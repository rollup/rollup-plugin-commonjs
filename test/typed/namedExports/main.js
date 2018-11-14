const toExport = {};

function foo() {
	return 42;
}
toExport.foo = foo;

function baz() {
	return 'hello world';
}
toExport.bar = baz;

function qux() {
	return 43;
}
toExport.qux = qux;

function quux() {
	return 44;
}
toExport.default = quux;

module.exports = toExport;
