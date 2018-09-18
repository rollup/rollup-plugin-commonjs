const acorn = require( 'acorn' );
const path = require( 'path' );
const fs = require( 'fs' );
const assert = require( 'assert' );
const relative = require( 'require-relative' );
const { SourceMapConsumer } = require( 'source-map' );
const { getLocator } = require( 'locate-character' );
const { rollup } = require( 'rollup' );
const resolve = require( 'rollup-plugin-node-resolve' );

function commonjs (options) {
	delete require.cache[require.resolve('..')];
	return require('..')(options);
}

require( 'source-map-support' ).install();

process.chdir( __dirname );

function execute ( code, context = {} ) {
	let fn;

	const contextKeys = Object.keys( context );

	const argNames = contextKeys.concat( 'module', 'exports', 'require', 'global', 'assert', code );

	try {
		fn = new Function( ...argNames );
	} catch ( err ) {
		// syntax error
		console.log( code );
		throw err;
	}

	const module = { exports: {} };
	const global = {};

	const argValues = contextKeys.map( key => context[ key ] ).concat(
		module,
		module.exports,
		name => relative( name, 'test/x.js' ),
		global,
		assert
	);

	fn( ...argValues );

	return {
		code,
		exports: module.exports,
		global
	};
}

async function executeBundle ( bundle, { context, exports } = {} ) {
	const options = { format: 'cjs' };
	if ( exports ) options.exports = exports;

	const { code } = await bundle.generate( options );
	return execute( code, context );
}

const transformContext = {
	parse: ( input, options ) =>
		acorn.parse( input, Object.assign( {
			ecmaVersion: 9,
			sourceType: 'module',
		}, options ) )
};

describe( 'rollup-plugin-commonjs', () => {
	describe( 'form', () => {
		fs.readdirSync( 'form' ).forEach( dir => {
			let config;

			try {
				config = require( `./form/${dir}/_config.js` );
			} catch ( err ) {
				config = {};
			}

			( config.solo ? it.only : it )( dir, () => {
				const { transform, options } = commonjs( config.options );
				options({ input: 'main.js' });

				const input = fs.readFileSync( `form/${dir}/input.js`, 'utf-8' );
				const expected = fs.readFileSync( `form/${dir}/output.js`, 'utf-8' ).trim();

				return transform.call( transformContext, input, 'input.js' ).then( transformed => {
					const actual = ( transformed ? transformed.code : input ).trim().replace( /\0/g, '' );
					assert.equal( actual, expected );
				});
			});
		});
	});

	describe( 'function', () => {
		fs.readdirSync( 'function' ).forEach( dir => {
			let config;

			try {
				config = require( `./function/${dir}/_config.js` );
			} catch ( err ) {
				config = {};
			}

			( config.solo ? it.only : it )( dir, async () => {
				const options = Object.assign({
					input: `function/${dir}/main.js`,
					plugins: [ commonjs( config.pluginOptions ) ]
				}, config.options || {} );

				const bundle = await rollup( options );
				const { code } = await bundle.generate({ format: 'cjs' });
				if ( config.show || config.solo ) {
					console.error( code );
				}

				const { exports, global } = execute( code, config.context );

				if ( config.exports ) config.exports( exports );
				if ( config.global ) config.global( global );
			});
		});
	});

	describe( 'misc tests', () => {
		// most of these should be moved over to function...
		it( 'generates a sourcemap', async () => {
			const bundle = await rollup({
				input: 'samples/sourcemap/main.js',
				plugins: [ commonjs({ sourceMap: true }) ]
			});

			const {code, map} = await bundle.generate({
				format: 'cjs',
				sourcemap: true,
				sourcemapFile: path.resolve( 'bundle.js' )
			});

			const smc = new SourceMapConsumer( map );
			const locator = getLocator( code, { offsetLine: 1 });

			let generatedLoc = locator( '42' );
			let loc = smc.originalPositionFor( generatedLoc ); // 42
			assert.equal( loc.source, 'samples/sourcemap/foo.js' );
			assert.equal( loc.line, 1 );
			assert.equal( loc.column, 15 );

			generatedLoc = locator( 'log' );
			loc = smc.originalPositionFor( generatedLoc ); // log
			assert.equal( loc.source, 'samples/sourcemap/main.js' );
			assert.equal( loc.line, 2 );
			assert.equal( loc.column, 8 );
		});

		it( 'supports multiple entry points for experimentalCodeSplitting', async () => {
			const bundle = await rollup({
				input: [
					'samples/multiple-entry-points/b.js',
					'samples/multiple-entry-points/c.js'
				],
				experimentalCodeSplitting: true,
				plugins: [ commonjs() ]
			});

			const {output} = await bundle.generate({
				format: 'cjs',
				chunkFileNames: '[name].js'
			});
			//console.log(bundle);
			assert.equal(Object.keys(output).length, 3);
			assert.equal('b.js' in output, true);
			assert.equal('c.js' in output, true);
		});

		it( 'supports multiple entry points as object for experimentalCodeSplitting', async () => {
			const bundle = await rollup({
				input: {
					b: require.resolve('./samples/multiple-entry-points/b.js'),
					c: require.resolve('./samples/multiple-entry-points/c.js')
				},
				experimentalCodeSplitting: true,
				plugins: [ resolve(), commonjs() ]
			});

			const {output} = await bundle.generate({
				format: 'cjs',
				chunkFileNames: '[name].js'
			});

			assert.equal(Object.keys(output).length, 3);
			assert.equal('b.js' in output, true);
			assert.equal('c.js' in output, true);
		});

		it( 'handles references to `global`', async () => {
			const bundle = await rollup({
				input: 'samples/global/main.js',
				plugins: [ commonjs() ]
			});

			const generated = await bundle.generate({
				format: 'cjs'
			});

			const mockWindow = {};
			const mockGlobal = {};
			const mockSelf = {};

			const fn = new Function ( 'module', 'window', 'global', 'self', generated.code );

			fn( {}, mockWindow, mockGlobal,  mockSelf);
			assert.equal( mockWindow.foo, 'bar', generated.code );
			assert.equal( mockGlobal.foo, undefined, generated.code );
			assert.equal( mockSelf.foo, undefined, generated.code );

			fn( {}, undefined, mockGlobal,  mockSelf );
			assert.equal( mockGlobal.foo, 'bar', generated.code );
			assert.equal( mockSelf.foo, undefined, generated.code );

			fn( {}, undefined, undefined, mockSelf );
			assert.equal( mockSelf.foo, 'bar', generated.code );
		});

		it( 'handles multiple references to `global`', async () => {
			const bundle = await rollup({
				input: 'samples/global-in-if-block/main.js',
				plugins: [ commonjs() ]
			});

			const generated = await bundle.generate({
				format: 'cjs'
			});

			const fn = new Function ( 'module', 'exports', 'window', generated.code );

			const module = { exports: {} };
			const window = {};

			fn( module, module.exports, window );
			assert.equal( window.count, 1 );

			fn( module, module.exports, window );
			assert.equal( window.count, 2 );
		});

		it( 'handles transpiled CommonJS modules', async () => {
			const bundle = await rollup({
				input: 'samples/corejs/literal-with-default.js',
				plugins: [ commonjs() ]
			});

			const generated = await bundle.generate({
				format: 'cjs'
			});

			const module = { exports: {} };

			const fn = new Function ( 'module', 'exports', generated.code );
			fn( module, module.exports );

			assert.equal( module.exports, 'foobar', generated.code );
		});

		it( 'handles successive builds', async () => {
			const plugin = commonjs();
			let bundle = await rollup({
				input: 'samples/corejs/literal-with-default.js',
				plugins: [ plugin ]
			});
			await bundle.generate({
				format: 'cjs'
			});

			bundle = await rollup({
				input: 'samples/corejs/literal-with-default.js',
				plugins: [ plugin ]
			});
			const generated = await bundle.generate({
				format: 'cjs'
			});

			const module = { exports: {} };

			const fn = new Function ( 'module', 'exports', generated.code );
			fn( module, module.exports );

			assert.equal( module.exports, 'foobar', generated.code );
		});

		it( 'allows named exports to be added explicitly via config', async () => {
			const bundle = await rollup({
				input: 'samples/custom-named-exports/main.js',
				plugins: [
					resolve({ main: true }),
					commonjs({
						namedExports: {
							'samples/custom-named-exports/secret-named-exporter.js': [ 'named' ],
							'external': [ 'message' ]
						}
					})
				]
			});

			await executeBundle( bundle );
		});

		it( 'ignores false positives with namedExports (#36)', async () => {
			const bundle = await rollup({
				input: 'samples/custom-named-exports-false-positive/main.js',
				plugins: [
					resolve({ main: true }),
					commonjs({
						namedExports: {
							'irrelevant': [ 'lol' ]
						}
					})
				]
			});

			await executeBundle( bundle );
		});

		it( 'converts a CommonJS module with custom file extension', async () => {
			const bundle = await rollup({
				input: 'samples/extension/main.coffee',
				plugins: [ commonjs({ extensions: ['.coffee' ]}) ]
			});

			assert.equal( (await executeBundle( bundle )).exports, 42 );
		});

		it( 'identifies named exports from object literals', async () => {
			const bundle = await rollup({
				input: 'samples/named-exports-from-object-literal/main.js',
				plugins: [ commonjs() ]
			});

			const { code } = await bundle.generate({
				format: 'cjs'
			});

			const fn = new Function ( 'module', 'assert', code );
			fn( {}, assert );
		});

		it( 'can ignore references to `global`', async () => {
			const bundle = await rollup({
				input: 'samples/ignore-global/main.js',
				plugins: [
					commonjs({ ignoreGlobal: true })
				],
				onwarn: warning => {
					if ( warning.code === 'THIS_IS_UNDEFINED' ) return;
					console.warn( warning.message );
				}
			});

			const generated = await bundle.generate({
				format: 'cjs'
			});

			const { exports, global } = await executeBundle( bundle );

			assert.equal( exports.immediate1, global.setImmediate, generated.code );
			assert.equal( exports.immediate2, global.setImmediate, generated.code );
			assert.equal( exports.immediate3, null, generated.code );
		});

		it( 'can handle parens around right have node while producing default export', async () => {
			const bundle = await rollup({
				input: 'samples/paren-expression/index.js',
				plugins: [ commonjs() ]
			});

			assert.equal( (await executeBundle( bundle )).exports, 42 );
		});

		describe( 'typeof transforms', () => {
			it( 'correct-scoping', async () => {
				const bundle = await rollup({
					input: 'samples/umd/correct-scoping.js',
					plugins: [ commonjs() ]
				});

				assert.equal( (await executeBundle( bundle )).exports, 'object' );
			});

			it( 'protobuf', async () => {
				const bundle = await rollup({
					input: 'samples/umd/protobuf.js',
					external: [ 'bytebuffer' ],
					plugins: [ commonjs() ]
				});

				assert.equal( (await executeBundle( bundle )).exports, true );
			});

			it( 'sinon', async () => {
				const bundle = await rollup({
					input: 'samples/umd/sinon.js',
					plugins: [ commonjs() ]
				});

				const { code } = await bundle.generate({ format: 'es' });

				assert.equal( code.indexOf( 'typeof require' ), -1, code );
				// assert.notEqual( code.indexOf( 'typeof module' ), -1, code ); // #151 breaks this test
				// assert.notEqual( code.indexOf( 'typeof define' ), -1, code ); // #144 breaks this test
			});
		});

		it( 'deconflicts helper name', async () => {
			const bundle = await rollup({
				input: 'samples/deconflict-helpers/main.js',
				plugins: [ commonjs() ]
			});

			const { exports } = await executeBundle( bundle );
			assert.notEqual( exports, 'nope' );
		});

		it( 'deconflicts reserved keywords', async () => {
			const bundle = await rollup({
				input: 'samples/reserved-as-property/main.js',
				plugins: [ commonjs() ]
			});

			const reservedProp = (await executeBundle( bundle, { exports: 'named' })).exports.delete;
			assert.equal(reservedProp, 'foo');
		});

		it( 'does not process the entry file when it has a leading "." (issue #63)', async () => {
			const bundle = await rollup({
				input: './function/basic/main.js',
				plugins: [ commonjs() ]
			});

			await executeBundle( bundle );
		});

		it( 'does not reexport named contents', async () => {
			try {
				await rollup({
					input: 'samples/reexport/main.js',
					plugins: [ commonjs() ]
				});
			} catch (error) {
				assert.equal( error.message, `'named' is not exported by samples${path.sep}reexport${path.sep}reexport.js` );
			}
		});

		it( 'respects other plugins', async () => {
			const bundle = await rollup({
				input: 'samples/other-transforms/main.js',
				plugins: [
					{
						transform ( code, id ) {
							if ( id[0] === '\0' ) return null;
							return code.replace( '40', '41' );
						}
					},
					commonjs()
				]
			});

			await executeBundle( bundle );
		});

		it( 'rewrites top-level defines', async () => {
			const bundle = await rollup({
				input: 'samples/define-is-undefined/main.js',
				plugins: [ commonjs() ]
			});

			function define () {
				throw new Error( 'nope' );
			}

			define.amd = true;

			const { exports } = await executeBundle( bundle, { context: { define } });
			assert.equal( exports, 42 );
		});

		it( 'respects options.external', async () => {
			const bundle = await rollup({
				input: 'samples/external/main.js',
				plugins: [
					resolve(),
					commonjs()
				],
				external: ['baz']
			});

			const { code } = await bundle.generate({ format: 'cjs' });
			assert.equal( code.indexOf( 'hello' ), -1 );

			const { exports } = await executeBundle( bundle );
			assert.equal( exports, 'HELLO' );
		});

		it( 'prefers to set name using directory for index files', async () => {
			const bundle = await rollup({
				input: 'samples/rename-index/main.js',
				plugins: [ commonjs() ]
			});

			const { code } = await bundle.generate({ format: 'cjs' });
			assert.equal( code.indexOf( 'var index' ), -1 );
			assert.notEqual( code.indexOf( 'var invalidVar' ), -1 );
			assert.notEqual( code.indexOf( 'var validVar' ), -1 );
			assert.notEqual( code.indexOf( 'var nonIndex' ), -1 );
		});

		it( 'does not misassign default when consuming rollup output', async () => {
			// Issue #224
			const bundle = await rollup({
				input: 'samples/use-own-output/main.js',
				plugins: [ commonjs() ],
			});

			const window = {};
			await executeBundle( bundle, { context: { window } } );
			assert.notEqual( window.b.default, undefined );
		});

		it( 'does not warn even if the ES module not export "default"', async () => {
			const warns = [];
			await rollup({
				input: 'samples/es-modules-without-default-export/main.js',
				plugins: [ commonjs() ],
				onwarn: (warn) => warns.push( warn )
			});
			assert.equal( warns.length, 0 );

			await rollup({
				input: 'function/bare-import/bar.js',
				plugins: [ commonjs() ],
				onwarn: (warn) => warns.push( warn )
			});
			assert.equal( warns.length, 0 );

			await rollup({
				input: 'function/bare-import-comment/main.js',
				plugins: [ commonjs() ],
				onwarn: (warn) => warns.push( warn )
			});
			assert.equal( warns.length, 0 );
		});

		it( 'compiles with cache', async () => {
			// specific commonjs require() to ensure same instance is used
			const commonjs = require('..');

			const bundle = await rollup({
				input: 'function/index/main.js',
				plugins: [ commonjs() ]
			});

			await rollup({
				input: 'function/index/main.js',
				plugins: [ commonjs() ],
				cache: bundle
			});
		});

		it( 'creates an error with a code frame when parsing fails', async () => {
			try {
				await rollup({
					input: 'samples/invalid-syntax/main.js',
					plugins: [ commonjs() ]
				});
			} catch (error) {
				assert.equal( error.frame, '1: export const foo = 2,\n                        ^' );
			}
		});

		it('ignores virtual modules', async () => {
			const bundle = await rollup({
				input: 'samples/ignore-virtual-modules/main.js',
				plugins: [ commonjs(), {
					load (id) {
						if (id === '\0virtual') {
							return 'export default "Virtual export"';
						}
					}
				} ]
			});
			assert.equal( (await executeBundle( bundle )).exports, 'Virtual export' );
		});
	});
});
