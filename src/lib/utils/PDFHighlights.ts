import { PDFArray, PDFDict, PDFDocument, PDFName, PDFNumber, PDFRef, PDFString } from 'pdf-lib';

export type PDFQuad = [number, number, number, number, number, number, number, number];
export type PDFHighlight = {
	id: string;
	page: number;
	color: string;
	quads: PDFQuad[];
};

const hexChannel = (value: number) =>
	Math.round(Math.max(0, Math.min(1, value)) * 255)
		.toString(16)
		.padStart(2, '0');

const colorFromArray = (array?: PDFArray) => {
	if (!array) return '#f6d76b';
	const values = Array.from({ length: array.size() }, (_, index) =>
		array.lookup(index, PDFNumber).asNumber()
	);
	const channels = values.length === 1 ? [values[0], values[0], values[0]] : values;
	if (channels.length < 3) return '#f6d76b';
	return `#${channels.slice(0, 3).map(hexChannel).join('')}`;
};

const colorChannels = (hex: string) => {
	if (!/^#[0-9a-fA-F]{6}$/.test(hex)) throw new Error('Invalid highlight color.');
	return [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16) / 255);
};

export const listHighlights = (document: PDFDocument): PDFHighlight[] => {
	const highlights: PDFHighlight[] = [];
	for (let page = 1; page <= document.getPageCount(); page++) {
		const annotations = document.getPage(page - 1).node.Annots();
		if (!annotations) continue;
		for (let index = 0; index < annotations.size(); index++) {
			const ref = annotations.get(index);
			const annotation = document.context.lookup(ref);
			if (!(ref instanceof PDFRef) || !(annotation instanceof PDFDict)) continue;
			if (annotation.lookup(PDFName.of('Subtype'))?.toString() !== '/Highlight') continue;
			const quadPoints = annotation.lookupMaybe(PDFName.of('QuadPoints'), PDFArray);
			if (!quadPoints || quadPoints.size() < 8) continue;
			const quads: PDFQuad[] = [];
			for (let point = 0; point + 7 < quadPoints.size(); point += 8) {
				quads.push(
					Array.from({ length: 8 }, (_, offset) =>
						quadPoints.lookup(point + offset, PDFNumber).asNumber()
					) as PDFQuad
				);
			}
			highlights.push({
				id: ref.toString(),
				page,
				color: colorFromArray(annotation.lookupMaybe(PDFName.of('C'), PDFArray)),
				quads
			});
		}
	}
	return highlights;
};

export const addHighlight = async (
	source: PDFDocument,
	pageNumber: number,
	quads: PDFQuad[],
	color: string
): Promise<PDFDocument> => {
	if (
		!quads.length ||
		quads.some((quad) => quad.length !== 8 || quad.some((value) => !Number.isFinite(value)))
	)
		throw new Error('A highlight needs valid text bounds.');
	const channels = colorChannels(color);
	const result = await PDFDocument.load(await source.save());
	const coordinates = quads.flat();
	const xs = coordinates.filter((_, index) => index % 2 === 0);
	const ys = coordinates.filter((_, index) => index % 2 === 1);
	const annotation = result.context.obj({
		Type: 'Annot',
		Subtype: 'Highlight',
		Rect: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)],
		QuadPoints: coordinates,
		C: channels,
		CA: 0.45,
		F: 4,
		M: PDFString.fromDate(new Date())
	});
	result.getPage(pageNumber - 1).node.addAnnot(result.context.register(annotation));
	return result;
};

export const removeHighlight = async (source: PDFDocument, id: string): Promise<PDFDocument> => {
	const result = await PDFDocument.load(await source.save());
	for (let page = 0; page < result.getPageCount(); page++) {
		const annotations = result.getPage(page).node.Annots();
		if (!annotations) continue;
		for (let index = 0; index < annotations.size(); index++) {
			const ref = annotations.get(index);
			if (ref instanceof PDFRef && ref.toString() === id) {
				annotations.remove(index);
				return result;
			}
		}
	}
	throw new Error('Highlight not found.');
};
