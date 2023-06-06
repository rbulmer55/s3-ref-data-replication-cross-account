#!/usr/bin/env node
import 'source-map-support/register';

import * as cdk from 'aws-cdk-lib';

//Stateful
import { StatefulS3ReplicationDataStackServiceA } from '../stateful/service-a/service-a-stateful';
import { StatefulS3ReplicationDataStackServiceB } from '../stateful/service-b/service-b-stateful';
import { StatefulS3ReplicationDataStackServiceC } from '../stateful/service-c/service-c-stateful';

//Stateless
import { StatelessS3ReplicationDataStackServiceA } from '../stateless/service-a/service-a-stateless';
import { StatefulS3ReplicationDataStackShared } from '../stateful/shared/shared-stateful';

const app = new cdk.App();

new StatefulS3ReplicationDataStackShared(
	app,
	'S3ReplicationDataStackShared',
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
