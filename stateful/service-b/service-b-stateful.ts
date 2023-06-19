import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { CfnOutput, Fn, RemovalPolicy, SecretValue } from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import { AccountPrincipal, ArnPrincipal } from 'aws-cdk-lib/aws-iam';
import * as secretsManager from 'aws-cdk-lib/aws-secretsmanager';
import * as kms from 'aws-cdk-lib/aws-kms';

export class StatefulS3ReplicationDataStackServiceB extends cdk.Stack {
	constructor(scope: Construct, id: string, props?: cdk.StackProps) {
		super(scope, id, props);

		const {
			ORG_ID: orgId,
			ROLE_ACCOUNT: roleAccountId,
			ROLE_SECRET: roleSecret,
		} = process.env;
		if (!orgId || !roleAccountId || !roleSecret) {
			throw new Error('Stack environment variables not set');
		}

		// Fetch replication role ARN for bucket policy
		const replicationRoleArn = this.getReplicationRoleArn(
			roleAccountId,
			roleSecret
		);

		// Create replication Bucket
		const dataBucket = new s3.Bucket(this, 'reference-data-bucket', {
			objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
			blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
			enforceSSL: true,
			encryption: s3.BucketEncryption.S3_MANAGED,
			removalPolicy: RemovalPolicy.DESTROY,
			versioned: true,
		});

		// Add to bucket Policy
		dataBucket.addToResourcePolicy(
			new iam.PolicyStatement({
				effect: iam.Effect.ALLOW,
				resources: [dataBucket.arnForObjects('*')],
				actions: ['s3:ReplicateDelete', 's3:ReplicateObject'],
				principals: [new ArnPrincipal(replicationRoleArn)],
			})
		);
		dataBucket.addToResourcePolicy(
			new iam.PolicyStatement({
				effect: iam.Effect.ALLOW,
				principals: [new ArnPrincipal(replicationRoleArn)],
				resources: [dataBucket.bucketArn],
				actions: [
					's3:List*',
					's3:GetBucketVersioning',
					's3:PutBucketVersioning',
				],
			})
		);

		dataBucket.addToResourcePolicy(
			new iam.PolicyStatement({
				effect: iam.Effect.ALLOW,
				principals: [new AccountPrincipal(roleAccountId)],
				resources: [dataBucket.arnForObjects('*')],
				actions: ['s3:ObjectOwnerOverrideToBucketOwner'],
			})
		);

		// prevent replicating tags
		dataBucket.addToResourcePolicy(
			new iam.PolicyStatement({
				effect: iam.Effect.DENY,
				principals: [new ArnPrincipal(replicationRoleArn)],
				resources: [dataBucket.arnForObjects('*')],
				actions: ['s3:ReplicateTags'],
			})
		);

		// Create shared secret for other stacks to use the bucket
		// Stack with the master data bucket will require this for IAM role
		const bucketSecret = this.createSharedSecretForBucketArn(orgId, dataBucket);
		// Output secret name to use in other deployments
		// include the random chars required for lookup
		// arn:aws:secretsmanager:<Region>:<AccountId>:secret:SecretName-6RandomCharacters
		new CfnOutput(this, 'cfn-secret-name', {
			exportName: 'secretNameWithRandomChars',
			value: Fn.select(6, Fn.split(':', bucketSecret.secretArn)),
		});
	}

	private getReplicationRoleArn(accountId: string, secretName: string): string {
		return secretsManager.Secret.fromSecretCompleteArn(
			this,
			'replication-role-arn-secret',
			`arn:aws:secretsmanager:eu-west-1:${accountId}:secret:${secretName}`
		).secretValue.unsafeUnwrap();
	}

	private createSharedSecretForBucketArn(
		organisationId: string,
		bucket: s3.Bucket
	): secretsManager.Secret {
		const secretKey = new kms.Key(this, 'secret-encryption-key', {
			enableKeyRotation: true,
		});

		secretKey.addToResourcePolicy(
			new iam.PolicyStatement({
				actions: ['kms:Decrypt', 'kms:DescribeKey'],
				resources: ['*'],
				principals: [new iam.OrganizationPrincipal(organisationId)],
			})
		);

		const bucketSecret = new secretsManager.Secret(
			this,
			'replication-bucket-secret',
			{
				secretStringValue: SecretValue.unsafePlainText(bucket.bucketArn),
				encryptionKey: secretKey,
			}
		);

		bucketSecret.addToResourcePolicy(
			new iam.PolicyStatement({
				actions: ['secretsmanager:GetSecretValue'],
				resources: [bucketSecret.secretArn],
				principals: [new iam.OrganizationPrincipal(organisationId)],
			})
		);

		return bucketSecret;
	}
}
