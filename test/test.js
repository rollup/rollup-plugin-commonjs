var path = require( 'path' );
var assert = require( 'assert' );
var SourceMapConsumer = require( 'source-map' ).SourceMapConsumer;
var rollup = require( 'rollup' );
var commonjs = require( '..' );

process.chdir( __dirname );

describe( 'rollup-plugin-commonjs', function () {
	it( 'converts a basic CommonJS module', function () {
		return rollup.rollup({
			entry: 'samples/basic/main.js',
			plugins: [ commonjs() ]
		}).then( function ( bundle ) {
			var generated = bundle.generate({
				format: 'cjs'
			});

			var fn = new Function ( 'module', generated.code );
			var module = {};

			fn( module );

			assert.equal( module.exports, 42 );
		});
	});

	it( 'converts a CommonJS module that mutates exports instead of replacing', function () {
		return rollup.rollup({
			entry: 'samples/exports/main.js',
			plugins: [ commonjs() ]
		}).then( function ( bundle ) {
			var generated = bundle.generate({
				format: 'cjs'
			});

			var fn = new Function ( 'module', generated.code );
			var module = {};

			fn( module );

			assert.equal( module.exports, 'BARBAZ' );
		});
	});

	it( 'converts inline require calls', function () {
		return rollup.rollup({
			entry: 'samples/inline/main.js',
			plugins: [ commonjs() ]
		}).then( function ( bundle ) {
			var generated = bundle.generate({
				format: 'cjs'
			});

			var fn = new Function ( 'module', generated.code );
			var module = {};

			fn( module );

			assert.equal( module.exports(), 2 );
		});
	});

	it( 'generates a sourcemap', function () {
		return rollup.rollup({
			entry: 'samples/sourcemap/main.js',
			plugins: [ commonjs({ sourceMap: true }) ]
		}).then( function ( bundle ) {
			var generated = bundle.generate({
				format: 'cjs',
				sourceMap: true,
				sourceMapFile: path.resolve( 'bundle.js' )
			});

			var smc = new SourceMapConsumer( generated.map );

			var loc = smc.originalPositionFor({ line: 3, column: 17 }); // 42
			assert.equal( loc.source, 'samples/sourcemap/foo.js' );
			assert.equal( loc.line, 1 );
			assert.equal( loc.column, 15 );

			loc = smc.originalPositionFor({ line: 6, column: 8 });
			assert.equal( loc.source, 'samples/sourcemap/main.js' );
			assert.equal( loc.line, 2 );
			assert.equal( loc.column, 8 );
		});
	});

	it( 'finds index.js files', function () {
		return rollup.rollup({
			entry: 'samples/index/main.js',
			plugins: [ commonjs() ]
		}).then( function ( bundle ) {
			var generated = bundle.generate({
				format: 'cjs'
			});

			var fn = new Function ( 'module', 'assert', generated.code );
			fn( {}, assert );
		});
	});

	it( 'handles reassignments to imports', function () {
		return rollup.rollup({
			entry: 'samples/reassignment/main.js',
			plugins: [ commonjs() ]
		}).then( function ( bundle ) {
			var generated = bundle.generate({
				format: 'cjs'
			});

			var fn = new Function ( 'module', 'assert', generated.code );
			fn( {}, assert );
		});
	});

	it( 'handles imports with a trailing slash', function () {
		// yes this actually happens. Not sure why someone would do this
		// https://github.com/nodejs/readable-stream/blob/077681f08e04094f087f11431dc64ca147dda20f/lib/_stream_readable.js#L125
		return rollup.rollup({
			entry: 'samples/trailing-slash/main.js',
			plugins: [ commonjs() ]
		}).then( function ( bundle ) {
			var generated = bundle.generate({
				format: 'cjs'
			});

			var fn = new Function ( 'module', 'assert', generated.code );
			fn( {}, assert );
		});
	});

	it( 'handles imports with a non-extension dot', function () {
		return rollup.rollup({
			entry: 'samples/dot/main.js',
			plugins: [ commonjs() ]
		}).then( function ( bundle ) {
			var generated = bundle.generate({
				format: 'cjs'
			});

			var fn = new Function ( 'module', 'assert', generated.code );
			fn( {}, assert );
		});
	});

	it( 'handles shadowed require', function () {
		return rollup.rollup({
			entry: 'samples/shadowing/main.js',
			plugins: [ commonjs() ]
		}).then( function ( bundle ) {
			var generated = bundle.generate({
				format: 'cjs'
			});

			var fn = new Function ( 'module', 'assert', generated.code );
			fn( {}, assert );
		});
	});

	it( 'identifies named exports', function () {
		return rollup.rollup({
			entry: 'samples/named-exports/main.js',
			plugins: [ commonjs() ]
		}).then( function ( bundle ) {
			var generated = bundle.generate({
				format: 'cjs'
			});

			var fn = new Function ( 'module', 'assert', generated.code );
			fn( {}, assert );
		});
	});

	it( 'identifies named exports from object literals', function () {
		return rollup.rollup({
			entry: 'samples/named-exports-from-object-literal/main.js',
			plugins: [ commonjs() ]
		}).then( function ( bundle ) {
			var generated = bundle.generate({
				format: 'cjs'
			});

			assert.ok( generated.code.indexOf( 'module' ) !== -1,
				'The generated code should contain a "module" variable.' );

			var fn = new Function ( 'module', 'assert', generated.code );
			fn( {}, assert );
		});
	});

	it( 'handles references to `global`', function () {
		return rollup.rollup({
			entry: 'samples/global/main.js',
			plugins: [ commonjs() ]
		}).then( function ( bundle ) {
			var generated = bundle.generate({
				format: 'cjs'
			});

			var window = {};

			var fn = new Function ( 'window', 'module', generated.code );
			fn( window, {} );

			assert.equal( window.foo, 'bar', generated.code );
		});
	});

	it( 'optimises module.exports statements', function () {
		return rollup.rollup({
			entry: 'samples/optimise-module-exports/main.js',
			plugins: [ commonjs() ]
		}).then( function ( bundle ) {
			var generated = bundle.generate();

			assert.ok( generated.code.indexOf( 'module' ) === -1,
				'The generated code should not contain a "module" variable.' );
		});
	});

	it( 'fails to optimise module.exports statements that `usesModuleOrExports`', function () {
		return rollup.rollup({
			entry: 'samples/optimise-module-exports-fail/main.js',
			plugins: [ commonjs() ]
		}).then( function ( bundle ) {
			var generated = bundle.generate();

			assert.ok( generated.code.indexOf( 'module' ) !== -1,
				'The generated code should contain a "module" variable.' );
		});
	});
});
