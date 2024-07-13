<script lang="ts">
	import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
	import { processedFile } from '../../stores/FileStore';
	import { goto } from '$app/navigation';
	export let fileData: RecentFile;

	const goToHistoryFile = async (fileData: RecentFile) => {
		const buffer = await fileData.blob.arrayBuffer();
		const loadingTask = pdfjs.getDocument({ data: buffer });
		$processedFile = await loadingTask.promise;

		await goto('/pdf');
	};
</script>

<button on:click={() => goToHistoryFile(fileData)}>{fileData.name}</button>
