import babel from 'rollup-plugin-babel';
import json from 'rollup-plugin-json';
import pkg from './package.json';

export default {
	input: 'src/index.js',
	plugins: [
		json(),
		babel()
	],
	external: Object.keys(pkg.dependencies).concat(['fs', 'path']),
	output: [
		{
			format: 'es',
			file: pkg.module,
			sourcemap: true
		},
		{
			format: 'cjs',
			file: pkg.main,
			sourcemap: true
		}
	]
};
