import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
// import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { RemovalPolicy } from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import { ArnPrincipal } from 'aws-cdk-lib/aws-iam';

interface CustomProps extends cdk.StackProps {
	replicationRoleArn: string;
}

export class StatefulS3ReplicationDataStackServiceC extends cdk.Stack {
	public readonly replicationBucket: s3.Bucket;
	constructor(scope: Construct, id: string, props?: CustomProps) {
		super(scope, id, props);

		if (!props?.replicationRoleArn) {
			throw new Error('Role arn not specified');
		}

		const dataBucket = new s3.Bucket(this, 'reference-data-bucket-c', {
			objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
			blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
			enforceSSL: true,
			encryption: s3.BucketEncryption.S3_MANAGED,
			removalPolicy: RemovalPolicy.DESTROY,
			versioned: true,
			bucketName: 's3-euw1-rb-2023-ref-data-c-bucket',
		});
		this.replicationBucket = dataBucket;

		dataBucket.addToResourcePolicy(
			new iam.PolicyStatement({
				resources: [dataBucket.arnForObjects('*')],
				actions: ['s3:ReplicateDelete', 's3:ReplicateObject'],
				principals: [new ArnPrincipal(props.replicationRoleArn)],
			})
		);
		dataBucket.addToResourcePolicy(
			new iam.PolicyStatement({
				principals: [new ArnPrincipal(props.replicationRoleArn)],
				resources: [dataBucket.bucketArn],
				actions: [
					's3:List*',
					's3:GetBucketVersioning',
					's3:PutBucketVersioning',
				],
			})
		);
	}
}
