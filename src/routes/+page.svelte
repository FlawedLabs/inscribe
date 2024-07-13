<script lang="ts">
	import { goto } from '$app/navigation';
	import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
	import { fileAsBlob, fileName, processedFile } from '../stores/FileStore';
	import { onMount } from 'svelte';
	import { saveBlob } from './utils/IndexDBUtils';

	let file: File | null = null;
	let isLoading: boolean = false;

	let db: IDBDatabase | undefined;

	pdfjs.GlobalWorkerOptions.workerSrc = 'pdf.worker.min.mjs';

	onMount(() => {
		const dbInit = indexedDB.open('inscribe', 1);

		dbInit.onupgradeneeded = (event) => {
			db = (event.target as IDBOpenDBRequest).result;

			// Create the object store inside the onupgradeneeded event
			if (!db.objectStoreNames.contains('recentFiles')) {
				db.createObjectStore('recentFiles', { keyPath: 'id', autoIncrement: true });
			}
		};

		dbInit.onsuccess = (event) => {
			db = (event.target as IDBOpenDBRequest).result;
			console.log('DB opened:', db);
		};

		dbInit.onerror = (event) => {
			console.error('DB error:', (event.target as IDBOpenDBRequest).error);
		};
	});

	const handleFileSelection = (event: Event) => {
		isLoading = true;

		const target = event.target as HTMLInputElement;
		if (target.files) {
			file = target.files.item(0);

			if (file) {
				const reader = new FileReader();
				$fileName = file.name;

				reader.onload = async (event) => {
					const fileArrayBuffer = event.target?.result as ArrayBuffer;

					$fileAsBlob = new Blob([fileArrayBuffer], { type: 'application/pdf' });

					const loadingTask = pdfjs.getDocument({ data: fileArrayBuffer });
					$processedFile = await loadingTask.promise;

					// Save the file to IndexedDB
					if (db) {
						saveBlob(db, 'recentFiles', $fileAsBlob, $fileName);
					}

					await goto('/pdf');
					isLoading = false;
				};

				reader.readAsArrayBuffer(file);
			}
		}
	};
</script>

{#if isLoading}
	<p>Loading...</p>
{/if}
<div class="flex items-center justify-center w-full">
	<label
		for="dropzone-file"
		class="flex flex-col items-center justify-center w-full h-64 border-2 border-gray-300 border-dashed rounded-lg cursor-pointer bg-gray-50 dark:hover:bg-gray-800 dark:bg-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:hover:border-gray-500"
	>
		<div class="flex flex-col items-center justify-center pt-5 pb-6">
			<svg
				class="w-8 h-8 mb-4 text-gray-500 dark:text-gray-400"
				aria-hidden="true"
				xmlns="http://www.w3.org/2000/svg"
				fill="none"
				viewBox="0 0 20 16"
			>
				<path
					stroke="currentColor"
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M13 13h3a3 3 0 0 0 0-6h-.025A5.56 5.56 0 0 0 16 6.5 5.5 5.5 0 0 0 5.207 5.021C5.137 5.017 5.071 5 5 5a4 4 0 0 0 0 8h2.167M10 15V6m0 0L8 8m2-2 2 2"
				/>
			</svg>
			<p class="mb-2 text-sm text-gray-500 dark:text-gray-400">
				<span class="font-semibold">Click to upload</span> or drag and drop
			</p>
			<p class="text-xs text-gray-500 dark:text-gray-400">PDF only</p>
		</div>
		<input
			id="dropzone-file"
			type="file"
			on:change={handleFileSelection}
			accept=".pdf"
			class="hidden"
		/>
	</label>
</div>
