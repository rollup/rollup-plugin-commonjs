const toExport = {};

function foo() {
	return 42;
}

toExport.default = foo;

module.exports = toExport;
