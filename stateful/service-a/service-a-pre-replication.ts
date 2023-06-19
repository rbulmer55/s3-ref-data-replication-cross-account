import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as iam from 'aws-cdk-lib/aws-iam';
import { CfnOutput, Fn, SecretValue } from 'aws-cdk-lib';
import * as secretsManager from 'aws-cdk-lib/aws-secretsmanager';
import * as kms from 'aws-cdk-lib/aws-kms';

/**
 * Name: PreReplication Stack -
 * Description: Used for deploying resources used by all accounts
 * Usage: The Replication Configuration requires a Role to exist to add to
 * 	the bucket policy. The Role is then updated after the destionation and
 * 	source bucket have been deployed; The bucket ARNs are required in the
 * 	IAM policy Statements.
 */
export class S3ReplicationDataStackPreReplication extends cdk.Stack {
	public readonly replicationRole: iam.Role;
	constructor(scope: Construct, id: string, props?: cdk.StackProps) {
		super(scope, id, props);

		const { ORG_ID: orgId } = process.env;
		if (!orgId) {
			throw new Error('Organisation ID environment not set.');
		}

		const replicationRole = new iam.Role(this, 'replication-role', {
			assumedBy: new iam.ServicePrincipal('s3.amazonaws.com'),
			path: '/service-role/',
			description: 'IAM service role for s3 replication',
			// Specify the Name here, so stackAStateful can ammend later
			// Todo: convert/remove magic string
			roleName: 's3-master-replication-role',
		});
		this.replicationRole = replicationRole;

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

		const roleSecret = new secretsManager.Secret(
			this,
			'replication-role-secret',
			{
				secretStringValue: SecretValue.unsafePlainText(replicationRole.roleArn),
				encryptionKey: secretKey,
			}
		);

		roleSecret.addToResourcePolicy(
			new iam.PolicyStatement({
				actions: ['secretsmanager:GetSecretValue'],
				resources: [roleSecret.secretArn],
				principals: [new iam.OrganizationPrincipal(orgId)],
			})
		);

		// output secret name to use in other deployments
		// include the random chars required for lookup
		// arn:aws:secretsmanager:<Region>:<AccountId>:secret:SecretName-6RandomCharacters
		new CfnOutput(this, 'cfn-secret-name', {
			exportName: 'secretNameWithRandomChars',
			value: Fn.select(6, Fn.split(':', roleSecret.secretArn)),
		});
	}
}
