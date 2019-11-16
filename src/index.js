import { realpathSync, existsSync } from 'fs';
import { extname, resolve, normalize } from 'path';
import { sync as nodeResolveSync, isCore } from 'resolve';
import { createFilter } from 'rollup-pluginutils';
import { peerDependencies } from '../package.json';
import {
	EXTERNAL_SUFFIX,
	getIdFromExternalProxyId,
	getIdFromProxyId,
	HELPERS,
	HELPERS_ID,
	PROXY_SUFFIX
} from './helpers';
import { getIsCjsPromise, setIsCjsPromise } from './is-cjs';
import { getResolveId } from './resolve-id';
import { checkEsModule, hasCjsKeywords, transformCommonjs } from './transform.js';
import { getName, getPackageJsonModuleName } from './utils.js';

export default function commonjs(options = {}) {
	const extensions = options.extensions || ['.js'];
	const filter = createFilter(options.include, options.exclude);
	const ignoreGlobal = options.ignoreGlobal;

	const customNamedExports = {};
	if (options.namedExports) {
		// Each namedExports key will be added to customNamedExports in the following forms:
		//
		// 1. As-is: used for finding modules by module name such as `jquery`.
		// 2. Resolved via path.resolve: used for finding modules by file path.
		// 3. Realpathed: used for finding modules by file path when node_modules is symlinked.
		//
		// We do not attempt to detect which case applies up front. While node only considers
		// module specifiers starting with `/`, `./`, or `../` as file path based specifiers, this
		// plugin historically allows named export keys that specify relative paths without the
		// leading `./`. So we map both in `customNamedExports` and check both when checking
		// exports.
		Object.keys(options.namedExports).forEach(id => {
			const resolvedId = resolve(id);
			customNamedExports[id] = options.namedExports[id];
			customNamedExports[resolvedId] = options.namedExports[id];

			if (existsSync(resolvedId)) {
				const realpath = realpathSync(resolvedId);
				if (realpath !== resolvedId) {
					customNamedExports[realpath] = options.namedExports[id];
				}
			}
		});
	}

	const esModulesWithoutDefaultExport = new Set();
	const esModulesWithDefaultExport = new Set();
	const allowDynamicRequire = !!options.ignore; // TODO maybe this should be configurable?

	const ignoreRequire =
		typeof options.ignore === 'function'
			? options.ignore
			: Array.isArray(options.ignore)
				? id => options.ignore.includes(id)
				: () => false;

	const resolveId = getResolveId(extensions);

	const sourceMap = options.sourceMap !== false;

	function transformAndCheckExports(code, id) {
		{
			const { isEsModule, hasDefaultExport, ast } = checkEsModule(this.parse, code, id);
			if (isEsModule) {
				(hasDefaultExport ? esModulesWithDefaultExport : esModulesWithoutDefaultExport).add(id);
				return null;
			}

			// it is not an ES module but it does not have CJS-specific elements.
			if (!hasCjsKeywords(code, ignoreGlobal)) {
				esModulesWithoutDefaultExport.add(id);
				return null;
			}

			
			const moduleName = getPackageJsonModuleName(id);
			const normalizedId = normalize(id);
			const namedExports = customNamedExports[moduleName] || customNamedExports[normalizedId];

			const transformed = transformCommonjs(
				this.parse,
				code,
				id,
				this.getModuleInfo(id).isEntry,
				ignoreGlobal,
				ignoreRequire,
				namedExports,
				sourceMap,
				allowDynamicRequire,
				ast
			);
			if (!transformed) {
				esModulesWithoutDefaultExport.add(id);
				return null;
			}

			return transformed;
		}
	}

	return {
		name: 'commonjs',

		buildStart() {
			const [major, minor] = this.meta.rollupVersion.split('.').map(Number);
			const minVersion = peerDependencies.rollup.slice(2);
			const [minMajor, minMinor] = minVersion.split('.').map(Number);
			if (major < minMajor || (major === minMajor && minor < minMinor)) {
				this.error(
					`Insufficient Rollup version: "rollup-plugin-commonjs" requires at least rollup@${minVersion} but found rollup@${this.meta.rollupVersion}.`
				);
			}
		},

		resolveId,

		load(id) {
			if (id === HELPERS_ID) return HELPERS;

			// generate proxy modules
			if (id.endsWith(EXTERNAL_SUFFIX)) {
				const actualId = getIdFromExternalProxyId(id);
				const name = getName(actualId);

				return `import ${name} from ${JSON.stringify(actualId)}; export default ${name};`;
			}

			if (id.endsWith(PROXY_SUFFIX)) {
				const actualId = getIdFromProxyId(id);
				const name = getName(actualId);

				return getIsCjsPromise(actualId).then(isCjs => {
					if (isCjs)
						return `import { __moduleExports } from ${JSON.stringify(
							actualId
						)}; export default __moduleExports;`;
					else if (esModulesWithoutDefaultExport.has(actualId))
						return `import * as ${name} from ${JSON.stringify(actualId)}; export default ${name};`;
					else if (esModulesWithDefaultExport.has(actualId)) {
						return `export {default} from ${JSON.stringify(actualId)};`;
					} else
						return `import * as ${name} from ${JSON.stringify(
							actualId
						)}; import {getCjsExportFromNamespace} from "${HELPERS_ID}"; export default getCjsExportFromNamespace(${name})`;
				});
			}
		},

		transform(code, id) {
			if (!filter(id) || extensions.indexOf(extname(id)) === -1) {
				setIsCjsPromise(id, null);
				return null;
			}

			let transformed;
			try {
				transformed = transformAndCheckExports.call(this, code, id);
			} catch (err) {
				transformed = null;
				this.error(err, err.loc);
			}

			setIsCjsPromise(id, Boolean(transformed));
			return transformed;
		}
	};
}
