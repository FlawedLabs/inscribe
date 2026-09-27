import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

const root = new URL('../../../', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), 'utf8');
const config = JSON.parse(read('src-tauri/tauri.conf.json'));

it('keeps all application version manifests and the Cargo lockfile consistent', () => {
	const version = JSON.parse(read('package.json')).version;
	expect(config.version).toBe(version);
	expect(read('src-tauri/Cargo.toml').match(/^version = "([^"]+)"/m)?.[1]).toBe(version);
	expect(read('src-tauri/Cargo.lock').match(/name = "inscribe"\r?\nversion = "([^"]+)"/)?.[1]).toBe(
		version
	);
});

it('embeds a canonical Base64 updater public key without line wrapping', () => {
	const encoded = config.plugins.updater.pubkey;
	const decoded = Buffer.from(encoded, 'base64');
	expect(decoded.toString('base64')).toBe(encoded);
	const lines = decoded.toString('utf8').trim().split(/\r?\n/);
	expect(lines[0]).toMatch(/^untrusted comment: minisign public key:/);
	const key = Buffer.from(lines[1], 'base64');
	expect(key.toString('base64')).toBe(lines[1]);
	expect(key.length).toBe(42);
	expect(key.subarray(0, 2).toString()).toBe('Ed');
});
