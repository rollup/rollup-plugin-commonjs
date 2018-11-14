import { readFileSync, existsSync } from 'fs';
import { basename, dirname, extname, resolve, sep, relative, join } from 'path';
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

export async function getTypeInfoExports(id) {
	const cwd = process.cwd();
	const pkgFile = (dir => {
		let testPkgFile = resolve(dir, 'package.json');
		while (!existsSync(testPkgFile)) {
			if (dir === cwd) {
				return null;
			}
			dir = resolve(dir, '..');
			testPkgFile = resolve(dir, 'package.json');
		}

		return testPkgFile;
	})(dirname(id));

	if (pkgFile === null) {
		return [];
	}

	try {
		const pkg = JSON.parse(readFileSync(pkgFile, { encoding: 'utf-8' }));

		if (typeof pkg.types === 'string' && typeof pkg.main === 'string') {
			const pkgDir = dirname(pkgFile);
			const relativeImport = id.substring(`${pkgDir}/`.length);
			const typesDirRelativeToCodeDir = join(relative(dirname(pkg.main), pkg.types), '..');
			const typesDir = join(pkgDir, dirname(pkg.main), typesDirRelativeToCodeDir);
			const typeFile =
				relativeImport === pkg.main
					? join(pkgDir, pkg.types)
					: join(typesDir, `${basename(relativeImport, '.js')}.d.ts`); // TODO: Check other extensions?

			const parsedDeclarationFile = await new TypescriptParser().parseFile(typeFile, pkgDir);

			const blockExports = [].concat(
				...parsedDeclarationFile.exports.map(exp => {
					if (exp.specifiers) {
						return exp.specifiers.map(
							specifier => (specifier.alias ? specifier.alias : specifier.specifier)
						);
					}
					return [];
				})
			);

			const declarationExports = parsedDeclarationFile.declarations
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

			return [...blockExports, ...declarationExports];
		}
	} catch (err) {
		// console.error(err);
		return [];
	}
}
