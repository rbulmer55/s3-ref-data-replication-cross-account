#!/usr/bin/env node
import 'source-map-support/register';

import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';

//Stateful
import { StatefulS3ReplicationDataStackServiceA } from '../stateful/service-a/service-a-stateful';
import { StatefulS3ReplicationDataStackServiceB } from '../stateful/service-b/service-b-stateful';
import { StatefulS3ReplicationDataStackServiceC } from '../stateful/service-c/service-c-stateful';

//Stateless
import { StatelessS3ReplicationDataStackServiceA } from '../stateless/service-a/service-a-stateless';
import { StatefulS3ReplicationDataStackShared } from '../stateful/shared/shared-stateful';

const app = new cdk.App();

const sharedStack = new StatefulS3ReplicationDataStackShared(
	app,
	'S3ReplicationDataStackStatefulShared',
	{
		env: { account: '' },
	}
);

const stackB = new StatefulS3ReplicationDataStackServiceB(
	app,
	'S3ReplicationDataStackStatefulB',
	{
		replicationRoleArn: sharedStack.roleArn,
		env: { account: '' },
	}
);
const stackC = new StatefulS3ReplicationDataStackServiceC(
	app,
	'S3ReplicationDataStackStatefulC',
	{
		replicationRoleArn: sharedStack.roleArn,
		env: { account: '' },
	}
);

const statefulA = new StatefulS3ReplicationDataStackServiceA(
	app,
	'S3ReplicationDataStackStatefulA',
	{
		replicationBuckets: [stackB.replicationBucket, stackC.replicationBucket],
		replicationRoleArn: sharedStack.roleArn,
		env: { account: '' },
	}
);

new StatelessS3ReplicationDataStackServiceA(
	app,
	'S3ReplicationDataStackStatelessA',
	{
		uploadBucket: statefulA.uploadBucket,
		masterBucket: statefulA.masterBucket,
		env: { account: '' },
	}
);
