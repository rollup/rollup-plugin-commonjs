function takeModule(name) {
	return require(name);
}

module.exports = {
	parent: takeModule('..'),
	customModule: takeModule('custom-module')
};
