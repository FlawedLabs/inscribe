import { expect, test } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';

test.skip(!process.env.OCR_E2E, 'Requires the OCR language model download.');

test('recognizes words with the current Tesseract output format', async ({ page }) => {
	test.setTimeout(120_000);
	page.on('console', (message) => {
		if (message.type() === 'error') console.log('OCR browser error:', message.text());
	});
	page.on('pageerror', (error) => console.log('OCR page error:', error.message));
	await page.goto('/');
	const image = await page.evaluate(() => {
		const canvas = document.createElement('canvas');
		canvas.width = 600;
		canvas.height = 200;
		const context = canvas.getContext('2d')!;
		context.fillStyle = 'white';
		context.fillRect(0, 0, canvas.width, canvas.height);
		context.fillStyle = 'black';
		context.font = 'bold 100px Arial';
		context.fillText('HELLO', 35, 135);
		return canvas.toDataURL('image/png').split(',')[1];
	});
	const pdf = await PDFDocument.create();
	const png = await pdf.embedPng(Buffer.from(image, 'base64'));
	pdf.addPage([600, 200]).drawImage(png, { x: 0, y: 0, width: 600, height: 200 });
	await page.getByLabel('Sélectionner un fichier PDF').setInputFiles({
		name: 'ocr.png.pdf',
		mimeType: 'application/pdf',
		buffer: Buffer.from(await pdf.save())
	});
	await expect(page.getByRole('main', { name: 'Aperçu du document' })).toBeVisible();
	await page.getByRole('button', { name: 'Outils texte : OCR et extraction' }).click();
	await page.getByLabel('Langue du document').selectOption('eng');
	await page.getByRole('button', { name: 'Lancer l’OCR' }).click();
	await expect(page.getByText(/Texte ajouté à 1 page|L’OCR a échoué/)).toBeVisible({
		timeout: 90_000
	});
	await expect(page.getByText('Texte ajouté à 1 page.', { exact: false })).toBeVisible({
		timeout: 1000
	});
});
