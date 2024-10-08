import { defineConfig } from 'vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { internalIpV4 } from 'internal-ip';

const mobile = !!/android|ios/.exec(process.env.TAURI_ENV_PLATFORM);

export default defineConfig(async () => ({
	plugins: [sveltekit()],
	test: {
		include: ['src/**/*.{test,spec}.{js,ts}']
	},

	clearScreen: false,
	server: {
		port: 1420,
		strictPort: true,
		host: mobile ? '0.0.0.0' : false,
		hmr: mobile
			? {
					protocol: 'ws',
					host: await internalIpV4(),
					port: 1421
				}
			: undefined,
		watch: {
			ignored: ['**/src-tauri/**']
		}
	}
}));
