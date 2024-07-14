<script>
	import { CircleArrowLeft, FileSymlink, Save } from 'lucide-svelte';
	import { fileName } from '../../../stores/FileStore';
	import { goto } from '$app/navigation';
	import Button from '../Button.svelte';
	import Menu from './Menu.svelte';

	// Should be a function in the utils file, and it should clear the $processedFile store
	// Also it probably should ask for confirmation if changes were made ㅋㅋ
	const goBack = () => {
		goto('/');
	};
</script>

<div class="flex flex-col w-full max-h-36">
	<Menu />
	<div class="flex items-center gap-4 p-2 border-b-2 font-bold text-xl">
		<Button on:click={goBack}>
			<CircleArrowLeft size={22} />
		</Button>
		{$fileName}
	</div>

	<!-- Tools -->
	<nav class="flex justify-center items-center m-1">
		<Button tooltipText="Merge a PDF">
			<FileSymlink />
		</Button>

		<Button tooltipText="Save the PDF">
			<Save />
		</Button>
	</nav>
</div>
