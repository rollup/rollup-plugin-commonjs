import { statSync } from 'fs';
import { dirname, extname, resolve, sep } from 'path';
import acorn from 'acorn';
import { walk } from 'estree-walker';
import MagicString from 'magic-string';
import { addExtension, createFilter } from 'rollup-pluginutils';

var firstpass = /\b(?:require|module|exports)\b/;

export default function commonjs ( options = {} ) {
	var filter = createFilter( options.include, options.exclude );

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
				} catch ( err ) {}
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
						name = `require$$${uid++}`;
						required[ source ] = { source, name };
					} else {
						name = required[ source ].name;
					}

					magicString.overwrite( node.start, node.end, name );
				},

				leave ( node ) {
					if ( /Function/.test( node.type ) ) depth -= 1;
				}
			});

			const sources = Object.keys( required );

			if ( !sources.length && !hasCommonJsExports ) return null;

			const importBlock = sources.length ?
				sources.map( source => `import ${required[ source ].name} from '${source}';` ).join( '\n' ) :
				'';

			const intro = `\n\nexport default (function (module) {\nvar exports = module.exports;\n`;
			const outro = `\nreturn module.exports;\n})({exports:{}});`;

			magicString.trim()
				.prepend( importBlock + intro )
				.trim()
				.append( outro );

			code = magicString.toString();
			const map = options.sourceMap ? magicString.generateMap() : null;

			return { code, map };
		}
	};
}
