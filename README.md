# S3 Replication across services

> There is currently a bug with the CDK using Event Notifications (https://github.com/aws/aws-cdk/issues/5760). See Custom Resource workaround in "service-a-stateless.ts".

This demo can be extended to perform cross-account replicaiton.

However to keep things simple, we deploy 3 services each with their own Cloudformation Stack to demonstrate the replication.

Service A is the master source of the data. Services B and C use the source data with synchronisation with Service A.

Service A will cleanse and validate the data so even if the actor uploads a corrupted copy then it won't break downstream services.

![s3-replication-image](./docs//s3-replication-img.png)

# Welcome to your CDK TypeScript project

This is a blank project for CDK development with TypeScript.

The `cdk.json` file tells the CDK Toolkit how to execute your app.

## Useful commands

- `npm run build` compile typescript to js
- `npm run watch` watch for changes and compile
- `npm run test` perform the jest unit tests
- `cdk deploy` deploy this stack to your default AWS account/region
- `cdk diff` compare deployed stack with current state
- `cdk synth` emits the synthesized CloudFormation template
