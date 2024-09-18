import { get } from 'svelte/store';
import Tesseract from 'tesseract.js';
import { canvasList, updatedFile } from '../../stores/FileStore';
import { rgb } from 'pdf-lib';
export const addOCR = async () => {
	const { createWorker } = Tesseract;

	const worker = await createWorker('eng', 1, {
		corePath: '/node_modules/tesseract.js-core',
		workerPath: '/node_modules/tesseract.js/dist/worker.min.js',
		logger: (m) => console.log(m)
	});

	const OCRBlocks = [];

	const canvasListArray = get(canvasList);

	for (const page of canvasListArray) {
		const res = await worker.recognize(page, { pdfTitle: 'testOCR' }, { pdf: true });
		OCRBlocks.push(res.data.words);
	}

	const fileToOCR = get(updatedFile);

	const pages = fileToOCR.getPages();

	OCRBlocks.forEach((words, i) => {
		const page = pages[i];

		words?.forEach((word) => {
			const { bbox, text } = word;
			const { x0, x1, y0, y1 } = bbox;

			const xHeightChars = 'acegmnorsuvwxz';
			const heights: number[] = [];

			words.forEach((word) => {
				word.symbols.forEach((symbol) => {
					if (xHeightChars.includes(symbol.text)) {
						const { y0, y1 } = symbol.bbox;
						heights.push(y1 - y0);
					}
				});
			});

			heights.sort((a, b) => a - b);
			const medianHeight = heights[Math.floor(heights.length / 2)];

			const pdfWidth = page.getWidth();
			const pdfHeight = page.getHeight();
			const canvasWidth = canvasListArray[i].width;
			const canvasHeight = canvasListArray[i].height;

			const x = (x0 / canvasWidth) * pdfWidth;
			const y = pdfHeight - (y1 / canvasHeight) * pdfHeight;

			console.log({ i, x0, x1, y0, y1 });

			page.drawText(text, {
				x: x,
				y: y,
				size: medianHeight,
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
