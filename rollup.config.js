import babel from 'rollup-plugin-babel';

var external = Object.keys( require( './package.json' ).dependencies ).concat([ 'fs', 'path' ]);

export default {
	entry: 'src/index.js',
	plugins: [ babel() ],
	external: external
};
