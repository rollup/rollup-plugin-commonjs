var foo = 1;
var bar = 2;

var foo_1 = 'a';
var bar_1 = 'b';

var __moduleExports = {
	foo: foo_1,
	bar: bar_1
};

export default __moduleExports;
export { __moduleExports };
export { foo_1 as foo };
export { bar_1 as bar };
