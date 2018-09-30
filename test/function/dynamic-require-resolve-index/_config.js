const nodeResolve = require('rollup-plugin-node-resolve');

module.exports = {
	description: 'resolves imports of directories via index.js',
	options: {
		plugins: [nodeResolve()]
	},
	pluginOptions: {
		dynamicRequires: [
			'function/dynamic-require-resolve-index',
			'function/dynamic-require-resolve-index/sub',
			'function/dynamic-require-resolve-index/node_modules/custom-module'
		]
	}
};
