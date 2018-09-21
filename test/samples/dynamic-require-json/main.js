function takeModule(withName) {
	return require('./' + withName);
}

assert.deepEqual(takeModule('dynamic.json'), {value: 'present'});
assert.deepEqual(takeModule('dynamic'), {value: 'present'});
