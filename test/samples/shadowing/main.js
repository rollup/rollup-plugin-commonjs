function foo ( require ) {
	require( 'not-an-actual-require-statement' );
}

let result;

foo( function ( msg ) {
	result = msg;
});

assert.equal( result, 'not-an-actual-require-statement' );
