import { describe, expect, it } from 'vitest';
import { detectVisitorOS, installerLinks } from './Installers';

describe('installer selection', () => {
	it('distinguishes desktop operating systems without treating mobile Linux or desktop-mode iPad as a desktop', () => {
		expect(detectVisitorOS('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe('windows');
		expect(detectVisitorOS('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')).toBe('mac');
		expect(detectVisitorOS('Mozilla/5.0 (X11; Linux x86_64)')).toBe('linux');
		expect(detectVisitorOS('Mozilla/5.0 (Linux; Android 16)')).toBe('mobile');
		expect(detectVisitorOS('Mozilla/5.0 (Macintosh; Intel Mac OS X)', 'MacIntel', 5)).toBe(
			'mobile'
		);
		expect(detectVisitorOS('Mozilla/5.0 (X11; CrOS x86_64)')).toBe('unknown');
	});

	it('selects manual installers rather than updater archives or signatures', () => {
		const names = [
			'inscribe_0.1.0_aarch64.dmg',
			'inscribe_0.1.0_x64.dmg',
			'inscribe_0.1.0_x64-setup.exe',
			'inscribe_0.1.0_amd64.AppImage',
			'inscribe.app.tar.gz',
			'inscribe_0.1.0_aarch64.dmg.sig'
		];
		const assets = names.map((name) => ({
			name,
			browser_download_url: `https://github.com/FlawedLabs/inscribe/releases/download/v0.1.0/${name}`
		}));
		expect(installerLinks({ assets })).toEqual({
			'mac-arm': assets[0].browser_download_url,
			'mac-intel': assets[1].browser_download_url,
			windows: assets[2].browser_download_url,
			linux: assets[3].browser_download_url
		});
	});

	it('ignores malformed releases, foreign download URLs and unsupported architectures', () => {
		expect(installerLinks(null)).toEqual({});
		expect(
			installerLinks({
				assets: [
					null,
					{},
					{ name: 'inscribe_x64.exe', browser_download_url: 'https://example.com/file.exe' },
					{
						name: 'inscribe_arm64.AppImage',
						browser_download_url:
							'https://github.com/FlawedLabs/inscribe/releases/download/v0.1.0/inscribe_arm64.AppImage'
					}
				]
			})
		).toEqual({});
	});
});
