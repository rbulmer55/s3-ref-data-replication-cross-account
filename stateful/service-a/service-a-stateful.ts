import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as iam from 'aws-cdk-lib/aws-iam';
import { RemovalPolicy } from 'aws-cdk-lib';
import * as secretsManager from 'aws-cdk-lib/aws-secretsmanager';

interface DestinationBucket {
	bucketAccountId: string;
	bucket: s3.IBucket;
}

// can we replace the magic string for role name?
const replicationRoleName = 's3-master-replication-role';

export class StatefulS3ReplicationDataStackServiceA extends cdk.Stack {
	public readonly uploadBucket: s3.Bucket;
	public readonly masterBucket: s3.Bucket;

	constructor(scope: Construct, id: string, props?: cdk.StackProps) {
		super(scope, id, props);

		const {
			SERVICE_B_ACCOUNT: bAccountId,
			SERVICE_C_ACCOUNT: cAccountId,
			SERVICE_B_BUCKET_SECRET: bBucketSecret,
			SERVICE_C_BUCKET_SECRET: cBucketSecret,
		} = process.env;

		if (!bAccountId || !cAccountId || !bBucketSecret || !cBucketSecret) {
			throw new Error('Stack Environment Variables not set');
		}

		// Fetch replication bucket B and C using Cross-account secrets manager
		// Required for the bucket ARNs and accountId used in Replication Role IAM Policy
		const replicationBucketB = this.getDestinationBucket(
			bAccountId,
			bBucketSecret,
			'dest-b'
		);
		const replicationBucketC = this.getDestinationBucket(
			cAccountId,
			cBucketSecret,
			'dest-c'
		);
		const replicationBuckets: DestinationBucket[] = [
			{ bucketAccountId: bAccountId, bucket: replicationBucketB },
			{ bucketAccountId: cAccountId, bucket: replicationBucketC },
		];

		// Create an upload bucket for inbound and uncleansed data
		const uploadBucket = new s3.Bucket(this, 'upload-bucket', {
			objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
			blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
			enforceSSL: true,
			encryption: s3.BucketEncryption.S3_MANAGED,
			removalPolicy: RemovalPolicy.DESTROY,
		});
		this.uploadBucket = uploadBucket;

		// Create a master bucket for cleansed data ready for replication
		const masterBucket = new s3.Bucket(this, 'master-bucket', {
			objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
			blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
			enforceSSL: true,
			encryption: s3.BucketEncryption.S3_MANAGED,
			versioned: true,
			removalPolicy: RemovalPolicy.DESTROY,
		});
		this.masterBucket = masterBucket;

		// Now we have the replication buckets we can update the IAM role with replication permissions
		// Let's use the Role we created in the first deployment stack via RoleName
		// ** Tried using secrets manager instead of roleName, but Dynamic references don't work.
		// ** Tried fromSecretCompleteArn and using Role.fromRoleArn to pass into Role.attachInlinePolicy
		const replicationRole = iam.Role.fromRoleName(
			this,
			'replication-role-to-update',
			replicationRoleName
		);
		new iam.ManagedPolicy(this, 'update-replication-managed-policy', {
			roles: [replicationRole],
			statements: [
				new iam.PolicyStatement({
					resources: [masterBucket.bucketArn],
					actions: ['s3:GetReplicationConfiguration', 's3:ListBucket'],
				}),
				new iam.PolicyStatement({
					resources: [masterBucket.arnForObjects('*')],
					actions: [
						's3:GetObjectVersionForReplication',
						's3:GetObjectVersionAcl',
						's3:GetObjectVersionTagging',
					],
				}),
				...replicationBuckets.map(({ bucket }) => {
					return new iam.PolicyStatement({
						resources: [bucket.arnForObjects('*')],
						actions: [
							's3:ReplicateObject',
							's3:ReplicateDelete',
							's3:ReplicateTags',
							's3:ObjectOwnerOverrideToBucketOwner',
						],
					});
				}),
			],
		});

		// Add replication configuration using escape hatch. No construct support yet.
		const replicationConfiguration: s3.CfnBucket.ReplicationConfigurationProperty =
			{
				// IRole.roleArn doesn't incude path ('/service-role/')
				// role: replicationRole.roleArn,
				role: `arn:aws:iam::${this.account}:role/service-role/${replicationRoleName}`,
				rules: replicationBuckets.map(
					(
						{ bucket: { bucketArn }, bucketAccountId },
						index
					): s3.CfnBucket.ReplicationRuleProperty => {
						return {
							destination: {
								bucket: bucketArn,
								accessControlTranslation: {
									owner: 'Destination',
								},
								// Ibucket doesn't get the cross account id,
								// returns the cdk profile account id.
								// account: destinationBucket.env.account,
								account: bucketAccountId,
							},
							status: 'Enabled',
							priority: index++,
							filter: {
								prefix: '',
							},
							deleteMarkerReplication: {
								status: 'Enabled',
							},
							id: `r${bucketAccountId}`,
						};
					}
				),
			};
		const cfnMasterBucket = masterBucket.node.defaultChild as s3.CfnBucket;
		cfnMasterBucket.replicationConfiguration = replicationConfiguration;
	}

	private getDestinationBucket(
		accountId: string,
		secretName: string,
		logicalId: string
	): s3.IBucket {
		// Get Bucket ARN from Secrets Manager
		const BucketArn = secretsManager.Secret.fromSecretCompleteArn(
			this,
			`${logicalId}-secret`,
			`arn:aws:secretsmanager:eu-west-1:${accountId}:secret:${secretName}`
		).secretValue.unsafeUnwrap();

		// Return IBucket
		return s3.Bucket.fromBucketArn(this, `${logicalId}-bucket`, BucketArn);
	}
}

/**
 * Attempt to use secrets manager to pull the role in
 * Issue with using Dynamic reference to attach the policy to the Role
 */
// const replicationRoleArn = secretsManager.Secret.fromSecretCompleteArn(
// 	this,
// 	'replication-role-arn-secret',
// 	`arn:aws:secretsmanager:eu-west-1:${roleAccount}:secret:${secretRole}`
// ).secretValue.unsafeUnwrap();

// const replicationRole = iam.Role.fromRoleArn(
// 	this,
// 	'replication-role',
// 	replicationRoleArn
// );

// new iam.ManagedPolicy(this, 'managed-policy', {
// 	roles: [replicationRole],
// 	statements: [
// 		new iam.PolicyStatement({
// 			resources: [masterBucket.bucketArn],
// 			actions: ['s3:GetReplicationConfiguration', 's3:ListBucket'],
// 		}),
// 		new iam.PolicyStatement({
// 			resources: [masterBucket.arnForObjects('*')],
// 			actions: [
// 				's3:GetObjectVersion',
// 				's3:GetObjectVersionAcl',
// 				's3:GetObjectVersionForReplication',
// 				's3:GetObjectLegalHold',
// 				's3:GetObjectVersionTagging',
// 				's3:GetObjectRetention',
// 			],
// 		}),
// 		...replicationBuckets.map((destinationBucket) => {
// 			return new iam.PolicyStatement({
// 				resources: [destinationBucket.arnForObjects('*')],
// 				actions: [
// 					's3:ReplicateObject',
// 					's3:ReplicateDelete',
// 					's3:ReplicateTags',
// 					's3:GetObjectVersionTagging',
// 					's3:ObjectOwnerOverrideToBucketOwner',
// 				],
// 			});
// 		}),
// 	],
// });

// replicationRole.attachInlinePolicy(
// 	new iam.Policy(this, 'amended-policy', {
// 		statements: [
// 			new iam.PolicyStatement({
// 				resources: [masterBucket.bucketArn],
// 				actions: ['s3:GetReplicationConfiguration', 's3:ListBucket'],
// 			}),
// 			new iam.PolicyStatement({
// 				resources: [masterBucket.arnForObjects('*')],
// 				actions: [
// 					's3:GetObjectVersion',
// 					's3:GetObjectVersionAcl',
// 					's3:GetObjectVersionForReplication',
// 					's3:GetObjectLegalHold',
// 					's3:GetObjectVersionTagging',
// 					's3:GetObjectRetention',
// 				],
// 			}),
// 			...replicationBuckets.map((destinationBucket) => {
// 				return new iam.PolicyStatement({
// 					resources: [destinationBucket.arnForObjects('*')],
// 					actions: [
// 						's3:ReplicateObject',
// 						's3:ReplicateDelete',
// 						's3:ReplicateTags',
// 						's3:GetObjectVersionTagging',
// 						's3:ObjectOwnerOverrideToBucketOwner',
// 					],
// 				});
// 			}),
// 		],
// 	})
// );
