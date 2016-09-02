import * as x from './answer';

assert.ok( 'answer' in x );
assert.ok( 'default' in x ); // TODO is this right?
assert.ok( !( '__esModule' in x ) );
