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
