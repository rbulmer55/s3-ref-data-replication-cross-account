import Ajv from 'ajv';
import { S3Event } from 'aws-lambda';
import { S3 } from 'aws-sdk';
import { schema } from './schemas/data-cleanser-schema';

const s3 = new S3();
const ajv = new Ajv();

export const handler = async (event: S3Event) => {
	const { SOURCE_BUCKET: srcBucketName, DESTINATION_BUCKET: destBucketName } =
		process.env;

	if (!srcBucketName || !destBucketName) {
		throw new Error(
			'Either the source or destination bucket has not been provided.'
		);
	}

	for await (const record of event.Records) {
		// Debug
		// console.log('Event Name: %s', record.eventName);
		// console.log('S3 Request: %j', record.s3);

		const rawObject = await s3
			.getObject({
				Key: record.s3.object.key,
				Bucket: srcBucketName || '',
			})
			.promise();

		const dataObject = JSON.parse(rawObject.Body?.toString('utf-8') || '');

		// debug
		// console.log(dataObject);

		if (!ajv.validate(schema, dataObject)) {
			throw new Error(
				'Imported data is invalid, please ensure it matches the schema.'
			);
		}

		await s3
			.putObject({
				Bucket: destBucketName,
				Body: JSON.stringify(dataObject),
				Key: 'stores-reference-data.json',
				ContentType: 'application/json',
			})
			.promise();
	}
};
