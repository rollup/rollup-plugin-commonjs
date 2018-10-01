const nodeResolve = require('rollup-plugin-node-resolve');

module.exports = {
	description: 'resolves imports of directories via package.json files',
	options: {
		plugins: [nodeResolve()]
	},
	pluginOptions: {
		dynamicRequireTargets: [
			'function/dynamic-require-package',
			'function/dynamic-require-package/sub',
			'function/dynamic-require-package/node_modules/custom-module'
		]
	}
};
