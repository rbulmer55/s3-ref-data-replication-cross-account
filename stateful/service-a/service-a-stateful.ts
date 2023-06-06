import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as iam from 'aws-cdk-lib/aws-iam';
import { RemovalPolicy } from 'aws-cdk-lib';
import { ManagedPolicy } from 'aws-cdk-lib/aws-iam';
import * as secretsManager from 'aws-cdk-lib/aws-secretsmanager';
import { SecretsManager } from 'aws-sdk';

const sm = new SecretsManager();

export class StatefulS3ReplicationDataStackServiceA extends cdk.Stack {
	public readonly uploadBucket: s3.Bucket;
	public readonly masterBucket: s3.Bucket;

	constructor(scope: Construct, id: string, props?: cdk.StackProps) {
		super(scope, id, props);

		// Get Bucket B from Secrets Manager and Bucket ARN
		const serviceBAccountId = process.env.SERVICE_B_ACCOUNT;
		if (!serviceBAccountId) {
			throw new Error('Service B account id environment not set.');
		}
		// In production set secret arns in parameter store rather than Env vars
		const secretBucketBName = process.env.SERVICE_B_BUCKET_SECRET_NAME;
		if (!secretBucketBName) {
			throw new Error('Secret Bucket name for service B environment not set.');
		}
		const serviceBBucketArn = secretsManager.Secret.fromSecretCompleteArn(
			this,
			'replication-b-bucket-arn-secret',
			`arn:aws:secretsmanager:eu-west-1:${serviceBAccountId}:secret:${secretBucketBName}`
		).secretValue.unsafeUnwrap();

		const replicationBucketB = s3.Bucket.fromBucketArn(
			this,
			'service-b-bucket',
			serviceBBucketArn
		);

		// Get Bucket C from Secrets Manager and Bucket ARN
		const serviceCAccountId = process.env.SERVICE_C_ACCOUNT;
		if (!serviceCAccountId) {
			throw new Error('Service C account id environment not set.');
		}
		// In production set secret arns in parameter store rather than Env Vars
		const secretBucketCName = process.env.SERVICE_C_BUCKET_SECRET_NAME;
		if (!secretBucketCName) {
			throw new Error('Secret Bucket name for service C environment not set.');
		}
		const serviceCBucketArn = secretsManager.Secret.fromSecretCompleteArn(
			this,
			'replication-c-bucket-arn-secret',
			`arn:aws:secretsmanager:eu-west-1:${serviceBAccountId}:secret:${secretBucketBName}`
		).secretValue.unsafeUnwrap();

		const replicationBucketC = s3.Bucket.fromBucketArn(
			this,
			'service-c-bucket',
			serviceCBucketArn
		);

		const replicationBuckets = [replicationBucketB, replicationBucketC];

		const uploadBucket = new s3.Bucket(this, 'upload-bucket', {
			objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
			blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
			enforceSSL: true,
			encryption: s3.BucketEncryption.S3_MANAGED,
			removalPolicy: RemovalPolicy.DESTROY,
		});
		this.uploadBucket = uploadBucket;

		const masterBucket = new s3.Bucket(this, 'master-bucket', {
			objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
			blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
			enforceSSL: true,
			encryption: s3.BucketEncryption.S3_MANAGED,
			versioned: true,
			removalPolicy: RemovalPolicy.DESTROY,
		});
		this.masterBucket = masterBucket;

		const sharedAccountId = process.env.SHARED_ACCOUNT;
		if (!sharedAccountId) {
			throw new Error('Shared account id environment not set.');
		}
		// In production set secret arns in parameter store in the accounts required
		const secretRoleName = process.env.ROLE_SECRET_NAME;
		if (!secretRoleName) {
			throw new Error('Secret role name environment not set.');
		}
		const replicationRoleArn = secretsManager.Secret.fromSecretCompleteArn(
			this,
			'replication-role-arn-secret',
			`arn:aws:secretsmanager:eu-west-1:${sharedAccountId}:secret:${secretRoleName}`
		).secretValue.unsafeUnwrap();

		const replicationRole = iam.Role.fromRoleArn(
			this,
			'replication-role',
			replicationRoleArn
		);

		replicationRole.attachInlinePolicy(
			new iam.Policy(this, 'amended-policy', {
				statements: [
					new iam.PolicyStatement({
						resources: [masterBucket.bucketArn],
						actions: ['s3:GetReplicationConfiguration', 's3:ListBucket'],
					}),
					new iam.PolicyStatement({
						resources: [masterBucket.arnForObjects('*')],
						actions: [
							's3:GetObjectVersion',
							's3:GetObjectVersionAcl',
							's3:GetObjectVersionForReplication',
							's3:GetObjectLegalHold',
							's3:GetObjectVersionTagging',
							's3:GetObjectRetention',
						],
					}),
					...replicationBuckets.map((destinationBucket) => {
						return new iam.PolicyStatement({
							resources: [destinationBucket.arnForObjects('*')],
							actions: [
								's3:ReplicateObject',
								's3:ReplicateDelete',
								's3:ReplicateTags',
								's3:GetObjectVersionTagging',
								's3:ObjectOwnerOverrideToBucketOwner',
							],
						});
					}),
				],
			})
		);

		const replicationConfiguration: s3.CfnBucket.ReplicationConfigurationProperty =
			{
				role: replicationRoleArn,
				rules: replicationBuckets.map(
					(destinationBucket, index): s3.CfnBucket.ReplicationRuleProperty => {
						return {
							destination: {
								bucket: destinationBucket.bucketArn,
								//accessControlTranslation: { owner: 'account-name' },
								account: destinationBucket.env.account,
							},
							status: 'Enabled',
							priority: index++,
							filter: {
								prefix: '',
							},
							deleteMarkerReplication: {
								status: 'Enabled',
							},
						};
					}
				),
			};
		const cfnMasterBucket = masterBucket.node.defaultChild as s3.CfnBucket;
		cfnMasterBucket.replicationConfiguration = replicationConfiguration;
	}
}
