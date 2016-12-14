(function (global, factory) {
	typeof define === 'function' && define.amd ? define(factory) :
	typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory() :
	(global.foo = factory());
}(this, (function () { 'use strict';

	return 42;

})));
