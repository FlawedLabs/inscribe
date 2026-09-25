import type { PDFDocumentProxy } from 'pdfjs-dist';

export type ExtractedPDFText = {
	text: string;
	pagesWithText: number;
	pagesWithoutText: number[];
};

export async function extractPDFText(
	document: PDFDocumentProxy,
	onProgress?: (page: number, total: number) => void,
	signal?: AbortSignal
): Promise<ExtractedPDFText> {
	const sections: string[] = [];
	const pagesWithoutText: number[] = [];
	for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
		if (signal?.aborted) throw new DOMException('Extraction annulée', 'AbortError');
		const page = await document.getPage(pageNumber);
		const content = await page.getTextContent();
		if (signal?.aborted) throw new DOMException('Extraction annulée', 'AbortError');
		let pageText = '';
		for (const item of content.items) {
			if (!('str' in item)) continue;
			pageText += item.str;
			if (item.hasEOL) pageText += '\n';
		}
		pageText = pageText.trim();
		if (pageText) sections.push(`Page ${pageNumber}\n${pageText}`);
		else pagesWithoutText.push(pageNumber);
		onProgress?.(pageNumber, document.numPages);
	}
	return {
		text: sections.join('\n\n'),
		pagesWithText: document.numPages - pagesWithoutText.length,
		pagesWithoutText
	};
}
