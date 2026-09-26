<script lang="ts">
	import { Check, CircleAlert, Info, LoaderCircle, X } from '@lucide/svelte';
	import { Toaster } from 'svelte-sonner';
</script>

<Toaster
	position="top-right"
	offset={{ top: 132, right: 24 }}
	mobileOffset={{ top: 176, right: 16, left: 16 }}
	duration={6000}
	visibleToasts={2}
	expand
	closeButton
	pauseWhenPageIsHidden
	containerAriaLabel="Notifications"
	closeButtonAriaLabel="Fermer le message"
	toastOptions={{
		unstyled: true,
		classes: {
			toast:
				"grid w-full grid-cols-[18px_minmax(0,1fr)] items-start gap-x-3 gap-y-2 rounded-xl border border-(--line) bg-(--paper) p-4 pr-10 font-['Mulish',sans-serif] text-(--ink) shadow-lg",
			title: 'text-[13px] leading-5 font-bold',
			description: 'mt-1 text-xs leading-5 text-(--muted-ink)',
			content: 'col-start-2 min-w-0',
			icon: 'col-start-1 row-start-1 mt-0.5',
			actionButton:
				'col-start-2 min-h-9 cursor-pointer justify-self-start rounded-md bg-(--accent) px-3 py-2 text-xs font-bold text-white hover:bg-(--accent-dark) focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-(--ring)',
			closeButton:
				'absolute top-2 right-2 grid size-7 cursor-pointer place-items-center rounded-md border-0 bg-transparent text-(--muted-ink) hover:bg-(--canvas) hover:text-(--ink) focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-(--ring)'
		}
	}}
>
	{#snippet successIcon()}<Check size={18} class="text-(--accent)" />{/snippet}
	{#snippet errorIcon()}<CircleAlert size={18} class="text-[#8d3e27]" />{/snippet}
	{#snippet infoIcon()}<Info size={18} class="text-(--accent)" />{/snippet}
	{#snippet loadingIcon()}
		<LoaderCircle size={18} class="animate-spin text-(--accent) motion-reduce:animate-none" />
	{/snippet}
	{#snippet closeIcon()}<X size={14} />{/snippet}
</Toaster>
