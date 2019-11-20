import { basename, dirname, extname, sep, join } from 'path';
import { makeLegalIdentifier } from 'rollup-pluginutils';
import { readFileSync } from "fs";

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
			return promise.then(result =>
				result != null ? result : Promise.resolve(candidate.call(this, ...args))
			);
		}, Promise.resolve());
	};
}