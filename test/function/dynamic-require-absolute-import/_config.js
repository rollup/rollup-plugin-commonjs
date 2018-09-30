module.exports = {
	description: 'resolves non-relative paths via node_modules',
	pluginOptions: {
		dynamicRequires: [
			'function/dynamic-require-absolute-import/node_modules/**/*.js',
			'function/dynamic-require-absolute-import/sub/**/*.js'
		]
	}
};
