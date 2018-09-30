function takeModule(name) {
	return require(name);
}

assert.equal(takeModule('.'), 'same-directory');
assert.equal(takeModule('./'), 'same-directory');
assert.equal(takeModule('.//'), 'same-directory');

assert.equal(takeModule('./sub'), 'sub');

assert.equal(takeModule('custom-module'), 'custom-module');
assert.deepEqual(require('./sub/sub'), { parent: 'same-directory', customModule: 'custom-module' });
