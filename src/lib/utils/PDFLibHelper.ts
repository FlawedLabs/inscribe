import { PDFDocument } from 'pdf-lib';
import { openedFile, fileName, updatedFile } from '../../stores/FileStore';
import { get } from 'svelte/store';

/**
 * Load a PDF file from a Blob, usable with PDFLib
 */
export const load = async (file: Blob) => {
	const fileArrayBuffer = await file.arrayBuffer();

	return await PDFDocument.load(fileArrayBuffer);
};

export const save = async () => {
	const pdfBytes = await get(updatedFile).save();

	const fileBlob = new Blob([pdfBytes], { type: 'application/pdf' });

	const link = document.createElement('a');
	link.href = URL.createObjectURL(fileBlob);
	link.download = get(fileName);

	link.click();
	link.remove();

	setTimeout(() => URL.revokeObjectURL(link.href), 7000);
};
