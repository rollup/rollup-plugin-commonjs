var gobble = require( 'gobble' );
var babel = require( 'rollup-plugin-babel' );

var external = Object.keys( require( './package.json' ).dependencies ).concat([ 'fs', 'path' ]);

module.exports = gobble([
	gobble( 'src' ).transform( 'rollup', {
		entry: 'index.js',
		dest: 'rollup-plugin-commonjs.cjs.js',
		plugins: [ babel() ],
		format: 'cjs',
		external: external
	}),

	gobble( 'src' ).transform( 'rollup', {
		entry: 'index.js',
		dest: 'rollup-plugin-commonjs.es6.js',
		plugins: [ babel() ],
		format: 'es6',
		external: external
	})
]);
