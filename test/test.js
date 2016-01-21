import * as path from 'path';
import * as assert from 'assert';
import { SourceMapConsumer } from 'source-map';
import { rollup } from 'rollup';
import npm from 'rollup-plugin-npm';
import commonjs from '..';

process.chdir( __dirname );

function executeBundle ( bundle ) {
	const generated = bundle.generate({
		format: 'cjs'
	});

	const fn = new Function ( 'module', 'assert', generated.code );
	let module = {};

	fn( module, assert );

	return module;
}

describe( 'rollup-plugin-commonjs', () => {
	it( 'converts a basic CommonJS module', () => {
		return rollup({
			entry: 'samples/basic/main.js',
			plugins: [ commonjs() ]
		}).then( bundle => {
			assert.equal( executeBundle( bundle ).exports, 42 );
		});
	});

	it( 'converts a CommonJS module that mutates exports instead of replacing', () => {
		return rollup({
			entry: 'samples/exports/main.js',
			plugins: [ commonjs() ]
		}).then( bundle => {
			assert.equal( executeBundle( bundle ).exports, 'BARBAZ' );
		});
	});

	it( 'converts inline require calls', () => {
		return rollup({
			entry: 'samples/inline/main.js',
			plugins: [ commonjs() ]
		}).then( bundle => {
			assert.equal( executeBundle( bundle ).exports(), 2 );
		});
	});

	it( 'generates a sourcemap', () => {
		return rollup({
			entry: 'samples/sourcemap/main.js',
			plugins: [ commonjs({ sourceMap: true }) ]
		}).then( bundle => {
			const generated = bundle.generate({
				format: 'cjs',
				sourceMap: true,
				sourceMapFile: path.resolve( 'bundle.js' )
			});

			const smc = new SourceMapConsumer( generated.map );

			let loc = smc.originalPositionFor({ line: 5, column: 17 }); // 42
			assert.equal( loc.source, 'samples/sourcemap/foo.js' );
			assert.equal( loc.line, 1 );
			assert.equal( loc.column, 15 );

			loc = smc.originalPositionFor({ line: 9, column: 8 }); // log
			assert.equal( loc.source, 'samples/sourcemap/main.js' );
			assert.equal( loc.line, 2 );
			assert.equal( loc.column, 8 );
		});
	});

	it( 'finds index.js files', () => {
		return rollup({
			entry: 'samples/index/main.js',
			plugins: [ commonjs() ]
		}).then( executeBundle );
	});

	it( 'handles reassignments to imports', () => {
		return rollup({
			entry: 'samples/reassignment/main.js',
			plugins: [ commonjs() ]
		}).then( executeBundle );
	});

	it( 'handles imports with a trailing slash', () => {
		// yes this actually happens. Not sure why someone would do this
		// https://github.com/nodejs/readable-stream/blob/077681f08e04094f087f11431dc64ca147dda20f/lib/_stream_readable.js#L125
		return rollup({
			entry: 'samples/trailing-slash/main.js',
			plugins: [ commonjs() ]
		}).then( executeBundle );
	});

	it( 'handles imports with a non-extension dot', () => {
		return rollup({
			entry: 'samples/dot/main.js',
			plugins: [ commonjs() ]
		}).then( executeBundle );
	});

	it( 'handles shadowed require', () => {
		return rollup({
			entry: 'samples/shadowing/main.js',
			plugins: [ commonjs() ]
		}).then( executeBundle );
	});

	it( 'identifies named exports', () => {
		return rollup({
			entry: 'samples/named-exports/main.js',
			plugins: [ commonjs() ]
		}).then( executeBundle );
	});

	it( 'handles references to `global`', () => {
		return rollup({
			entry: 'samples/global/main.js',
			plugins: [ commonjs() ]
		}).then( bundle => {
			const generated = bundle.generate({
				format: 'cjs'
			});

			let window = {};

			const fn = new Function ( 'window', 'module', generated.code );
			fn( window, {} );

			assert.equal( window.foo, 'bar', generated.code );
		});
	});

	it( 'handles transpiled CommonJS modules', () => {
		return rollup({
			entry: 'samples/corejs/literal-with-default.js',
			plugins: [ commonjs() ]
		}).then( bundle => {
			const generated = bundle.generate({
				format: 'cjs'
			});

			let module = { exports: {} };

			const fn = new Function ( 'module', 'exports', generated.code );
			fn( module, module.exports );

			assert.equal( module.exports, 'foobar', generated.code );
		});
	});

	it( 'handles bare imports', () => {
		return rollup({
			entry: 'samples/bare-import/main.js',
			plugins: [ commonjs() ]
		}).then( executeBundle );
	});

	it( 'does not export __esModule', () => {
		return rollup({
			entry: 'samples/__esModule/main.js',
			plugins: [ commonjs() ]
		}).then( bundle => {
			const generated = bundle.generate({
				format: 'cjs'
			});

			const fn = new Function ( 'module', 'exports', generated.code );
			let module = { exports: {} };

			fn( module, module.exports );

			assert.ok( !module.exports.__esModule );
		});
	});

	it( 'allows named exports to be added explicitly via config', () => {
		return rollup({
			entry: 'samples/custom-named-exports/main.js',
			plugins: [
				npm({ main: true }),
				commonjs({
					namedExports: {
						'samples/custom-named-exports/secret-named-exporter.js': [ 'named' ],
						'external': [ 'message' ]
					}
				})
			]
		}).then( executeBundle );
	});

	it( 'converts a CommonJS module with custom file extension', () => {
		return rollup({
			entry: 'samples/extension/main.coffee',
			plugins: [ commonjs({ extensions: ['.coffee' ]}) ]
		}).then( bundle => {
			assert.equal( executeBundle( bundle ).exports, 42 );
		});
	});

	it( 'rewrites top-level this expressions', () => {
		return rollup({
			entry: 'samples/this/main.js',
			plugins: [ commonjs() ]
		}).then( executeBundle );
	});

	it( 'handles transpiled CommonJS imports with named and default exports (#29)', () => {
		return rollup({
			entry: 'samples/default-and-named/main.js',
			plugins: [ commonjs() ]
		}).then( executeBundle );
	});
});
