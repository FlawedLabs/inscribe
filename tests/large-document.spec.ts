import { expect, test } from '@playwright/test';
import { PDFDocument, rgb } from 'pdf-lib';

test('keeps a long PDF open while repeatedly reordering pages on mobile', async ({ browser }) => {
	const context = await browser.newContext({
		viewport: { width: 375, height: 700 },
		deviceScaleFactor: 2,
		isMobile: true,
		hasTouch: true
	});
	const page = await context.newPage();
	const pdf = await PDFDocument.create();
	for (let number = 1; number <= 48; number++) {
		const sheet = pdf.addPage([595, 842]);
		sheet.drawRectangle({ x: 30, y: 30, width: 535, height: 782, color: rgb(0.94, 0.94, 0.91) });
		sheet.drawText(`Page ${number}`, { x: 70, y: 700, size: 30 });
	}
	await page.goto('/');
	await page.getByLabel('Sélectionner un fichier PDF').setInputFiles({
		name: 'long.pdf',
		mimeType: 'application/pdf',
		buffer: Buffer.from(await pdf.save())
	});
	await expect(page.getByRole('main', { name: 'Aperçu du document' })).toBeVisible();
	await expect(page.locator('.page-section')).toHaveCount(48);
	await expect
		.poll(async () =>
			page
				.locator('.pdf-sheet canvas')
				.first()
				.evaluate((canvas: HTMLCanvasElement) => canvas.width)
		)
		.toBeGreaterThan(0);
	const renderedCount = () =>
		page
			.locator('.pdf-sheet canvas')
			.evaluateAll(
				(canvases: HTMLCanvasElement[]) => canvases.filter((canvas) => canvas.width > 0).length
			);
	expect(await renderedCount()).toBeLessThanOrEqual(4);
	await page.getByRole('button', { name: 'Afficher les pages' }).click();
	const thumbnail = (number: number) =>
		page.getByRole('button', { name: `Aller à la page ${number}`, exact: true });
	await expect(thumbnail(2)).toBeVisible();
	const thumbnailCenter = () =>
		page
			.locator('.thumbnail-item[aria-current="page"]')
			.locator('canvas')
			.evaluate((canvas: HTMLCanvasElement) => {
				if (!canvas.width || !canvas.height) return 255;
				return canvas
					.getContext('2d')!
					.getImageData(Math.floor(canvas.width / 2), Math.floor(canvas.height / 2), 1, 1).data[0];
			});
	await expect.poll(thumbnailCenter).toBeLessThan(250);
	await page.getByRole('button', { name: 'Masquer les pages' }).click();
	await page.locator('.document-stage').evaluate((stage) => (stage.scrollTop = 3000));
	await expect
		.poll(() => page.locator('.document-stage').evaluate((stage) => stage.scrollTop))
		.toBeGreaterThan(1000);
	await page.getByRole('button', { name: 'Afficher les pages' }).click();
	await expect.poll(thumbnailCenter).toBeLessThan(250);
	for (let attempt = 0; attempt < 4; attempt++) {
		await thumbnail(1).dragTo(thumbnail(2));
		await expect(page.getByText('Ordre des pages modifié.', { exact: false })).toBeVisible();
		expect(await renderedCount()).toBeLessThanOrEqual(4);
		expect(page.url()).toContain('/pdf');
	}
	await thumbnail(30).click();
	await expect
		.poll(async () =>
			page
				.locator('.pdf-sheet canvas')
				.nth(29)
				.evaluate((canvas: HTMLCanvasElement) => canvas.width)
		)
		.toBeGreaterThan(0);
	expect(await renderedCount()).toBeLessThanOrEqual(4);
	expect(
		await page
			.locator('.pdf-sheet canvas')
			.first()
			.evaluate((canvas: HTMLCanvasElement) => canvas.width)
	).toBe(0);
	await context.close();
});
