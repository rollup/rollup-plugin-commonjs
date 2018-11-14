import { readFileSync } from 'fs';
import { basename, dirname, extname, resolve, sep } from 'path';
import { makeLegalIdentifier } from 'rollup-pluginutils';
import { TypescriptParser, DefaultDeclaration } from 'typescript-parser';

export function getName(id) {
	const name = makeLegalIdentifier(basename(id, extname(id)));
	if (name !== 'index') {
		return name;
	} else {
		const segments = dirname(id).split(sep);
		return makeLegalIdentifier(segments[segments.length - 1]);
	}
}

// Return the first non-falsy result from an array of
// maybe-sync, maybe-promise-returning functions
export function first(candidates) {
	return function(...args) {
		return candidates.reduce((promise, candidate) => {
			return promise.then(
				result => (result != null ? result : Promise.resolve(candidate(...args)))
			);
		}, Promise.resolve());
	};
}

export async function getTypeInfoNamedExports(importDir) {
	const pkgFile = resolve(importDir, 'package.json');

	try {
		const pkg = JSON.parse(readFileSync(pkgFile, { encoding: 'utf-8' }));

		if (typeof pkg.types === 'string') {
			const parsed = await new TypescriptParser().parseFile(
				resolve(importDir, pkg.types),
				importDir
			);

			const typesExports = parsed.declarations
				.map(declaration => {
					if (declaration.isExported) {
						if (declaration instanceof DefaultDeclaration) {
							return 'default';
						} else {
							return declaration.name;
						}
					}
					return null;
				})
				.filter(name => name !== null)
				.filter((name, pos, arr) => arr.indexOf(name) === pos);

			return typesExports;
		}
	} catch (err) {
		return [];
	}
}
