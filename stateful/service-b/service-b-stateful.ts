import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { CfnOutput, RemovalPolicy, SecretValue } from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import { ArnPrincipal } from 'aws-cdk-lib/aws-iam';
import * as secretsManager from 'aws-cdk-lib/aws-secretsmanager';
import * as kms from 'aws-cdk-lib/aws-kms';

export class StatefulS3ReplicationDataStackServiceB extends cdk.Stack {
	constructor(scope: Construct, id: string, props?: cdk.StackProps) {
		super(scope, id, props);

		const orgId = process.env.ORG_ID;
		if (!orgId) {
			throw new Error('Organisation ID environment not set.');
		}

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

		const dataBucket = new s3.Bucket(this, 'reference-data-bucket-b', {
			objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
			blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
			enforceSSL: true,
			encryption: s3.BucketEncryption.S3_MANAGED,
			removalPolicy: RemovalPolicy.DESTROY,
			versioned: true,
		});

		dataBucket.addToResourcePolicy(
			new iam.PolicyStatement({
				resources: [dataBucket.arnForObjects('*')],
				actions: ['s3:ReplicateDelete', 's3:ReplicateObject'],
				principals: [new ArnPrincipal(replicationRoleArn)],
			})
		);
		dataBucket.addToResourcePolicy(
			new iam.PolicyStatement({
				principals: [new ArnPrincipal(replicationRoleArn)],
				resources: [dataBucket.bucketArn],
				actions: [
					's3:List*',
					's3:GetBucketVersioning',
					's3:PutBucketVersioning',
				],
			})
		);

		const secretKey = new kms.Key(this, 'secret-encryption-key', {
			enableKeyRotation: true,
		});

		secretKey.addToResourcePolicy(
			new iam.PolicyStatement({
				actions: ['kms:Decrypt', 'kms:DescribeKey'],
				resources: ['*'],
				principals: [new iam.OrganizationPrincipal(orgId)],
			})
		);

		const bucketSecret = new secretsManager.Secret(
			this,
			'replication-bucket-b-secret',
			{
				secretStringValue: SecretValue.unsafePlainText(dataBucket.bucketArn),
				encryptionKey: secretKey,
			}
		);

		bucketSecret.addToResourcePolicy(
			new iam.PolicyStatement({
				actions: ['secretsmanager:GetSecretValue'],
				resources: [bucketSecret.secretArn],
				principals: [new iam.OrganizationPrincipal(orgId)],
			})
		);

		//output secret name for testing
		new CfnOutput(this, 'cfn-secret-name', {
			exportName: 'secretName',
			value: bucketSecret.secretName,
		});
	}
}
