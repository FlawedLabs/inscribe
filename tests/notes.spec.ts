import { expect, test } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';
import { listNotes } from '../src/lib/utils/PDFNotes';
import { readFile } from 'node:fs/promises';

test('adds, edits, exports, and reopens a note on desktop and mobile', async ({ page }) => {
	const source = await PDFDocument.create();
	source.addPage([300, 400]);
	await page.goto('/');
	await page.getByLabel('Sélectionner un fichier PDF').setInputFiles({
		name: 'notes.pdf',
		mimeType: 'application/pdf',
		buffer: Buffer.from(await source.save())
	});
	await expect(page.getByRole('main', { name: 'Aperçu du document' })).toBeVisible();
	await page.getByRole('button', { name: 'Ajouter une note sur une page' }).click();
	await expect(page.getByText('Cliquez ou touchez une page pour placer la note.')).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(page.getByRole('button', { name: 'Ajouter une note sur une page' })).toHaveAttribute(
		'aria-pressed',
		'false'
	);
	await page.getByRole('button', { name: 'Ajouter une note sur une page' }).click();
	await page
		.getByRole('button', { name: 'Placer une note sur la page 1' })
		.click({ position: { x: 65, y: 75 } });
	const dialog = page.getByRole('dialog', { name: 'Nouvelle note' });
	await expect(dialog).toBeVisible();
	await expect(dialog.getByLabel('Texte de la note')).toBeFocused();
	await dialog.getByLabel('Texte de la note').fill('À vérifier avant signature');
	await dialog.getByRole('button', { name: 'Enregistrer la note' }).click();
	await expect(page.getByRole('button', { name: /Lire la note de la page 1/ })).toBeVisible();
	await page.getByRole('button', { name: /Lire la note de la page 1/ }).click();
	const editDialog = page.getByRole('dialog', { name: 'Modifier la note' });
	await editDialog.getByLabel('Texte de la note').fill('Signature validée');
	await editDialog.getByRole('button', { name: 'Enregistrer la note' }).click();
	await expect(page.getByRole('button', { name: /Signature validée/ })).toBeVisible();

	await page.setViewportSize({ width: 375, height: 700 });
	const noteButton = page.getByRole('button', { name: 'Ajouter une note sur une page' });
	await expect(noteButton).toBeVisible();
	const box = await noteButton.boundingBox();
	expect(box!.x + box!.width).toBeLessThanOrEqual(375);
	await page.getByRole('button', { name: /Signature validée/ }).click();
	await expect(editDialog).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(editDialog).not.toBeVisible();

	const downloadPromise = page.waitForEvent('download');
	await page.getByRole('button', { name: 'Exporter le PDF' }).click();
	await page.getByRole('button', { name: 'Télécharger sans mot de passe' }).click();
	const download = await downloadPromise;
	const exported = await PDFDocument.load(await readFile(await download.path()));
	expect(listNotes(exported)).toMatchObject([{ page: 1, text: 'Signature validée' }]);
	await page.getByRole('button', { name: 'Retour à l’accueil' }).click();
	await page.getByLabel('Sélectionner un fichier PDF').setInputFiles({
		name: 'notes-export.pdf',
		mimeType: 'application/pdf',
		buffer: Buffer.from(await exported.save())
	});
	await expect(page.getByRole('button', { name: /Signature validée/ })).toBeVisible();
	page.once('dialog', (confirmation) => confirmation.accept());
	await page.getByRole('button', { name: /Signature validée/ }).click();
	await page
		.getByRole('dialog', { name: 'Modifier la note' })
		.getByRole('button', { name: 'Supprimer' })
		.click();
	await expect(page.getByRole('button', { name: /Signature validée/ })).toHaveCount(0);
});
