import foo, { named } from './bar.js';

assert.equal( foo, 'the default' );
assert.equal( named, 'the named' );
