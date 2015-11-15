import { statSync } from 'fs';
import { basename, dirname, extname, resolve, sep } from 'path';
import acorn from 'acorn';
import { walk } from 'estree-walker';
import MagicString from 'magic-string';
import { attachScopes, createFilter, makeLegalIdentifier } from 'rollup-pluginutils';
import { flatten, isReference } from './ast-utils.js';

var firstpass = /\b(?:require|module|exports|global)\b/;
var exportsPattern = /^(?:module\.)?exports(?:\.([a-zA-Z_$][a-zA-Z_$0-9]*))?$/;

function getName ( id ) {
	const base = basename( id );
	const ext = extname( base );

	return makeLegalIdentifier( ext.length ? base.slice( 0, -ext.length ) : base );
}

export default function commonjs ( options = {} ) {
	const filter = createFilter( options.include, options.exclude );
	let bundleUsesGlobal = false;

	const sourceMap = options.sourceMap !== false;

	return {
		resolveId ( importee, importer ) {
			if ( importee[0] !== '.' ) return; // not our problem

			const resolved = resolve( dirname( importer ), importee );
			const candidates = [
				resolved,
				resolved + '.js',
				resolved + `${sep}index.js`
			];

			for ( let i = 0; i < candidates.length; i += 1 ) {
				try {
					const stats = statSync( candidates[i] );
					if ( stats.isFile() ) return candidates[i];
				} catch ( err ) { /* noop */ }
			}
		},

		transform ( code, id ) {
			if ( !filter( id ) ) return null;
			if ( extname( id ) !== '.js' ) return null;
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
			let namedExports = {};
			let usesModuleOrExports;
			let usesGlobal;

			walk( ast, {
				enter ( node, parent ) {
					if ( node.scope ) scope = node.scope;

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

						if ( match[1] ) namedExports[ match[1] ] = true;

						return;
					}

					if ( node.type === 'Identifier' ) {
						if ( ( node.name === 'module' || node.name === 'exports' ) && isReference( node, parent ) && !scope.contains( node.name ) ) usesModuleOrExports = true;
						if ( node.name === 'global' && isReference( node, parent ) && !scope.contains( 'global' ) ) usesGlobal = true;
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
						required[ source ] = { source, name };
					} else {
						name = required[ source ].name;
					}

					magicString.overwrite( node.start, node.end, name );
				},

				leave ( node ) {
					if ( node.scope ) scope = scope.parent;
				}
			});

			const sources = Object.keys( required );

			if ( !sources.length && !usesModuleOrExports && !usesGlobal ) return null; // not a CommonJS module

			const name = getName( id );

			const importBlock = sources.length ?
				sources.map( source => `import ${required[ source ].name} from '${source}';` ).join( '\n' ) :
				'';

			const intro = `\n\nvar ${name} = (function (module${usesGlobal ? ', global' : ''}) {\nvar exports = module.exports;\n`;
			let outro = `\nreturn module.exports;\n})({exports:{}}${usesGlobal ? ', __commonjs_global' : ''});\n\nexport default ${name};\n`;

			outro += Object.keys( namedExports ).map( x => `export var ${x} = ${name}.${x};` ).join( '\n' );

			magicString.trim()
				.prepend( importBlock + intro )
				.trim()
				.append( outro );

			code = magicString.toString();
			const map = sourceMap ? magicString.generateMap() : null;

			if ( usesGlobal ) bundleUsesGlobal = true;

			return { code, map };
		},

		intro () {
			return bundleUsesGlobal ?
				`var __commonjs_global = typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : this;` :
				'';
		}
	};
}
