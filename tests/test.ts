import { expect, test } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';

test('home page has expected h1', async ({ page }) => {
	await page.goto('/');
	await expect(page.locator('h1')).toBeVisible();
});

test('opens, reorders, and exports a PDF while preserving its form', async ({ page }) => {
	const document = await PDFDocument.create();
	document.setTitle('Client');
	const first = document.addPage([300, 400]);
	document.addPage([400, 500]);
	const field = document.getForm().createTextField('client.name');
	field.setText('Alice');
	field.addToPage(first);
	await page.goto('/');
	await page.getByLabel('Sélectionner un fichier PDF').setInputFiles({
		name: 'client.pdf',
		mimeType: 'application/pdf',
		buffer: Buffer.from(await document.save())
	});
	await expect(page.getByRole('main', { name: 'Aperçu du document' })).toBeVisible();
	await page.getByRole('button', { name: 'Déplacer la page 1 vers le bas' }).click();
	await expect(page.getByText('Ordre des pages modifié.')).toBeVisible();
	const downloadPromise = page.waitForEvent('download');
	await page.getByRole('button', { name: 'Exporter le PDF' }).click();
	const download = await downloadPromise;
	const exported = await PDFDocument.load(
		await (await import('node:fs/promises')).readFile(await download.path())
	);
	expect(exported.getPage(0).getWidth()).toBe(400);
	expect(exported.getPage(1).getWidth()).toBe(300);
	expect(exported.getTitle()).toBe('Client');
	expect(exported.getForm().getTextField('client.name').getText()).toBe('Alice');
});

test('keeps different recent PDFs with the same filename', async ({ page }) => {
	const first = await PDFDocument.create();
	first.addPage([300, 400]);
	const second = await PDFDocument.create();
	second.addPage([400, 500]);
	second.addPage([500, 600]);
	const upload = async (buffer: Uint8Array) => {
		await page.getByLabel('Sélectionner un fichier PDF').setInputFiles({
			name: 'same-name.pdf',
			mimeType: 'application/pdf',
			buffer: Buffer.from(buffer)
		});
		await expect(page.getByRole('main', { name: 'Aperçu du document' })).toBeVisible();
		await page.getByRole('button', { name: 'Retour à l’accueil' }).click();
		await expect(page.getByRole('heading', { name: 'Documents récents' })).toBeVisible();
	};
	await page.goto('/');
	await upload(await first.save());
	await upload(await second.save());
	await expect(page.locator('.recent-row')).toHaveCount(2);
});
