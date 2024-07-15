<script lang="ts">
	import * as Tooltip from '$lib/components/ui/tooltip';

	export let tooltipText: string | undefined = undefined;
</script>

{#if tooltipText}
	<Tooltip.Root>
		<Tooltip.Trigger>
			<button
				class="transition-all ease-in-out duration-300 hover:bg-gray-100 p-2 rounded-sm"
				on:click
			>
				<slot />
			</button>
		</Tooltip.Trigger>
		<Tooltip.Content>{tooltipText}</Tooltip.Content>
	</Tooltip.Root>
{:else}
	<button class="transition-all ease-in-out duration-300 hover:bg-gray-100 p-2 rounded-sm" on:click>
		<slot />
	</button>
{/if}
