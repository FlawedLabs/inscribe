import { copyFileSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const destination = join(root, 'static', 'ocr');
const workerSource = join(root, 'node_modules', 'tesseract.js', 'dist', 'worker.min.js');
const coreSource = join(root, 'node_modules', 'tesseract.js-core');
const coreFile = /^tesseract-core(?:-.*)?\.wasm(?:\.js)?$/;

mkdirSync(destination, { recursive: true });
copyFileSync(workerSource, join(destination, 'worker.min.js'));
for (const file of readdirSync(destination).filter((name) => coreFile.test(name)))
	rmSync(join(destination, file));
for (const file of readdirSync(coreSource).filter((name) => coreFile.test(name)))
	copyFileSync(join(coreSource, file), join(destination, file));

const pdfjsSource = join(root, 'node_modules', 'pdfjs-dist', 'wasm');
const pdfjsDestination = join(root, 'static', 'pdfjs', 'wasm');
mkdirSync(pdfjsDestination, { recursive: true });
for (const file of readdirSync(pdfjsSource))
	copyFileSync(join(pdfjsSource, file), join(pdfjsDestination, file));
