import type { PDFDocument } from 'pdf-lib';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { writable } from 'svelte/store';
import { get } from 'svelte/store';

const fileName = writable<string>(''); // The name of the file that was opened

const processedFile = writable<PDFDocumentProxy>(); // This is the file that was processed by PDFjs
const openedFile = writable<File>(); // This is the file that was opened by the user, before any changes
const updatedFile = writable<PDFDocument>(); // This is the updated file, with the changes made

const canvasList = writable<HTMLCanvasElement[]>([]); // This is the list of canvases that are used to render the PDF

export { processedFile, fileName, openedFile, updatedFile, canvasList };
