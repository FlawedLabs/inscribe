<script>
	import '@fontsource/mulish';
	import '@fontsource/mulish/500.css';
	import '@fontsource/mulish/600.css';
	import '@fontsource/mulish/700.css';
	import '../app.css';
	import Notifications from '#lib/components/Notifications.svelte';
	import { Tooltip } from 'bits-ui';
	/**
	 * @typedef {Object} Props
	 * @property {import('svelte').Snippet} [children]
	 */

	/** @type {Props} */
	let { children } = $props();
</script>

<Tooltip.Provider delayDuration={300} skipDelayDuration={150} ignoreNonKeyboardFocus>
	{@render children?.()}
</Tooltip.Provider>
<Notifications />
