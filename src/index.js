import { statSync, readFileSync, existsSync } from 'fs';
import { extname, resolve, join } from 'path';
import { sync as nodeResolveSync } from 'resolve';
import { createFilter } from 'rollup-pluginutils';
import {
	EXTERNAL_PREFIX,
	PROXY_PREFIX, HELPERS_ID, HELPERS,
	DYNAMIC_REGISTER_PREFIX, DYNAMIC_PACKAGES_ID
} from './helpers.js';
import { checkEsModule, hasCjsKeywords, transformCommonjs, normalizeDynamicModulePath } from './transform.js';
import { getIsCjsPromise, setIsCjsPromise } from './is-cjs';
import { getResolveId } from './resolve-id';
import { getName } from './utils.js';
import glob from 'glob';

export default function commonjs(options = {}) {
	const extensions = options.extensions || ['.js'];
	const filter = createFilter(options.include, options.exclude);
	const ignoreGlobal = options.ignoreGlobal;

	let dynamicRequireModulePaths = [];
	let dynamicRequireModuleDirPaths = [];

	if (options.dynamicRequires) {
		let patterns = options.dynamicRequires;

		patterns = Array.isArray(patterns) ? patterns : [patterns];

		for (const pattern of patterns) {
			const negate = /^!/.test(pattern);
			let paths = glob.sync(negate ? pattern.substr(1) : pattern);
			paths = paths.map(x => resolve(x));
			if (negate) {
				dynamicRequireModulePaths = dynamicRequireModulePaths.filter(x => paths.indexOf(x) === -1);
			} else {
				dynamicRequireModulePaths = dynamicRequireModulePaths.concat(paths);
			}
		}

		// Dedup
		dynamicRequireModulePaths = dynamicRequireModulePaths.filter(
			(v, i, a) => a.indexOf(v, i + 1) === -1
		);

		// We use this to register entry points separately
		dynamicRequireModuleDirPaths = dynamicRequireModulePaths.filter(x => {
			try {
				if (statSync(x).isDirectory()) return true;
			} catch (ignored) {
				// We don't care about this.
			}
			return false;
		});
	}

	// The map should contain the normalized, unique paths
	const dynamicRequireModuleSet = new Set(
		dynamicRequireModulePaths.map(id => normalizeDynamicModulePath(id))
	);

	const customNamedExports = {};
	if (options.namedExports) {
		Object.keys(options.namedExports).forEach(id => {
			let resolvedId;

			try {
				resolvedId = nodeResolveSync(id, { basedir: process.cwd() });
			} catch (err) {
				resolvedId = resolve(id);
			}

			customNamedExports[resolvedId] = options.namedExports[id];
		});
	}

	const esModulesWithoutDefaultExport = Object.create(null);
	const esModulesWithDefaultExport = Object.create(null);

	const ignoreRequire =
		typeof options.ignore === 'function'
			? options.ignore
			: Array.isArray(options.ignore)
				? id => options.ignore.includes(id)
				: () => false;

	let entryModuleIdsPromise = null;

	const resolveId = getResolveId(extensions);

	const sourceMap = options.sourceMap !== false;

	let mainModuleId = null;

	return {
		name: 'commonjs',

		options(options) {
			resolveId.setRollupOptions(options);
			const input = options.input || options.entry;
			const entryModules = Array.isArray(input)
				? input
				: typeof input === 'object' && input !== null
					? Object.values(input)
					: [input];
			entryModuleIdsPromise = Promise.all(entryModules.map(entry => resolveId(entry)));
		},

		resolveId,

		load(id) {
			// TODO JSON files must have virtual ids
			if (id === HELPERS_ID) return HELPERS;

			// generate proxy modules
			if (id.startsWith(EXTERNAL_PREFIX)) {
				const actualId = id.slice(EXTERNAL_PREFIX.length);
				const name = getName(actualId);

				if (actualId === HELPERS_ID || actualId === DYNAMIC_PACKAGES_ID)
					// These do not export default
					return `import * as ${name} from ${JSON.stringify(actualId)}; export default ${name};`;

				return `import ${name} from ${JSON.stringify(actualId)}; export default ${name};`;
			}

			if (id === DYNAMIC_PACKAGES_ID) {
				let code = `const { commonjsRegister } = require('${HELPERS_ID}');`;
				for (const dir of dynamicRequireModuleDirPaths) {
					const normalizedPath = normalizeDynamicModulePath(dir);

					let pkg = {};

					try {
						if (existsSync(join(normalizedPath, 'package.json'))) {
							pkg = JSON.parse(
								readFileSync(join(normalizedPath, 'package.json'), { encoding: 'utf8' })
							);
						}
					} catch (ignored) {
						// We don't care about this, we fallback to default.
					}

					const entryPoint = pkg.main || 'index.js';

					code += `\ncommonjsRegister(${JSON.stringify(
						normalizedPath
					)}, function (module, exports) {
  module.exports = require(${JSON.stringify(
		normalizeDynamicModulePath(join(normalizedPath, entryPoint))
	)});
});`;
				}
				return code;
			}

			const normalizedPath = normalizeDynamicModulePath(id);

			if (dynamicRequireModuleSet.has(normalizedPath)) {
				// Try our best to still export the module fully.
				// The commonjs polyfill should take care of circular references.

				return `require('${HELPERS_ID}').commonjsRegister(${JSON.stringify(
					normalizedPath
				)}, function (module, exports) {
  ${readFileSync(normalizedPath, { encoding: 'utf8' })}
});`;
			}

			if (id.startsWith(PROXY_PREFIX)) {
				const actualId = id.slice(PROXY_PREFIX.length);
				const name = getName(actualId);

				return getIsCjsPromise(actualId).then(isCjs => {
					if (dynamicRequireModuleSet.has(normalizeDynamicModulePath(actualId)))
						return `import {commonjsRequire} from '${HELPERS_ID}'; const ${name} = commonjsRequire(${JSON.stringify(
							normalizeDynamicModulePath(actualId)
						)}); export default (${name} && ${name}['default']) || ${name}`;
					else if (isCjs)
						return `import { __moduleExports } from ${JSON.stringify(
							actualId
						)}; export default __moduleExports;`;
					else if (esModulesWithoutDefaultExport[actualId])
						return `import * as ${name} from ${JSON.stringify(actualId)}; export default ${name};`;
					else if (esModulesWithDefaultExport[actualId]) {
						return `export {default} from ${JSON.stringify(actualId)};`;
					} else
						return `import * as ${name} from ${JSON.stringify(
							actualId
						)}; import {getCjsExportFromNamespace} from "${HELPERS_ID}"; export default getCjsExportFromNamespace(${name})`;
				});
			}

			// Keep reference to this, so we know where to register dynamic modules
			if (!mainModuleId) {
				mainModuleId = id;
				let code = readFileSync(id, {encoding: 'utf8'});

				// There's a bug in rollup (or this plugin) that unescaped backslashes.
				// We need to double encode (on top of JSON.stringify)
				// When it's fixed, we can removed this weirdo. JSON.stringify should be enough.
				const escapedWindowsPaths = dynamicRequireModulePaths.map(id => id.replace(/\\/g, '\\\\'));

				let dynamicImports = escapedWindowsPaths
					.map(id => `require(${JSON.stringify(DYNAMIC_REGISTER_PREFIX + id)});`)
					.join('\n');

				if (dynamicRequireModuleDirPaths.length) {
					dynamicImports += `require(${JSON.stringify(
						DYNAMIC_REGISTER_PREFIX + DYNAMIC_PACKAGES_ID
					)});`;
				}

				const hasUseStrict = /^\s*(['"])use strict\1\s*;?/.test(code);
				if (hasUseStrict) code = code.replace(/^\s*(['"])use strict\1\s*;?/, '');

				code = dynamicImports + '\n' + code;

				if (hasUseStrict) code = '"use strict";\n' + code;

				return code;
			}
		},

		transform(code, id) {
			if (id !== DYNAMIC_PACKAGES_ID) {
				if (!filter(id) || extensions.indexOf(extname(id)) === -1) {
					setIsCjsPromise(id, Promise.resolve(null));
					return null;
				}
			}

			const transformPromise = entryModuleIdsPromise
				.then(entryModuleIds => {
					const { isEsModule, hasDefaultExport, ast } = checkEsModule(this.parse, code, id);
					const isDynamicRequireModule = dynamicRequireModuleSet.has(
						normalizeDynamicModulePath(id)
					);

					if (isEsModule && !isDynamicRequireModule) {
						(hasDefaultExport ? esModulesWithDefaultExport : esModulesWithoutDefaultExport)[
							id
						] = true;
						return null;
					}

					// it is not an ES module but it does not have CJS-specific elements.
					if (!hasCjsKeywords(code, ignoreGlobal)) {
						esModulesWithoutDefaultExport[id] = true;
						return null;
					}

					const transformed = transformCommonjs(
						this.parse,
						code,
						id,
						entryModuleIds.indexOf(id) !== -1,
						ignoreGlobal,
						ignoreRequire,
						customNamedExports[id],
						sourceMap,
						dynamicRequireModuleSet,
						ast
					);
					if (!transformed) {
						esModulesWithoutDefaultExport[id] = true;
						return null;
					}

					return transformed;
				})
				.catch(err => {
					this.error(err, err.loc);
				});

			setIsCjsPromise(id, transformPromise.then(Boolean, () => false));
			return transformPromise;
		}
	};
}
