const assert = require('assert');

module.exports = {
	exports(exports) {
		assert.equal(exports.encoded, encodeURIComponent('test string'));
	}
};
