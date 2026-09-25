import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { duplicatePage, reorderPage } from './PDFEdition';
import { addHighlight, listHighlights, removeHighlight, type PDFQuad } from './PDFHighlights';

const quad: PDFQuad = [30, 200, 120, 200, 30, 184, 120, 184];

describe('PDF highlights', () => {
	it('saves color and text bounds in a native annotation', async () => {
		const original = await PDFDocument.create();
		original.addPage([300, 400]);
		original.addPage([300, 400]);
		const marked = await addHighlight(original, 1, [quad], '#a9ddac');
		expect(listHighlights(original)).toEqual([]);
		const reopened = await PDFDocument.load(await marked.save());
		expect(listHighlights(reopened)).toMatchObject([{ page: 1, color: '#a9ddac', quads: [quad] }]);
		const reordered = await reorderPage(reopened, 1, 2);
		expect(listHighlights(reordered)[0].page).toBe(2);
		const duplicated = await duplicatePage(reopened, 1);
		expect(listHighlights(duplicated).map((item) => item.page)).toEqual([1, 2]);
	});

	it('keeps separate highlight areas together and can remove them', async () => {
		const source = await PDFDocument.create();
		source.addPage();
		const second: PDFQuad = [30, 170, 75, 170, 30, 154, 75, 154];
		const marked = await addHighlight(source, 1, [quad, second], '#f0afc4');
		const [highlight] = listHighlights(marked);
		expect(highlight.quads).toEqual([quad, second]);
		const removed = await removeHighlight(marked, highlight.id);
		expect(listHighlights(await PDFDocument.load(await removed.save()))).toEqual([]);
	});
});
