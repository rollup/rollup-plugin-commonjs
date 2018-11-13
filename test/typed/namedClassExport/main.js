const toExport = {};

class Foo {
	constructor() {
		this.bar = 'bar';
	}

	baz() {
		return 42;
	}
}

toExport.Foo = Foo;
module.exports = toExport;
