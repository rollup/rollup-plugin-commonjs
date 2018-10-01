module.exports = {
	description: 'supports glob patterns',
	pluginOptions: {
		dynamicRequireTargets: [
			'function/dynamic-require-globs/s*.js',
			'function/dynamic-require-globs/e*.*',
			'!function/dynamic-require-globs/e*2.js'
		]
	}
};
