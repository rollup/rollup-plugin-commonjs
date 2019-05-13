import { statSync } from 'fs';
import { dirname, resolve, sep } from 'path';
import { EXTERNAL_PREFIX, PROXY_PREFIX } from './helpers';

function getCandidatesForExtension(resolved, extension) {
	return [resolved + extension, resolved + `${sep}index${extension}`];
}

function getCandidates(resolved, extensions) {
	return extensions.reduce(
		(paths, extension) => paths.concat(getCandidatesForExtension(resolved, extension)),
		[resolved]
	);
}

export function getResolveId(extensions) {
	function resolveExtensions(importee, importer) {
		if (importee[0] !== '.' || !importer) return; // not our problem

		const resolved = resolve(dirname(importer), importee);
		const candidates = getCandidates(resolved, extensions);

		for (let i = 0; i < candidates.length; i += 1) {
			try {
				const stats = statSync(candidates[i]);
				if (stats.isFile()) return {id: candidates[i]};
			} catch (err) {
				/* noop */
			}
		}
	}

	function resolveId(importee, importer) {
		const isProxyModule = importee.startsWith(PROXY_PREFIX);
		if (isProxyModule) {
			importee = importee.slice(PROXY_PREFIX.length);
		} else if (importee.startsWith('\0')) {
			return importee;
		}

		if (importer && importer.startsWith(PROXY_PREFIX)) {
			importer = importer.slice(PROXY_PREFIX.length);
		}

		return this.resolve(importee, importer, { skipSelf: true }).then(resolved => {
			if (!resolved) {
				resolved = resolveExtensions(importee, importer);
			}
			if (isProxyModule) {
				if (!resolved) {
					return { id: EXTERNAL_PREFIX + importee, external: false };
				}
				resolved.id = (resolved.external ? EXTERNAL_PREFIX : PROXY_PREFIX) + resolved.id;
				resolved.external = false;
				return resolved;
			}
			return resolved;
		});
	}

	return resolveId;
}
