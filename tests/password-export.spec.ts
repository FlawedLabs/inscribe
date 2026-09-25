import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

for (const { name, width } of [
	{ name: 'desktop', width: 1280 },
	{ name: 'mobile', width: 375 }
]) {
	test(`exports an AES-encrypted PDF with an opening password on ${name}`, async ({ browser }) => {
		const context = await browser.newContext({ viewport: { width, height: 800 } });
		const page = await context.newPage();
		const source = await PDFDocument.create();
		source.setTitle('Document confidentiel');
		source.addPage([400, 500]).drawText('Contenu secret', { x: 50, y: 400 });
		await page.goto('/');
		await page.getByLabel('Sélectionner un fichier PDF').setInputFiles({
			name: 'contrat.pdf',
			mimeType: 'application/pdf',
			buffer: Buffer.from(await source.save())
		});
		await expect(page.getByRole('main', { name: 'Aperçu du document' })).toBeVisible();
		await page.getByRole('button', { name: 'Exporter le PDF' }).click();
		const dialog = page.getByRole('dialog', { name: 'Exporter le document' });
		await expect(dialog).toBeVisible();
		await expect(dialog.locator('#export-password')).toBeFocused();
		await dialog.getByLabel('Mot de passe d’ouverture').fill('secret-épreuve-2026');
		await dialog.getByLabel('Confirmer le mot de passe').fill('autre');
		await dialog.getByRole('button', { name: 'Protéger et télécharger' }).click();
		await expect(dialog.getByRole('alert')).toHaveText('Les mots de passe ne correspondent pas.');
		await dialog.getByLabel('Confirmer le mot de passe').fill('secret-épreuve-2026');
		const downloadPromise = page.waitForEvent('download');
		await dialog.getByRole('button', { name: 'Protéger et télécharger' }).click();
		const download = await downloadPromise;
		expect(download.suggestedFilename()).toBe('contrat-protege.pdf');
		await expect(dialog).not.toBeVisible();
		const bytes = new Uint8Array(await readFile(await download.path()));
		await expect(PDFDocument.load(bytes)).rejects.toThrow();
		await expect(
			getDocument({ data: bytes.slice(), password: 'incorrect' }).promise
		).rejects.toThrow();
		const loadingTask = getDocument({ data: bytes.slice(), password: 'secret-épreuve-2026' });
		const document = await loadingTask.promise;
		expect(document.numPages).toBe(1);
		expect(((await document.getMetadata()).info as { Title?: string }).Title).toBe(
			'Document confidentiel'
		);
		expect(
			(await (await document.getPage(1)).getTextContent()).items.some(
				(item) => 'str' in item && item.str.includes('Contenu secret')
			)
		).toBe(true);
		await loadingTask.destroy();
		await page.getByRole('button', { name: 'Exporter le PDF' }).click();
		await expect(dialog.getByLabel('Mot de passe d’ouverture')).toHaveValue('');
		await expect(dialog.getByLabel('Confirmer le mot de passe')).toHaveValue('');
		await page.keyboard.press('Escape');
		await expect(dialog).not.toBeVisible();
		await expect(page.getByRole('button', { name: 'Exporter le PDF' })).toBeFocused();
		await page.getByRole('button', { name: 'Retour à l’accueil' }).click();
		await page.getByLabel('Sélectionner un fichier PDF').setInputFiles({
			name: download.suggestedFilename(),
			mimeType: 'application/pdf',
			buffer: Buffer.from(bytes)
		});
		const openDialog = page.getByRole('dialog', { name: 'PDF protégé' });
		await expect(openDialog).toBeVisible();
		await openDialog.getByLabel('Mot de passe d’ouverture').fill('incorrect');
		await openDialog.getByRole('button', { name: 'Ouvrir le PDF' }).click();
		await expect(openDialog.getByRole('alert')).toHaveText('Mot de passe incorrect. Réessayez.');
		await openDialog.getByLabel('Mot de passe d’ouverture').fill('secret-épreuve-2026');
		await openDialog.getByRole('button', { name: 'Ouvrir le PDF' }).click();
		await expect(page.getByRole('main', { name: 'Aperçu du document' })).toBeVisible();
		await expect(openDialog).not.toBeVisible();
		await context.close();
	});
}
