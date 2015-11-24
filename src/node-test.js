export function staticObject ( node ) {
  return node.type === 'ObjectExpression' && node.properties.every( prop =>
    !prop.computed && staticValue( prop.value ) );
}

export function staticMember ( node ) {
  return node.type === 'MemberExpression' && literal( node.property ) &&
    ( literal( node.object ) || staticMember( node.object ) );
}

export function staticValue ( node ) {
  return literal( node ) || identifier( node ) || staticObject( node ) || staticMember( node );
}

export function literal ( node ) {
  return node.type === 'Literal';
}

export function identifier ( node ) {
  return node.type === 'Identifier';
}
