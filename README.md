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
      
      // add this if you want to generate sourcemaps later
      sourceMap: true
    })
  ]
}).then(...)
```


## License

MIT
