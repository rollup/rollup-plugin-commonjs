function foo () {
	var a = 1, global = {};
	global.modified = true;
	return global;
}

var notGlobal = foo();
assert.ok( notGlobal.modified );
assert.ok( !global.modified );

module.exports = {};
