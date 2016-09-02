const assert = require( 'assert' );

module.exports = {
	global: global => {
		assert.equal( global.a, undefined );
		assert.equal( global.b, 2 );
		assert.equal( global.c, undefined );
	}
};
