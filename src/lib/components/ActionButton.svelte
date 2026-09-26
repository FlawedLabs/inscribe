<script lang="ts">
	import { Tooltip, mergeProps } from 'bits-ui';
	import type { Snippet } from 'svelte';
	import type { HTMLButtonAttributes } from 'svelte/elements';

	type Props = HTMLButtonAttributes & {
		tooltip?: string;
		ref?: HTMLButtonElement | null;
		children?: Snippet;
	};

	let {
		tooltip,
		title,
		ref = $bindable(null),
		children,
		disabled = false,
		type = 'button',
		...props
	}: Props = $props();
	const label = $derived(tooltip ?? props['aria-label'] ?? title ?? '');
</script>

<Tooltip.Root disabled={disabled || !label}>
	<Tooltip.Trigger id={props.id ?? undefined} disabled={disabled ?? false}>
		{#snippet child({ props: triggerProps })}
			<button
				{...mergeProps(props, triggerProps)}
				type={type ?? 'button'}
				disabled={disabled ?? false}
				bind:this={ref}
			>
				{@render children?.()}
			</button>
		{/snippet}
	</Tooltip.Trigger>
	<Tooltip.Portal to={ref?.closest('dialog') ?? undefined}>
		<Tooltip.Content
			role="tooltip"
			sideOffset={8}
			collisionPadding={12}
			class="z-50 max-w-64 rounded-lg border border-(--line) bg-(--paper) px-3 py-2 font-['Mulish',sans-serif] text-xs leading-5 font-semibold wrap-break-word text-(--ink) shadow-md"
		>
			{label}
		</Tooltip.Content>
	</Tooltip.Portal>
</Tooltip.Root>
