#!/usr/bin/env node

import path from "node:path";
import { fileURLToPath } from "node:url";

import { App } from "aws-cdk-lib";

import { ZoomGovDemoDataStack } from "../lib/data-stack";
import { ZoomGovDemoWebStack } from "../lib/web-stack";

const app = new App();
const budgetEmail = process.env.BUDGET_EMAIL?.trim();
const dataStackName =
  process.env.AWS_DATA_STACK_NAME?.trim() || "ZoomGovDemoDataStack";
const webStackName =
  process.env.AWS_WEB_STACK_NAME?.trim() || "ZoomGovDemoWebStack";

if (!budgetEmail) {
  throw new Error(
    "BUDGET_EMAIL is required so the monthly AWS Budget can notify an operator.",
  );
}

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const appAssetPath = path.resolve(
  repositoryRoot,
  process.env.APP_ASSET_PATH ?? ".aws-artifacts/web.zip",
);
const environment = {
  region: "ap-northeast-1",
};

const dataStack = new ZoomGovDemoDataStack(app, dataStackName, {
  budgetEmail,
  env: environment,
});

const webStack = new ZoomGovDemoWebStack(app, webStackName, {
  appAssetPath,
  dataStack,
  env: environment,
});

webStack.addStackDependency(dataStack);
