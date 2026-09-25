import { expect, test } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';

test('pinch zoom changes the PDF preview without scaling the mobile interface', async ({
	browser
}) => {
	const context = await browser.newContext({
		viewport: { width: 375, height: 700 },
		deviceScaleFactor: 2,
		isMobile: true,
		hasTouch: true
	});
	const page = await context.newPage();
	const pdf = await PDFDocument.create();
	const sheet = pdf.addPage([595, 842]);
	sheet.drawText('ZOOM LOCAL', { x: 80, y: 680, size: 32 });
	await page.goto('/');
	await page.getByLabel('Sélectionner un fichier PDF').setInputFiles({
		name: 'mobile.pdf',
		mimeType: 'application/pdf',
		buffer: Buffer.from(await pdf.save())
	});
	await expect(page.locator('.textLayer')).toContainText('ZOOM LOCAL');
	const initialZoom = Number(
		(await page.locator('.zoom-controls span').textContent())?.replace(/[^0-9]/g, '')
	);
	const initialSheet = await page.locator('.pdf-sheet').boundingBox();
	const initialHeader = await page.locator('.editor-header').boundingBox();
	const stage = await page.locator('.document-stage').boundingBox();
	const textBefore = await page.locator('.textLayer span').first().boundingBox();
	expect(initialSheet).not.toBeNull();
	expect(stage).not.toBeNull();
	expect(textBefore).not.toBeNull();
	const centerX = textBefore!.x + textBefore!.width / 2;
	const centerY = textBefore!.y + textBefore!.height / 2;
	const client = await context.newCDPSession(page);
	const fingers = (spacing: number) => [
		{ x: centerX - spacing, y: centerY, id: 1 },
		{ x: centerX + spacing, y: centerY, id: 2 }
	];
	await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: fingers(35) });
	await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: fingers(60) });
	await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: fingers(85) });
	await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
	await expect
		.poll(async () =>
			Number((await page.locator('.zoom-controls span').textContent())?.replace(/[^0-9]/g, ''))
		)
		.toBeGreaterThan(initialZoom);
	await expect
		.poll(async () => (await page.locator('.pdf-sheet').boundingBox())!.width)
		.toBeGreaterThan(initialSheet!.width);
	await expect
		.poll(async () => (await page.locator('.textLayer span').first().boundingBox())!.width)
		.toBeGreaterThan(textBefore!.width);
	await expect
		.poll(async () => {
			const [text, sheet] = await Promise.all([
				page.locator('.textLayer span').first().boundingBox(),
				page.locator('.pdf-sheet').boundingBox()
			]);
			return text && sheet ? text.x - sheet.x : 0;
		})
		.toBeGreaterThan(100);
	const textAfter = await page.locator('.textLayer span').first().boundingBox();
	expect(Math.abs(textAfter!.x + textAfter!.width / 2 - centerX)).toBeLessThan(35);
	expect(Math.abs(textAfter!.y + textAfter!.height / 2 - centerY)).toBeLessThan(35);
	const finalHeader = await page.locator('.editor-header').boundingBox();
	expect(finalHeader!.height).toBe(initialHeader!.height);
	expect(finalHeader!.width).toBe(initialHeader!.width);
	expect(await page.evaluate(() => window.visualViewport?.scale)).toBe(1);
	await expect(page.getByRole('button', { name: 'Ajouter une note sur une page' })).toBeVisible();
	const zoomedIn = Number(
		(await page.locator('.zoom-controls span').textContent())?.replace(/[^0-9]/g, '')
	);
	await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: fingers(80) });
	await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: fingers(50) });
	await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
	await expect
		.poll(async () =>
			Number((await page.locator('.zoom-controls span').textContent())?.replace(/[^0-9]/g, ''))
		)
		.toBeLessThan(zoomedIn);
	const beforeScroll = await page
		.locator('.document-stage')
		.evaluate((element) => element.scrollTop);
	await client.send('Input.dispatchTouchEvent', {
		type: 'touchStart',
		touchPoints: [{ x: centerX, y: centerY + 90, id: 3 }]
	});
	await client.send('Input.dispatchTouchEvent', {
		type: 'touchMove',
		touchPoints: [{ x: centerX, y: centerY - 80, id: 3 }]
	});
	await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
	await expect
		.poll(async () => page.locator('.document-stage').evaluate((element) => element.scrollTop))
		.toBeGreaterThan(beforeScroll);
	await context.close();
});
