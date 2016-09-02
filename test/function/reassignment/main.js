var foo = require( './foo.js' );

if ( !foo.something ) {
	foo = function somethingElse () {}
	foo.something = true;
}

assert.ok( foo.something );
