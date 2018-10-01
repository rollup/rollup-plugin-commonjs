module.exports = {
	description: 'resolves both windows and posix paths',
	pluginOptions: {
		dynamicRequireTargets: [
			'function/dynamic-require-relative-paths/sub/submodule.js',
			'function/dynamic-require-relative-paths/sub/subsub/subsubmodule.js'
		]
	}
};
