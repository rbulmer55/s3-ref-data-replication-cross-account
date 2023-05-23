import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as iam from 'aws-cdk-lib/aws-iam';
import { RemovalPolicy } from 'aws-cdk-lib';
import { ArnPrincipal } from 'aws-cdk-lib/aws-iam';

const orgId = 'o-abrfjp2g8q';

export class StatefulS3ReplicationDataStackShared extends cdk.Stack {
	public readonly roleArn: string;
	constructor(scope: Construct, id: string, props?: cdk.StackProps) {
		super(scope, id, props);

		const replicationRole = new iam.Role(this, 'replication-role', {
			assumedBy: new iam.ServicePrincipal('s3.amazonaws.com'),
			path: '/service-role/',
			description: 'IAM service role for s3 replication',
			roleName: 'iam-euw1-rb-2023-data-rep-role',
		});

		this.roleArn = replicationRole.roleArn;
	}
}
