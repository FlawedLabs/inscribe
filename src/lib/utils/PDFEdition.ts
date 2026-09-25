import { PDFDocument } from 'pdf-lib';

const clone = async (source: PDFDocument) => PDFDocument.load(await source.save());

export const mergePDFs = async (source: PDFDocument, file: Blob): Promise<PDFDocument> => {
	const result = await clone(source);
	const incoming = await PDFDocument.load(await file.arrayBuffer());
	for (const page of await result.copyPages(incoming, incoming.getPageIndices()))
		result.addPage(page);
	return result;
};

export const duplicatePage = async (
	source: PDFDocument,
	pageNumber: number
): Promise<PDFDocument> => {
	const result = await clone(source);
	const [page] = await result.copyPages(result, [pageNumber - 1]);
	result.insertPage(pageNumber, page);
	return result;
};

export const removePage = async (source: PDFDocument, pageNumber: number): Promise<PDFDocument> => {
	if (source.getPageCount() <= 1) throw new Error('A PDF must contain at least one page.');
	const result = await clone(source);
	result.removePage(pageNumber - 1);
	return result;
};

export const reorderPage = async (
	source: PDFDocument,
	fromPage: number,
	toPage: number
): Promise<PDFDocument> => {
	const result = await clone(source);
	const page = result.getPage(fromPage - 1);
	result.removePage(fromPage - 1);
	result.insertPage(toPage - 1, page);
	return result;
};
