const assert = require( 'assert' );

module.exports = {
	options: {
		external: [ 'foo' ]
	},
	exports: exports => {
		assert.equal( exports, 'foo' );
	}
};
