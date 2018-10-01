import { existsSync, readFileSync } from 'fs';
import { extname, resolve, join } from 'path';
import { sync as nodeResolveSync } from 'resolve';
import { createFilter } from 'rollup-pluginutils';
import { getDynamicRequirePaths } from './dynamic-require-paths';
import {
	DYNAMIC_JSON_PREFIX,
	DYNAMIC_PACKAGES_ID,
	DYNAMIC_REGISTER_PREFIX,
	EXTERNAL_PREFIX,
	HELPERS,
	HELPERS_ID,
	PROXY_PREFIX
} from './helpers.js';
import {getIsCjsPromise, setIsCjsPromise} from './is-cjs';
import {getResolveId} from './resolve-id';
import {
	checkEsModule,
	normalizePathSlashes,
	hasCjsKeywords,
	transformCommonjs
} from './transform.js';
import { getName } from './utils.js';

export default function commonjs(options = {}) {
	const extensions = options.extensions || ['.js'];
	const filter = createFilter(options.include, options.exclude);
	const ignoreGlobal = options.ignoreGlobal;

	const { dynamicRequireModuleSet, dynamicRequireModuleDirPaths } = getDynamicRequirePaths(
		options.dynamicRequires
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
					let entryPoint = 'index.js';

					try {
						if (existsSync(join(dir, 'package.json'))) {
							entryPoint = JSON.parse(
								readFileSync(join(dir, 'package.json'), { encoding: 'utf8' })
							).main || entryPoint;
						}
					} catch (ignored) {
						// ignored
					}

					code += `\ncommonjsRegister(${JSON.stringify(
						dir
					)}, function (module, exports) {
  module.exports = require(${JSON.stringify(
		normalizePathSlashes(join(dir, entryPoint))
	)});
});`;
				}
				return code;
			}

			const isDynamicJson = id.startsWith(DYNAMIC_JSON_PREFIX);
			if (isDynamicJson) {
				id = id.slice(DYNAMIC_JSON_PREFIX.length);
			}

			const normalizedPath = normalizePathSlashes(id);

			if (isDynamicJson) {
				return `require('${HELPERS_ID}').commonjsRegister(${JSON.stringify(
					normalizedPath
				)}, function (module, exports) {
  module.exports = require(${JSON.stringify(normalizedPath)});
});`;
			}

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
					if (dynamicRequireModuleSet.has(normalizePathSlashes(actualId)))
						return `import {commonjsRequire} from '${HELPERS_ID}'; const ${name} = commonjsRequire(${JSON.stringify(
							normalizePathSlashes(actualId)
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

			// TODO: For code splitting, the runtime probably needs to be imported by each entry point
			// TODO: This does not work and will leave untranspiled requires if the entry point is an ES Module
			// TODO: This also has a some performance impact for everyone using this plugin even if they do not use dynamic requires
			if (!mainModuleId) {
				mainModuleId = id;
				let code = readFileSync(id, {encoding: 'utf8'});

				let dynamicImports = Array.from(dynamicRequireModuleSet)
					.map(id => `require(${JSON.stringify(DYNAMIC_REGISTER_PREFIX + id)});`)
					.join('\n');

				if (dynamicRequireModuleDirPaths.length) {
					dynamicImports += `require(${JSON.stringify(
						DYNAMIC_REGISTER_PREFIX + DYNAMIC_PACKAGES_ID
					)});`;
				}

				code = dynamicImports + '\n' + code;

				return code;
			}
		},

		transform(code, id) {
			if (id !== DYNAMIC_PACKAGES_ID && !id.startsWith(DYNAMIC_JSON_PREFIX)) {
				if (!filter(id) || extensions.indexOf(extname(id)) === -1) {
					setIsCjsPromise(id, Promise.resolve(null));
					return null;
				}
			}

			const transformPromise = entryModuleIdsPromise
				.then(entryModuleIds => {
					const { isEsModule, hasDefaultExport, ast } = checkEsModule(this.parse, code, id);
					const isDynamicRequireModule = dynamicRequireModuleSet.has(
						normalizePathSlashes(id)
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
