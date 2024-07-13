<script>
	import { Save } from 'lucide-svelte';
	import { fileName } from '../../../stores/FileStore';
</script>

<div class="flex justify-center items-center">
	<div>
		{$fileName}
	</div>

	<!-- Tools -->
	<nav>
		<button><Save /></button>
	</nav>
</div>
