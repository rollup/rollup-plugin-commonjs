module.exports = {
	description: 'resolves non-relative paths via node_modules',
	pluginOptions: {
		dynamicRequires: [
			'function/dynamic-require-absolute-import/sub/node_modules/module/direct.js',
			'function/dynamic-require-absolute-import/sub/node_modules/module/nested/nested.js',
			'function/dynamic-require-absolute-import/node_modules/parent-module/parent.js'
		]
	}
};
