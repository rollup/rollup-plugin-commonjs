module.exports = function () {
	return require( './multiply' )( 2, require( './foo' ) );
};
