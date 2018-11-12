const assert = require('assert');

module.exports = {
	solo: true,
	exports: exports => {
		assert.equal(exports.caughtOk, true);
	}
};
