<script lang="ts">
	import { onDestroy, tick } from 'svelte';
	import {
		CheckSquare,
		ChevronDown,
		CircleDot,
		SquarePen,
		TextCursorInput,
		Type,
		Undo2,
		X
	} from '@lucide/svelte';
	import { toast } from 'svelte-sonner';
	import type { PDFDocument } from 'pdf-lib';
	import ActionButton from './ActionButton.svelte';
	import {
		addPDFContent,
		updateFormField,
		updatePlacedText,
		moveFormField,
		removeFormField,
		listFormFields,
		PDFContentError,
		type ContentKind,
		type ContentSettings,
		type ContentPlacement,
		type PDFFormField
	} from '#lib/utils/PDFContent.js';
	import { fileSession, getProcessedFile } from '../../stores/FileStore.svelte';

	interface Props {
		busy?: boolean;
		placing?: ContentKind | null;
		onApply: (document: PDFDocument) => Promise<void>;
	}
	let { busy = $bindable(false), placing = $bindable(null), onApply }: Props = $props();
	let root: HTMLDivElement = $state(null!);
	let trigger: HTMLButtonElement = $state(null!);
	let dialog: HTMLDialogElement = $state(null!);
	let firstInput: HTMLTextAreaElement = $state(null!);
	let nameInput: HTMLInputElement = $state(null!);
	let menuOpen = $state(false);
	let error = $state('');
	let kind: ContentKind = $state('text');
	let text = $state('');
	let fontSize = $state(14);
	let color = $state('#252a27');
	let name = $state('');
	let value = $state('');
	let checked = $state(false);
	let required = $state(false);
	let multiline = $state(false);
	let optionsText = $state('');
	let width = $state(240);
	let height = $state(80);
	let position: { page: number; x: number; y: number } | null = $state(null);
	let editing: PDFFormField | null = $state(null);
	let undoSource: PDFDocument | null = $state.raw(null);
	let undoResult: PDFDocument | null = $state.raw(null);
	const tools = [
		{ kind: 'text', label: 'Ajouter du texte', icon: Type },
		{ kind: 'text-field', label: 'Champ de texte', icon: TextCursorInput },
		{ kind: 'checkbox', label: 'Case à cocher', icon: CheckSquare },
		{ kind: 'dropdown', label: 'Liste déroulante', icon: ChevronDown },
		{ kind: 'radio', label: 'Boutons radio', icon: CircleDot }
	] as const;
	const title = $derived.by(() =>
		editing
			? editing.kind === 'placed-text'
				? 'Modifier le texte ajouté'
				: `Modifier le champ « ${editing.name} »`
			: (tools.find((tool) => tool.kind === kind)?.label ?? 'Ajouter du contenu')
	);
	const settings = (): ContentSettings => ({
		kind,
		text,
		fontSize,
		color,
		name,
		value,
		checked,
		required,
		multiline,
		options: optionsText.split('\n')
	});
	const stopPlacement = () => {
		placing = null;
		trigger?.focus();
	};
	const startPlacement = (next: ContentKind) => {
		placing = next;
		menuOpen = false;
	};
	$effect(() => {
		if (placing) {
			toast.info('Cliquez ou touchez une page pour placer le contenu.', {
				id: 'content-placement',
				duration: Infinity,
				closeButton: false,
				dismissible: false,
				action: { label: 'Annuler', onClick: stopPlacement }
			});
		} else toast.dismiss('content-placement');
	});
	$effect(() => {
		if (undoResult && fileSession.updatedFile !== undoResult) {
			undoResult = null;
			undoSource = null;
		}
	});
	onDestroy(() => toast.dismiss('content-placement'));

	export const place = async (page: number, x = 0.1, y = 0.15) => {
		if (!placing || busy) return;
		kind = placing;
		placing = null;
		position = { page, x, y };
		editing = null;
		error = '';
		text = '';
		fontSize = 14;
		color = '#252a27';
		value = '';
		checked = required = multiline = false;
		optionsText = kind === 'radio' ? 'Oui\nNon' : '';
		width = kind === 'checkbox' ? 20 : 240;
		height = kind === 'text' ? 80 : kind === 'checkbox' ? 20 : kind === 'radio' ? 72 : 32;
		const existing = new Set(listFormFields(fileSession.updatedFile).map((field) => field.name));
		const prefix =
			kind === 'checkbox'
				? 'Case'
				: kind === 'dropdown'
					? 'Liste'
					: kind === 'radio'
						? 'Choix'
						: 'Champ';
		let index = 1;
		while (existing.has(`${prefix}_${index}`)) index++;
		name = `${prefix}_${index}`;
		await tick();
		if (!dialog?.isConnected) return;
		dialog.showModal();
		(kind === 'text' ? firstInput : nameInput)?.focus();
	};
	export const edit = async (field: PDFFormField) => {
		if (busy) return;
		placing = null;
		editing = field;
		kind = field.kind === 'placed-text' ? 'text' : field.kind;
		name = field.name;
		text = field.kind === 'placed-text' ? field.value : '';
		value = field.value;
		checked = field.checked;
		required = field.required;
		multiline = field.multiline;
		optionsText = field.options.join('\n');
		error = '';
		await tick();
		if (!dialog?.isConnected) return;
		dialog.showModal();
		dialog
			.querySelector<HTMLElement>(
				field.kind === 'placed-text' ? '#pdf-new-text' : '#pdf-field-value, input[type="checkbox"]'
			)
			?.focus();
	};
	export const move = async (field: PDFFormField, deltaX: number, deltaY: number) => {
		if (busy) return false;
		busy = true;
		try {
			await onApply(
				await moveFormField(
					fileSession.updatedFile,
					field.name,
					field.page,
					field.widgetIndex,
					deltaX,
					deltaY,
					field.companion
				)
			);
			return true;
		} catch {
			toast.error('Le champ n’a pas pu être déplacé. Le document reste ouvert.');
			return false;
		} finally {
			busy = false;
		}
	};
	const getPlacement = async (): Promise<ContentPlacement> => {
		if (!position) throw new PDFContentError('Choisissez une position sur la page.');
		if (![width, height].every(Number.isFinite) || width < 12 || height < 12)
			throw new PDFContentError('Les dimensions doivent être d’au moins 12 points.');
		const page = await getProcessedFile().getPage(position.page);
		const viewport = page.getViewport({ scale: 1 });
		const areaWidth = Math.min(width, viewport.width - 8);
		const areaHeight = Math.min(height, viewport.height - 8);
		const left = Math.max(4, Math.min(position.x * viewport.width, viewport.width - areaWidth - 4));
		const top = Math.max(
			4,
			Math.min(position.y * viewport.height, viewport.height - areaHeight - 4)
		);
		const [x, y] = viewport.convertToPdfPoint(left, top + areaHeight);
		return {
			page: position.page,
			x,
			y,
			width: areaWidth,
			height: areaHeight,
			rotation: ((viewport.rotation % 360) + 360) % 360
		};
	};
	const save = async () => {
		if (busy) return;
		busy = true;
		error = '';
		const source = fileSession.updatedFile;
		try {
			const next =
				editing?.kind === 'placed-text'
					? await updatePlacedText(source, editing.name, text)
					: editing
						? await updateFormField(source, editing.name, settings())
						: await addPDFContent(source, await getPlacement(), settings());
			await onApply(next);
			if (!editing) {
				undoSource = source;
				undoResult = next;
			}
			dialog.close();
			toast.success(
				editing?.kind === 'placed-text'
					? 'Texte mis à jour. Pensez à exporter le PDF.'
					: editing
						? 'Champ mis à jour. Pensez à exporter le PDF.'
						: 'Contenu ajouté. Pensez à exporter le PDF.',
				{ id: 'editor-feedback', duration: 6000, important: false, action: undefined }
			);
		} catch (cause) {
			if (!(cause instanceof PDFContentError))
				console.error('PDF content could not be saved:', cause);
			error =
				cause instanceof PDFContentError
					? cause.message
					: 'Le contenu n’a pas pu être enregistré. Votre saisie est conservée.';
		} finally {
			busy = false;
		}
	};
	const remove = async () => {
		if (busy || !editing) return;
		const confirmation =
			editing.kind === 'placed-text'
				? 'Supprimer ce bloc de texte ?'
				: `Supprimer le champ « ${editing.name} » ?`;
		if (!window.confirm(confirmation)) return;
		busy = true;
		error = '';
		try {
			await onApply(await removeFormField(fileSession.updatedFile, editing.name));
			dialog.close();
		} catch {
			error = 'Le champ n’a pas pu être supprimé. Réessayez.';
		} finally {
			busy = false;
		}
	};
	const undo = async () => {
		if (busy || !undoSource) return;
		busy = true;
		menuOpen = false;
		try {
			await onApply(undoSource);
			undoSource = null;
			undoResult = null;
		} catch {
			toast.error('L’ajout n’a pas pu être annulé. Réessayez.', {
				id: 'editor-feedback',
				duration: Infinity,
				important: true,
				action: undefined
			});
		} finally {
			busy = false;
		}
	};
</script>

<svelte:window
	onpointerdown={(event) => {
		if (menuOpen && event.target instanceof Node && !root.contains(event.target)) menuOpen = false;
	}}
	onkeydown={(event) => {
		if (event.key !== 'Escape') return;
		if (placing) stopPlacement();
		if (menuOpen) {
			menuOpen = false;
			trigger.focus();
		}
	}}
/>

<div class="relative" bind:this={root}>
	<ActionButton
		bind:ref={trigger}
		class="inline-flex size-9.5 cursor-pointer items-center justify-center rounded-lg border border-(--line) bg-transparent text-(--ink) hover:bg-[#eef1eb] disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-(--ring)"
		aria-label="Ajouter du texte ou un formulaire"
		aria-expanded={menuOpen}
		aria-controls="pdf-content-tools"
		disabled={busy}
		onclick={() => (menuOpen = !menuOpen)}><SquarePen size={18} /></ActionButton
	>
	{#if menuOpen}
		<div
			id="pdf-content-tools"
			class="absolute top-12 left-0 z-30 grid w-60 gap-1 rounded-xl border border-(--line) bg-(--paper) p-2 shadow-lg"
			role="group"
			aria-label="Créer du contenu PDF"
		>
			{#each tools as tool}
				<button
					type="button"
					class="flex min-h-10 cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-left text-xs font-bold text-(--ink) hover:bg-[#eef1eb] focus-visible:outline-3 focus-visible:outline-(--ring)"
					onclick={() => startPlacement(tool.kind)}
					><tool.icon size={17} class="text-(--accent)" />{tool.label}</button
				>
			{/each}
			<button
				type="button"
				class="mt-1 flex min-h-10 cursor-pointer items-center gap-3 rounded-lg border-t border-(--line) px-3 py-2 text-left text-xs font-bold text-(--ink) hover:bg-[#eef1eb] disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-3 focus-visible:outline-(--ring)"
				disabled={!undoSource || busy}
				onclick={undo}><Undo2 size={17} />Annuler le dernier ajout</button
			>
		</div>
	{/if}

	<dialog
		bind:this={dialog}
		aria-labelledby="content-dialog-title"
		class="m-auto w-[min(480px,calc(100vw-24px))] max-h-[calc(100dvh-24px)] overflow-y-auto rounded-xl border border-(--line) bg-(--paper) p-6 text-(--ink) shadow-xl backdrop:bg-[#17251c66] max-[520px]:p-4"
		oncancel={(event) => {
			if (busy) event.preventDefault();
		}}
		onclose={() => trigger?.focus()}
	>
		<form
			onsubmit={(event) => {
				event.preventDefault();
				void save();
			}}
		>
			<header class="mb-5 flex items-start justify-between gap-3">
				<div class="min-w-0">
					<p class="mb-1 text-[10px] font-extrabold tracking-widest text-(--accent)">
						{editing?.kind === 'placed-text'
							? 'TEXTE PDF'
							: editing
								? 'FORMULAIRE PDF'
								: `PAGE ${position?.page ?? ''}`}
					</p>
					<h2 id="content-dialog-title" class="text-lg font-bold wrap-break-word">{title}</h2>
				</div>
				<ActionButton
					class="grid size-8 shrink-0 cursor-pointer place-items-center rounded-md text-(--muted-ink) hover:bg-(--canvas) focus-visible:outline-3 focus-visible:outline-(--ring)"
					aria-label="Fermer la création de contenu"
					disabled={busy}
					onclick={() => dialog.close()}><X size={18} /></ActionButton
				>
			</header>
			{#if kind === 'text'}
				<label for="pdf-new-text" class="mb-2 block text-xs font-bold">
					{editing?.kind === 'placed-text' ? 'Texte' : 'Texte à ajouter'}
				</label>
				<textarea
					bind:this={firstInput}
					id="pdf-new-text"
					bind:value={text}
					rows="4"
					required
					disabled={busy}
					class="w-full resize-y rounded-lg border border-(--line) bg-white p-3 text-sm leading-6 focus-visible:outline-3 focus-visible:outline-(--ring)"
				></textarea>
				<p class="mt-2 text-xs leading-5 text-(--muted-ink)">
					{editing?.kind === 'placed-text'
						? 'Le texte reste sélectionnable dans le PDF exporté.'
						: 'Le texte sera sélectionnable dans le PDF exporté.'}
				</p>
			{:else}
				<label for="pdf-field-name" class="mb-2 block text-xs font-bold">Nom du champ</label>
				<input
					bind:this={nameInput}
					id="pdf-field-name"
					bind:value={name}
					required
					readonly={Boolean(editing)}
					disabled={busy}
					class="w-full rounded-lg border border-(--line) bg-white px-3 py-2 text-sm focus-visible:outline-3 focus-visible:outline-(--ring)"
				/>
				<p class="mt-2 text-xs leading-5 text-(--muted-ink)">
					Chaque champ porte un nom unique. Il restera remplissable après l’export.
				</p>
				{#if kind === 'checkbox'}
					<label class="mt-4 flex items-center gap-2 text-xs font-bold"
						><input
							type="checkbox"
							bind:checked
							disabled={busy}
							class="size-4 accent-(--accent) focus-visible:outline-3 focus-visible:outline-(--ring)"
						/>Case cochée</label
					>
				{:else}
					{#if kind === 'dropdown' || kind === 'radio'}
						<label for="pdf-field-options" class="mt-4 mb-2 block text-xs font-bold"
							>{kind === 'radio'
								? 'Choix du groupe, un par ligne'
								: 'Choix proposés, un par ligne'}</label
						>
						<textarea
							id="pdf-field-options"
							bind:value={optionsText}
							rows="3"
							required
							disabled={busy || (Boolean(editing) && kind === 'radio')}
							class="w-full resize-y rounded-lg border border-(--line) bg-white p-3 text-sm focus-visible:outline-3 focus-visible:outline-(--ring)"
						></textarea>
						{#if editing && kind === 'radio'}<p class="mt-2 text-xs leading-5 text-(--muted-ink)">
								Les choix d’un groupe radio ne peuvent pas être renommés après sa création.
							</p>{/if}
					{/if}
					<label for="pdf-field-value" class="mt-4 mb-2 block text-xs font-bold"
						>{editing ? 'Valeur du champ' : 'Valeur initiale (facultatif)'}</label
					>
					{#if kind === 'dropdown' || kind === 'radio'}
						<select
							id="pdf-field-value"
							bind:value
							disabled={busy}
							class="w-full rounded-lg border border-(--line) bg-white px-3 py-2 text-sm focus-visible:outline-3 focus-visible:outline-(--ring)"
							><option value="">Aucune sélection</option>{#each [...new Set(optionsText
										.split('\n')
										.map((option) => option.trim())
										.filter(Boolean))] as option}<option value={option}>{option}</option
								>{/each}</select
						>
					{:else}
						<textarea
							id="pdf-field-value"
							bind:value
							rows={multiline ? 3 : 1}
							disabled={busy}
							class="w-full resize-y rounded-lg border border-(--line) bg-white p-3 text-sm focus-visible:outline-3 focus-visible:outline-(--ring)"
						></textarea>
						<label class="mt-3 flex items-center gap-2 text-xs font-bold"
							><input
								type="checkbox"
								bind:checked={multiline}
								disabled={busy}
								class="size-4 accent-(--accent) focus-visible:outline-3 focus-visible:outline-(--ring)"
							/>Autoriser plusieurs lignes</label
						>
					{/if}
				{/if}
				<label class="mt-3 flex items-center gap-2 text-xs font-bold"
					><input
						type="checkbox"
						bind:checked={required}
						disabled={busy}
						class="size-4 accent-(--accent) focus-visible:outline-3 focus-visible:outline-(--ring)"
					/>Champ obligatoire</label
				>
			{/if}
			{#if !editing}
				<div class="mt-5 grid grid-cols-2 gap-3">
					<label class="grid gap-2 text-xs font-bold" for="pdf-content-width"
						>Largeur (pt)<input
							id="pdf-content-width"
							type="number"
							min="12"
							max="2000"
							bind:value={width}
							required
							disabled={busy}
							class="min-w-0 rounded-lg border border-(--line) bg-white px-3 py-2 text-sm focus-visible:outline-3 focus-visible:outline-(--ring)"
						/></label
					>
					<label class="grid gap-2 text-xs font-bold" for="pdf-content-height"
						>Hauteur (pt)<input
							id="pdf-content-height"
							type="number"
							min="12"
							max="2000"
							bind:value={height}
							required
							disabled={busy}
							class="min-w-0 rounded-lg border border-(--line) bg-white px-3 py-2 text-sm focus-visible:outline-3 focus-visible:outline-(--ring)"
						/></label
					>
					{#if kind !== 'checkbox'}<label
							class="grid gap-2 text-xs font-bold"
							for="pdf-content-size"
							>Taille du texte (pt)<input
								id="pdf-content-size"
								type="number"
								min="6"
								max="72"
								bind:value={fontSize}
								required
								disabled={busy}
								class="min-w-0 rounded-lg border border-(--line) bg-white px-3 py-2 text-sm focus-visible:outline-3 focus-visible:outline-(--ring)"
							/></label
						>{/if}
					{#if kind === 'text'}<label class="grid gap-2 text-xs font-bold" for="pdf-content-color"
							>Couleur<input
								id="pdf-content-color"
								type="color"
								bind:value={color}
								disabled={busy}
								class="h-10 w-full cursor-pointer rounded-lg border border-(--line) bg-white p-1 focus-visible:outline-3 focus-visible:outline-(--ring)"
							/></label
						>{/if}
				</div>
				<p class="mt-2 text-xs leading-5 text-(--muted-ink)">
					La zone est ajustée pour rester à l’intérieur de la page.
				</p>
			{/if}
			{#if error}<p
					role="alert"
					class="mt-4 rounded-lg bg-[#fff0e8] p-3 text-xs leading-5 font-bold text-[#8d3e27]"
				>
					{error}
				</p>{/if}
			<footer class="mt-6 flex flex-wrap justify-end gap-2 border-t border-(--line) pt-4">
				{#if editing}<button
						type="button"
						onclick={() => void remove()}
						disabled={busy}
						class="mr-auto min-h-10 cursor-pointer rounded-lg px-3 py-2 text-xs font-bold text-[#8d3e27] hover:bg-[#fff0e8] disabled:opacity-40 focus-visible:outline-3 focus-visible:outline-(--ring)"
						>{editing.kind === 'placed-text'
							? 'Supprimer le texte ajouté'
							: 'Supprimer le champ'}</button
					>{/if}
				<button
					type="button"
					onclick={() => dialog.close()}
					disabled={busy}
					class="min-h-10 cursor-pointer rounded-lg border border-(--line) px-4 py-2 text-xs font-bold disabled:opacity-40 focus-visible:outline-3 focus-visible:outline-(--ring)"
					>Annuler</button
				>
				<button
					type="submit"
					disabled={busy}
					class="min-h-10 cursor-pointer rounded-lg bg-(--accent) px-4 py-2 text-xs font-bold text-white hover:bg-(--accent-dark) disabled:cursor-wait disabled:opacity-40 focus-visible:outline-3 focus-visible:outline-(--ring)"
					>{busy
						? 'Enregistrement…'
						: editing
							? editing.kind === 'placed-text'
								? 'Enregistrer le texte'
								: 'Enregistrer le champ'
							: kind === 'text'
								? 'Ajouter le texte'
								: 'Créer le champ'}</button
				>
			</footer>
		</form>
	</dialog>
</div>
