assert.deepEqual(require('./sub/submodule'), {
	moduleDirect: 'direct',
	moduleNested: 'nested',
	parentModule: 'parent'
});
