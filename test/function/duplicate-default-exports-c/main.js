import E from './exports.js';
import { Foo } from './exports.js';
import { var as Var } from './exports.js';

assert.strictEqual( E.Foo, 1 );
assert.strictEqual( E.var, 'VAR' );
assert.deepEqual( E.default, { Foo: 2, default:  3 });
assert.strictEqual( E.default.Foo, 2 );
assert.strictEqual( E.default.default, 3 );
assert.strictEqual( Foo, 1 );
assert.strictEqual( Var, 'VAR' );
