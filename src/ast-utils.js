export function isReference ( node, parent ) {
	if ( parent.type === 'MemberExpression' ) return parent.computed || node === parent.object;

	// disregard the `bar` in { bar: foo }
	if ( parent.type === 'Property' && node !== parent.value ) return false;

	// disregard the `bar` in `class Foo { bar () {...} }`
	if ( parent.type === 'MethodDefinition' ) return false;

	// disregard the `bar` in `export { foo as bar }`
	if ( parent.type === 'ExportSpecifier' && node !== parent.local ) return false;

	return true;
}

export function flatten ( node ) {
	let name;
	let parts = [];

	while ( node.type === 'MemberExpression' ) {
		if ( node.computed ) return null;

		parts.unshift( node.property.name );
		node = node.object;
	}

	if ( node.type !== 'Identifier' ) return null;

	name = node.name;
	parts.unshift( name );

	return { name, keypath: parts.join( '.' ) };
}
