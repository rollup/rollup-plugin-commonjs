import * as commonjsHelpers from 'commonjsHelpers';
import 'bar';
import bar from 'commonjs-proxy:bar';

var foo = commonjsHelpers.commonjsRequire( ('foo').toLowerCase() ,".");

var input = {

};

export default input;
export { input as __moduleExports };