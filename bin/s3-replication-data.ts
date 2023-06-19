#!/usr/bin/env node
import 'source-map-support/register';

import * as cdk from 'aws-cdk-lib';

//PreReplicationDeployment
import { S3ReplicationDataStackPreReplication } from '../stateful/service-a/service-a-pre-replication';

//Stateful
import { StatefulS3ReplicationDataStackServiceA } from '../stateful/service-a/service-a-stateful';
import { StatefulS3ReplicationDataStackServiceB } from '../stateful/service-b/service-b-stateful';
import { StatefulS3ReplicationDataStackServiceC } from '../stateful/service-c/service-c-stateful';

//Stateless
import { StatelessS3ReplicationDataStackServiceA } from '../stateless/service-a/service-a-stateless';

const app = new cdk.App();

/**
 * Stacks in Deployment Order.
 * Each Service can be moved to its own repo/Owned by another service team
 * Together here for example/reference
 */
new S3ReplicationDataStackPreReplication(
	app,
	'S3ReplicationDataStackPreReplication',
	{}
);

new StatefulS3ReplicationDataStackServiceB(
	app,
	'S3ReplicationDataStackStatefulB',
	{}
);

new StatefulS3ReplicationDataStackServiceC(
	app,
	'S3ReplicationDataStackStatefulC',
	{}
);

const statefulA = new StatefulS3ReplicationDataStackServiceA(
	app,
	'S3ReplicationDataStackStatefulA',
	{}
);

new StatelessS3ReplicationDataStackServiceA(
	app,
	'S3ReplicationDataStackStatelessA',
	{
		uploadBucket: statefulA.uploadBucket,
		masterBucket: statefulA.masterBucket,
	}
);
