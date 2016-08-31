import buble from 'rollup-plugin-buble';

var external = Object.keys( require( './package.json' ).dependencies ).concat([ 'fs', 'path' ]);

export default {
	entry: 'src/index.js',
	plugins: [
		buble({
			transforms: { dangerousForOf: true }
		})
	],
	external: external,
	sourceMap: true
};
