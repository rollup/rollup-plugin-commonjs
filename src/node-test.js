export function staticObject ( node ) {
  return node.type === 'ObjectExpression' && node.properties.every( prop =>
    !prop.computed && staticValue( prop.value ) );
}

export function staticMember ( node ) {
  return node.type === 'MemberExpression' && identifier( node.property ) &&
    staticValue( node.object );
}

export function staticValue ( node ) {
  return literal( node ) || identifier( node ) || func( node ) ||
    staticBinOp( node ) || staticObject( node ) || staticMember( node );
}

export function staticBinOp ( node ) {
  return ( node.type === 'BinaryExpression' || node.type === 'LogicalExpression' ) &&
    staticValue( node.left ) && staticValue( node.right );
}

export function func ( node ) {
  return node.type === 'FunctionExpression';
}

export function literal ( node ) {
  return node.type === 'Literal';
}

export function identifier ( node ) {
  return node.type === 'Identifier';
}
