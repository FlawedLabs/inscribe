<script>
	import '@fontsource/mulish';
	import '@fontsource/mulish/500.css';
	import '@fontsource/mulish/600.css';
	import '@fontsource/mulish/700.css';
	import '../app.css';

	import * as pdfjs from 'pdfjs-dist';

	pdfjs.GlobalWorkerOptions.workerSrc = new URL(
		'pdfjs-dist/build/pdf.worker.min.mjs',
		import.meta.url
	).toString();
</script>

<svelte:head>
	<title>Inscribe | PDF Editor</title>
</svelte:head>

<slot />
