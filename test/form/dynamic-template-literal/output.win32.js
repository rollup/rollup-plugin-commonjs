import * as commonjsHelpers from 'commonjsHelpers';

var pe = 'pe';
var foo = commonjsHelpers.commonjsRequire((`ta${pe}`).toLowerCase(),".");
console.log(foo);

var input = {

};

export default input;
export { input as __moduleExports };
