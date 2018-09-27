let message;

function takeModule(withName) {
	return require('./' + withName);
}

try {
	const submodule = takeModule('submodule');
	message = submodule();
} catch ( err ) {
	message = err.message;
}

assert.equal( message, 'Hello there' );
