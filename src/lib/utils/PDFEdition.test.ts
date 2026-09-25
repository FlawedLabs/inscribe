import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { duplicatePage, mergePDFs, removePage, reorderPage } from './PDFEdition';

const fixture = async () => {
	const document = await PDFDocument.create();
	document.setTitle('Document signé');
	const first = document.addPage([300, 400]);
	document.addPage([400, 500]);
	const field = document.getForm().createTextField('client.name');
	field.setText('Alice');
	field.addToPage(first);
	return document;
};

const checkOriginal = (document: PDFDocument) => {
	expect(document.getTitle()).toBe('Document signé');
	expect(document.getForm().getTextField('client.name').getText()).toBe('Alice');
};

describe('PDF page editing', () => {
	it('keeps metadata and form fields when reordering pages', async () => {
		const original = await fixture();
		const result = await PDFDocument.load(await (await reorderPage(original, 1, 2)).save());
		expect(result.getPageCount()).toBe(2);
		expect(result.getPage(0).getWidth()).toBe(400);
		expect(result.getPage(1).getWidth()).toBe(300);
		checkOriginal(result);
		checkOriginal(original);
	});

	it('keeps the original form when duplicating, merging, or removing another page', async () => {
		const original = await fixture();
		const duplicate = await PDFDocument.load(await (await duplicatePage(original, 2)).save());
		expect(duplicate.getPageCount()).toBe(3);
		checkOriginal(duplicate);

		const incoming = await PDFDocument.create();
		incoming.addPage([200, 200]);
		const merged = await PDFDocument.load(
			await (await mergePDFs(original, new Blob([await incoming.save()]))).save()
		);
		expect(merged.getPageCount()).toBe(3);
		checkOriginal(merged);

		const removed = await PDFDocument.load(await (await removePage(original, 2)).save());
		expect(removed.getPageCount()).toBe(1);
		checkOriginal(removed);
		expect(original.getPageCount()).toBe(2);
	});
});
