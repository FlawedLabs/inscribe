import { copyFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const destination = join(root, 'static', 'ocr');
const workerSource = join(root, 'node_modules', 'tesseract.js', 'dist', 'worker.min.js');
const coreSource = join(root, 'node_modules', 'tesseract.js-core');
const coreNames = [
	'tesseract-core',
	'tesseract-core-simd',
	'tesseract-core-lstm',
	'tesseract-core-simd-lstm'
];

mkdirSync(destination, { recursive: true });
copyFileSync(workerSource, join(destination, 'worker.min.js'));
for (const name of coreNames) {
	for (const extension of ['wasm.js', 'wasm']) {
		copyFileSync(
			join(coreSource, `${name}.${extension}`),
			join(destination, `${name}.${extension}`)
		);
	}
}
