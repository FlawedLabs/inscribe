import { PDFDict, PDFDocument, PDFHexString, PDFName, PDFRef, PDFString } from 'pdf-lib';
import { readNumberArray } from './PDFAnnotations';
import { cloneDocument } from './PDFLibHelper';

export type PDFNote = {
	id: string;
	page: number;
	text: string;
	x: number;
	y: number;
};

const annotations = (document: PDFDocument, pageNumber: number) =>
	document.getPage(pageNumber - 1).node.Annots();

export const listNotes = (document: PDFDocument): PDFNote[] => {
	const notes: PDFNote[] = [];
	for (let page = 1; page <= document.getPageCount(); page++) {
		const array = annotations(document, page);
		if (!array) continue;
		for (let index = 0; index < array.size(); index++) {
			const ref = array.get(index);
			const annotation = document.context.lookup(ref);
			if (!(ref instanceof PDFRef) || !(annotation instanceof PDFDict)) continue;
			if (annotation.lookup(PDFName.of('Subtype'))?.toString() !== '/Text') continue;
			const rect = readNumberArray(annotation.lookup(PDFName.of('Rect')));
			const contents = annotation.lookup(PDFName.of('Contents'));
			if (
				rect?.length !== 4 ||
				!(contents instanceof PDFString || contents instanceof PDFHexString)
			)
				continue;
			const [x, y] = rect;
			notes.push({ id: ref.toString(), page, text: contents.decodeText(), x, y });
		}
	}
	return notes;
};

export const addNote = async (
	source: PDFDocument,
	pageNumber: number,
	x: number,
	y: number,
	text: string
): Promise<PDFDocument> => {
	if (!text.trim()) throw new Error('A note cannot be empty.');
	if (![x, y].every(Number.isFinite)) throw new Error('A note needs valid coordinates.');
	const result = await cloneDocument(source);
	const page = result.getPage(pageNumber - 1);
	const annotation = result.context.obj({
		Type: 'Annot',
		Subtype: 'Text',
		Rect: [x, y, x + 24, y + 24],
		Contents: PDFHexString.fromText(text.trim()),
		Name: 'Comment',
		C: [0.79, 0.42, 0.26],
		F: 4,
		M: PDFString.fromDate(new Date())
	});
	page.node.addAnnot(result.context.register(annotation));
	return result;
};

export const updateNote = async (
	source: PDFDocument,
	id: string,
	text: string
): Promise<PDFDocument> => {
	if (!text.trim()) throw new Error('A note cannot be empty.');
	const result = await cloneDocument(source);
	for (const note of listNotes(result)) {
		if (note.id !== id) continue;
		const ref = findNoteRef(result, note.page, id);
		const annotation = ref && result.context.lookup(ref);
		if (!(annotation instanceof PDFDict)) break;
		annotation.set(PDFName.of('Contents'), PDFHexString.fromText(text.trim()));
		annotation.set(PDFName.of('M'), PDFString.fromDate(new Date()));
		return result;
	}
	throw new Error('Note not found.');
};

const findNoteRef = (document: PDFDocument, page: number, id: string) => {
	const array = annotations(document, page);
	if (!array) return;
	for (let index = 0; index < array.size(); index++) {
		const ref = array.get(index);
		if (ref instanceof PDFRef && ref.toString() === id) return ref;
	}
};

export const removeNote = async (source: PDFDocument, id: string): Promise<PDFDocument> => {
	const result = await cloneDocument(source);
	for (let page = 1; page <= result.getPageCount(); page++) {
		const array = annotations(result, page);
		if (!array) continue;
		for (let index = 0; index < array.size(); index++) {
			const ref = array.get(index);
			if (ref instanceof PDFRef && ref.toString() === id) {
				array.remove(index);
				return result;
			}
		}
	}
	throw new Error('Note not found.');
};
