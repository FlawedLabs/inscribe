import { processedFile } from '../../stores/FileStore';
import { asset } from '$app/paths';
import * as pdfjs from 'pdfjs-dist';

export const parse = async (file: File | Blob) => {
	const loadingTask = pdfjs.getDocument({
		data: await file.arrayBuffer(),
		wasmUrl: asset('pdfjs/wasm/jbig2.wasm').slice(0, -'jbig2.wasm'.length)
	});
	return loadingTask.promise;
};

export const load = async (file: File | Blob) => {
	processedFile.set(await parse(file));
};
