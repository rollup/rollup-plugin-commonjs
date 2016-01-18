var foo = require( './foo' );

var obj = {};
foo.call( obj );

assert.equal( obj.x, 'x' );
assert.equal( this.y, 'y' );
