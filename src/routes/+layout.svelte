<script>
	import '@fontsource/mulish';
	import '@fontsource/mulish/500.css';
	import '@fontsource/mulish/600.css';
	import '@fontsource/mulish/700.css';
	import '../app.css';
	import Notifications from '#lib/components/Notifications.svelte';
	import { Tooltip } from 'bits-ui';
	import { dev } from '$app/env';
	import { inject } from '@vercel/analytics';

	let { children } = $props();

	inject({ mode: dev ? 'development' : 'production' });
</script>

<Tooltip.Provider delayDuration={300} skipDelayDuration={150} ignoreNonKeyboardFocus>
	{@render children?.()}
</Tooltip.Provider>
<Notifications />
