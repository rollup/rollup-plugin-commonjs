function takeModule (withName) {
	return require('./' + withName);
}

module.exports = takeModule('submodule.js');
