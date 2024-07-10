<script>
	import { fileName } from '../../stores/FileStore';
	import { ScanText } from 'lucide-svelte';
	import { isTauri } from '@tauri-apps/api/core';

	const OCRPdf = () => {
		console.log('OCR PDF');
	};
</script>

<nav class="flex justify-between items-center py-1 px-4 bg-gray-50 dark:bg-gray-700">
	<h4 class="font-bold">{$fileName}</h4>

	<div>
		{#if isTauri()}
			<button
				on:click={OCRPdf}
				class="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 hover:bg-gray-200 h-10 px-4 py-2"
			>
				<ScanText />
			</button>
		{/if}
	</div>
</nav>

<slot />
