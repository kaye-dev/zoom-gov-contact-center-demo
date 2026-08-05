import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  CfnOutput,
  Duration,
  RemovalPolicy,
  Stack,
  type StackProps,
} from "aws-cdk-lib";
import * as budgets from "aws-cdk-lib/aws-budgets";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as lambdaNodejs from "aws-cdk-lib/aws-lambda-nodejs";
import * as logs from "aws-cdk-lib/aws-logs";
import * as rds from "aws-cdk-lib/aws-rds";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import type { Construct } from "constructs";

const DATABASE_NAME = "zoom_demo";
const DATABASE_USERNAME = "zoom_admin";

export interface ZoomGovDemoDataStackProps extends StackProps {
  readonly budgetEmail: string;
  /** Tests may inject inline code to avoid Docker asset bundling. */
  readonly operationsCode?: lambda.Code;
}

export class ZoomGovDemoDataStack extends Stack {
  readonly applicationSecurityGroup: ec2.SecurityGroup;
  readonly authSecret: secretsmanager.Secret;
  readonly authSecretValue: string;
  readonly database: rds.DatabaseCluster;
  readonly databaseUrl: string;
  readonly operationsFunction: lambda.Function;
  readonly vpc: ec2.Vpc;

  constructor(
    scope: Construct,
    id: string,
    props: ZoomGovDemoDataStackProps,
  ) {
    super(scope, id, props);

    if (!props.budgetEmail.trim()) {
      throw new Error("budgetEmail must not be empty.");
    }

    this.vpc = new ec2.Vpc(this, "Vpc", {
      ipAddresses: ec2.IpAddresses.cidr("10.42.0.0/24"),
      maxAzs: 2,
      natGateways: 0,
      subnetConfiguration: [
        {
          cidrMask: 26,
          name: "application",
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
        },
      ],
    });

    this.applicationSecurityGroup = new ec2.SecurityGroup(
      this,
      "ApplicationSecurityGroup",
      {
        allowAllOutbound: true,
        description: "Outbound access from the application and operations Lambdas",
        vpc: this.vpc,
      },
    );

    const databaseSecurityGroup = new ec2.SecurityGroup(
      this,
      "DatabaseSecurityGroup",
      {
        allowAllOutbound: false,
        description: "Aurora accepts PostgreSQL only from the Lambda security group",
        vpc: this.vpc,
      },
    );
    databaseSecurityGroup.addIngressRule(
      this.applicationSecurityGroup,
      ec2.Port.tcp(5432),
      "PostgreSQL from application and operations Lambdas",
    );

    this.database = new rds.DatabaseCluster(this, "Database", {
      backup: {
        retention: Duration.days(1),
      },
      cloudwatchLogsExports: [],
      copyTagsToSnapshot: false,
      credentials: rds.Credentials.fromGeneratedSecret(DATABASE_USERNAME),
      defaultDatabaseName: DATABASE_NAME,
      deletionProtection: false,
      engine: rds.DatabaseClusterEngine.auroraPostgres({
        version: rds.AuroraPostgresEngineVersion.VER_16_9,
      }),
      readers: [],
      removalPolicy: RemovalPolicy.DESTROY,
      parameters: {
        "rds.force_ssl": "1",
      },
      securityGroups: [databaseSecurityGroup],
      serverlessV2AutoPauseDuration: Duration.seconds(300),
      serverlessV2MaxCapacity: 1,
      serverlessV2MinCapacity: 0,
      storageType: rds.DBClusterStorageType.AURORA,
      vpc: this.vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
      },
      writer: rds.ClusterInstance.serverlessV2("Writer", {
        autoMinorVersionUpgrade: true,
        enablePerformanceInsights: false,
      }),
    });
    this.database.secret?.applyRemovalPolicy(RemovalPolicy.DESTROY);

    this.databaseUrl = this.buildDatabaseUrl();

    this.authSecret = new secretsmanager.Secret(this, "BetterAuthSecret", {
      generateSecretString: {
        excludePunctuation: true,
        generateStringKey: "secret",
        passwordLength: 64,
        secretStringTemplate: "{}",
      },
    });
    this.authSecret.applyRemovalPolicy(RemovalPolicy.DESTROY);
    this.authSecretValue = this.authSecret
      .secretValueFromJson("secret")
      .unsafeUnwrap();

    const operationsLogGroup = new logs.LogGroup(
      this,
      "OperationsLogGroup",
      {
        retention: logs.RetentionDays.ONE_WEEK,
        removalPolicy: RemovalPolicy.DESTROY,
      },
    );

    this.operationsFunction = props.operationsCode
      ? new lambda.Function(this, "OperationsFunction", {
          architecture: lambda.Architecture.ARM_64,
          code: props.operationsCode,
          environment: this.operationsEnvironment(),
          handler: "index.handler",
          logGroup: operationsLogGroup,
          memorySize: 1_024,
          reservedConcurrentExecutions: 1,
          runtime: lambda.Runtime.NODEJS_24_X,
          securityGroups: [this.applicationSecurityGroup],
          timeout: Duration.minutes(15),
          vpc: this.vpc,
          vpcSubnets: {
            subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
          },
        })
      : this.createBundledOperationsFunction(operationsLogGroup);

    new budgets.CfnBudget(this, "MonthlyBudget", {
      budget: {
        budgetLimit: {
          amount: 10,
          unit: "USD",
        },
        budgetName: "zoom-gov-demo-monthly-cost",
        budgetType: "COST",
        timeUnit: "MONTHLY",
      },
      notificationsWithSubscribers: [50, 80, 100].map((threshold) => ({
        notification: {
          comparisonOperator: "GREATER_THAN",
          notificationType: "ACTUAL",
          threshold,
          thresholdType: "PERCENTAGE",
        },
        subscribers: [
          {
            address: props.budgetEmail,
            subscriptionType: "EMAIL",
          },
        ],
      })),
    });

    new CfnOutput(this, "OperationsFunctionName", {
      description: "Invoke this function for migration status/deploy and admin seed operations",
      value: this.operationsFunction.functionName,
    });
    new CfnOutput(this, "DatabaseInstanceIdentifier", {
      description: "Writer identifier used to verify Aurora auto-pause metrics",
      value: this.database.instanceIdentifiers[0],
    });
  }

  private buildDatabaseUrl(): string {
    const credentials = this.database.secret;
    if (!credentials) {
      throw new Error("Aurora generated credentials secret was not created.");
    }

    const username = credentials
      .secretValueFromJson("username")
      .unsafeUnwrap();
    const password = credentials
      .secretValueFromJson("password")
      .unsafeUnwrap();

    // Dynamic references are resolved by CloudFormation while configuring Lambda.
    // This avoids a paid Secrets Manager VPC endpoint in the isolated, NAT-free VPC.
    return `postgresql://${username}:${password}@${this.database.clusterEndpoint.hostname}:${this.database.clusterEndpoint.port}/${DATABASE_NAME}?sslmode=require&connect_timeout=45`;
  }

  private createBundledOperationsFunction(
    logGroup: logs.ILogGroup,
  ): lambdaNodejs.NodejsFunction {
    const repositoryRoot = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../..",
    );

    return new lambdaNodejs.NodejsFunction(this, "OperationsFunction", {
      architecture: lambda.Architecture.ARM_64,
      bundling: {
        commandHooks: {
          afterBundling(inputDir: string, outputDir: string): string[] {
            return [
              `mkdir -p ${outputDir}/prisma`,
              `cp ${inputDir}/infra/functions/prisma.config.ts ${outputDir}/prisma.config.ts`,
              `cp ${inputDir}/prisma/schema.prisma ${outputDir}/prisma/schema.prisma`,
              `cp -R ${inputDir}/prisma/migrations ${outputDir}/prisma/migrations`,
              // Prisma 7.9's CLI requires Studio's data/BFF modules at startup,
              // even for migrate commands, but it never needs the browser UI
              // or esbuild metafiles. Omit only those 30+ MiB artifacts.
              `rm -rf ${outputDir}/node_modules/@prisma/studio-core/dist/ui`,
              `rm -f ${outputDir}/node_modules/@prisma/studio-core/dist/metafile-*.json`,
              `test "$(du -sk ${outputDir} | cut -f1)" -lt 256000 || { echo "Operations Lambda asset exceeds the 250 MiB uncompressed limit." >&2; exit 1; }`,
            ];
          },
          beforeBundling(): string[] {
            return [];
          },
          beforeInstall(): string[] {
            return [];
          },
        },
        forceDockerBundling: true,
        minify: false,
        nodeModules: ["prisma"],
        sourceMap: false,
        target: "node24",
      },
      depsLockFilePath: path.join(repositoryRoot, "package-lock.json"),
      entry: path.join(repositoryRoot, "infra/functions/operations.ts"),
      environment: this.operationsEnvironment(),
      logGroup,
      memorySize: 1_024,
      projectRoot: repositoryRoot,
      reservedConcurrentExecutions: 1,
      runtime: lambda.Runtime.NODEJS_24_X,
      securityGroups: [this.applicationSecurityGroup],
      timeout: Duration.minutes(15),
      vpc: this.vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
      },
    });
  }

  private operationsEnvironment(): Record<string, string> {
    return {
      DATABASE_URL: this.databaseUrl,
      DB_SSL: "true",
      NODE_ENV: "production",
      PRISMA_HIDE_UPDATE_MESSAGE: "1",
    };
  }
}
