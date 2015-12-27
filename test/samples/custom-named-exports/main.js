import { named } from './secret-named-exporter.js';
import { message } from 'external';

assert.equal( named, 42 );
assert.equal( message, 'it works' );
