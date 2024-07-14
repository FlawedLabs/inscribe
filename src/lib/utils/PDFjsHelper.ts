import { get } from 'svelte/store';
import { processedFile } from '../../stores/FileStore';
import * as pdfjs from 'pdfjs-dist';

export const load = async (file: File | Blob) => {
	const fileArrayBuffer = await file.arrayBuffer();

	const loadingTask = pdfjs.getDocument({ data: fileArrayBuffer });
	processedFile.set(await loadingTask.promise);
};
