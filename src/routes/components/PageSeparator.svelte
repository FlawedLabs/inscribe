<script lang="ts">
	import { CirclePlus } from 'lucide-svelte';
</script>

<!-- svelte-ignore a11y-click-events-have-key-events -->
<!-- svelte-ignore a11y-no-static-element-interactions -->
<div
	on:click
	class="group flex items-center justify-center pt-5 pb-3 hover:cursor-pointer w-1/2 mx-auto"
>
	<div class="hidden group-hover:flex">
		<div class="w-1/3 border-2 border-dashed border-gray-300"></div>
		<span class="px-4 flex items-center gap-2 text-gray-400">
			<CirclePlus /> Add new page
		</span>
		<div class="w-1/3 border-2 border-dashed border-gray-300"></div>
	</div>
</div>
