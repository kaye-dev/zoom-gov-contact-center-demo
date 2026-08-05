export const DEFAULT_AWS_REGION = "ap-northeast-1";
export const DEFAULT_DATA_STACK_NAME = "ZoomGovDemoDataStack";
export const DEFAULT_WEB_STACK_NAME = "ZoomGovDemoWebStack";

export type AwsRuntimeConfig = {
  region: string;
  profile?: string;
  expectedAccountId?: string;
  dataStackName: string;
  webStackName: string;
};

function optionalValue(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function resolveAwsRuntimeConfig(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): AwsRuntimeConfig {
  const region =
    optionalValue(environment.AWS_REGION) ??
    optionalValue(environment.AWS_DEFAULT_REGION) ??
    DEFAULT_AWS_REGION;

  if (region !== DEFAULT_AWS_REGION) {
    throw new Error(
      `This CDK application is fixed to '${DEFAULT_AWS_REGION}', but AWS region '${region}' was configured.`,
    );
  }

  return {
    region,
    profile: optionalValue(environment.AWS_PROFILE),
    expectedAccountId: optionalValue(environment.AWS_EXPECTED_ACCOUNT_ID),
    dataStackName:
      optionalValue(environment.AWS_DATA_STACK_NAME) ?? DEFAULT_DATA_STACK_NAME,
    webStackName:
      optionalValue(environment.AWS_WEB_STACK_NAME) ?? DEFAULT_WEB_STACK_NAME,
  };
}

export function awsGlobalArguments(config: AwsRuntimeConfig): string[] {
  const arguments_: string[] = ["--region", config.region];

  if (config.profile) {
    arguments_.push("--profile", config.profile);
  }

  arguments_.push("--no-cli-pager");
  return arguments_;
}
