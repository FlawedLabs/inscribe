import { asset } from '$app/paths';
import {
	getDocument,
	GlobalWorkerOptions,
	type PDFDocumentProxy
} from 'pdfjs-dist/legacy/build/pdf.mjs';
import workerURL from 'pdfjs-dist/legacy/build/pdf.worker.mjs?url';

GlobalWorkerOptions.workerSrc = workerURL;

export const parse = async (file: Blob): Promise<PDFDocumentProxy> => {
	const loadingTask = getDocument({
		data: await file.arrayBuffer(),
		wasmUrl: asset('pdfjs/wasm/jbig2.wasm').slice(0, -'jbig2.wasm'.length)
	});
	try {
		return await loadingTask.promise;
	} catch (cause) {
		// Failed imports also own a worker and must release it before another attempt.
		await loadingTask.destroy().catch(() => undefined);
		throw cause;
	}
};
