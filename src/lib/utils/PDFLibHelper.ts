import { PDFDocument } from 'pdf-lib';
import { fileSession } from '../../stores/FileStore.svelte';

/**
 * Load a PDF file from a Blob, usable with PDFLib
 */
export const load = async (file: Blob) => {
	const fileArrayBuffer = await file.arrayBuffer();

	return await PDFDocument.load(fileArrayBuffer);
};

export const save = async (password?: string) => {
	let pdfBytes = await fileSession.updatedFile.save();
	if (password) {
		const { encryptPDF } = await import('@pdfsmaller/pdf-encrypt');
		pdfBytes = await encryptPDF(pdfBytes, password);
	}

	const fileBlob = new Blob([new Uint8Array(pdfBytes)], { type: 'application/pdf' });

	const link = document.createElement('a');
	link.href = URL.createObjectURL(fileBlob);
	link.download = password
		? fileSession.fileName.replace(/\.pdf$/i, '') + '-protege.pdf'
		: fileSession.fileName;

	link.click();
	link.remove();

	setTimeout(() => URL.revokeObjectURL(link.href), 7000);
};
