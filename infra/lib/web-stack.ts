import {
  CfnOutput,
  Duration,
  RemovalPolicy,
  Stack,
  type StackProps,
} from "aws-cdk-lib";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as logs from "aws-cdk-lib/aws-logs";
import type { Construct } from "constructs";

import type { ZoomGovDemoDataStack } from "./data-stack";

export interface ZoomGovDemoWebStackProps extends StackProps {
  readonly appAssetPath: string;
  /** Tests may inject inline code instead of reading a built web asset. */
  readonly appCode?: lambda.Code;
  readonly dataStack: ZoomGovDemoDataStack;
}

export class ZoomGovDemoWebStack extends Stack {
  readonly applicationFunction: lambda.Function;
  readonly distribution: cloudfront.Distribution;

  constructor(
    scope: Construct,
    id: string,
    props: ZoomGovDemoWebStackProps,
  ) {
    super(scope, id, props);

    const applicationLogGroup = new logs.LogGroup(
      this,
      "ApplicationLogGroup",
      {
        retention: logs.RetentionDays.ONE_WEEK,
        removalPolicy: RemovalPolicy.DESTROY,
      },
    );
    const adapterLayer = lambda.LayerVersion.fromLayerVersionArn(
      this,
      "LambdaWebAdapterLayer",
      `arn:${Stack.of(this).partition}:lambda:${Stack.of(this).region}:753240598075:layer:LambdaAdapterLayerArm64:28`,
    );

    this.applicationFunction = new lambda.Function(
      this,
      "ApplicationFunction",
      {
        architecture: lambda.Architecture.ARM_64,
        code: props.appCode ?? lambda.Code.fromAsset(props.appAssetPath),
        environment: {
          AWS_LAMBDA_EXEC_WRAPPER: "/opt/bootstrap",
          AWS_LWA_INVOKE_MODE: "buffered",
          AWS_LWA_PORT: "3000",
          AWS_LWA_READINESS_CHECK_PROTOCOL: "tcp",
          BETTER_AUTH_ALLOWED_HOSTS: "*.cloudfront.net",
          BETTER_AUTH_SECRET: props.dataStack.authSecretValue,
          BETTER_AUTH_TRUSTED_ORIGINS: "https://*.cloudfront.net",
          BETTER_AUTH_TRUST_PROXY_HEADERS: "true",
          DATABASE_URL: props.dataStack.databaseUrl,
          DB_SSL: "true",
          NODE_ENV: "production",
          PORT: "3000",
        },
        handler: "run.sh",
        layers: [adapterLayer],
        logGroup: applicationLogGroup,
        memorySize: 1_024,
        reservedConcurrentExecutions: 2,
        runtime: lambda.Runtime.NODEJS_24_X,
        securityGroups: [props.dataStack.applicationSecurityGroup],
        timeout: Duration.seconds(60),
        vpc: props.dataStack.vpc,
        vpcSubnets: {
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
        },
      },
    );

    const functionUrl = this.applicationFunction.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.AWS_IAM,
      invokeMode: lambda.InvokeMode.BUFFERED,
    });
    const originAccessControl =
      new cloudfront.FunctionUrlOriginAccessControl(
        this,
        "FunctionUrlOriginAccessControl",
        {
          description: "SigV4 access from CloudFront to the private Lambda Function URL",
          originAccessControlName: "zoom-gov-demo-lambda-url",
          signing: cloudfront.Signing.SIGV4_ALWAYS,
        },
      );
    const origin = origins.FunctionUrlOrigin.withOriginAccessControl(
      functionUrl,
      {
        originAccessControl,
        readTimeout: Duration.seconds(60),
      },
    );
    const viewerHostFunction = new cloudfront.Function(
      this,
      "ViewerHostFunction",
      {
        code: cloudfront.FunctionCode.fromInline(`function handler(event) {
  var request = event.request;
  if (request.headers.host) {
    request.headers['x-forwarded-host'] = { value: request.headers.host.value };
  }
  return request;
}`),
        comment: "Preserve the CloudFront viewer host for application URL generation",
        runtime: cloudfront.FunctionRuntime.JS_2_0,
      },
    );
    const functionAssociations = [
      {
        eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
        function: viewerHostFunction,
      },
    ];
    const publicAssetCachePolicy = new cloudfront.CachePolicy(
      this,
      "PublicAssetCachePolicy",
      {
        cachePolicyName: "zoom-gov-demo-public-assets",
        comment: "Cache immutable-ish public images for one hour",
        cookieBehavior: cloudfront.CacheCookieBehavior.none(),
        defaultTtl: Duration.hours(1),
        enableAcceptEncodingBrotli: true,
        enableAcceptEncodingGzip: true,
        headerBehavior: cloudfront.CacheHeaderBehavior.none(),
        maxTtl: Duration.days(1),
        minTtl: Duration.seconds(0),
        queryStringBehavior: cloudfront.CacheQueryStringBehavior.none(),
      },
    );

    this.distribution = new cloudfront.Distribution(this, "Distribution", {
      defaultBehavior: {
        allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
        cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
        cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD_OPTIONS,
        compress: true,
        functionAssociations,
        origin,
        // The managed policy forwards every viewer header except Host. OAC
        // needs the browser-provided x-amz-content-sha256 value for POST/PUT.
        originRequestPolicy:
          cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      },
      enableIpv6: true,
      enabled: true,
      additionalBehaviors: {
        "/_next/static/*": {
          allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
          cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
          cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD_OPTIONS,
          compress: true,
          origin,
          viewerProtocolPolicy:
            cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        },
        "*.ico": this.publicAssetBehavior(
          origin,
          publicAssetCachePolicy,
        ),
        "*.png": this.publicAssetBehavior(
          origin,
          publicAssetCachePolicy,
        ),
        "*.svg": this.publicAssetBehavior(
          origin,
          publicAssetCachePolicy,
        ),
      },
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
    });
    this.distribution.applyRemovalPolicy(RemovalPolicy.DESTROY);

    // Since October 2025, a Function URL caller needs both actions. CDK
    // 2.263.0's OAC helper adds InvokeFunctionUrl only, so add the second,
    // URL-scoped permission explicitly to avoid a CloudFront 403 response.
    new lambda.CfnPermission(this, "InvokeFunctionViaUrlFromCloudFront", {
      action: "lambda:InvokeFunction",
      functionName: this.applicationFunction.functionArn,
      invokedViaFunctionUrl: true,
      principal: "cloudfront.amazonaws.com",
      sourceArn: this.distribution.distributionArn,
    });

    new CfnOutput(this, "ApplicationUrl", {
      description: "Public HTTPS URL served by CloudFront",
      value: `https://${this.distribution.distributionDomainName}`,
    });
    new CfnOutput(this, "FunctionName", {
      description: "Next.js Lambda function name",
      value: this.applicationFunction.functionName,
    });
    new CfnOutput(this, "FunctionUrl", {
      description: "Private Function URL used to verify direct access is denied",
      value: functionUrl.url,
    });
  }

  private publicAssetBehavior(
    origin: cloudfront.IOrigin,
    cachePolicy: cloudfront.ICachePolicy,
  ): cloudfront.BehaviorOptions {
    return {
      allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
      cachePolicy,
      cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD_OPTIONS,
      compress: true,
      origin,
      viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
    };
  }
}
