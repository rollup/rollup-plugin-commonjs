import { statSync } from 'fs';
import { dirname, extname, resolve, sep } from 'path';
import acorn from 'acorn';
import { walk } from 'estree-walker';
import MagicString from 'magic-string';
import { attachScopes, createFilter } from 'rollup-pluginutils';
import { flatten, isReference } from './ast-utils.js';

var firstpass = /\b(?:require|module|exports|global)\b/;
var exportsPattern = /^(?:module\.)?exports(?:\.([a-zA-Z_$][a-zA-Z_$0-9]*))?$/;

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

			// Set `topLevel = true` on all top level statements
			ast.body.forEach( node => {
				node.topLevel = true;

				// needed when optimising `var x = module.exports = ...`
				if ( node.type === 'VariableDeclaration' ) {
					node.declarations.forEach( declarator => {
						declarator.topLevel = true;

						Object.defineProperty( declarator, 'parent', {
							value: node,
							configurable: true
						});
					});
				}
			});

			let scope = attachScopes( ast, 'scope' );
			let namedExports = {};
			let usesModuleOrExports = false;
			let usesGlobal = false;

			let hasOptimisedModuleExports = false;

			// identifier start-indicies to ignore when determining
			// if the module `usesModuleOrExports` or `usesGlobal`
			const skip = {};
			const lazyOptimisations = [];

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

						if ( !hasOptimisedModuleExports && flattened.keypath === 'module.exports' && parent.topLevel ) {
							hasOptimisedModuleExports = true;

							// we can't optimise object expressions without a function wrapper yet
							if ( node.right.type === 'ObjectExpression' ) {
								node.right.properties.forEach( prop => {
									namedExports[ prop.key.name ] = true;
								});
							} else {

								// this usage of `module.exports` doesn't count as `usesModuleOrExports`
								skip[ node.left.object.start ] = true;
								skip[ node.left.property.start ] = true;

								// optimise `module.exports =` -> `export default `
								if ( parent.type === 'VariableDeclarator' ) {
									lazyOptimisations.push(
										() => magicString.remove( node.left.start, node.right.start ),
										() => magicString.insert( parent.parent.end, `export default ${parent.id.name};\n` )
									);
								} else {
									lazyOptimisations.push(
										() => magicString.overwrite( node.left.start, node.right.start, 'export default ' )
									);
								}
							}

							return;
						}

						if ( match[1] ) namedExports[ match[1] ] = true;

						return;
					}

					if ( node.type === 'Identifier' ) {
						if ( ( node.name === 'module' || node.name === 'exports' ) && !skip[ node.start ] && isReference( node, parent ) && !scope.contains( node.name ) ) usesModuleOrExports = true;
						if ( node.name === 'global' && isReference( node, parent ) && !scope.contains( 'global' ) ) {
							magicString.overwrite( node.start, node.end, '__commonjs_global' );
							usesGlobal = true;
						}
						return;
					}

					if ( node.type !== 'CallExpression' ) return;
					if ( node.callee.name !== 'require' || scope.contains( 'require' ) ) return;
					if ( node.arguments.length !== 1 || node.arguments[0].type !== 'Literal' ) return; // TODO handle these weird cases?

					const source = node.arguments[0].value;

					// `require` is called for it's side effects when it's
					// return value isn't used, for example:
					//
					//    require('foo');
					//
					//    var a = (require('foo'), require('a'));
					let calledForSideEffects = parent.type === 'ExpressionStatement' ||
						( parent.type === 'SequenceExpression' &&
							parent.expressions[ parent.expressions.length - 1 ] === node );

					let existing = required[ source ];
					let name;

					if ( calledForSideEffects ) {
						if ( !existing ) {
							name = '';
							required[ source ] = { source, name };
						}

						// Overwrite with `undefined` to handle both examples. Replacing with
						// the empty string '' would yield an invalid SequenceExpression.
						//
						//   undefined;
						//
						//   var a = (undefined, require$$0);
						magicString.overwrite( node.start, node.end, 'undefined' );
						return;
					}

					if ( !existing || !existing.name ) {
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

			// return null if not a CommonJS module
			if ( !sources.length && !usesModuleOrExports && !usesGlobal && !lazyOptimisations.length ) return null;

			const importBlock = sources.length ?
				sources.map( source => `import ${required[ source ].name ? required[ source ].name + ' from ' : ''}'${source}';` ).join( '\n' ) :
				'';

			const intro = `\n\nvar exports = {}, module = { exports: exports };\n`;
			let outro = `\nexport default module.exports;\n`;

			const named = Object.keys( namedExports );

			if ( named.length ) {
				outro += named.map( x => `var export$${x} = module.exports.${x};` ).join( '\n' );
				outro += `export { ${named.map( x => `export$${x} as ${x}`).join( ', ' )} };`;
			}

			// don't trim the string, since we may want to insert
			// something in the trailing spaces.
			// magicString.trim();

			// `intro` and `outro` are only used if
			// we use `module.exports`, `exports` or `global`
			if ( usesModuleOrExports ) {
				magicString.prepend( intro );
			}

			// the `importBlock` is always used
			magicString.prepend( importBlock );

			if ( usesModuleOrExports ) {
				magicString.append( outro );
			} else {
				// if we don't need any of the above globals,
				// we can do some extra optimisations
				lazyOptimisations.forEach( fn => fn() );
			}

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
