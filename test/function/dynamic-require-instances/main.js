function takeModule(withName) {
	return require(withName);
}

takeModule('./direct').value = 'direct-instance';
assert.equal(takeModule('./direct/index.js').value, 'direct-instance');
assert.equal(require('./direct/index.js').value, 'direct-instance');

takeModule('./package').value = 'package-instance';
assert.equal(takeModule('./package/main.js').value, 'package-instance');
assert.equal(require('./package/main.js').value, 'package-instance');
