import { describe, expect, it } from 'vitest';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { OcrTextLayer } from './OcrTextLayer';

describe('OCR text placement', () => {
	it('keeps selectable text aligned with the recognized word width', async () => {
		const pdf = await PDFDocument.create();
		const page = pdf.addPage([300, 400]);
		const font = await pdf.embedFont(StandardFonts.Helvetica);
		new OcrTextLayer(page, font).addWord('COPROPRIETE', {
			x: 40,
			y: 150,
			endX: 195,
			endY: 150,
			height: 20
		});

		const rendered = await getDocument({ data: await pdf.save() }).promise;
		const content = await (await rendered.getPage(1)).getTextContent();
		const word = content.items.find((item) => 'str' in item && item.str === 'COPROPRIETE');
		expect(word).toBeDefined();
		if (!word || !('str' in word)) return;
		expect(word.width).toBeGreaterThan(154);
		expect(word.width).toBeLessThan(156);
		expect(word.transform[4]).toBeCloseTo(40, 1);
		expect(word.transform[5]).toBeCloseTo(150, 1);
	});
});
