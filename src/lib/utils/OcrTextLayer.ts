import {
	TextRenderingMode,
	beginText,
	endText,
	popGraphicsState,
	pushGraphicsState,
	setFontAndSize,
	setTextMatrix,
	setTextRenderingMode,
	showText,
	type PDFFont,
	type PDFPage
} from 'pdf-lib';

type WordPlacement = {
	x: number;
	y: number;
	endX: number;
	endY: number;
	height: number;
};

/** Places invisible text at the full width of the OCR word box. */
export class OcrTextLayer {
	private readonly fontKey;

	constructor(
		private readonly page: PDFPage,
		private readonly font: PDFFont
	) {
		this.fontKey = page.node.newFontDictionary(font.name, font.ref);
	}

	addWord(text: string, { x, y, endX, endY, height }: WordPlacement) {
		const width = Math.hypot(endX - x, endY - y);
		const size = Math.max(1, height * 0.88);
		const naturalWidth = this.font.widthOfTextAtSize(text, size);
		if (!Number.isFinite(width) || !Number.isFinite(size) || width <= 0 || naturalWidth <= 0)
			return;

		const stretch = width / naturalWidth;
		const cosine = (endX - x) / width;
		const sine = (endY - y) / width;
		this.page.pushOperators(
			pushGraphicsState(),
			beginText(),
			setFontAndSize(this.fontKey, size),
			setTextRenderingMode(TextRenderingMode.Invisible),
			setTextMatrix(cosine * stretch, sine * stretch, -sine, cosine, x, y),
			showText(this.font.encodeText(text)),
			endText(),
			popGraphicsState()
		);
	}
}
