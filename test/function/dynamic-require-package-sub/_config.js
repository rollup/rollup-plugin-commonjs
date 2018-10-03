const nodeResolve = require('rollup-plugin-node-resolve');

module.exports = {
	input: 'sub/entry.js',
	description: 'resolves imports of node_modules from subdirectories',
	options: {
		plugins: [nodeResolve()]
	},
	pluginOptions: {
		dynamicRequireTargets: [
			'function/dynamic-require-package-sub/node_modules/custom-module/**'
		]
	}
};
