exports.encodeURIComponent = function () {
	return encodeURIComponent( this.str );
};

global.foo = exports; // to ensure module is wrapped
