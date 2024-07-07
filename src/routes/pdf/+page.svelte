<script lang="ts">
	import { onMount } from 'svelte';
	import { processedFile } from '../../stores/FileStore';

	let pages = Array.from({ length: $processedFile.numPages }, (_, i) => i + 1);

	let mainCanvas: HTMLCanvasElement;
	let thumbnailsCanvas: HTMLCanvasElement[] = [];

	onMount(async () => {
		loadThumbnails();
		loadPage(1);
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

	const loadPage = async (pageIndex: number) => {
		const page = await $processedFile.getPage(pageIndex);
		const viewport = page.getViewport({ scale: 1 });

		const canvas = mainCanvas;
		canvas.width = viewport.width;
		canvas.height = viewport.height;
		const ctx = canvas.getContext('2d')!;

		const renderContext = {
			canvasContext: ctx,
			viewport: viewport
		};

		await page.render(renderContext).promise;
	};
</script>

<div class="flex h-screen bg-gray-100">
	<div
		class="w-48 overflow-y-auto border-r-2 border-gray-800 bg-gray-200 p-2 flex flex-col items-center gap-5"
	>
		{#each pages as page}
			<div>
				<canvas
					class="hover:cursor-pointer shadow-lg"
					on:click={() => loadPage(page)}
					bind:this={thumbnailsCanvas[page - 1]}
					height="168"
					width="120"
				></canvas>
				<p>Page {page}</p>
			</div>
		{/each}
	</div>

	<div class="flex-1">
		<canvas bind:this={mainCanvas} class="max-h-screen overflow-y-auto overflow-x-hidden shadow-lg"
		></canvas>
	</div>
</div>
