# rollup-plugin-commonjs changelog

## 1.4.0

* Generate sourcemaps by default

## 1.3.0

* Handle references to `global` ([#6](https://github.com/rollup/rollup-plugin-commonjs/issues/6))

## 1.2.0

* Generate named exports where possible ([#5](https://github.com/rollup/rollup-plugin-commonjs/issues/5))
* Handle shadowed `require`/`module`/`exports`

## 1.1.0

* Handle dots in filenames ([#3](https://github.com/rollup/rollup-plugin-commonjs/issues/3))
* Wrap modules in IIFE for more readable output

## 1.0.0

* Stable release, now that Rollup supports plugins

## 0.2.1

* Allow mixed CommonJS/ES6 imports/exports
* Use `var` instead of `let`

## 0.2.0

* Sourcemap support
* Support `options.include` and `options.exclude`
* Bail early if module is obviously not a CommonJS module

## 0.1.1

Add dist files to package (whoops!)

## 0.1.0

* First release
