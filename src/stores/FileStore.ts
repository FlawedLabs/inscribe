import type { PDFDocumentProxy } from 'pdfjs-dist';
import { writable } from 'svelte/store';

const processedFile = writable<PDFDocumentProxy>();

export { processedFile };
