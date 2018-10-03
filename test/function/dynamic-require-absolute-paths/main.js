const Path = require('path');
let basePath = process.cwd() + '/function/dynamic-require-absolute-paths';

assert.equal(require(Path.resolve(`${basePath}/submodule.js`)), 'submodule');
