export const PROXY_PREFIX = '\0commonjs-proxy:';
export const EXTERNAL_PREFIX = '\0commonjs-external:';
export const DYNAMIC_REGISTER_PREFIX = '\0commonjs-dynamic-register:';
export const DYNAMIC_JSON_PREFIX = '\0commonjs-dynamic-json:';
export const DYNAMIC_PACKAGES_ID = '\0commonjs-dynamic-packages';
export const HELPERS_ID = '\0commonjsHelpers';

export const HELPERS = `
export var commonjsGlobal = typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : typeof self !==
'undefined' ? self : {};

export function commonjsRegister (path, loader) {
	DYNAMIC_REQUIRE_LOADER_MAP.set(path, loader);
}

export function unwrapExports (x) {
	return x && x.__esModule && Object.prototype.hasOwnProperty.call(x, 'default') ? x.default : x;
}

export function createCommonjsModule(fn, module) {
	return module = { exports: {} }, fn(module, module.exports), module.exports;
}

export function getCjsExportFromNamespace (n) {
	return n && n.default || n;
}

let pathModule;
const DYNAMIC_REQUIRE_LOADER_MAP = new Map();
const DYNAMIC_REQUIRE_CACHE = Object.create(null);
const DEFAULT_PARENT_MODULE = {
	id: '<' + 'rollup' + '>', exports: {}, parent: undefined, filename: null, loaded: false, children: [], paths: []
};
const CHECKED_EXTENSIONS = ['', '.js', '.json'];

export function commonjsRequire (path, originalModuleDir) {
	if (!pathModule) pathModule = require('path');
	const isRelative = /[/\\\\]/.test(path);
	let relPath;
	while (true) {
		if (isRelative) {
			relPath = pathModule.normalize(pathModule.join(originalModuleDir || '', path)).replace(/\\\\/g, '/');
		} else if (originalModuleDir)
			relPath = pathModule.normalize(pathModule.join(originalModuleDir, '../node_modules/', path)).replace(/\\\\/g, '/');
		else {
			relPath = pathModule.normalize(pathModule.join('/node_modules/', path)).replace(/\\\\/g, '/');
		}
		let cachedModule = DYNAMIC_REQUIRE_CACHE[relPath] || DYNAMIC_REQUIRE_CACHE[relPath + '.js'] || DYNAMIC_REQUIRE_CACHE[relPath + '.json'];
		if (!cachedModule) {
			let resolvedPath, loader;
			for (let extensionIndex = 0; extensionIndex < CHECKED_EXTENSIONS.length; extensionIndex++) {
				resolvedPath = relPath + CHECKED_EXTENSIONS[extensionIndex];
				loader = DYNAMIC_REQUIRE_LOADER_MAP.get(resolvedPath);
				if (loader) break;
			}
			if (loader) {
				DYNAMIC_REQUIRE_CACHE[resolvedPath] = cachedModule = {
					id: resolvedPath,
					filename: resolvedPath,
					exports: {},
					parent: DEFAULT_PARENT_MODULE,
					loaded: false,
					children: [],
					paths: []
				};
				try {
					loader.call(commonjsGlobal, cachedModule, cachedModule.exports);
				} catch (ex) {
					delete DYNAMIC_REQUIRE_CACHE[resolvedPath];
					throw ex;
				}
				cachedModule.loaded = true;
			}
		}
		if (cachedModule) return cachedModule.exports;
		if (isRelative) break;
		const nextDir = pathModule.normalize(pathModule.join(originalModuleDir, '..')).replace(/\\\\/g, '/');
		if (nextDir === originalModuleDir) break;
		originalModuleDir = nextDir;
	}

	return require(path);
}

commonjsRequire.cache = DYNAMIC_REQUIRE_CACHE;`;
