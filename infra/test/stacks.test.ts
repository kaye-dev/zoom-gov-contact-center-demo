import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { App } from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import * as lambda from "aws-cdk-lib/aws-lambda";

import { ZoomGovDemoDataStack } from "../lib/data-stack";
import { ZoomGovDemoWebStack } from "../lib/web-stack";

function synthesizeStacks(): {
  dataTemplate: Template;
  webTemplate: Template;
} {
  const app = new App();
  const dataStack = new ZoomGovDemoDataStack(app, "DataTest", {
    budgetEmail: "operator@example.com",
    env: { account: "111111111111", region: "ap-northeast-1" },
    operationsCode: lambda.Code.fromInline("exports.handler = async () => ({ ok: true });"),
  });
  const webStack = new ZoomGovDemoWebStack(app, "WebTest", {
    appAssetPath: "unused.zip",
    appCode: lambda.Code.fromInline("exports.handler = async () => ({ statusCode: 200 });"),
    dataStack,
    env: { account: "111111111111", region: "ap-northeast-1" },
  });

  return {
    dataTemplate: Template.fromStack(dataStack),
    webTemplate: Template.fromStack(webStack),
  };
}

describe("Zoom Gov demo low-cost infrastructure", () => {
  it("creates an isolated Aurora Serverless v2 cluster that can auto-pause", () => {
    const { dataTemplate } = synthesizeStacks();

    dataTemplate.resourceCountIs("AWS::EC2::NatGateway", 0);
    dataTemplate.resourceCountIs("AWS::EC2::Subnet", 2);
    dataTemplate.resourceCountIs("AWS::RDS::DBInstance", 1);
    dataTemplate.hasResourceProperties("AWS::RDS::DBCluster", {
      BackupRetentionPeriod: 1,
      DatabaseName: "zoom_demo",
      DeletionProtection: false,
      Engine: "aurora-postgresql",
      EngineVersion: "16.9",
      ServerlessV2ScalingConfiguration: {
        MaxCapacity: 1,
        MinCapacity: 0,
        SecondsUntilAutoPause: 300,
      },
      StorageType: "aurora",
    });
    dataTemplate.hasResourceProperties("AWS::RDS::DBInstance", {
      DBInstanceClass: "db.serverless",
      EnablePerformanceInsights: false,
      PubliclyAccessible: false,
    });
    dataTemplate.hasResourceProperties("AWS::RDS::DBClusterParameterGroup", {
      Parameters: {
        "rds.force_ssl": "1",
      },
    });
    dataTemplate.resourceCountIs("AWS::SecretsManager::Secret", 2);
    const secrets = dataTemplate.findResources("AWS::SecretsManager::Secret");
    for (const secret of Object.values(secrets)) {
      assert.equal(secret.DeletionPolicy, "Delete");
      assert.equal(secret.UpdateReplacePolicy, "Delete");
    }
  });

  it("limits database ingress and creates budget notifications", () => {
    const { dataTemplate } = synthesizeStacks();

    dataTemplate.hasResourceProperties("AWS::EC2::SecurityGroupIngress", {
      FromPort: 5432,
      IpProtocol: "tcp",
      ToPort: 5432,
    });
    dataTemplate.hasResourceProperties("AWS::Lambda::Function", {
      Environment: {
        Variables: Match.objectLike({ DB_SSL: "true" }),
      },
    });
    dataTemplate.hasResourceProperties("AWS::Budgets::Budget", {
      Budget: {
        BudgetLimit: { Amount: 10, Unit: "USD" },
        BudgetType: "COST",
        TimeUnit: "MONTHLY",
      },
      NotificationsWithSubscribers: Match.arrayWith([
        Match.objectLike({
          Notification: Match.objectLike({ Threshold: 50 }),
        }),
        Match.objectLike({
          Notification: Match.objectLike({ Threshold: 80 }),
        }),
        Match.objectLike({
          Notification: Match.objectLike({ Threshold: 100 }),
        }),
      ]),
    });
  });

  it("uses a private IAM Function URL behind a signing CloudFront OAC", () => {
    const { webTemplate } = synthesizeStacks();

    webTemplate.hasResourceProperties("AWS::Lambda::Url", {
      AuthType: "AWS_IAM",
      InvokeMode: "BUFFERED",
    });
    webTemplate.hasResourceProperties("AWS::Lambda::Permission", {
      Action: "lambda:InvokeFunctionUrl",
      Principal: "cloudfront.amazonaws.com",
    });
    webTemplate.hasResourceProperties("AWS::Lambda::Permission", {
      Action: "lambda:InvokeFunction",
      InvokedViaFunctionUrl: true,
      Principal: "cloudfront.amazonaws.com",
    });
    webTemplate.hasResourceProperties("AWS::CloudFront::OriginAccessControl", {
      OriginAccessControlConfig: {
        OriginAccessControlOriginType: "lambda",
        SigningBehavior: "always",
        SigningProtocol: "sigv4",
      },
    });
    webTemplate.hasResourceProperties("AWS::Lambda::Function", {
      Architectures: ["arm64"],
      Environment: {
        Variables: Match.objectLike({
          BETTER_AUTH_ALLOWED_HOSTS: "*.cloudfront.net",
          BETTER_AUTH_TRUSTED_ORIGINS: "https://*.cloudfront.net",
          BETTER_AUTH_TRUST_PROXY_HEADERS: "true",
          DB_SSL: "true",
        }),
      },
      MemorySize: 1024,
      ReservedConcurrentExecutions: 2,
      Runtime: "nodejs24.x",
      Timeout: 60,
    });
    webTemplate.resourceCountIs("AWS::ApiGateway::RestApi", 0);
    webTemplate.resourceCountIs("AWS::ElasticLoadBalancingV2::LoadBalancer", 0);
    webTemplate.resourceCountIs("AWS::ECR::Repository", 0);

    const distributions = webTemplate.findResources(
      "AWS::CloudFront::Distribution",
    );
    const distribution = Object.values(distributions)[0] as {
      Properties: {
        DistributionConfig: {
          CacheBehaviors: Array<Record<string, unknown>>;
          DefaultCacheBehavior: Record<string, unknown>;
          PriceClass: string;
        };
      };
    };
    const config = distribution.Properties.DistributionConfig;
    assert.equal(config.PriceClass, "PriceClass_100");
    assert.ok(config.DefaultCacheBehavior.FunctionAssociations);
    for (const behavior of config.CacheBehaviors) {
      assert.equal("FunctionAssociations" in behavior, false);
    }
  });

  it("forwards the viewer payload hash header to the OAC origin", () => {
    const { webTemplate } = synthesizeStacks();
    const distributions = webTemplate.findResources(
      "AWS::CloudFront::Distribution",
    );
    const distribution = Object.values(distributions)[0] as {
      Properties: {
        DistributionConfig: {
          DefaultCacheBehavior: {
            OriginRequestPolicyId?: string;
          };
        };
      };
    };

    // AWS managed AllViewerExceptHostHeader forwards every viewer header other
    // than Host, including x-amz-content-sha256, plus all cookies/query strings.
    assert.equal(
      distribution.Properties.DistributionConfig.DefaultCacheBehavior
        .OriginRequestPolicyId,
      "b689b0a8-53d0-40ab-baf2-68738e2966ac",
    );
  });

  it("exposes the stable outputs consumed by deployment scripts", () => {
    const { dataTemplate, webTemplate } = synthesizeStacks();
    const dataOutputs = dataTemplate.toJSON().Outputs as Record<string, unknown>;
    const webOutputs = webTemplate.toJSON().Outputs as Record<string, unknown>;

    assert.ok(dataOutputs.OperationsFunctionName);
    assert.ok(dataOutputs.DatabaseInstanceIdentifier);
    assert.ok(webOutputs.ApplicationUrl);
    assert.ok(webOutputs.FunctionName);
    assert.ok(webOutputs.FunctionUrl);
  });
});
