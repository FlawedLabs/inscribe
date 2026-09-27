export type InstallerTarget = 'windows' | 'linux' | 'mac-arm' | 'mac-intel';
export type VisitorOS = 'windows' | 'linux' | 'mac' | 'mobile' | 'unknown';
export const releasesUrl = 'https://github.com/FlawedLabs/inscribe/releases/latest';
export const releaseApi = 'https://api.github.com/repos/FlawedLabs/inscribe/releases/latest';

export function detectVisitorOS(userAgent: string, platform = '', maxTouchPoints = 0): VisitorOS {
	if (
		/Android|iPhone|iPad|iPod/i.test(userAgent) ||
		(maxTouchPoints > 1 && /Mac/i.test(platform + userAgent))
	)
		return 'mobile';
	if (/Windows|Win32|Win64/i.test(platform + userAgent)) return 'windows';
	if (/Mac/i.test(platform + userAgent)) return 'mac';
	if (/Linux/i.test(platform + userAgent) && !/CrOS/i.test(userAgent)) return 'linux';
	return 'unknown';
}

export function installerLinks(release: unknown): Partial<Record<InstallerTarget, string>> {
	if (
		!release ||
		typeof release !== 'object' ||
		!('assets' in release) ||
		!Array.isArray(release.assets)
	)
		return {};
	const links: Partial<Record<InstallerTarget, string>> = {};
	for (const asset of release.assets) {
		if (!asset || typeof asset.name !== 'string' || typeof asset.browser_download_url !== 'string')
			continue;
		if (
			!asset.browser_download_url.startsWith(
				'https://github.com/FlawedLabs/inscribe/releases/download/'
			)
		)
			continue;
		const name = asset.name.toLowerCase();
		if (name.endsWith('.dmg') && /aarch64|arm64/.test(name))
			links['mac-arm'] = asset.browser_download_url;
		if (name.endsWith('.dmg') && /x64|x86_64/.test(name))
			links['mac-intel'] = asset.browser_download_url;
		if (name.endsWith('.exe') && /x64|x86_64/.test(name))
			links.windows = asset.browser_download_url;
		if (name.endsWith('.appimage') && /amd64|x64|x86_64/.test(name))
			links.linux = asset.browser_download_url;
	}
	return links;
}
