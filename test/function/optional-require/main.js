try {
  var fs = require('fs');
  require('does-not-exist');
}
catch (err) {
  if (err instanceof Error && err.message === 'Cannot find module \'does-not-exist\'.' && fs)
    exports.caughtOk = true;
}
