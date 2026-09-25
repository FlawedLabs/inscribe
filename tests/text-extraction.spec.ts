import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';

for (const { name, width } of [
	{ name: 'desktop', width: 1280 },
	{ name: 'mobile', width: 375 }
]) {
	test(`extracts and shares text from every PDF page on ${name}`, async ({ browser }) => {
		const context = await browser.newContext({
			viewport: { width, height: 800 },
			permissions: ['clipboard-read', 'clipboard-write']
		});
		const page = await context.newPage();
		const pdf = await PDFDocument.create();
		pdf.addPage([400, 500]).drawText('Bonjour le monde', { x: 50, y: 400 });
		pdf.addPage([400, 500]);
		pdf.addPage([400, 500]).drawText('Conclusion', { x: 50, y: 400 });
		await page.goto('/');
		await page.getByLabel('Sélectionner un fichier PDF').setInputFiles({
			name: 'rapport.pdf',
			mimeType: 'application/pdf',
			buffer: Buffer.from(await pdf.save())
		});
		await expect(page.getByRole('main', { name: 'Aperçu du document' })).toBeVisible();
		await page.getByRole('button', { name: 'Outils texte : OCR et extraction' }).click();
		await page.getByRole('button', { name: 'Extraire tout le texte' }).click();
		const dialog = page.getByRole('dialog', { name: 'Texte du document' });
		await expect(dialog).toBeVisible();
		await expect(dialog).toContainText('2 pages avec texte sur 3');
		await expect(dialog).toContainText('1 page ne contient pas de texte détectable');
		const downloadBounds = await dialog
			.getByRole('button', { name: 'Télécharger le .txt' })
			.boundingBox();
		expect(downloadBounds).not.toBeNull();
		expect(downloadBounds!.y + downloadBounds!.height).toBeLessThanOrEqual(800);
		const extracted = dialog.getByLabel('Texte extrait, par page');
		await expect(extracted).toHaveValue('Page 1\nBonjour le monde\n\nPage 3\nConclusion');
		await dialog.getByRole('button', { name: 'Copier le texte' }).click();
		await expect(dialog).toContainText('Texte copié dans le presse-papiers.');
		expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
			'Page 1\nBonjour le monde\n\nPage 3\nConclusion'
		);
		const downloadPromise = page.waitForEvent('download');
		await dialog.getByRole('button', { name: 'Télécharger le .txt' }).click();
		const download = await downloadPromise;
		expect(download.suggestedFilename()).toBe('rapport.txt');
		expect(await readFile(await download.path(), 'utf8')).toBe(
			'Page 1\nBonjour le monde\n\nPage 3\nConclusion'
		);
		await page.keyboard.press('Escape');
		await expect(dialog).not.toBeVisible();
		await expect(
			page.getByRole('button', { name: 'Outils texte : OCR et extraction' })
		).toBeFocused();
		await context.close();
	});
}

test('explains when a PDF has no selectable text', async ({ page }) => {
	const pdf = await PDFDocument.create();
	pdf.addPage();
	await page.goto('/');
	await page.getByLabel('Sélectionner un fichier PDF').setInputFiles({
		name: 'scan.pdf',
		mimeType: 'application/pdf',
		buffer: Buffer.from(await pdf.save())
	});
	await page.getByRole('button', { name: 'Outils texte : OCR et extraction' }).click();
	await page.getByRole('button', { name: 'Extraire tout le texte' }).click();
	const dialog = page.getByRole('dialog', { name: 'Texte du document' });
	await expect(dialog).toContainText('Aucun texte à copier ou à télécharger');
	await expect(dialog).toContainText('lancez l’OCR');
	await expect(dialog.getByRole('button', { name: 'Copier le texte' })).toBeDisabled();
	await expect(dialog.getByRole('button', { name: 'Télécharger le .txt' })).toBeDisabled();
});
