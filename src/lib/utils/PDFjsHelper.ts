import { processedFile } from '../../stores/FileStore';
import * as pdfjs from 'pdfjs-dist';

export const parse = async (file: File | Blob) => {
	const loadingTask = pdfjs.getDocument({ data: await file.arrayBuffer() });
	return loadingTask.promise;
};

export const load = async (file: File | Blob) => {
	processedFile.set(await parse(file));
};
