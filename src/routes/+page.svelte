<script lang="ts">
	import { goto } from '$app/navigation';
	import { fileName, openedFile } from '../stores/FileStore';
	import { load } from '@/utils/PDFjsHelper';
	import 'pdfjs-dist/build/pdf.worker.min.mjs';

	let file: File | null = null;
	let isLoading: boolean = false;

	const handleFileSelection = async (event: Event) => {
		isLoading = true;

		const target = event.target as HTMLInputElement;
		if (target.files) {
			file = target.files.item(0);

			if (file) {
				$fileName = file.name;

				$openedFile = file;

				await load(file);

				await goto('/pdf');
				isLoading = false;
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
