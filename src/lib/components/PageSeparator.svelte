<script lang="ts">
	import { CirclePlus } from 'lucide-svelte';
</script>

<div class="group min-h-6 max-h-6 w-1/2 cursor-pointer">
	<div class="hidden group-hover:flex justify-center items-center gap-2">
		<div class="border-2 border-dashed border-slate-300 grow"></div>
		<span class="text-slate-400 inline-flex items-center gap-2 font-medium"
			><CirclePlus size={18} /> Insert a page</span
		>
		<div class="border-2 border-dashed border-slate-300 grow"></div>
	</div>
</div>
