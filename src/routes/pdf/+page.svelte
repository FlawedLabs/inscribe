<script lang="ts">
	import { onMount } from 'svelte';
	import { processedFile } from '../../stores/FileStore';
	import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
	import 'pdfjs-dist/web/pdf_viewer.css';
	import { goto } from '$app/navigation';
	import { Sortable, type SortableEventNames } from '@shopify/draggable';

	const PDF_SCALE = 1.3;

	let pages: number[] = [];

	let mainCanvas: HTMLCanvasElement;
	let thumbnailsCanvas: HTMLCanvasElement[] = [];
	let textLayerDiv: HTMLDivElement;

	let thumbnailContainer: HTMLDivElement;

	let sortable: Sortable<SortableEventNames>;

	onMount(async () => {
		if ($processedFile) {
			pages = Array.from({ length: $processedFile.numPages }, (_, i) => i + 1);
			loadThumbnails();
			loadPage(1);

			sortable = new Sortable(thumbnailContainer, {
				draggable: '.thumbnail-sub-container',
				delay: 200,

				mirror: {
					appendTo: thumbnailContainer,
					constrainDimensions: true
				}
			});

			sortable.on('sortable:stop', (event: { oldIndex: any; newIndex: any }) => {
				const { oldIndex, newIndex } = event;

				// Remove the page from the old index and insert it at the new index
				const pageToMove = pages.splice(oldIndex, 1);
				pages.splice(newIndex, 0, pageToMove[0]);

				pages = [...pages];
			});
		} else {
			goto('/');
		}
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
		const viewport = page.getViewport({ scale: PDF_SCALE });

		textLayerDiv.innerHTML = '';

		const canvas = mainCanvas;
		canvas.width = viewport.width;
		canvas.height = viewport.height;
		const ctx = canvas.getContext('2d')!;

		const renderContext = {
			canvasContext: ctx,
			viewport
		};

		await page.render(renderContext).promise;

		page.getTextContent().then((textContent) => {
			const textLayer = new pdfjs.TextLayer({
				textContentSource: textContent,
				container: textLayerDiv,
				viewport
			});

			textLayerDiv.style.height = `${viewport.height}px`;
			textLayerDiv.style.width = `${viewport.width}px`;

			textLayer.render();
		});
	};
</script>

<div class="flex h-screen bg-gray-100">
	<div
		bind:this={thumbnailContainer}
		class="w-48 overflow-y-auto border-r-2 border-gray-800 bg-gray-200 p-2 flex flex-col items-center gap-5"
	>
		{#each pages as page (page)}
			<!-- svelte-ignore a11y-no-static-element-interactions -->
			<div class="thumbnail-sub-container">
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

	<div class="pdfViewer flex-1" style={`--scale-factor: ${PDF_SCALE};`}>
		<div class="page">
			<div class="canvasWrapper">
				<canvas bind:this={mainCanvas} class="shadow-lg"></canvas>
			</div>
			<div bind:this={textLayerDiv} class="textLayer"></div>
		</div>
	</div>
</div>
