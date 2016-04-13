var _foo;
(function outer ( modules, cache, entry ) {
	// Save the require from previous bundle to this closure if any
	var previousRequire = typeof require == 'function' && require;

	function newRequire ( name ) {
		if (!cache[name]) {
			if (!modules[name]) {
				if (previousRequire) return previousRequire(name, true);
			}
			var m = cache[name] = {
				exports: {}
			};
			modules[name][0].call( m.exports, function ( x ) {
				var id = modules[name][1][x];
				return newRequire(id ? id : x);
			}, m, m.exports, outer, modules, cache, entry);
		}
		return cache[name].exports;
	}
	var mod = {
		exports: {}
	};
	(function ( require, module) {
		(function ( global) {
			module.exports = function ( data) {
				return global.encodeURIComponent(data);
			};
			_foo = module.exports;
		}).call(this, typeof global !== 'undefined' ? global : typeof self !== 'undefined' ? self : typeof window !== 'undefined' ? window : {});
	}.call(this, newRequire, mod, mod.exports));
}());
export default _foo;
