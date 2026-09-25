import { expect, test } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';

for (const { name, width, sidebarInitiallyOpen } of [
	{ name: 'desktop', width: 1280, sidebarInitiallyOpen: true },
	{ name: 'mobile', width: 375, sidebarInitiallyOpen: false }
]) {
	test(`the current thumbnail follows preview scrolling on ${name}`, async ({ browser }) => {
		const context = await browser.newContext({
			viewport: { width, height: 800 },
			isMobile: !sidebarInitiallyOpen,
			hasTouch: !sidebarInitiallyOpen
		});
		const page = await context.newPage();
		const pdf = await PDFDocument.create();
		for (let number = 1; number <= 12; number++) {
			pdf.addPage([595, 842]).drawText(`Page ${number}`, { x: 80, y: 700, size: 32 });
		}
		await page.goto('/');
		await page.getByLabel('Sélectionner un fichier PDF').setInputFiles({
			name: 'pages.pdf',
			mimeType: 'application/pdf',
			buffer: Buffer.from(await pdf.save())
		});
		await expect(page.locator('.page-section')).toHaveCount(12);
		await page.locator('.page-section').nth(8).scrollIntoViewIfNeeded();
		const selected = page.getByRole('button', { name: 'Aller à la page 9', exact: true });
		await expect(page.locator('.editor-subbar')).toContainText('Page 9 sur 12');
		expect(
			await page.locator('.editor-subbar').evaluate((bar) => bar.scrollWidth <= bar.clientWidth)
		).toBe(true);
		if (!sidebarInitiallyOpen) {
			await page.getByRole('button', { name: 'Afficher les pages' }).click();
		}
		await expect(selected).toHaveAttribute('aria-current', 'page');
		await expect
			.poll(() => selected.locator('canvas').evaluate((canvas: HTMLCanvasElement) => canvas.width))
			.toBeGreaterThan(0);
		const position = await page.evaluate(() => {
			const list = document.querySelector('.thumbnail-list')!.getBoundingClientRect();
			const item = document.querySelectorAll('.thumbnail-item')[8].getBoundingClientRect();
			return {
				listTop: list.top,
				listBottom: list.bottom,
				itemTop: item.top,
				itemBottom: item.bottom
			};
		});
		expect(position.itemTop).toBeGreaterThanOrEqual(position.listTop - 1);
		expect(position.itemBottom).toBeLessThanOrEqual(position.listBottom + 1);
		await context.close();
	});
}
