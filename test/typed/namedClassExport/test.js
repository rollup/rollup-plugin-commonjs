import { Foo } from './main.js';

const foo = new Foo();
assert.equal(foo.bar, 'bar');
assert.equal(foo.baz(), 42);
