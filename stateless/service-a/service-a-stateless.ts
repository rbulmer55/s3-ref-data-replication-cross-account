import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as nodeLambda from 'aws-cdk-lib/aws-lambda-nodejs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Runtime, Tracing } from 'aws-cdk-lib/aws-lambda';
import * as path from 'path';
import * as iam from 'aws-cdk-lib/aws-iam';
import { RetentionDays } from 'aws-cdk-lib/aws-logs';
import {
	AwsCustomResource,
	AwsCustomResourcePolicy,
	PhysicalResourceId,
} from 'aws-cdk-lib/custom-resources';

interface CustomProps extends cdk.StackProps {
	uploadBucket: s3.IBucket;
	masterBucket: s3.IBucket;
}

export class StatelessS3ReplicationDataStackServiceA extends cdk.Stack {
	public readonly cleanserLambda: nodeLambda.NodejsFunction;
	constructor(scope: Construct, id: string, props?: CustomProps) {
		super(scope, id, props);

		if (!props?.masterBucket || !props?.uploadBucket) {
			throw new Error('No Buckets have been specified.');
		}

		const cleanserFunction = new nodeLambda.NodejsFunction(
			this,
			'data-cleanser',
			{
				runtime: Runtime.NODEJS_18_X,
				functionName: 's3-replication-data-cleanser',
				entry: path.join(__dirname, 'src/data-cleanser/data-cleanser.ts'),
				handler: 'handler',
				tracing: Tracing.ACTIVE,
				memorySize: 1024,
				bundling: {
					minify: true,
				},
				environment: {
					SOURCE_BUCKET: props.uploadBucket.bucketName,
					DESTINATION_BUCKET: props.masterBucket.bucketName,
				},
			}
		);
		this.cleanserLambda = cleanserFunction;

		/*
		 * Event Notifcation Workaround. Bug: https://github.com/aws/aws-cdk/issues/5760
		 *
		 * props.uploadBucket.addEventNotification(
				s3.EventType.OBJECT_CREATED_PUT,
				new LambdaDestination(cleanserFunction)
			);
		 */

		cleanserFunction.addPermission(`AllowS3Invocation`, {
			action: 'lambda:InvokeFunction',
			principal: new iam.ServicePrincipal('s3.amazonaws.com'),
			sourceArn: props.uploadBucket.bucketArn,
		});

		const notificationResource = new AwsCustomResource(
			this,
			`NotificationCustomResource`,
			{
				logRetention: RetentionDays.THREE_DAYS,
				policy: AwsCustomResourcePolicy.fromStatements([
					new iam.PolicyStatement({
						effect: iam.Effect.ALLOW,
						actions: ['s3:PutBucketNotification'],
						resources: [
							props.uploadBucket.bucketArn,
							`${props.uploadBucket.bucketArn}/*`,
						],
					}),
				]),
				onCreate: {
					service: 'S3',
					action: 'putBucketNotificationConfiguration',
					parameters: {
						Bucket: props.uploadBucket.bucketName,
						NotificationConfiguration: {
							LambdaFunctionConfigurations: [
								{
									Events: ['s3:ObjectCreated:*'],
									LambdaFunctionArn: cleanserFunction.functionArn,
								},
							],
						},
					},
					physicalResourceId: PhysicalResourceId.of(
						`${id + Date.now().toString()}`
					),
				},
			}
		);

		notificationResource.node.addDependency(
			cleanserFunction.permissionsNode.findChild('AllowS3Invocation')
		);

		props.uploadBucket.grantRead(cleanserFunction);
		props.masterBucket.grantPut(cleanserFunction);
	}
}
