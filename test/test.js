var assert = require( 'assert' );
var rollup = require( 'rollup' );
var plugin = require( '..' );

process.chdir( __dirname );

describe( 'rollup-plugin-commonjs', function () {
	it( 'converts a basic CommonJS module', function () {
		return rollup.rollup({
			entry: 'samples/basic/main.js',
			plugins: [ plugin() ]
		}).then( function ( bundle ) {
			var generated = bundle.generate({
				format: 'cjs'
			});

			var fn = new Function ( 'module', generated.code );
			var module = {};

			fn( module );

			assert.equal( module.exports, 42 );
		})
	});
});
