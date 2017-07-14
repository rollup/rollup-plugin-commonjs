const path = require( 'path' );
const fs = require( 'fs' );
const assert = require( 'assert' );
const relative = require( 'require-relative' );
const { SourceMapConsumer } = require( 'source-map' );
const { getLocator } = require( 'locate-character' );
const { rollup } = require( 'rollup' );
const resolve = require( 'rollup-plugin-node-resolve' );
const commonjs = require( '..' );

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

function executeBundle ( bundle, { context, exports } = {} ) {
	const options = { format: 'cjs' };
	if ( exports ) options.exports = exports;

	const { code } = bundle.generate( options );
	return execute( code, context );
}

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
				options({ entry: 'main.js' });

				const input = fs.readFileSync( `form/${dir}/input.js`, 'utf-8' );
				const expected = fs.readFileSync( `form/${dir}/output.js`, 'utf-8' ).trim();

				return transform( input, 'input.js' ).then( transformed => {
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

			( config.solo ? it.only : it )( dir, () => {
				const options = Object.assign({
					entry: `function/${dir}/main.js`,
					plugins: [ commonjs( config.pluginOptions ) ]
				}, config.options || {} );

				return rollup( options ).then( bundle => {
					const { code } = bundle.generate({ format: 'cjs' });
					if ( config.show || config.solo ) {
						console.error( code );
					}

					const { exports, global } = execute( code, config.context );

					if ( config.exports ) config.exports( exports );
					if ( config.global ) config.global( global );
				});
			});
		});
	});

	describe( 'misc tests', () => {
		// most of these should be moved over to function...
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
				const locator = getLocator( generated.code, { offsetLine: 1 });

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
		});

		it( 'handles references to `global`', () => {
			return rollup({
				entry: 'samples/global/main.js',
				plugins: [ commonjs() ]
			}).then( bundle => {
				const generated = bundle.generate({
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
		});

		it( 'handles multiple references to `global`', () => {
			return rollup({
				entry: 'samples/global-in-if-block/main.js',
				plugins: [ commonjs() ]
			}).then( bundle => {
				const generated = bundle.generate({
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
		});

		it( 'handles transpiled CommonJS modules', () => {
			return rollup({
				entry: 'samples/corejs/literal-with-default.js',
				plugins: [ commonjs() ]
			}).then( bundle => {
				const generated = bundle.generate({
					format: 'cjs'
				});

				const module = { exports: {} };

				const fn = new Function ( 'module', 'exports', generated.code );
				fn( module, module.exports );

				assert.equal( module.exports, 'foobar', generated.code );
			});
		});

		it( 'allows named exports to be added explicitly via config', () => {
			return rollup({
				entry: 'samples/custom-named-exports/main.js',
				plugins: [
					resolve({ main: true }),
					commonjs({
						namedExports: {
							'samples/custom-named-exports/secret-named-exporter.js': [ 'named' ],
							'external': [ 'message' ]
						}
					})
				]
			}).then( executeBundle );
		});

		it( 'ignores false positives with namedExports (#36)', () => {
			return rollup({
				entry: 'samples/custom-named-exports-false-positive/main.js',
				plugins: [
					resolve({ main: true }),
					commonjs({
						namedExports: {
							'irrelevant': [ 'lol' ]
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

		it( 'can ignore references to `global`', () => {
			return rollup({
				entry: 'samples/ignore-global/main.js',
				plugins: [
					commonjs({ ignoreGlobal: true })
				],
				onwarn: warning => {
					if ( warning.code === 'THIS_IS_UNDEFINED' ) return;
					console.warn( warning.message );
				}
			}).then( bundle => {
				const generated = bundle.generate({
					format: 'cjs'
				});

				const { exports, global } = executeBundle( bundle );

				assert.equal( exports.immediate1, global.setImmediate, generated.code );
				assert.equal( exports.immediate2, global.setImmediate, generated.code );
				assert.equal( exports.immediate3, null, generated.code );
			});
		});

		it( 'can handle parens around right have node while producing default export', () => {
			return rollup({
				entry: 'samples/paren-expression/index.js',
				plugins: [ commonjs() ]
			}).then( bundle => {
				assert.equal( executeBundle( bundle ).exports, 42 );
			});
		});

		describe( 'typeof transforms', () => {
			it( 'correct-scoping', () => {
				return rollup({
					entry: 'samples/umd/correct-scoping.js',
					plugins: [ commonjs() ]
				}).then( bundle => {
					assert.equal( executeBundle( bundle ).exports, 'object' );
				});
			});

			it( 'protobuf', () => {
				return rollup({
					entry: 'samples/umd/protobuf.js',
					external: [ 'bytebuffer' ],
					plugins: [ commonjs() ]
				}).then( bundle => {
					assert.equal( executeBundle( bundle ).exports, true );
				});
			});

			it( 'sinon', () => {
				return rollup({
					entry: 'samples/umd/sinon.js',
					plugins: [ commonjs() ]
				}).then( bundle => {
					const code = bundle.generate({ format: 'es' }).code;

					assert.equal( code.indexOf( 'typeof require' ), -1, code );
					// assert.notEqual( code.indexOf( 'typeof module' ), -1, code ); // #151 breaks this test
					// assert.notEqual( code.indexOf( 'typeof define' ), -1, code ); // #144 breaks this test
				});
			});
		});

		it( 'deconflicts helper name', () => {
			return rollup({
				entry: 'samples/deconflict-helpers/main.js',
				plugins: [ commonjs() ]
			}).then( executeBundle ).then( ({ exports }) => {
				assert.notEqual( exports, 'nope' );
			});
		});

		it( 'deconflicts reserved keywords', () => {
			return rollup({
				entry: 'samples/reserved-as-property/main.js',
				plugins: [ commonjs() ]
			})
			.then( bundle => {
				assert.doesNotThrow(() => {
					const reservedProp = executeBundle( bundle, { exports: 'named' }).exports.delete;
					assert.equal(reservedProp, 'foo');
				});
			});
		});

		it( 'does not process the entry file when it has a leading "." (issue #63)', () => {
			return rollup({
				entry: './function/basic/main.js',
				plugins: [ commonjs() ]
			}).then( executeBundle );
		});

		it( 'does not reexport named contents', () => {
			return rollup({
				entry: 'samples/reexport/main.js',
				plugins: [ commonjs() ]
			})
			.then( executeBundle )
			.catch( error => {
				assert.equal( error.message, `'named' is not exported by samples${path.sep}reexport${path.sep}reexport.js` );
			});
		});

		it( 'respects other plugins', () => {
			return rollup({
				entry: 'samples/other-transforms/main.js',
				plugins: [
					{
						transform ( code, id ) {
							if ( id[0] === '\0' ) return null;
							return code.replace( '40', '41' );
						}
					},
					commonjs()
				]
			}).then( executeBundle );
		});

		it( 'rewrites top-level defines', () => {
			return rollup({
				entry: 'samples/define-is-undefined/main.js',
				plugins: [ commonjs() ]
			})
			.then( bundle => {
				function define () {
					throw new Error( 'nope' );
				}

				define.amd = true;

				const { exports } = executeBundle( bundle, { context: { define } });
				assert.equal( exports, 42 );
			});
		});

		it( 'respects options.external', () => {
			return rollup({
				entry: 'samples/external/main.js',
				plugins: [
					resolve(),
					commonjs()
				],
				external: ['baz']
			})
			.then( async bundle => {
				const { code } = await bundle.generate({ format: 'cjs' });
				assert.equal( code.indexOf( 'hello' ), -1 );

				const { exports } = executeBundle( bundle );
				assert.equal( exports, 'HELLO' );
			});
		});

		it( 'prefers to set name using directory for index files', () => {
			return rollup({
				entry: 'samples/rename-index/main.js',
				plugins: [ commonjs() ]
			})
			.then( async bundle => {
				const { code } = await bundle.generate({ format: 'cjs' });
				assert.equal( code.indexOf( 'var index' ), -1 );
				assert.notEqual( code.indexOf( 'var invalidVar' ), -1 );
				assert.notEqual( code.indexOf( 'var validVar' ), -1 );
				assert.notEqual( code.indexOf( 'var nonIndex' ), -1 );
			});
		});
	});
});
