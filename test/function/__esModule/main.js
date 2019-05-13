import * as x from './answer';

assert.ok( 'answer' in x );
assert.ok( 'default' in x );
assert.ok( !( '__esModule' in x ) );
