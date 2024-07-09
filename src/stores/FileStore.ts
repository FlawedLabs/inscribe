import type { PDFDocumentProxy } from 'pdfjs-dist';
import { writable } from 'svelte/store';

const fileName = writable<string>('');
const processedFile = writable<PDFDocumentProxy>();

export { processedFile, fileName };
