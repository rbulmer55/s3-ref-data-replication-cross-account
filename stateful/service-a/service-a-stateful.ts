import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as iam from 'aws-cdk-lib/aws-iam';
import { RemovalPolicy } from 'aws-cdk-lib';
import { ArnPrincipal, ManagedPolicy } from 'aws-cdk-lib/aws-iam';

interface CustomProps extends cdk.StackProps {
	replicationRoleArn: string;
	replicationBuckets: s3.IBucket[];
}

const orgId = 'o-abrfjp2g8q';

export class StatefulS3ReplicationDataStackServiceA extends cdk.Stack {
	public readonly uploadBucket: s3.Bucket;
	public readonly masterBucket: s3.Bucket;

	constructor(scope: Construct, id: string, props?: CustomProps) {
		super(scope, id, props);

		if (!props?.replicationBuckets.length) {
			throw new Error('No Replication buckets Specified');
		}

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
			bucketName: 's3-euw1-rb-2023-master-bucket',
		});
		this.masterBucket = masterBucket;

		const replicationRole = iam.Role.fromRoleName(
			this,
			'replication-role',
			'iam-euw1-rb-2023-data-rep-role'
		);

		const destinationBucketStatements: iam.PolicyStatement[] =
			props.replicationBuckets.map((destinationBucket) => {
				return new iam.PolicyStatement({
					resources: [destinationBucket.arnForObjects('*')],
					actions: [
						's3:ReplicateObject',
						's3:ReplicateDelete',
						's3:ReplicateTags',
						's3:GetObjectVersionTagging',
						's3:ObjectOwnerOverrideToBucketOwner',
					],
					conditions: {
						'ForAllValues:StringEquals': {
							'aws:PrincipalOrgID': orgId,
						},
					},
				});
			});

		replicationRole.addManagedPolicy(
			new ManagedPolicy(this, 'ammended-rep-role-policy', {
				statements: [
					new iam.PolicyStatement({
						resources: [masterBucket.bucketArn],
						actions: ['s3:GetReplicationConfiguration', 's3:ListBucket'],
						conditions: {
							'ForAllValues:StringEquals': {
								'aws:PrincipalOrgID': orgId,
							},
						},
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
						conditions: {
							'ForAllValues:StringEquals': {
								'aws:PrincipalOrgID': orgId,
							},
						},
					}),
					...destinationBucketStatements,
				],
			})
		);

		const replicationConfiguration: s3.CfnBucket.ReplicationConfigurationProperty =
			{
				role: replicationRole.roleArn,
				rules: props.replicationBuckets.map(
					(destinationBucket, index): s3.CfnBucket.ReplicationRuleProperty => {
						return {
							destination: {
								bucket: destinationBucket.bucketArn,
								/**
								 * Cross-Account Settings
								 * account: 'account-id',
								 * accessControlTranslation: { owner: 'account-name' },
								 */
								account: destinationBucket.env.account,
								//accessControlTranslation: {owner: destinationBucket.}
							},
							status: 'Enabled',
							priority: index + 1,
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
