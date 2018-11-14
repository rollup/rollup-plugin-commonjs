const toExport = {};

const foo = require("./foo");

toExport.foo = foo.default;

function bar() {
	return 'hello world';
}
toExport.bar = bar;

module.exports = toExport;
