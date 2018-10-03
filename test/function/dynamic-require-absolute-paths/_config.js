module.exports = {
	description: 'resolves both windows and posix absolute paths',
	pluginOptions: {
		dynamicRequireTargets: [
			'function/dynamic-require-absolute-paths/subsubmodule.js'
		]
	}
};
