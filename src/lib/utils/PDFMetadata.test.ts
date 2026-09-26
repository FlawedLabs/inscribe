import { describe, expect, it } from 'vitest';
import { PDFDict, PDFDocument, PDFName, PDFString } from 'pdf-lib';
import { loadPDFMetadata, readPDFMetadata } from './PDFMetadata';

describe('imported PDF metadata', () => {
	it('keeps readable properties when an optional date is malformed', async () => {
		const document = await PDFDocument.create();
		document.addPage();
		document.setTitle('Contrat');
		const info = document.context.lookup(document.context.trailerInfo.Info, PDFDict);
		info.set(PDFName.of('CreationDate'), PDFString.of('invalid date'));
		const metadata = readPDFMetadata({ name: 'contrat.pdf', size: 2048 }, document);
		expect(metadata).toMatchObject({
			name: 'contrat.pdf',
			size: '2 Ko',
			pages: 1,
			title: 'Contrat',
			created: 'Non renseignée'
		});
		document.addPage();
		expect(metadata.pages).toBe(1);
	});

	it('retains basic metadata when the preview cannot read its dictionary', async () => {
		const document = await PDFDocument.create();
		document.addPage();
		const original = readPDFMetadata({ name: 'document.pdf', size: 100 }, document);
		const result = await loadPDFMetadata(original, {
			getMetadata: async () => {
				throw new Error('Invalid metadata');
			}
		});
		expect(result).toEqual(original);
	});
});
