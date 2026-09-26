import { PDFArray, PDFNumber, type PDFObject } from 'pdf-lib';

/** Imported annotations are optional; malformed coordinates must not block the document. */
export const readNumberArray = (value: PDFObject | undefined): number[] | undefined => {
	if (!(value instanceof PDFArray)) return;
	const numbers: number[] = [];
	for (let index = 0; index < value.size(); index++) {
		const item = value.lookup(index);
		if (!(item instanceof PDFNumber) || !Number.isFinite(item.asNumber())) return;
		numbers.push(item.asNumber());
	}
	return numbers;
};
