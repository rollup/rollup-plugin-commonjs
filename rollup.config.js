import buble from 'rollup-plugin-buble';
import pkg from './package.json';

export default {
	input: 'src/index.js',
	plugins: [
		buble({
			transforms: { dangerousForOf: true }
		})
	],
	external: Object.keys( pkg.dependencies ).concat([ 'fs', 'path' ]),
	sourcemap: true,
	output: [
		{
			format: 'es',
			file: pkg.module
		},
		{
			format: 'cjs',
			file: pkg.main
		}
	]
};
