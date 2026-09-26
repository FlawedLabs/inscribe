import type { PDFDocument } from 'pdf-lib';
import type { PDFDocumentProxy } from 'pdfjs-dist';

let processedFile = $state.raw<PDFDocumentProxy>(null!);

export const getProcessedFile = () => processedFile;

export const setProcessedFile = (document: PDFDocumentProxy) => {
	processedFile = document;
};

// The editor is a local static app. These values are set when a file is opened,
// before navigating to the PDF route.
export const fileSession = $state({
	fileName: '',
	openedFile: null! as File,
	updatedFile: null! as PDFDocument
});
