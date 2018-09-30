const json = require('rollup-plugin-json');

module.exports = {
	description: 'dynamically requires json files',
	options: {
		plugins: [json()]
	},
	pluginOptions: {
		dynamicRequires: ['function/dynamic-require-json/dynamic.json']
	}
};
