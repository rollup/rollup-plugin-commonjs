import { readFileSync, statSync } from 'fs';
import { basename, dirname, extname, resolve, sep } from 'path';
import { sync as nodeResolveSync } from 'resolve';
import { createFilter, makeLegalIdentifier } from 'rollup-pluginutils';
import { HELPERS_ID, HELPERS, PREFIX } from './helpers.js';
import defaultResolver from './defaultResolver.js';
import transform from './transform.js';

var firstpassGlobal = /\b(?:require|module|exports|global)\b/;
var firstpassNoGlobal = /\b(?:require|module|exports)\b/;

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

export default function commonjs ( options = {} ) {
	const extensions = options.extensions || ['.js'];
	const filter = createFilter( options.include, options.exclude );
	const ignoreGlobal = options.ignoreGlobal;
	const firstpass = ignoreGlobal ? firstpassNoGlobal : firstpassGlobal;

	const sourceMap = options.sourceMap !== false;

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

		const isCommonJsImporter = importee.startsWith( PREFIX );
		if ( isCommonJsImporter ) importee = importee.slice( PREFIX.length );

		for ( let resolver of resolvers ) {
			const resolved = resolver( importee, importer );
			if ( resolved ) return isCommonJsImporter ? PREFIX + resolved : resolved;
		}

		if ( isCommonJsImporter ) {
			// standard resolution procedure
			const resolved = defaultResolver( importee, importer );
			if ( resolved ) return PREFIX + resolved;
		}
	}

	let resolvers;

	return {
		name: 'commonjs',

		options ( options ) {
			resolvers = ( options.plugins || [] )
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
		},

		resolveId,

		load ( id ) {
			if ( id === HELPERS_ID ) return HELPERS;
			if ( id.startsWith( PREFIX ) ) {
				const actualId = id.slice( PREFIX.length );
				return readFileSync( actualId, 'utf-8' );
			}
		},

		transform ( code, id ) {
			const isCommonJsImporter = id.startsWith( PREFIX );
			if ( isCommonJsImporter ) id = id.slice( PREFIX.length );

			if ( !filter( id ) ) return null;
			if ( extensions.indexOf( extname( id ) ) === -1 ) return null;

			let namedExports = {};
			if ( customNamedExports[ id ] ) {
				customNamedExports[ id ].forEach( name => namedExports[ name ] = true );
			}

			const transformed = transform( code, id, firstpass, sourceMap, ignoreGlobal, namedExports );
			const isCommonJsModule = !!transformed;

			// CJS importing CJS – pass module.exports through unmolested
			if ( isCommonJsModule && isCommonJsImporter ) {
				// console.log( 'CJS importing CJS' );
				return transformed;
			}

			// ES importing CJS – do the interop dance
			if ( isCommonJsModule && !isCommonJsImporter ) {
				// console.log( 'ES importing CJS' );
				const name = getName( id );
				const HELPERS_NAME = 'commonjsHelpers';

				let proxy = `import * as ${HELPERS_NAME} from '${HELPERS_ID}';\nimport ${name} from '${PREFIX}${id}';\n\n`;
				proxy += `export default ${HELPERS_NAME}.unwrapExports(${name});\n`;
				proxy += Object.keys( namedExports )
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

			// CJS importing ES – need to import a namespace and re-export as default
			if ( !isCommonJsModule && isCommonJsImporter ) {
				console.log( 'CJS importing ES' );
				return {
					code: 'TODO',
					map: { mappings: '' }
				};
			}

			return null;
		}
	};
}
