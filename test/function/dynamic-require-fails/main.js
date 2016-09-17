let message;

try {
	const req = require;
	req( 'nope' );
} catch ( err ) {
	message = err.message;
}

assert.equal( message, 'Dynamic requires are not currently supported by rollup-plugin-commonjs' );
