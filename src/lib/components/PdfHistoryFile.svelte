<script lang="ts">
	import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
	import { fileSession } from '../../stores/FileStore.svelte';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import Tooltip from './Tooltip/Tooltip.svelte';
	import TooltipContent from './Tooltip/TooltipContent.svelte';
	import type { RecentFile } from '../../types/recentFile';
	interface Props {
		fileData: RecentFile;
	}

	let { fileData }: Props = $props();

	let thumbnailsCanvas: HTMLCanvasElement[] = $state([]);

	const goToPdf = async (fileData: RecentFile) => {
		const buffer = await fileData.blob.arrayBuffer();
		const loadingTask = pdfjs.getDocument({ data: buffer });
		fileSession.processedFile = await loadingTask.promise;

		await goto('/pdf');
	};

	const loadThumbnails = async () => {
		const page = await fileSession.processedFile.getPage(1);
		const viewport = page.getViewport({ scale: 0.2 });
		const canvas = thumbnailsCanvas[1 - 1];

		canvas.width = viewport.width;
		canvas.height = viewport.height;
		const ctx = canvas.getContext('2d')!;

		const renderContext = { canvas, viewport };

		await page.render(renderContext).promise;
	};

	onMount(async () => {
		const buffer = await fileData.blob.arrayBuffer();
		const loadingTask = pdfjs.getDocument({ data: buffer });
		fileSession.processedFile = await loadingTask.promise;

		loadThumbnails();
	});
</script>

<Tooltip>
	<canvas
		class="hover:cursor-pointer shadow-lg h-32 w-24 my-6"
		bind:this={thumbnailsCanvas[1 - 1]}
		onclick={() => goToPdf(fileData)}
	>
	</canvas>
	<TooltipContent>
		<div class="bg-gray-500 rounded-lg py-2 px-3">
			<p class="text-white">{fileData.name}</p>
		</div>
	</TooltipContent>
</Tooltip>
