try {
  require('does-not-exist');
}
catch (err) {
  if (err instanceof Error && err.message === 'Cannot find module \'does-not-exist\'.')
    exports.caughtOk = true;
}