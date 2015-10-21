import { parse } from 'acorn/src/index.js';
import { walk } from 'estree-walker';
import MagicString from 'magic-string';

export default function commonjs ( options = {} ) {
	return {
		transform ( code, id ) {
			// TODO skip non-CommonJS modules
			const ast = parse( code, {
				ecmaVersion: 6,
				sourceType: 'module'
			});

			const magicString = new MagicString( code );

			let required = [];
			let hasEs6ImportOrExport = false;
			let hasCommonJsExports = false;

			// TODO handle shadowed `require` calls
			let depth = 0;

			walk( ast, {
				enter ( node, parent ) {
					if ( /Function/.test( node.type ) ) {
						depth += 1;
						return;
					}

					if ( /^(Import|Export)/.test( node.type ) ) {
						hasEs6ImportOrExport = true;
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

					let index = required.indexOf( source );

					if ( !~index ) {
						index = required.length;
						required.push( source );
					}

					magicString.overwrite( node.start, node.end, `require$$${index}` );
				},

				leave ( node ) {
					if ( /Function/.test( node.type ) ) depth -= 1;
				}
			});

			if ( !required.length && !hasCommonJsExports ) return null;
			if ( hasEs6ImportOrExport ) throw new Error( 'Cannot mix and match CommonJS and ES2015 imports/exports' );

			const importBlock = required.length ?
				required.map( ( source, i ) => `import require$$${i} from '${source}';` ).join( '\n' ) :
				'';

			const intro = `let exports = {}, module = { exports: exports };`;

			const outro = `export default module.exports;`;

			magicString
				.prepend( importBlock + intro )
				.append( outro );

			return {
				code: magicString.toString(),
				map: magicString.generateMap()
			};
		}
	};
}
