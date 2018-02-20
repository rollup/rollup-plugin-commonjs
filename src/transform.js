import acorn from 'acorn';
import { walk } from 'estree-walker';
import MagicString from 'magic-string';
import { attachScopes, makeLegalIdentifier } from 'rollup-pluginutils';
import { extractNames, flatten, isReference, isTruthy, isFalsy } from './ast-utils.js';
import { PREFIX, HELPERS_ID } from './helpers.js';
import { getName } from './utils.js';

const reserved = 'abstract arguments boolean break byte case catch char class const continue debugger default delete do double else enum eval export extends false final finally float for function goto if implements import in instanceof int interface let long native new null package private protected public return short static super switch synchronized this throw throws transient true try typeof var void volatile while with yield'.split( ' ' );
const blacklist = { __esModule: true };
reserved.forEach( word => blacklist[ word ] = true );

const exportsPattern = /^(?:module\.)?exports(?:\.([a-zA-Z_$][a-zA-Z_$0-9]*))?$/;

const firstpassGlobal = /\b(?:require|module|exports|global)\b/;
const firstpassNoGlobal = /\b(?:require|module|exports)\b/;
const importExportDeclaration = /^(?:Import|Export(?:Named|Default))Declaration/;

function deconflict ( scope, globals, identifier ) {
	let i = 1;
	let deconflicted = identifier;

	while ( scope.contains( deconflicted ) || globals.has( deconflicted ) || deconflicted in blacklist ) deconflicted = `${identifier}_${i++}`;
	scope.declarations[ deconflicted ] = true;

	return deconflicted;
}

function tryParse ( code, id ) {
	try {
		return acorn.parse( code, {
			ecmaVersion: 9,
			sourceType: 'module',
			allowReturnOutsideFunction: true
		});
	} catch ( err ) {
		err.message += ` in ${id}`;
		throw err;
	}
}

export function checkFirstpass (code, ignoreGlobal) {
	const firstpass = ignoreGlobal ? firstpassNoGlobal : firstpassGlobal;
	return firstpass.test(code);
}

export function checkEsModule (code, id) {
	const ast = tryParse(code, id);

	// if there are top-level import/export declarations, this is ES not CommonJS
	let hasDefaultExport = false;
	let isEsModule = false;
	for ( const node of ast.body ) {
		if ( node.type === 'ExportDefaultDeclaration' )
			hasDefaultExport = true;
		if ( importExportDeclaration.test( node.type ) )
			isEsModule = true;
	}

	return { isEsModule, hasDefaultExport, ast };
}

export function transformCommonjs ( code, id, isEntry, ignoreGlobal, ignoreRequire, customNamedExports, sourceMap, allowDynamicRequire, astCache ) {
	const ast = astCache || tryParse( code, id );

	const magicString = new MagicString( code );

	const required = {};
	// Because objects have no guaranteed ordering, yet we need it,
	// we need to keep track of the order in a array
	const sources = [];

	let uid = 0;

	let scope = attachScopes( ast, 'scope' );
	const uses = { module: false, exports: false, global: false, require: false };

	let lexicalDepth = 0;
	let programDepth = 0;

	const globals = new Set();

	const HELPERS_NAME = deconflict( scope, globals, 'commonjsHelpers' ); // TODO technically wrong since globals isn't populated yet, but ¯\_(ツ)_/¯

	const namedExports = {};

	// TODO handle transpiled modules
	let shouldWrap = /__esModule/.test( code );

	function isRequireStatement ( node ) {
		if ( !node ) return;
		if ( node.type !== 'CallExpression' ) return;
		if ( node.callee.name !== 'require' || scope.contains( 'require' ) ) return;
		if ( node.arguments.length !== 1 || (node.arguments[0].type !== 'Literal' && (node.arguments[0].type !== 'TemplateLiteral' || node.arguments[0].expressions.length > 0) ) ) return; // TODO handle these weird cases?
		if ( ignoreRequire( node.arguments[0].value ) ) return;

		return true;
	}

	function getRequired ( node, name ) {
		const source = node.arguments[0].type === 'Literal' ? node.arguments[0].value : node.arguments[0].quasis[0].value.cooked;

		const existing = required[ source ];
		if ( existing === undefined ) {
			sources.push( source );

			if ( !name ) {
				do name = `require$$${uid++}`;
				while ( scope.contains( name ) );
			}

			required[ source ] = { source, name, importsDefault: false };
		}

		return required[ source ];
	}

	// do a first pass, see which names are assigned to. This is necessary to prevent
	// illegally replacing `var foo = require('foo')` with `import foo from 'foo'`,
	// where `foo` is later reassigned. (This happens in the wild. CommonJS, sigh)
	const assignedTo = new Set();
	walk( ast, {
		enter ( node ) {
			if ( node.type !== 'AssignmentExpression' ) return;
			if ( node.left.type === 'MemberExpression' ) return;

			extractNames( node.left ).forEach( name => {
				assignedTo.add( name );
			});
		}
	});

	walk( ast, {
		enter ( node, parent ) {
			if ( sourceMap ) {
				magicString.addSourcemapLocation( node.start );
				magicString.addSourcemapLocation( node.end );
			}

			// skip dead branches
			if ( parent && ( parent.type === 'IfStatement' || parent.type === 'ConditionalExpression' ) ) {
				if ( node === parent.consequent && isFalsy( parent.test ) ) return this.skip();
				if ( node === parent.alternate && isTruthy( parent.test ) ) return this.skip();
			}

			if ( node._skip ) return this.skip();

			programDepth += 1;

			if ( node.scope ) scope = node.scope;
			if ( /^Function/.test( node.type ) ) lexicalDepth += 1;

			// if toplevel return, we need to wrap it
			if ( node.type === 'ReturnStatement' && lexicalDepth === 0 ) {
				shouldWrap = true;
			}

			// rewrite `this` as `commonjsHelpers.commonjsGlobal`
			if ( node.type === 'ThisExpression' && lexicalDepth === 0 ) {
				uses.global = true;
				if ( !ignoreGlobal ) magicString.overwrite( node.start, node.end, `${HELPERS_NAME}.commonjsGlobal`, { storeName: true } );
				return;
			}

			// rewrite `typeof module`, `typeof module.exports` and `typeof exports` (https://github.com/rollup/rollup-plugin-commonjs/issues/151)
			if ( node.type === 'UnaryExpression' && node.operator === 'typeof' ) {
				const flattened = flatten( node.argument );
				if ( !flattened ) return;

				if ( scope.contains( flattened.name ) ) return;

				if ( flattened.keypath === 'module.exports' || flattened.keypath === 'module' || flattened.keypath === 'exports' ) {
					magicString.overwrite( node.start, node.end, `'object'`, { storeName: false } );
				}
			}

			// rewrite `require` (if not already handled) `global` and `define`, and handle free references to
			// `module` and `exports` as these mean we need to wrap the module in commonjsHelpers.createCommonjsModule
			if ( node.type === 'Identifier' ) {
				if ( isReference( node, parent ) && !scope.contains( node.name ) ) {
					if ( node.name in uses ) {
						if ( node.name === 'require' ) {
							if ( allowDynamicRequire ) return;
							magicString.overwrite( node.start, node.end, `${HELPERS_NAME}.commonjsRequire`, { storeName: true } );
						}

						uses[ node.name ] = true;
						if ( node.name === 'global' && !ignoreGlobal ) {
							magicString.overwrite( node.start, node.end, `${HELPERS_NAME}.commonjsGlobal`, { storeName: true } );
						}

						// if module or exports are used outside the context of an assignment
						// expression, we need to wrap the module
						if ( node.name === 'module' || node.name === 'exports' ) {
							shouldWrap = true;
						}
					}

					if ( node.name === 'define' ) {
						magicString.overwrite( node.start, node.end, 'undefined', { storeName: true } );
					}

					globals.add( node.name );
				}

				return;
			}

			// Is this an assignment to exports or module.exports?
			if ( node.type === 'AssignmentExpression' ) {
				if ( node.left.type !== 'MemberExpression' ) return;

				const flattened = flatten( node.left );
				if ( !flattened ) return;

				if ( scope.contains( flattened.name ) ) return;

				const match = exportsPattern.exec( flattened.keypath );
				if ( !match || flattened.keypath === 'exports' ) return;

				uses[ flattened.name ] = true;

				// we're dealing with `module.exports = ...` or `[module.]exports.foo = ...` –
				// if this isn't top-level, we'll need to wrap the module
				if ( programDepth > 3 ) shouldWrap = true;

				node.left._skip = true;

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

			// if this is `var x = require('x')`, we can do `import x from 'x'`
			if ( node.type === 'VariableDeclarator' && node.id.type === 'Identifier' && isRequireStatement( node.init ) ) {
				// for now, only do this for top-level requires. maybe fix this in future
				if ( scope.parent ) return;

				// edge case — CJS allows you to assign to imports. ES doesn't
				if ( assignedTo.has( node.id.name ) ) return;

				const r = getRequired( node.init, node.id.name );
				r.importsDefault = true;

				if ( r.name === node.id.name ) {
					node._shouldRemove = true;
				}
			}

			if ( !isRequireStatement( node ) ) return;

			const r = getRequired( node );

			if ( parent.type === 'ExpressionStatement' ) {
				// is a bare import, e.g. `require('foo');`
				magicString.remove( parent.start, parent.end );
			} else {
				r.importsDefault = true;
				magicString.overwrite( node.start, node.end, r.name );
			}

			node.callee._skip = true;
		},

		leave ( node ) {
			programDepth -= 1;
			if ( node.scope ) scope = scope.parent;
			if ( /^Function/.test( node.type ) ) lexicalDepth -= 1;

			if ( node.type === 'VariableDeclaration' ) {
				let keepDeclaration = false;
				let c = node.declarations[0].start;

				for ( let i = 0; i < node.declarations.length; i += 1 ) {
					const declarator = node.declarations[i];

					if ( declarator._shouldRemove ) {
						magicString.remove( c, declarator.end );
					} else {
						if ( !keepDeclaration ) {
							magicString.remove( c, declarator.start );
							keepDeclaration = true;
						}

						c = declarator.end;
					}
				}

				if ( !keepDeclaration ) {
					magicString.remove( node.start, node.end );
				}
			}
		}
	});

	if ( !sources.length && !uses.module && !uses.exports && !uses.require && ( ignoreGlobal || !uses.global ) ) {
		if ( Object.keys( namedExports ).length ) {
			throw new Error( `Custom named exports were specified for ${id} but it does not appear to be a CommonJS module` );
		}
		return null; // not a CommonJS module
	}

	const includeHelpers = shouldWrap || uses.global || uses.require;
	const importBlock = ( includeHelpers ? [ `import * as ${HELPERS_NAME} from '${HELPERS_ID}';` ] : [] ).concat(
		sources.map( source => {
			// import the actual module before the proxy, so that we know
			// what kind of proxy to build
			return `import '${source}';`;
		}),
		sources.map( source => {
			const { name, importsDefault } = required[ source ];
			return `import ${importsDefault ? `${name} from ` : ``}'${PREFIX}${source}';`;
		})
	).join( '\n' ) + '\n\n';

	const namedExportDeclarations = [];
	let wrapperStart = '';
	let wrapperEnd = '';

	const moduleName = deconflict( scope, globals, getName( id ) );
	if ( !isEntry ) {
		const exportModuleExports = {
			str: `export { ${moduleName} as __moduleExports };`,
			name: '__moduleExports'
		};

		namedExportDeclarations.push( exportModuleExports );
	}

	const name = getName( id );

	function addExport ( x ) {
		const deconflicted = deconflict( scope, globals, name );

		const declaration = deconflicted === name ?
			`export var ${x} = ${moduleName}.${x};` :
			`var ${deconflicted} = ${moduleName}.${x};\nexport { ${deconflicted} as ${x} };`;

		namedExportDeclarations.push({
			str: declaration,
			name: x
		});
	}

	if ( customNamedExports ) customNamedExports.forEach( addExport );

	const defaultExportPropertyAssignments = [];
	let hasDefaultExport = false;

	if ( shouldWrap ) {
		const args = `module${uses.exports ? ', exports' : ''}`;

		wrapperStart = `var ${moduleName} = ${HELPERS_NAME}.createCommonjsModule(function (${args}) {\n`;
		wrapperEnd = `\n});`;
	} else {
		const names = [];

		ast.body.forEach( node => {
			if ( node.type === 'ExpressionStatement' && node.expression.type === 'AssignmentExpression' ) {
				const left = node.expression.left;
				const flattened = flatten( left );

				if ( !flattened ) return;

				const match = exportsPattern.exec( flattened.keypath );
				if ( !match ) return;

				if ( flattened.keypath === 'module.exports' ) {
					hasDefaultExport = true;
					magicString.overwrite( left.start, left.end, `var ${moduleName}` );
				} else {
					const name = match[1];
					const deconflicted = deconflict( scope, globals, name );

					names.push({ name, deconflicted });

					magicString.overwrite( node.start, left.end, `var ${deconflicted}` );

					const declaration = name === deconflicted ?
						`export { ${name} };` :
						`export { ${deconflicted} as ${name} };`;

					if ( name !== 'default' ) {
						namedExportDeclarations.push({
							str: declaration,
							name
						});
						delete namedExports[name];
					}

					defaultExportPropertyAssignments.push( `${moduleName}.${name} = ${deconflicted};` );
				}
			}
		});

		if ( !hasDefaultExport ) {
			wrapperEnd = `\n\nvar ${moduleName} = {\n${
				names.map( ({ name, deconflicted }) => `\t${name}: ${deconflicted}` ).join( ',\n' )
			}\n};`;
		}
	}
	Object.keys( namedExports )
		.filter( key => !blacklist[ key ] )
		.forEach( addExport );

	const defaultExport = /__esModule/.test( code ) ?
		`export default ${HELPERS_NAME}.unwrapExports(${moduleName});` :
		`export default ${moduleName};`;

	const named = namedExportDeclarations
		.filter( x => x.name !== 'default' || !hasDefaultExport )
		.map( x => x.str );

	const exportBlock = '\n\n' + [ defaultExport ]
		.concat( named )
		.concat( hasDefaultExport ? defaultExportPropertyAssignments : [] )
		.join( '\n' );

	magicString.trim()
		.prepend( importBlock + wrapperStart )
		.trim()
		.append( wrapperEnd + exportBlock );

	code = magicString.toString();
	const map = sourceMap ? magicString.generateMap() : null;

	return { code, map };
}
