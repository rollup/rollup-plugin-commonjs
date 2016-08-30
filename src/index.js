import { readFileSync, statSync } from 'fs';
import { basename, dirname, extname, resolve, sep } from 'path';
import { sync as nodeResolveSync } from 'resolve';
import { createFilter, makeLegalIdentifier } from 'rollup-pluginutils';
import MagicString from 'magic-string';
import { PREFIX, HELPERS_ID, HELPERS } from './helpers.js';
import defaultResolver from './defaultResolver.js';
import transform from './transform.js';

const reserved = 'abstract arguments boolean break byte case catch char class const continue debugger default delete do double else enum eval export extends false final finally float for function goto if implements import in instanceof int interface let long native new null package private protected public return short static super switch synchronized this throw throws transient true try typeof var void volatile while with yield'.split( ' ' );

var blacklistedExports = { __esModule: true };
reserved.forEach( word => blacklistedExports[ word ] = true );

function getCandidatesForExtension ( resolved, extension ) {
	return [
		resolved + extension,
		resolved + `${sep}index${extension}`
	];
}

function getCandidates ( resolved, extensions ) {
	return extensions.reduce(
		( paths, extension ) => paths.concat( getCandidatesForExtension ( resolved, extension ) ),
		[resolved]
	);
}

function getName ( id ) {
	const base = basename( id );
	const ext = extname( base );

	return makeLegalIdentifier( ext.length ? base.slice( 0, -ext.length ) : base );
}

// Return the first non-falsy result from an array of
// maybe-sync, maybe-promise-returning functions
function first ( candidates ) {
	return function ( ...args ) {
		return candidates.reduce( ( promise, candidate ) => {
			return promise.then( result => result != null ?
				result :
				Promise.resolve( candidate( ...args ) ) );
		}, Promise.resolve() );
	};
}

function startsWith ( str, prefix ) {
	return str.slice( 0, prefix.length ) === prefix;
}


export default function commonjs ( options = {} ) {
	const extensions = options.extensions || ['.js'];
	const filter = createFilter( options.include, options.exclude );
	const ignoreGlobal = options.ignoreGlobal;

	let customNamedExports = {};
	if ( options.namedExports ) {
		Object.keys( options.namedExports ).forEach( id => {
			let resolvedId;

			try {
				resolvedId = nodeResolveSync( id, { basedir: process.cwd() });
			} catch ( err ) {
				resolvedId = resolve( id );
			}

			customNamedExports[ resolvedId ] = options.namedExports[ id ];
		});
	}

	function resolveId ( importee, importer ) {
		if ( importee === HELPERS_ID ) return importee;

		if ( importer ) importer = importer.replace( PREFIX, '' );

		const isImportedByCommonJsModule = startsWith( importee, PREFIX );
		importee = importee.replace( PREFIX, '' );

		return resolveUsingOtherResolvers( importee, importer ).then( resolved => {
			if ( resolved ) return isImportedByCommonJsModule ? PREFIX + resolved : resolved;

			if ( isImportedByCommonJsModule ) {
				// standard resolution procedure
				const resolved = defaultResolver( importee, importer );
				if ( resolved ) return PREFIX + resolved;
			}
		});
	}

	let commonjsModules = new Map();
	function getCommonjsModule ( code, id ) {
		if ( !commonjsModules.has( id ) ) {
			commonjsModules.set( id, transform( code, id, ignoreGlobal, customNamedExports[ id ] ) );
		}

		return commonjsModules.get( id );
	}

	let resolveUsingOtherResolvers;

	return {
		name: 'commonjs',

		options ( options ) {
			const resolvers = ( options.plugins || [] )
				.map( plugin => {
					if ( plugin.resolveId === resolveId ) {
						// substitute CommonJS resolution logic
						return ( importee, importer ) => {
							if ( importee[0] !== '.' || !importer ) return; // not our problem

							const resolved = resolve( dirname( importer ), importee );
							const candidates = getCandidates( resolved, extensions );

							for ( let i = 0; i < candidates.length; i += 1 ) {
								try {
									const stats = statSync( candidates[i] );
									if ( stats.isFile() ) return candidates[i];
								} catch ( err ) { /* noop */ }
							}
						};
					}

					return plugin.resolveId;
				})
				.filter( Boolean );

			resolveUsingOtherResolvers = first( resolvers );
		},

		resolveId,

		load ( id ) {
			if ( id === HELPERS_ID ) return HELPERS;

			if ( startsWith( id, PREFIX ) ) {
				const actualId = id.slice( PREFIX.length );
				return readFileSync( actualId, 'utf-8' );
			}
		},

		transform ( code, id ) {
			const isImportedByCommonJsModule = startsWith( id, PREFIX );
			id = id.replace( PREFIX, '' );

			let transformed;
			if ( filter( id ) && extensions.indexOf( extname( id ) ) !== -1 ) transformed = getCommonjsModule( code, id );
			const isCommonJsModule = !!transformed;

			const name = getName( id );

			if ( isImportedByCommonJsModule ) {
				if ( !isCommonJsModule ) {
					// CJS importing ES – need to import a namespace and re-export as default
					const code = `import * as ${name} from '${id}'; export default ${name}['default'] || ${name};`;

					return {
						code,
						map: { mappings: '' }
					};
				}

				// CJS importing CJS – pass module.exports through unmolested
				return transformed;
			}

			// ES importing CJS – do the interop dance
			if ( isCommonJsModule ) {
				const HELPERS_NAME = 'commonjsHelpers';

				let proxy = `import * as ${HELPERS_NAME} from '${HELPERS_ID}';\nimport ${name} from '${PREFIX}${id}';\n\n`;
				proxy += /__esModule/.test( code ) ? `export default ${HELPERS_NAME}.unwrapExports(${name});\n` : `export default ${name};\n`;
				proxy += Object.keys( transformed.namedExports )
					.filter( key => !blacklistedExports[ key ] )
					.map( x => {
						if (x === name) {
							return `var ${x}$$1 = ${name}.${x};\nexport { ${x}$$1 as ${x} };`;
						} else {
							return `export var ${x} = ${name}.${x};`;
						}
					})
					.join( '\n' );

				return {
					code: proxy,
					map: { mappings: '' }
				};
			}

			return null;
		},

		transformBundle ( code ) {
			// prevent external dependencies from having the prefix
			const magicString = new MagicString( code );
			const pattern = new RegExp( PREFIX, 'g' );

			if ( !pattern.test( code ) ) return null;

			let match;
			while ( match = pattern.exec( code ) ) {
				magicString.remove( match.index, match[0].length );
			}

			return {
				code: magicString.toString(),
				map: magicString.generateMap({ hires: true })
			};
		}
	};
}
