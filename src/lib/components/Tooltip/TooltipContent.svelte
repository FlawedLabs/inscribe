<script lang="ts">
	interface Props {
		spacing?: string;
		children?: import('svelte').Snippet;
	}

	let { spacing = '-translate-y-[4.25rem]', children }: Props = $props();
</script>

<div class="hidden group-hover:flex justify-center z-50">
	<div class="absolute {spacing}">
		{@render children?.()}
	</div>
</div>
