import { statSync } from 'fs';
import glob from 'glob';
import { resolve } from 'path';
import { normalizeDynamicModulePath } from './transform';

export function getDynamicRequirePaths(patterns) {
	const dynamicRequireModuleSet = new Set();
	patterns = patterns || [];
	for (const pattern of Array.isArray(patterns) ? patterns : [patterns]) {
		const isNegated = pattern.startsWith('!');
		const modifySet = Set.prototype[isNegated ? 'delete' : 'add'].bind(
			dynamicRequireModuleSet
		);
		for (const path of glob.sync(isNegated ? pattern.substr(1) : pattern)) {
			modifySet(normalizeDynamicModulePath(resolve(path)));
		}
	}
	const dynamicRequireModuleDirPaths = Array.from(dynamicRequireModuleSet).filter(path => {
		try {
			if (statSync(path).isDirectory()) return true;
		} catch (ignored) {
			return false;
		}
	});
	return { dynamicRequireModuleSet, dynamicRequireModuleDirPaths };
}
