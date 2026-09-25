import type { PDFDocument } from 'pdf-lib';
import type { PDFDocumentProxy } from 'pdfjs-dist';

// The editor is a local static app. These values are set when a file is opened,
// before navigating to the PDF route.
export const fileSession = $state({
	fileName: '',
	processedFile: null! as PDFDocumentProxy,
	openedFile: null! as File,
	updatedFile: null! as PDFDocument
});
