import { expect, test } from '@playwright/test';
import { PDFDocument, rgb } from 'pdf-lib';

test('home page has expected h1', async ({ page }) => {
	await page.goto('/');
	await expect(page.locator('h1')).toBeVisible();
});

test('renders imported PDF content in the page canvas', async ({ page }) => {
	const document = await PDFDocument.create();
	const sheet = document.addPage([300, 400]);
	sheet.drawRectangle({ x: 40, y: 280, width: 180, height: 80, color: rgb(0, 0, 0) });
	sheet.drawText('VISIBLE TEXT', { x: 40, y: 200, size: 24 });
	await page.goto('/');
	await page.getByLabel('Sélectionner un fichier PDF').setInputFiles({
		name: 'visible.pdf',
		mimeType: 'application/pdf',
		buffer: Buffer.from(await document.save())
	});
	await expect(page.getByRole('main', { name: 'Aperçu du document' })).toBeVisible();
	expect((await page.request.get('/pdfjs/wasm/jbig2.wasm')).ok()).toBe(true);
	await expect
		.poll(async () =>
			page
				.locator('.pdf-sheet canvas')
				.first()
				.evaluate((canvas: HTMLCanvasElement) => {
					const { data } = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height);
					for (let offset = 0; offset < data.length; offset += 4) {
						if (
							data[offset] < 100 &&
							data[offset + 1] < 100 &&
							data[offset + 2] < 100 &&
							data[offset + 3] > 0
						)
							return true;
					}
					return false;
				})
		)
		.toBe(true);
	await expect
		.poll(async () =>
			page
				.locator('.textLayer span')
				.first()
				.evaluate((span) => parseFloat(getComputedStyle(span).fontSize))
		)
		.toBeGreaterThan(20);
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
	await expect
		.poll(
			async () => {
				const [thumbnail, preview] = await Promise.all([
					page
						.locator('.thumbnail-item')
						.first()
						.evaluate((element) => element.getAnimations().length),
					page
						.locator('.page-section')
						.first()
						.evaluate((element) => element.getAnimations().length)
				]);
				return thumbnail > 0 && preview > 0;
			},
			{ intervals: [25, 25, 25, 25, 50] }
		)
		.toBe(true);
	await expect(page.getByText('Ordre des pages modifié.')).toBeVisible();
	await page
		.getByRole('button', { name: 'Aller à la page 1' })
		.dragTo(page.getByRole('button', { name: 'Aller à la page 2' }));
	await expect(page.getByText('Ordre des pages modifié.')).toBeVisible();
	await expect(page.getByText('L’opération a échoué.')).toHaveCount(0);
	const downloadPromise = page.waitForEvent('download');
	await page.getByRole('button', { name: 'Exporter le PDF' }).click();
	await page.getByRole('button', { name: 'Télécharger sans mot de passe' }).click();
	const download = await downloadPromise;
	const exported = await PDFDocument.load(
		await (await import('node:fs/promises')).readFile(await download.path())
	);
	expect(exported.getPage(0).getWidth()).toBe(300);
	expect(exported.getPage(1).getWidth()).toBe(400);
	expect(exported.getTitle()).toBe('Client');
	expect(exported.getForm().getTextField('client.name').getText()).toBe('Alice');
});

test('reorders thumbnails after moving a page in the main preview', async ({ page }) => {
	await page.setViewportSize({ width: 1280, height: 1400 });
	const document = await PDFDocument.create();
	for (const width of [300, 400, 500]) document.addPage([width, 600]);
	await page.goto('/');
	await page.getByLabel('Sélectionner un fichier PDF').setInputFiles({
		name: 'three-pages.pdf',
		mimeType: 'application/pdf',
		buffer: Buffer.from(await document.save())
	});
	await expect(page.getByRole('main', { name: 'Aperçu du document' })).toBeVisible();
	await page.getByRole('button', { name: 'Déplacer la page 1 vers le bas' }).click();
	await expect(page.getByText('Ordre des pages modifié.')).toBeVisible();
	const firstDownloadPromise = page.waitForEvent('download');
	await page.getByRole('button', { name: 'Exporter le PDF' }).click();
	await page.getByRole('button', { name: 'Télécharger sans mot de passe' }).click();
	const firstDownload = await firstDownloadPromise;
	const firstExport = await PDFDocument.load(
		await (await import('node:fs/promises')).readFile(await firstDownload.path())
	);
	expect(firstExport.getPages().map((item) => item.getWidth())).toEqual([400, 300, 500]);
	await page
		.getByRole('button', { name: 'Aller à la page 1' })
		.dragTo(page.getByRole('button', { name: 'Aller à la page 3' }));
	await expect(page.getByText('L’opération a échoué.')).toHaveCount(0);
	const downloadPromise = page.waitForEvent('download');
	await page.getByRole('button', { name: 'Exporter le PDF' }).click();
	await page.getByRole('button', { name: 'Télécharger sans mot de passe' }).click();
	const download = await downloadPromise;
	const exported = await PDFDocument.load(
		await (await import('node:fs/promises')).readFile(await download.path())
	);
	expect(exported.getPages().map((item) => item.getWidth())).toEqual([300, 500, 400]);
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

test('restores page actions from the thumbnail context menu', async ({ page }) => {
	await page.addInitScript(() => {
		window.confirm = () => {
			throw new Error('The native confirmation must not be used for page deletion.');
		};
	});
	const document = await PDFDocument.create();
	document.addPage([300, 400]);
	document.addPage([400, 500]);
	await page.goto('/');
	await page.getByLabel('Sélectionner un fichier PDF').setInputFiles({
		name: 'pages.pdf',
		mimeType: 'application/pdf',
		buffer: Buffer.from(await document.save())
	});
	const thumbnail = (number: number) =>
		page.getByRole('button', { name: `Aller à la page ${number}` });
	await thumbnail(1).dragTo(thumbnail(2));
	await expect(page.getByText('Ordre des pages modifié.')).toBeVisible();
	await thumbnail(1).click({ button: 'right' });
	await expect(page.getByRole('menuitem', { name: 'Dupliquer la page' })).toBeVisible();
	await page.getByRole('menuitem', { name: 'Dupliquer la page' }).click();
	await expect(thumbnail(3)).toBeVisible();
	await thumbnail(2).click({ button: 'right' });
	await page.getByRole('menuitem', { name: 'Supprimer la page' }).click();
	const confirmation = page.getByRole('dialog', { name: 'Supprimer la page 2 ?' });
	await expect(confirmation).toBeVisible();
	await confirmation.getByRole('button', { name: 'Supprimer la page' }).click();
	await expect(page.getByText('Page supprimée.')).toBeVisible();
	await expect(thumbnail(3)).toHaveCount(0);
	await page.getByRole('button', { name: 'Supprimer la page 1' }).click();
	await expect(page.getByRole('dialog', { name: 'Supprimer la page 1 ?' })).toBeVisible();
	await page.getByRole('button', { name: 'Annuler' }).click();
	await expect(thumbnail(2)).toBeVisible();
	await page.getByRole('button', { name: 'Supprimer la page 1' }).click();
	await page
		.getByRole('dialog', { name: 'Supprimer la page 1 ?' })
		.getByRole('button', { name: 'Supprimer la page' })
		.click();
	await expect(page.getByText('Page supprimée.')).toBeVisible();
	await expect(thumbnail(2)).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'Supprimer la page 1' })).toBeDisabled();
	const downloadPromise = page.waitForEvent('download');
	await page.getByRole('button', { name: 'Exporter le PDF' }).click();
	await page.getByRole('button', { name: 'Télécharger sans mot de passe' }).click();
	const download = await downloadPromise;
	const exported = await PDFDocument.load(
		await (await import('node:fs/promises')).readFile(await download.path())
	);
	expect(exported.getPageCount()).toBe(1);
	expect(exported.getPage(0).getWidth()).toBe(300);
});

test('shows metadata from the imported PDF after editing pages', async ({ page }) => {
	const document = await PDFDocument.create();
	document.addPage();
	document.addPage();
	document.setTitle('Contrat client');
	document.setAuthor('Camille Martin');
	document.setSubject('Dossier annuel');
	document.setKeywords(['client', 'archives']);
	document.setCreationDate(new Date('2020-01-02T12:00:00Z'));
	await page.goto('/');
	await page.getByLabel('Sélectionner un fichier PDF').setInputFiles({
		name: 'contrat.pdf',
		mimeType: 'application/pdf',
		buffer: Buffer.from(await document.save())
	});
	await page.getByRole('button', { name: 'Informations sur le PDF' }).click();
	const dialog = page.getByRole('dialog', { name: 'Informations sur le PDF' });
	await expect(dialog).toBeVisible();
	const dialogBox = await dialog.boundingBox();
	const viewport = page.viewportSize();
	expect(dialogBox).not.toBeNull();
	expect(viewport).not.toBeNull();
	expect(Math.abs(dialogBox!.x + dialogBox!.width / 2 - viewport!.width / 2)).toBeLessThan(2);
	expect(Math.abs(dialogBox!.y + dialogBox!.height / 2 - viewport!.height / 2)).toBeLessThan(2);
	await expect(dialog.getByText('contrat.pdf')).toBeVisible();
	await expect(dialog.getByText('2 pages')).toBeVisible();
	await expect(dialog.getByText('Contrat client')).toBeVisible();
	await expect(dialog.getByText('Camille Martin')).toBeVisible();
	await expect(dialog.getByText('Dossier annuel')).toBeVisible();
	await expect(dialog.getByText('PDF 1.7')).toBeVisible();
	await expect(dialog.getByText('2020', { exact: false })).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(dialog).not.toBeVisible();
	await page.getByRole('button', { name: 'Dupliquer la page 1' }).click();
	await expect(page.getByRole('button', { name: 'Aller à la page 3' })).toBeVisible();
	await page.getByRole('button', { name: 'Informations sur le PDF' }).click();
	await expect(dialog.getByText('2 pages')).toBeVisible();
	await page.keyboard.press('Escape');
	await page.setViewportSize({ width: 375, height: 700 });
	const infoButton = await page
		.getByRole('button', { name: 'Informations sur le PDF' })
		.boundingBox();
	expect(infoButton).not.toBeNull();
	expect(infoButton!.x + infoButton!.width).toBeLessThanOrEqual(375);
	await page.getByRole('button', { name: 'Informations sur le PDF' }).click();
	await expect(dialog).toBeVisible();
});
