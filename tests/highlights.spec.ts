import { expect, test } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';
import { readFile } from 'node:fs/promises';
import { listHighlights } from '../src/lib/utils/PDFHighlights';

test('highlights selected PDF text with a preset and a custom wheel color', async ({ page }) => {
	const source = await PDFDocument.create();
	const sheet = source.addPage([400, 400]);
	sheet.drawText('PREMIERE PHRASE', { x: 36, y: 290, size: 22 });
	sheet.drawText('SECONDE PHRASE', { x: 36, y: 230, size: 22 });
	await page.goto('/');
	await page.getByLabel('Sélectionner un fichier PDF').setInputFiles({
		name: 'surlignage.pdf',
		mimeType: 'application/pdf',
		buffer: Buffer.from(await source.save())
	});
	await expect(page.locator('.textLayer').first()).toContainText('PREMIERE PHRASE');
	const selectText = async (text: string) => {
		await expect(page.locator('.textLayer').first()).toContainText(text);
		await page.evaluate((label) => {
			const span = [...document.querySelectorAll('.textLayer span')].find((item) =>
				item.textContent?.includes(label)
			);
			if (!span?.firstChild) throw new Error(`Text not rendered: ${label}`);
			const range = document.createRange();
			range.selectNodeContents(span);
			const selection = window.getSelection();
			selection?.removeAllRanges();
			selection?.addRange(range);
			document.dispatchEvent(new Event('selectionchange'));
		}, text);
		await expect(
			page.getByRole('toolbar', { name: 'Surligner le texte sélectionné' })
		).toBeVisible();
	};
	const firstSpan = page.locator('.textLayer span').filter({ hasText: 'PREMIERE PHRASE' }).first();
	const firstBox = await firstSpan.boundingBox();
	expect(firstBox).not.toBeNull();
	await page.mouse.move(firstBox!.x + 2, firstBox!.y + firstBox!.height / 2);
	await page.mouse.down();
	await page.mouse.move(firstBox!.x + firstBox!.width - 2, firstBox!.y + firstBox!.height / 2, {
		steps: 8
	});
	await page.mouse.up();
	await expect(page.getByRole('toolbar', { name: 'Surligner le texte sélectionné' })).toBeVisible();
	await page.getByRole('button', { name: 'Surligner en Jaune' }).click();
	await expect(page.locator('.highlight-rect')).toHaveCount(1);
	await page.getByRole('button', { name: 'Annuler le surlignage' }).click();
	await expect(page.locator('.highlight-rect')).toHaveCount(0);
	await selectText('PREMIERE PHRASE');
	await page.getByRole('button', { name: 'Surligner en Jaune' }).click();
	await expect(page.locator('.highlight-rect')).toHaveCount(1);
	await selectText('SECONDE PHRASE');
	await page.getByRole('button', { name: 'Choisir une couleur personnalisée' }).click();
	const wheel = page.getByRole('slider', { name: 'Roue de couleur, teinte' });
	await expect(wheel).toBeVisible();
	await wheel.click({ position: { x: 145, y: 84 } });
	await expect(page.locator('#custom-color')).not.toHaveValue('#c96a42');
	await wheel.focus();
	await page.keyboard.press('ArrowRight');
	await page.getByRole('button', { name: 'Surligner avec cette couleur' }).click();
	await expect(page.locator('.highlight-rect')).toHaveCount(2);
	const downloadPromise = page.waitForEvent('download');
	await page.getByRole('button', { name: 'Exporter le PDF' }).click();
	const download = await downloadPromise;
	const exported = await PDFDocument.load(await readFile(await download.path()));
	const highlights = listHighlights(exported);
	expect(highlights).toHaveLength(2);
	expect(highlights[0].color).toBe('#f6d76b');
	expect(highlights[1].color).not.toBe('#c96a42');
	const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
	const externalViewer = await pdfjs.getDocument({ data: new Uint8Array(await exported.save()) })
		.promise;
	const externalAnnotations = await (await externalViewer.getPage(1)).getAnnotations();
	expect(
		externalAnnotations.filter((annotation) => annotation.subtype === 'Highlight')
	).toHaveLength(2);
	await page.getByRole('button', { name: 'Retour à l’accueil' }).click();
	await page.setViewportSize({ width: 375, height: 700 });
	await page.getByLabel('Sélectionner un fichier PDF').setInputFiles({
		name: 'surlignage-export.pdf',
		mimeType: 'application/pdf',
		buffer: Buffer.from(await exported.save())
	});
	await expect(page.locator('.highlight-rect')).toHaveCount(2);
	await selectText('PREMIERE PHRASE');
	await page.getByRole('button', { name: 'Choisir une couleur personnalisée' }).click();
	const mobilePanel = await page
		.getByRole('toolbar', { name: 'Surligner le texte sélectionné' })
		.boundingBox();
	expect(mobilePanel).not.toBeNull();
	expect(mobilePanel!.x).toBeGreaterThanOrEqual(0);
	expect(mobilePanel!.x + mobilePanel!.width).toBeLessThanOrEqual(375);
	expect(mobilePanel!.y).toBeGreaterThanOrEqual(0);
	expect(mobilePanel!.y + mobilePanel!.height).toBeLessThanOrEqual(700);
	const boxes = await page.locator('.highlight-rect').evaluateAll((elements) =>
		elements.map((element) => ({
			width: element.getBoundingClientRect().width,
			height: element.getBoundingClientRect().height
		}))
	);
	expect(boxes.every((box) => box.width > 20 && box.height > 5)).toBe(true);
});
