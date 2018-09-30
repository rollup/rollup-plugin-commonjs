module.exports = {
	description: 'resolves imports of directories via index.js',
	pluginOptions: {
		dynamicRequires: [
			'function/dynamic-require-resolve-index/**/index.js',
			'function/dynamic-require-resolve-index/sub/*.js'
		]
	}
};
