<script lang="ts">
	import { onMount } from 'svelte';
	import { processedFile } from '../../stores/FileStore';

	let pages = Array.from({ length: $processedFile.numPages }, (_, i) => i + 1);

	let thumbnailsCanvas: HTMLCanvasElement[] = [];

	onMount(async () => {
		loadThumbnails();
	});

	const loadThumbnails = async () => {
		for (let pageNum = 1; pageNum <= $processedFile.numPages; pageNum++) {
			const page = await $processedFile.getPage(pageNum);
			const viewport = page.getViewport({ scale: 0.2 });

			const canvas = thumbnailsCanvas[pageNum - 1];
			canvas.width = viewport.width;
			canvas.height = viewport.height;
			const ctx = canvas.getContext('2d')!;

			const renderContext = {
				canvasContext: ctx,
				viewport: viewport
			};

			await page.render(renderContext).promise;
		}
	};
</script>

<div class="flex h-screen bg-gray-100">
	<div
		class="w-40 overflow-y-auto border-r-2 border-gray-800 bg-white p-2 flex flex-col items-center"
	>
		{#each pages as page, i}
			<canvas bind:this={thumbnailsCanvas[i]} height="168" width="120"></canvas>
		{/each}
	</div>

	<div class="flex-1">
		<canvas class="shadow-lg"></canvas>
	</div>
</div>
