<script>
	import { fileName } from '../../stores/FileStore';
</script>

<nav class="bg-gray-50 dark:bg-gray-700">
	<div class="max-w-screen-xl px-4 py-3">
		<h4 class="font-bold">{$fileName}</h4>
	</div>
</nav>

<slot />
