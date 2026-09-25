import { asset } from '$app/paths';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { createWorker } from 'tesseract.js';
import { OcrTextLayer } from './OcrTextLayer';

export type OcrLanguage = 'eng' | 'fra' | 'eng+fra';
export type OcrProgress =
	| { phase: 'checking'; page: number; total: number }
	| { phase: 'loading'; percent: number }
	| { phase: 'recognizing'; page: number; total: number; percent: number }
	| { phase: 'saving' };

export type OcrResult = {
	document: PDFDocument;
	pagesProcessed: number;
	pagesUpdated: number;
	pagesSkipped: number;
	wordsAdded: number;
};

const supportedText = (text: string, font: Awaited<ReturnType<PDFDocument['embedFont']>>) =>
	Array.from(text)
		.filter((character) => {
			try {
				font.encodeText(character);
				return true;
			} catch {
				return false;
			}
		})
		.join('');

/** Adds a transparent, searchable text layer to pages that contain no selectable text. */
export async function applyOcrToPdf(
	source: PDFDocument,
	viewer: PDFDocumentProxy,
	language: OcrLanguage,
	onProgress: (progress: OcrProgress) => void = () => {}
): Promise<OcrResult> {
	if (source.getPageCount() !== viewer.numPages) throw new Error('PDF page count mismatch');

	const scannedPages: number[] = [];
	for (let pageNumber = 1; pageNumber <= viewer.numPages; pageNumber++) {
		onProgress({ phase: 'checking', page: pageNumber, total: viewer.numPages });
		const page = await viewer.getPage(pageNumber);
		try {
			const text = await page.getTextContent();
			const hasText = text.items.some((item) => 'str' in item && item.str.trim().length > 0);
			if (!hasText) scannedPages.push(pageNumber);
		} finally {
			page.cleanup();
		}
	}

	if (!scannedPages.length) {
		return {
			document: source,
			pagesProcessed: 0,
			pagesUpdated: 0,
			pagesSkipped: viewer.numPages,
			wordsAdded: 0
		};
	}

	// Work on a copy so a failed recognition cannot leave the open document half-edited.
	const result = await PDFDocument.load(await source.save());
	const font = await result.embedFont(StandardFonts.Helvetica);
	const workerPath = asset('ocr/worker.min.js');
	const assetRoot = workerPath.slice(0, -'/worker.min.js'.length);
	let currentPage = 0;
	onProgress({ phase: 'loading', percent: 0 });
	const worker = await createWorker(language, 1, {
		workerPath,
		corePath: assetRoot,
		logger: (message) => {
			const percent = Math.floor((message.progress || 0) * 10) * 10;
			if (currentPage)
				onProgress({
					phase: 'recognizing',
					page: currentPage,
					total: scannedPages.length,
					percent
				});
			else onProgress({ phase: 'loading', percent });
		}
	});

	let wordsAdded = 0;
	let pagesUpdated = 0;
	try {
		for (const [index, pageNumber] of scannedPages.entries()) {
			currentPage = index + 1;
			onProgress({
				phase: 'recognizing',
				page: currentPage,
				total: scannedPages.length,
				percent: 0
			});
			const page = await viewer.getPage(pageNumber);
			const baseViewport = page.getViewport({ scale: 1 });
			const renderScale = Math.min(2, 2400 / Math.max(baseViewport.width, baseViewport.height));
			const viewport = page.getViewport({ scale: renderScale });
			const canvas = document.createElement('canvas');
			canvas.width = Math.ceil(viewport.width);
			canvas.height = Math.ceil(viewport.height);
			const context = canvas.getContext('2d');
			if (!context) throw new Error('Canvas is unavailable');
			try {
				await page.render({ canvas, viewport }).promise;
				const recognition = await worker.recognize(canvas, {}, { blocks: true });
				const target = result.getPage(pageNumber - 1);
				const textLayer = new OcrTextLayer(target, font);
				const wordsBeforePage = wordsAdded;
				const words =
					recognition.data.blocks?.flatMap((block) =>
						block.paragraphs.flatMap((paragraph) => paragraph.lines.flatMap((line) => line.words))
					) ?? [];
				for (const word of words) {
					if (!word.text.trim() || word.confidence < 35) continue;
					const text = supportedText(word.text.trim(), font);
					if (!text) continue;
					const { x0, x1, y0, y1 } = word.bbox;
					if (![x0, x1, y0, y1].every(Number.isFinite) || x1 <= x0 || y1 <= y0) continue;
					const [x, y] = viewport.convertToPdfPoint(x0, y1);
					const [endX, endY] = viewport.convertToPdfPoint(x1, y1);
					const [topX, topY] = viewport.convertToPdfPoint(x0, y0);
					const height = Math.hypot(topX - x, topY - y);
					textLayer.addWord(text, { x, y, endX, endY, height });
					wordsAdded++;
				}
				if (wordsAdded > wordsBeforePage) pagesUpdated++;
			} finally {
				canvas.width = 0;
				canvas.height = 0;
				page.cleanup();
			}
		}
	} finally {
		await worker.terminate();
	}

	onProgress({ phase: 'saving' });
	return {
		document: result,
		pagesProcessed: scannedPages.length,
		pagesUpdated,
		pagesSkipped: viewer.numPages - scannedPages.length,
		wordsAdded
	};
}
