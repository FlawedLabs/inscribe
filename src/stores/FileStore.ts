import type { PDFDocument } from 'pdf-lib';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { writable } from 'svelte/store';
import { get } from 'svelte/store';

const fileName = writable<string>(''); // The name of the file that was opened
const processedFile = writable<PDFDocumentProxy>(); // This is the file that was processed by PDFjs
const openedFile = writable<File>(); // This is the file that was opened by the user, before any changes
const updatedFile = writable<PDFDocument>(get(openedFile) as unknown as PDFDocument); // This is the updated file, with the changes made

export { processedFile, fileName, openedFile, updatedFile };
