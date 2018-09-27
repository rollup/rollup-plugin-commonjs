function takeModule(withName) {
	return require('./' + withName);
}

assert.equal(takeModule('submodule1.js'), 'submodule1');
assert.equal(takeModule('submodule2.js'), 'submodule2');
assert.equal(takeModule('extramodule1.js'), 'extramodule1');

let hasThrown = false;
try {
	takeModule('extramodule2.js');
} catch (error) {
	assert.equal(error.message, "Cannot find module './extramodule2.js'");
	hasThrown = true;
}
assert.ok(hasThrown);
