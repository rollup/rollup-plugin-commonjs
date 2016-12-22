exports.encodeURIComponent = function () {
	return encodeURIComponent( this.str );
};

console.log( exports ); // to ensure module is wrapped
