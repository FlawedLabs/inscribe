import { PDFDocument } from 'pdf-lib';
import { load } from './PDFLibHelper';
import { openedFile, updatedFile } from '../../stores/FileStore';
import { get } from 'svelte/store';

/**
 * Take the current file, and merge it with the file passed as parameter
 */
export const openAndMergePDFs = async (file: Blob): Promise<PDFDocument> => {
	const currentFile = get(updatedFile);
	const fileToMerge = await load(file);

	const mergedPDF = await PDFDocument.create();

	(await mergedPDF.copyPages(currentFile, currentFile.getPageIndices())).forEach((page) => {
		mergedPDF.addPage(page);
	});

	(await mergedPDF.copyPages(fileToMerge, fileToMerge.getPageIndices())).forEach((page) => {
		mergedPDF.addPage(page);
	});

	return mergedPDF;
};

export const duplicatePage = async (contextMenuPage: number) => {
	const newPdf = await PDFDocument.create();
	const currentFile = get(updatedFile);

	(await newPdf.copyPages(currentFile, currentFile.getPageIndices())).forEach((page) => {
		newPdf.addPage(page);
	});
	
	const [duplicatedPage] = await newPdf.copyPages(currentFile, [contextMenuPage - 1]);
	newPdf.insertPage(contextMenuPage, duplicatedPage);

	return newPdf
}
