# rollup-plugin-commonjs

Convert CommonJS modules to ES6, so they can be included in a Rollup bundle


## Installation

```bash
npm install --save-dev rollup-plugin-commonjs
```


## Usage

Typically, you would use this plugin alongside [rollup-plugin-npm](https://github.com/rollup/rollup-plugin-npm), so that you could bundle your CommonJS dependencies in `node_modules`.

```js
import { rollup } from 'rollup';
import commonjs from 'rollup-plugin-commonjs';
import npm from 'rollup-plugin-npm';

rollup({
  entry: 'main.js',
  plugins: [
    npm({
      jsnext: true,
      main: true
    }),

    // non-CommonJS modules will be ignored, but you can also
    // specifically include/exclude files
    commonjs({
      include: 'node_modules/**',
      exclude: [ 'node_modules/foo/**', 'node_modules/bar/**' ],

      // search for files other than .js files (must already
      // be transpiled by a previous plugin!)
      extensions: [ '.js', '.coffee' ] // defaults to [ '.js' ]
    })
  ]
}).then(...)
```

### Custom named exports

This plugin will attempt to create named exports, where appropriate, so you can do this...

```js
// importer.js
import { named } from './exporter.js';

// exporter.js
module.exports = { named: 42 }; // or `exports.named = 42;`
```

...but that's not always possible:

```js
// importer.js
import { named } from 'my-lib';

// my-lib.js
var myLib = exports;
myLib.named = 'you can\'t see me';
```

In those cases, you can specify custom named exports:

```js
commonjs({
  namedExports: {
    // left-hand side can be an absolute path, a path
    // relative to the current directory, or the name
    // of a module in node_modules
    'node_modules/my-lib/index.js': [ 'named' ]
  }
});
```


## License

MIT
