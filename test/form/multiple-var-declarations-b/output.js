import './a';
import a from 'commonjs-proxy:./a';

var b = 42;

console.log( a, b );

var input = {

};

export default input;
export { input as __moduleExports };