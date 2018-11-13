const assert = require('assert');

module.exports = {
	pluginOptions: {
		isMissing(id) {
			return id === 'does-not-exist';
		}
	},
	exports: exports => {
		assert.equal(exports.caughtOk, true);
	}
};
