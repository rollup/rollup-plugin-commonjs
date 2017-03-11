import './b';
import b from 'commonjs-proxy:./b';

var a = 'a'
  , c = 'c';

console.log( a, b, c );

var input = {

};

export default input;
export { input as __moduleExports };