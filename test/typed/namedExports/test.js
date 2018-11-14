import * as main from './main.js';

assert.equal(main.foo(), 42);
assert.equal(main.bar(), 'hello world');
assert.equal(main.qux(), 43);
assert.equal(main.default(), 44);
