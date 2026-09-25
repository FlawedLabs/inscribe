<script>
	import '@fontsource/mulish';
	import '@fontsource/mulish/500.css';
	import '@fontsource/mulish/600.css';
	import '@fontsource/mulish/700.css';
	import '../app.css';
	/**
	 * @typedef {Object} Props
	 * @property {import('svelte').Snippet} [children]
	 */

	/** @type {Props} */
	let { children } = $props();
</script>

{@render children?.()}
