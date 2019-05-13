const isCjsPromises = new Map();

export function getIsCjsPromise(id) {
	let isCjsPromise = isCjsPromises.get(id);
	if (isCjsPromise) return isCjsPromise.promise;

	const promise = new Promise(resolve => {
		isCjsPromise = {
			resolve,
			promise: undefined
		};
		isCjsPromises.set(id, isCjsPromise);
	});
	isCjsPromise.promise = promise;

	return promise;
}

export function setIsCjsPromise(id, promise) {
	const isCjsPromise = isCjsPromises.get(id);
	if (isCjsPromise) {
		if (isCjsPromise.resolve) {
			isCjsPromise.resolve(promise);
			isCjsPromise.resolve = undefined;
		}
	} else {
		isCjsPromises.set(id, { promise, resolve: undefined });
	}
}
