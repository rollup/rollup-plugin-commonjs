import { message, foo } from 'events';

assert.equal( message, 'this is not builtin' );
assert.equal( foo, 'this is a hidden export' );
