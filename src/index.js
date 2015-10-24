import { parse } from 'acorn/src/index.js';
import { walk } from 'estree-walker';
import MagicString from 'magic-string';
import { createFilter } from 'rollup-pluginutils';

var firstpass = /\b(?:require|module|exports)\b/;

export default function commonjs ( options = {} ) {
	var filter = createFilter( options.include, options.exclude );

	return {
		transform ( code, id ) {
			if ( !filter( id ) ) return null;
			if ( !firstpass.test( code ) ) return null;

			const ast = parse( code, {
				ecmaVersion: 6,
				sourceType: 'module'
			});

			const magicString = new MagicString( code );

			let required = {};
			let uid = 0;
			let hasCommonJsExports = false;

			// TODO handle shadowed `require` calls
			let depth = 0;

			walk( ast, {
				enter ( node, parent ) {
					if ( options.sourceMap ) {
						magicString.addSourcemapLocation( node.start );
						magicString.addSourcemapLocation( node.end );
					}

					if ( /Function/.test( node.type ) ) {
						depth += 1;
						return;
					}

					if ( /^(Import|Export)/.test( node.type ) ) {
						return;
					}

					// TODO more accurate check
					if ( node.type === 'Identifier' && node.name === 'exports' || node.name === 'module' ) {
						hasCommonJsExports = true;
						return;
					}

					if ( node.type !== 'CallExpression' ) return;
					if ( node.callee.name !== 'require' ) return;
					if ( node.arguments.length !== 1 || node.arguments[0].type !== 'Literal' ) return; // TODO handle these weird cases?

					const source = node.arguments[0].value;

					let existing = required[ source ];
					let name;

					if ( !existing ) {
						if ( !depth && parent.type === 'VariableDeclarator' ) {
							name = parent.id.name;
							parent._remove = true;
						} else {
							name = `require$$${uid++}`;
						}

						required[ source ] = { source, name };
					} else {
						name = required[ source ].name;
					}

					magicString.overwrite( node.start, node.end, name );
				},

				leave ( node, parent ) {
					if ( /Function/.test( node.type ) ) depth -= 1;

					if ( node.type === 'VariableDeclarator' && node._remove ) {
						magicString.remove( node.start, node.end );
						parent.declarations.splice( parent.declarations.indexOf( node ), 1 );
					}

					if ( node.type === 'VariableDeclaration' && !node.declarations.length ) {
						magicString.remove( node.start, node.end );
					}
				}
			});

			const sources = Object.keys( required );

			if ( !sources.length && !hasCommonJsExports ) return null;

			const importBlock = sources.length ?
				sources.map( source => `import ${required[ source ].name} from '${source}';` ).join( '\n' ) :
				'';

			const intro = `var exports = {}, module = { 'exports': exports };`;
			const outro = `export default module.exports;`;

			magicString
				.prepend( importBlock + intro )
				.append( outro );

			code = magicString.toString();
			const map = options.sourceMap ? magicString.generateMap() : null;

			return { code, map };
		}
	};
}
