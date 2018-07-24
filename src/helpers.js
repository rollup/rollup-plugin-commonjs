export const PROXY_PREFIX = '\0commonjs-proxy:';
export const EXTERNAL_PREFIX = '\0commonjs-external:';
export const HELPERS_ID = '\0commonjsHelpers';

export const HELPERS = `
export var commonjsGlobal = typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : typeof self !== 'undefined' ? self : {};

const realRequire = require;

// Avoid evaluating when not necessary (requiring here will mainly break tests).
let pathModule;

const DYNAMIC_REQUIRE_LOADER_MAP = new Map();
const CACHE = Object.create(null); // This is how it's done in real 'require'
const DEFAULT_PARENT_MODULE = {id: '<' + 'rollup' + '>', exports: {}, parent: undefined, filename: null, loaded: false, children: [], paths: []};

export function commonjsRequire (path, originalModuleDir) {
    // Transform path to distribution path
    if (!pathModule)
        pathModule = realRequire('path');

    const isRelative = /[\\/\\\\]/.test(path);
    
    let relPath;
    
    while (true) {
        if (isRelative) {
            relPath = pathModule.normalize(pathModule.join(originalModuleDir || '', path)).replace(/\\\\/g, '/');
        } else {
            if (originalModuleDir)
                relPath = pathModule.normalize(pathModule.join(originalModuleDir || '', '../node_modules/', path)).replace(/\\\\/g, '/');
            else
                relPath = pathModule.normalize(pathModule.join('/node_modules/', path)).replace(/\\\\/g, '/');
        }
    
        let module = CACHE[relPath] || CACHE[relPath + '.js'] || CACHE[relPath + '.json'];
    
        if (!module) {
            let resolvedPath, loader;
             
            for (let attemptExt of ['', '.js', '.json']) {
                resolvedPath = relPath + attemptExt;
                loader = DYNAMIC_REQUIRE_LOADER_MAP.get(resolvedPath);
                
                if (loader) break;
            }
            
            if (loader) {
                module = {
                    id: resolvedPath,
                    filename: resolvedPath,
                    exports: {},
                    parent: DEFAULT_PARENT_MODULE,
                    loaded: false,
                    
                    // Try not to include to much dirty stuff in outcome.
                    // If it will turn out as necessary in the future, someone will have to try to implement this.
                    children: [],
                    paths: []
                };
                
                // This is part of what allows CJS to support circular dependencies
                CACHE[resolvedPath] = module;
                
                try {
                    loader.call(commonjsGlobal, module, module.exports);
                } catch (ex) {
                    // rollback
                    delete CACHE[resolvedPath];
                    
                    // rethrow
                    throw ex;
                }
                
                // This is part of what allows CJS to support circular dependencies
                module.loaded = true;
            }
        }
                
        if (module)
            return module.exports;
            
        // If this is a relative path, there's only one shot at trying to figure it out.
        if (isRelative)
            break;
        else {
            // Take a step back
            let nextDir = pathModule.normalize(pathModule.join(originalModuleDir, '../')).replace(/\\\\/g, '/');
            if (nextDir === originalModuleDir) break;
            originalModuleDir = nextDir;
        }
    }
    
    // Try original \`require\` with transformed path
    return realRequire(path);
}

commonjsRequire.cache = CACHE;

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
}`;

export const DYNAMIC_REGISTER_PREFIX = '\0commonjs-dynamic-register:';
export const DYNAMIC_PACKAGES_ID = '\0commonjs-dynamic-packages';
