<script lang="ts">
	import * as Menubar from '$lib/components/ui/menubar';
	import { mergePDFs } from '$lib/utils/PDFEdition';
	import { parse } from '@/utils/PDFjsHelper';
	import { save } from '@/utils/PDFLibHelper';
	import { processedFile, updatedFile } from '../../../stores/FileStore';

	const mergePDF = () => {
		const input = document.createElement('input');
		input.type = 'file';
		input.multiple = false;
		input.accept = '.pdf';
		input.onchange = async (e: Event) => {
			const target = e.target as HTMLInputElement;
			const file = target.files ? target.files[0] : null;
			if (file) {
				const merged = await mergePDFs($updatedFile, file);
				const binaryFile = await merged.save();
				const blob = new Blob([binaryFile], { type: 'application/pdf' });
				const preview = await parse(blob);
				$updatedFile = merged;
				$processedFile = preview;
			}
			input.remove();
		};
		input.click();
	};
</script>

<Menubar.Root>
	<Menubar.Menu>
		<Menubar.Trigger>File</Menubar.Trigger>
		<Menubar.Content>
			<Menubar.Item>New Tab</Menubar.Item>
			<Menubar.Item>New Window</Menubar.Item>
			<Menubar.Separator />
			<Menubar.Item on:click={save}>Save</Menubar.Item>
			<Menubar.Separator />
			<Menubar.Item>Print</Menubar.Item>
		</Menubar.Content>
	</Menubar.Menu>

	<Menubar.Menu>
		<Menubar.Trigger>Edit</Menubar.Trigger>
		<Menubar.Content>
			<Menubar.Item on:click={mergePDF}>
				Merge a PDF
				<Menubar.Shortcut>⌘T</Menubar.Shortcut>
			</Menubar.Item>
		</Menubar.Content>
	</Menubar.Menu>
</Menubar.Root>
