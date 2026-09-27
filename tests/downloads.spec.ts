import { expect, test } from '@playwright/test';

const api = 'https://api.github.com/repos/FlawedLabs/inscribe/releases/latest';
const base = 'https://github.com/FlawedLabs/inscribe/releases/download/v0.1.0/';
const assets = [
	'inscribe_0.1.0_x64-setup.exe',
	'inscribe_0.1.0_x64.dmg',
	'inscribe_0.1.0_aarch64.dmg',
	'inscribe_0.1.0_amd64.AppImage'
].map((name) => ({ name, browser_download_url: base + name }));

test('Windows visitors get a real installer link and can choose another system', async ({
	page
}) => {
	await page.addInitScript(() => {
		Object.defineProperty(navigator, 'userAgentData', { value: { platform: 'Windows' } });
	});
	await page.route(api, (route) => route.fulfill({ json: { tag_name: 'v0.1.0', assets } }));
	await page.goto('/');
	await expect(
		page.getByRole('link', { name: 'Télécharger Inscribe pour Windows' })
	).toHaveAttribute('href', base + assets[0].name);
	await page.getByLabel('Version à télécharger').selectOption('linux');
	await expect(page.getByRole('link', { name: 'Télécharger Inscribe pour Linux' })).toHaveAttribute(
		'href',
		base + assets[3].name
	);
});

test('Mac visitors explicitly choose their chip and can use the controls with the keyboard', async ({
	page
}) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.addInitScript(() => {
		Object.defineProperty(navigator, 'userAgentData', { value: { platform: 'macOS' } });
		Object.defineProperty(navigator, 'userAgent', { value: 'Macintosh; Intel Mac OS X' });
	});
	await page.route(api, (route) => route.fulfill({ json: { tag_name: 'v0.1.0', assets } }));
	await page.goto('/');
	await expect(page.getByLabel('Version à télécharger')).toHaveValue('');
	await page.getByLabel('Version à télécharger').selectOption('mac-intel');
	await expect(
		page.getByRole('link', { name: 'Télécharger Inscribe pour macOS · Intel' })
	).toHaveAttribute('href', base + assets[1].name);
	await page.getByLabel('Version à télécharger').selectOption('mac-arm');
	const download = page.getByRole('link', {
		name: 'Télécharger Inscribe pour macOS · Apple Silicon'
	});
	await expect(download).toHaveAttribute('href', base + assets[2].name);
	await page.getByLabel('Version à télécharger').focus();
	await page.keyboard.press('Tab');
	await expect(download).toBeFocused();
	expect((await page.getByLabel('Version à télécharger').boundingBox())?.width).toBeGreaterThan(
		200
	);
});

test('mobile visitors keep the web editor without a desktop download recommendation or horizontal overflow', async ({
	page
}) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.addInitScript(() => {
		Object.defineProperty(navigator, 'userAgent', {
			value: 'Mozilla/5.0 (Linux; Android 16) Mobile'
		});
	});
	await page.route(api, (route) => route.fulfill({ json: { tag_name: 'v0.1.0', assets } }));
	await page.goto('/');
	await expect(page.getByText('Disponible sur macOS, Windows et Linux.')).toBeVisible();
	await expect(page.getByLabel('Version à télécharger')).toHaveCount(0);
	await expect(page.getByRole('link', { name: 'Tous les installateurs' })).toBeVisible();
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('GitHub failure can be retried and a missing release never produces a broken direct download', async ({
	page
}) => {
	let attempts = 0;
	await page.route(api, (route) =>
		route.fulfill({ status: ++attempts === 1 ? 503 : 404, json: {} })
	);
	await page.goto('/');
	await page.getByRole('button', { name: 'Réessayer' }).click();
	await expect(page.getByText('Les installateurs seront bientôt disponibles.')).toBeVisible();
	await expect(page.getByRole('link', { name: 'Tous les installateurs' })).toHaveAttribute(
		'href',
		'https://github.com/FlawedLabs/inscribe/releases'
	);
	await expect(page.getByRole('link', { name: /Télécharger Inscribe/ })).toHaveCount(0);
});
