import { statSync } from 'fs';
import { basename, dirname, extname, resolve, sep } from 'path';
import { sync as nodeResolveSync } from 'resolve';
import acorn from 'acorn';
import { walk } from 'estree-walker';
import MagicString from 'magic-string';
import { attachScopes, createFilter, makeLegalIdentifier } from 'rollup-pluginutils';
import { flatten, isReference } from './ast-utils.js';

var firstpass = /\b(?:require|module|exports|global)\b/;
var exportsPattern = /^(?:module\.)?exports(?:\.([a-zA-Z_$][a-zA-Z_$0-9]*))?$/;

const reserved = 'abstract arguments boolean break byte case catch char class const continue debugger default delete do double else enum eval export extends false final finally float for function goto if implements import in instanceof int interface let long native new null package private protected public return short static super switch synchronized this throw throws transient true try typeof var void volatile while with yield'.split( ' ' );

var blacklistedExports = { __esModule: true };
reserved.forEach( word => blacklistedExports[ word ] = true );

function getName ( id ) {
	const base = basename( id );
	const ext = extname( base );

	return makeLegalIdentifier( ext.length ? base.slice( 0, -ext.length ) : base );
}

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

export default function commonjs ( options = {} ) {
	const extensions = options.extensions || ['.js'];
	const filter = createFilter( options.include, options.exclude );
	let bundleUsesGlobal = false;
	let bundleRequiresWrappers = false;

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

	return {
		resolveId ( importee, importer ) {
			if ( importee[0] !== '.' ) return; // not our problem

			const resolved = resolve( dirname( importer ), importee );
			const candidates = getCandidates( resolved, extensions );

			for ( let i = 0; i < candidates.length; i += 1 ) {
				try {
					const stats = statSync( candidates[i] );
					if ( stats.isFile() ) return candidates[i];
				} catch ( err ) { /* noop */ }
			}
		},

		transform ( code, id ) {
			if ( !filter( id ) ) return null;
			if ( extensions.indexOf( extname( id ) ) === -1 ) return null;
			if ( !firstpass.test( code ) ) return null;

			let ast;

			try {
				ast = acorn.parse( code, {
					ecmaVersion: 6,
					sourceType: 'module'
				});
			} catch ( err ) {
				err.message += ` in ${id}`;
				throw err;
			}

			const magicString = new MagicString( code );

			let required = {};
			let uid = 0;

			let scope = attachScopes( ast, 'scope' );
			let uses = { module: false, exports: false, global: false };

			let namedExports = {};
			if ( customNamedExports[ id ] ) {
				customNamedExports[ id ].forEach( name => namedExports[ name ] = true );
			}

			let scopeDepth = 0;

			walk( ast, {
				enter ( node, parent ) {
					if ( node.scope ) scope = node.scope;
					if ( /^Function/.test( node.type ) ) scopeDepth += 1;

					if ( sourceMap ) {
						magicString.addSourcemapLocation( node.start );
						magicString.addSourcemapLocation( node.end );
					}

					// Is this an assignment to exports or module.exports?
					if ( node.type === 'AssignmentExpression' ) {
						if ( node.left.type !== 'MemberExpression' ) return;

						const flattened = flatten( node.left );
						if ( !flattened ) return;

						if ( scope.contains( flattened.name ) ) return;

						const match = exportsPattern.exec( flattened.keypath );
						if ( !match || flattened.keypath === 'exports' ) return;

						if ( flattened.keypath === 'module.exports' && node.right.type === 'ObjectExpression' ) {
							return node.right.properties.forEach( prop => {
								if ( prop.computed || prop.key.type !== 'Identifier' ) return;
								const name = prop.key.name;
								if ( name === makeLegalIdentifier( name ) ) namedExports[ name ] = true;
							});
						}

						if ( match[1] ) namedExports[ match[1] ] = true;

						return;
					}

					if ( node.type === 'Identifier' ) {
						if ( ( node.name in uses && !uses[ node.name ] ) && isReference( node, parent ) && !scope.contains( node.name ) ) uses[ node.name ] = true;
						return;
					}

					if ( node.type === 'ThisExpression' && scopeDepth === 0 ) {
						uses.global = true;
						magicString.overwrite( node.start, node.end, `__commonjs_global`, true );
						return;
					}

					if ( node.type !== 'CallExpression' ) return;
					if ( node.callee.name !== 'require' || scope.contains( 'require' ) ) return;
					if ( node.arguments.length !== 1 || node.arguments[0].type !== 'Literal' ) return; // TODO handle these weird cases?

					const source = node.arguments[0].value;

					let existing = required[ source ];
					let name;

					if ( !existing ) {
						name = `require$$${uid++}`;
						required[ source ] = { source, name, importsDefault: false };
					} else {
						name = required[ source ].name;
					}

					if ( parent.type !== 'ExpressionStatement' ) {
						required[ source ].importsDefault = true;
						magicString.overwrite( node.start, node.end, name );
					} else {
						// is a bare import, e.g. `require('foo');`
						magicString.remove( parent.start, parent.end );
					}
				},

				leave ( node ) {
					if ( node.scope ) scope = scope.parent;
					if ( /^Function/.test( node.type ) ) scopeDepth -= 1;
				}
			});

			const sources = Object.keys( required );

			if ( !sources.length && !uses.module && !uses.exports && !uses.global ) {
				if ( Object.keys( namedExports ).length ) {
					throw new Error( `Custom named exports were specified for ${id} but it does not appear to be a CommonJS module` );
				}
				return null; // not a CommonJS module
			}

			bundleRequiresWrappers = true;

			const name = getName( id );

			const importBlock = sources.length ?
				sources.map( source => {
					const { name, importsDefault } = required[ source ];
					return `import ${importsDefault ? `${name} from ` : ``}'${source}';`;
				}).join( '\n' ) :
				'';

			const args = `module${uses.exports || uses.global ? ', exports' : ''}${uses.global ? ', global' : ''}`;

			const intro = `\n\nvar ${name} = __commonjs(function (${args}) {\n`;
			let outro = `\n});\n\nexport default (${name} && typeof ${name} === 'object' && 'default' in ${name} ? ${name}['default'] : ${name});\n`;

			outro += Object.keys( namedExports )
				.filter( key => !blacklistedExports[ key ] )
				.map( x => `export var ${x} = ${name}.${x};` )
				.join( '\n' );

			magicString.trim()
				.prepend( importBlock + intro )
				.trim()
				.append( outro );

			code = magicString.toString();
			const map = sourceMap ? magicString.generateMap() : null;

			if ( uses.global ) bundleUsesGlobal = true;

			return { code, map };
		},

		intro () {
			var intros = [];

			if ( bundleUsesGlobal ) {
				intros.push( `var __commonjs_global = typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : this;` );
			}

			if ( bundleRequiresWrappers ) {
				intros.push( `function __commonjs(fn, module) { return module = { exports: {} }, fn(module, module.exports${bundleUsesGlobal ? ', __commonjs_global' : ''}), module.exports; }\n` );
			}

			return intros.join( '\n' );
		}
	};
}
