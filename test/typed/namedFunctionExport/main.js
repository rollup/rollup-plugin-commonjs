const toExport = {};

function foo() {
	return 42;
}
toExport.foo = foo;

function bar() {
	return 'hello world';
}
toExport.bar = bar;

module.exports = toExport;
