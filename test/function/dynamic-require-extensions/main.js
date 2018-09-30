function takeModule(withName) {
	return require('./' + withName);
}

const withExtension = takeModule('submodule.js');
const withoutExtension = takeModule('submodule');

assert.equal(withExtension.name, 'submodule');
assert.equal(withoutExtension.name, 'submodule');

withExtension.value = 'mutated';

assert.equal(withoutExtension.value, 'mutated');
