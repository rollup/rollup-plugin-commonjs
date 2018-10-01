const nodeResolve = require('rollup-plugin-node-resolve');

module.exports = {
	description: 'returns the same module instance if required directly or via package.json/index.js',
	options: {
		plugins: [nodeResolve()]
	},
	pluginOptions: {
		dynamicRequireTargets: [
			'function/dynamic-require-instances/direct',
			'function/dynamic-require-instances/direct/index.js',
			'function/dynamic-require-instances/package',
			'function/dynamic-require-instances/package/main.js'
		]
	}
};
