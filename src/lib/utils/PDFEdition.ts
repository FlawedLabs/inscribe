import { degrees, PDFDocument } from 'pdf-lib';
import { cloneDocument } from './PDFLibHelper';

export const mergePDFs = async (source: PDFDocument, file: Blob): Promise<PDFDocument> => {
	const result = await cloneDocument(source);
	const incoming = await PDFDocument.load(await file.arrayBuffer());
	for (const page of await result.copyPages(incoming, incoming.getPageIndices()))
		result.addPage(page);
	return result;
};

export const duplicatePage = async (
	source: PDFDocument,
	pageNumber: number
): Promise<PDFDocument> => {
	const result = await cloneDocument(source);
	const [page] = await result.copyPages(result, [pageNumber - 1]);
	result.insertPage(pageNumber, page);
	return result;
};

export const removePage = async (source: PDFDocument, pageNumber: number): Promise<PDFDocument> => {
	if (source.getPageCount() <= 1) throw new Error('A PDF must contain at least one page.');
	const result = await cloneDocument(source);
	result.removePage(pageNumber - 1);
	return result;
};

export const reorderPage = async (
	source: PDFDocument,
	fromPage: number,
	toPage: number
): Promise<PDFDocument> => {
	const result = await cloneDocument(source);
	const page = result.getPage(fromPage - 1);
	result.removePage(fromPage - 1);
	result.insertPage(toPage - 1, page);
	return result;
};

export const rotatePage = async (source: PDFDocument, pageNumber: number): Promise<PDFDocument> => {
	const result = await cloneDocument(source);
	const page = result.getPage(pageNumber - 1);
	page.setRotation(degrees((page.getRotation().angle + 90) % 360));
	return result;
};
