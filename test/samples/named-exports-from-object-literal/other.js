var a = require( './a.js' );
var b = 2;
var d = 4;

module.exports = {
  a: a,
  b: b,
  c: a + b,
  [d]: b + b,
  2: 1 + 1
};
