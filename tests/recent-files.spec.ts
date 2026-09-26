import { expect, test, type Page } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';

const upload = async (page: Page, name: string, bytes: Uint8Array): Promise<void> => {
	await page.getByLabel('Sélectionner un fichier PDF').evaluate(
		(input: HTMLInputElement, file: { name: string; bytes: number[] }) => {
			const transfer = new DataTransfer();
			transfer.items.add(
				new File([new Uint8Array(file.bytes)], file.name, {
					type: 'application/pdf',
					lastModified: 1700000000000
				})
			);
			input.files = transfer.files;
			input.dispatchEvent(new Event('change', { bubbles: true }));
		},
		{ name, bytes: Array.from(bytes) }
	);
	await expect(page.getByRole('main', { name: 'Aperçu du document' })).toBeVisible();
};

test('keeps at most five recent files when two tabs import concurrently', async ({ context }) => {
	const pdf = await PDFDocument.create();
	pdf.addPage([300, 400]);
	const bytes = await pdf.save();
	const first = await context.newPage();
	await first.goto('/');
	for (let index = 0; index < 4; index++) {
		await upload(first, `previous-${index}.pdf`, bytes);
		await first.getByRole('button', { name: 'Retour à l’accueil' }).click();
	}
	const second = await context.newPage();
	await second.goto('/');
	await Promise.all([
		upload(first, 'first-tab.pdf', bytes),
		upload(second, 'second-tab.pdf', bytes)
	]);
	await first.getByRole('button', { name: 'Retour à l’accueil' }).click();
	await expect(first.locator('.recent-row')).toHaveCount(5);
	await expect(first.locator('.recent-row').filter({ hasText: 'first-tab.pdf' })).toHaveCount(1);
	await expect(first.locator('.recent-row').filter({ hasText: 'second-tab.pdf' })).toHaveCount(1);
	await expect(first.locator('.recent-row').filter({ hasText: 'previous-0.pdf' })).toHaveCount(0);
});

test('remembers the same file only once when two tabs import concurrently', async ({ context }) => {
	const pdf = await PDFDocument.create();
	pdf.addPage([300, 400]);
	const bytes = await pdf.save();
	const first = await context.newPage();
	const second = await context.newPage();
	await Promise.all([first.goto('/'), second.goto('/')]);
	await Promise.all([upload(first, 'shared.pdf', bytes), upload(second, 'shared.pdf', bytes)]);
	await first.getByRole('button', { name: 'Retour à l’accueil' }).click();
	await expect(first.locator('.recent-row')).toHaveCount(1);
});
