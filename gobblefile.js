var gobble = require( 'gobble' );

module.exports = gobble( 'src' )
	.transform( 'rollup-babel', {
		entry: 'index.js',
		dest: 'rollup-plugin-commonjs.js',
		format: 'cjs',
		external: [ 'rollup-pluginutils', 'fs', 'path' ]
	});
