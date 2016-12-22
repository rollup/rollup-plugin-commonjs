const assert = require( 'assert' );

module.exports = {
	exports: function ( exports ) {
		assert.equal( exports.encoded, encodeURIComponent( 'test string' ) );
	}
};
