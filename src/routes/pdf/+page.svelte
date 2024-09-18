<script lang="ts">
	import { onMount } from 'svelte';
	import { openedFile, updatedFile, processedFile, canvasList } from '../../stores/FileStore';
	import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
	import 'pdfjs-dist/web/pdf_viewer.css';
	import { goto } from '$app/navigation';
	import { Sortable, type SortableEventNames } from '@shopify/draggable';
	import { PDFDocument, PDFPage } from 'pdf-lib';
	import { inview } from 'svelte-inview';
	import PageSeparator from '../../lib/components/PageSeparator.svelte';
	import * as ContextMenu from '$lib/components/ui/context-menu/index';
	import { Files, Trash } from 'lucide-svelte';
	import { load } from '$lib/utils/PDFLibHelper';
	import { load as loadPDFjsHelper } from '@/utils/PDFjsHelper';
	import { duplicatePage } from '@/utils/PDFEdition';

	const PDF_SCALE = 1.3;
	const outputScale = window.devicePixelRatio || 1;

	let pages: number[] = [];

	let thumbnailsCanvas: HTMLCanvasElement[] = [];
	let textLayerDiv: HTMLDivElement[] = [];
	let pageDiv: HTMLDivElement[] = [];

	// By default, only render the first page
	let isInView: boolean[];

	let contextMenuPage: number;

	let selectedPage = 1;

	let thumbnailContainer: HTMLDivElement;

	let sortable: Sortable<SortableEventNames>;

	onMount(async () => {
		$updatedFile = await load($openedFile);
	});

	$: {
		init($processedFile);
	}

	const init = async (file: pdfjs.PDFDocumentProxy | null) => {
		if ($processedFile) {
			pages = Array.from({ length: $processedFile.numPages }, (_, i) => i + 1);
			loadThumbnails();

			// We create an array containing the rendered state of each page
			isInView = [true, ...Array.from({ length: pages.length }, () => false)];

			loadPage(1);

			// Make the thumbnails draggable
			sortable = new Sortable(thumbnailContainer, {
				draggable: '.thumbnail-sub-container',
				delay: 200,
				mirror: {
					appendTo: thumbnailContainer,
					constrainDimensions: true
				}
			});

			// When the user stops dragging a thumbnail, we update the pages array
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
	};

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

	const removePage = async () => {
		$updatedFile.removePage(contextMenuPage - 1);
		await loadPdf();
	};

	const duplicate = async () => {
		$updatedFile = await duplicatePage(contextMenuPage);
		await loadPdf();
	};

	const loadPdf = async () => {
		const binaryFile = await $updatedFile.save();
		const blob = new Blob([binaryFile], { type: 'application/pdf' });
		await loadPDFjsHelper(blob);
	};

	const loadPage = async (pageIndex: number) => {
		// Prevent loading already loaded pages
		if (!isInView[pageIndex]) {
			console.log('Loading page', pageIndex);
			isInView[pageIndex - 1] = true;

			// Processed File starts at 1
			const page = await $processedFile.getPage(pageIndex);
			const viewport = page.getViewport({ scale: PDF_SCALE });

			const canvas = $canvasList[pageIndex - 1];

			canvas.width = Math.floor(viewport.width * outputScale);
			canvas.height = Math.floor(viewport.height * outputScale);

			pageDiv[pageIndex - 1].style.width = Math.floor(viewport.width) + 'px';
			pageDiv[pageIndex - 1].style.height = Math.floor(viewport.height) + 'px';

			const ctx = canvas.getContext('2d')!;

			const renderContext = {
				canvasContext: ctx,
				viewport
			};

			await page.render(renderContext).promise;

			page.getTextContent().then((textContent) => {
				const textLayer = new pdfjs.TextLayer({
					textContentSource: textContent,
					container: textLayerDiv[pageIndex - 1],
					viewport
				});

				textLayerDiv[pageIndex - 1].style.height = `${viewport.height}px`;
				textLayerDiv[pageIndex - 1].style.width = `${viewport.width}px`;

				textLayer.render();
			});
		}
	};

	// Reorder pages in the PDF document
	const reorderPages = async (pdfDoc: PDFDocument, newOrder: number[]) => {
		const originalPages = pdfDoc.getPages();
		let reorderedPages: PDFPage[] = [];

		// Create a reordered array of pages based on newOrder
		newOrder.forEach((order) => {
			const pageIndex = order - 1;
			reorderedPages.push(originalPages[pageIndex]);
		});

		// Remove all pages from the document
		for (let i = originalPages.length - 1; i >= 0; i--) {
			pdfDoc.removePage(i);
		}

		// Add pages back in the new order
		reorderedPages.forEach((page) => {
			pdfDoc.addPage(page);
		});
	};

	const onPageVisible = (pageNumber: number) => {
		loadPage(pageNumber);
		selectedPage = pageNumber;
	};
</script>

<div class="flex min-h-screen h-full bg-gray-100">
	<div
		class="w-48 h-full fixed overflow-y-auto border-r-2 border-gray-800 bg-stone-100 p-2 flex flex-col items-center gap-5"
	>
		<ContextMenu.Root>
			<ContextMenu.Trigger>
				<div bind:this={thumbnailContainer}>
					{#each pages as page, i (page)}
						<!-- svelte-ignore a11y-no-static-element-interactions -->
						<div
							on:contextmenu={() => (contextMenuPage = page)}
							class={`thumbnail-sub-container px-4 pb-2 pt-3 rounded-md ${selectedPage === page ? 'bg-blue-200' : ''}`}
						>
							<a href="#page-{page}">
								<canvas
									class={`hover:cursor-pointer rounded-sm border-2 ${selectedPage === page ? 'border-blue-500' : 'border-stone-200'}`}
									bind:this={thumbnailsCanvas[page - 1]}
									height="168"
									width="120"
								></canvas>
							</a>
							<p
								class={`${selectedPage === page ? 'text-blue-500' : 'text-slate-500'} font-semibold`}
							>
								Page {i + 1}
							</p>
						</div>
					{/each}
				</div>
			</ContextMenu.Trigger>

			<ContextMenu.Content class="w-64">
				<ContextMenu.Item on:click={() => duplicate()} class="gap-2">
					Duplicate <Files size={16} />
				</ContextMenu.Item>
				<ContextMenu.Item
					on:click={() => removePage()}
					class="text-red-500 flex gap-2 hover:text-red-600"
				>
					Delete <Trash size={16} />
					<ContextMenu.Shortcut>X</ContextMenu.Shortcut>
				</ContextMenu.Item>
			</ContextMenu.Content>
		</ContextMenu.Root>
	</div>

	<div class="pdfViewer flex-1 mt-18" style={`--scale-factor: ${PDF_SCALE};`}>
		<div class="container flex flex-col items-center w-2/3">
			{#each pages as page (page)}
				<div id={`page-${page}`} class="page" bind:this={pageDiv[page - 1]}>
					<div class="canvasWrapper" use:inview on:inview_enter={() => onPageVisible(page)}>
						{#if isInView[page - 1] === true}
							<canvas bind:this={$canvasList[page - 1]} class="shadow-lg"></canvas>
						{:else}
							<div class="w-full h-full flex items-center justify-center">
								<div class="text-gray-400">Loading...</div>
							</div>
						{/if}
					</div>
					<div bind:this={textLayerDiv[page - 1]} class="textLayer"></div>
				</div>
				<PageSeparator />
			{/each}
		</div>
	</div>
</div>
