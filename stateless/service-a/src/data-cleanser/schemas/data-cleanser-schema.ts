export const schema = {
	type: 'object',
	required: ['stores'],
	maxProperties: 1,
	minProperties: 1,
	properties: {
		stores: {
			type: 'array',
			items: {
				type: 'object',
				required: ['storeId', 'storeLocation', 'storePrefix'],
				properties: {
					storeId: {
						type: 'string',
						pattern: '^[0-9]+$',
					},
					storeLocation: {
						type: 'string',
						pattern: '^[a-zA-Z-]+$',
					},
					storePrefix: {
						type: 'string',
						pattern: '^[a-zA-Z]+$',
					},
				},
			},
		},
	},
};
