import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { addNote, listNotes, removeNote, updateNote } from './PDFNotes';
import { duplicatePage, reorderPage } from './PDFEdition';

describe('PDF notes', () => {
	it('saves Unicode notes as PDF annotations and preserves their page after reordering', async () => {
		const original = await PDFDocument.create();
		original.addPage([300, 400]);
		original.addPage([400, 500]);
		const withNote = await addNote(original, 1, 42, 280, 'À relire — élève');
		expect(listNotes(original)).toEqual([]);
		const loaded = await PDFDocument.load(await withNote.save());
		expect(listNotes(loaded)).toMatchObject([{ page: 1, x: 42, y: 280, text: 'À relire — élève' }]);

		const reordered = await reorderPage(loaded, 1, 2);
		expect(listNotes(reordered)).toMatchObject([{ page: 2, text: 'À relire — élève' }]);
		const duplicated = await duplicatePage(loaded, 1);
		expect(listNotes(duplicated).map((note) => note.page)).toEqual([1, 2]);
	});

	it('updates and removes a note without changing the source document', async () => {
		const original = await PDFDocument.create();
		original.addPage();
		const withNote = await addNote(original, 1, 30, 40, 'Première version');
		const id = listNotes(withNote)[0].id;
		const updated = await updateNote(withNote, id, 'Version corrigée');
		expect(listNotes(updated)[0].text).toBe('Version corrigée');
		expect(listNotes(withNote)[0].text).toBe('Première version');
		const removed = await removeNote(updated, id);
		expect(listNotes(await PDFDocument.load(await removed.save()))).toEqual([]);
	});
});
