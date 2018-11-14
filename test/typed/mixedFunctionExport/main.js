const toExport = {};

function foo() {
	return 42;
}
toExport.default = foo;


function bar() {
	return 'hello world';
}
toExport.bar = bar;

module.exports = toExport;
