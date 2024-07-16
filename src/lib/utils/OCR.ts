import { get } from 'svelte/store';
import Tesseract from 'tesseract.js';
import { canvasList, updatedFile } from '../../stores/FileStore';
import { pdfDocEncodingDecode, rgb } from 'pdf-lib';
export const addOCR = async () => {
	const { createWorker } = Tesseract;

	const worker = await createWorker('eng', 1, {
		corePath: '/node_modules/tesseract.js-core',
		workerPath: '/node_modules/tesseract.js/dist/worker.min.js',
		logger: (m) => console.log(m)
	});

	console.log(worker);

	const PDFPagesAsImages = getCanvasAsImages(get(canvasList));

	const OCRBlocks = [];

	for (const page of PDFPagesAsImages) {
		const res = await worker.recognize(page, { pdfTitle: 'testOCR' }, { pdf: true });
		OCRBlocks.push(res.data.blocks);
	}

	const fileToOCR = get(updatedFile);

	const pages = fileToOCR.getPages();

	OCRBlocks.forEach((blocks, i) => {
		const page = pages[i];

		blocks?.forEach((block) => {
			const { bbox, text } = block;
			const { x0, x1, y0, y1 } = bbox;

			console.log({ x0, x1, y0, y1 });
			console.log(text);

			page.drawText(text, {
				x: 133,
				y: 100,
				size: 10,
				color: rgb(0, 0, 0)
			});
		});
	});

	worker.terminate();

	const pdfBytes = await fileToOCR.save();

	const x = new Blob([pdfBytes], { type: 'application/pdf' });
	const url = URL.createObjectURL(x);

	const a = document.createElement('a');
	a.href = url;
	a.download = 'xyz.pdf';
	document.body.appendChild(a);
	a.click();
	a.remove();
};

// Transform canvas to image for compatibility with TesseractJS
export const getCanvasAsImages = (canvas: HTMLCanvasElement[]) => {
	return canvas.map((c) => {
		const img = new Image();
		img.src = c.toDataURL();

		return img;
	});
};
