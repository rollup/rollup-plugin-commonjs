import './a';
import require$$0 from 'commonjs-proxy:./a';
import './b';
import b from 'commonjs-proxy:./b';

var a = require$$0();

console.log( a, b );

var input = {

};

export default input;
export { input as __moduleExports };