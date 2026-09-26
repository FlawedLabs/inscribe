import { PDFDocument } from 'pdf-lib';
import { downloadBlob } from './Download';

/**
 * Load a PDF file from a Blob, usable with PDFLib
 */
export const load = async (file: Blob): Promise<PDFDocument> =>
	PDFDocument.load(await file.arrayBuffer());

export const cloneDocument = async (source: PDFDocument): Promise<PDFDocument> =>
	PDFDocument.load(await source.save());

export const save = async (
	source: PDFDocument,
	filename: string,
	password?: string
): Promise<void> => {
	let pdfBytes = await source.save();
	if (password) {
		const { encryptPDF } = await import('@pdfsmaller/pdf-encrypt');
		pdfBytes = await encryptPDF(pdfBytes, password);
	}

	const fileBlob = new Blob([new Uint8Array(pdfBytes)], { type: 'application/pdf' });

	downloadBlob(fileBlob, password ? filename.replace(/\.pdf$/i, '') + '-protege.pdf' : filename);
};
