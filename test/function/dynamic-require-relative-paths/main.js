function takeModuleWithDelimiter(name, delimiter) {
	return require('.' + delimiter + name.replace(/=/g, delimiter));
}

assert.equal(takeModuleWithDelimiter('sub=submodule.js', '/'), 'submodule');
assert.equal(takeModuleWithDelimiter('sub=subsub=subsubmodule.js', '/'), 'subsubmodule');
assert.equal(takeModuleWithDelimiter('sub=submodule.js', '\\'), 'submodule');
assert.equal(takeModuleWithDelimiter('sub=subsub=subsubmodule.js', '\\'), 'subsubmodule');
