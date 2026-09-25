<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { flip } from 'svelte/animate';
	import { cubicOut } from 'svelte/easing';
	import { goto } from '$app/navigation';
	import {
		ArrowLeft,
		ChevronDown,
		ChevronUp,
		Copy,
		Download,
		FilePlus2,
		FileText,
		Info,
		Menu,
		Minus,
		Plus,
		ScanText,
		Trash2,
		X
	} from 'lucide-svelte';
	import type { PDFDocument } from 'pdf-lib';
	import {
		TextLayer,
		type PDFDocumentProxy,
		type RenderTask
	} from 'pdfjs-dist/legacy/build/pdf.mjs';
	import 'pdfjs-dist/web/pdf_viewer.css';
	import { fileName, openedFile, processedFile, updatedFile } from '../../stores/FileStore';
	import { parse as parsePDFjs } from '@/utils/PDFjsHelper';
	import { save as savePDF } from '@/utils/PDFLibHelper';
	import { mergePDFs, duplicatePage, removePage, reorderPage } from '@/utils/PDFEdition';
	import { applyOcrToPdf, type OcrLanguage, type OcrProgress } from '@/utils/OCR';
	import * as ContextMenu from '$lib/components/ui/context-menu';

	let pages: number[] = [];
	let pageItems: { id: number; page: number }[] = [];
	let nextPageId = 0;
	let moveDuration = 300;
	let animatingReorder = false;
	const setPageIds = (ids: number[]) => {
		pageItems = ids.map((id, index) => ({ id, page: index + 1 }));
	};
	let pageCanvases: HTMLCanvasElement[] = [];
	let textLayers: HTMLDivElement[] = [];
	let pageElements: HTMLElement[] = [];
	let mergeInput: HTMLInputElement;
	let toolsButton: HTMLButtonElement;
	let infoButton: HTMLButtonElement;
	let infoDialog: HTMLDialogElement;
	let deleteDialog: HTMLDialogElement;
	let pageToDelete: number | null = null;
	let importedMetadata: {
		name: string;
		size: string;
		pages: number;
		version: string;
		title: string;
		author: string;
		subject: string;
		keywords: string;
		creator: string;
		producer: string;
		created: string;
		modified: string;
	} | null = null;
	let selectedPage = 1;
	let contextMenuPage: number | null = null;
	let draggedPage: number | null = null;
	let dropTargetPage: number | null = null;
	let scale = 1;
	let sidebarOpen = true;
	let toolsOpen = false;
	let ocrLanguage: OcrLanguage = 'fra';
	let ocrProgress = '';
	let busy = false;
	let dirty = false;
	let status = '';
	let error = '';
	let mounted = false;
	let refreshToken = 0;
	let activeRender: RenderTask | undefined;

	onMount(() => {
		if (!$processedFile || !$updatedFile || !$openedFile) {
			void goto('/');
			return;
		}
		void loadImportedMetadata($openedFile, $updatedFile, $processedFile);
		sidebarOpen = window.innerWidth > 760;
		const availableWidth =
			window.innerWidth - (sidebarOpen ? 222 : 0) - (window.innerWidth <= 760 ? 32 : 100);
		scale = Math.max(0.6, Math.min(1, Math.floor((availableWidth / 595) * 10) / 10));
		moveDuration = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 300;
		mounted = true;
		return () => {
			refreshToken++;
			activeRender?.cancel();
		};
	});

	const present = (value: string | undefined) => value?.trim() || 'Non renseigné';
	const formatDate = (value: Date | undefined) => {
		if (!value || Number.isNaN(value.getTime())) return 'Non renseignée';
		return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeStyle: 'short' }).format(
			value
		);
	};
	const formatSize = (bytes: number) => {
		const unit = bytes >= 1024 * 1024 ? 'Mo' : bytes >= 1024 ? 'Ko' : 'octets';
		const divisor = unit === 'Mo' ? 1024 * 1024 : unit === 'Ko' ? 1024 : 1;
		return `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(bytes / divisor)} ${unit}`;
	};
	const loadImportedMetadata = async (
		file: File,
		document: PDFDocument,
		viewer: PDFDocumentProxy
	) => {
		const original = {
			name: file.name,
			size: formatSize(file.size),
			pages: document.getPageCount(),
			version: 'Non renseignée',
			title: present(document.getTitle()),
			author: present(document.getAuthor()),
			subject: present(document.getSubject()),
			keywords: present(document.getKeywords()),
			creator: present(document.getCreator()),
			producer: present(document.getProducer()),
			created: formatDate(document.getCreationDate()),
			modified: formatDate(document.getModificationDate())
		};
		importedMetadata = original;
		try {
			const { info } = await viewer.getMetadata();
			const values = info as Record<string, unknown>;
			const fallback = (current: string, key: string) =>
				current === 'Non renseigné' && typeof values[key] === 'string'
					? present(values[key] as string)
					: current;
			importedMetadata = {
				...original,
				version:
					typeof values.PDFFormatVersion === 'string'
						? `PDF ${values.PDFFormatVersion}`
						: original.version,
				title: fallback(original.title, 'Title'),
				author: fallback(original.author, 'Author'),
				subject: fallback(original.subject, 'Subject'),
				keywords: fallback(original.keywords, 'Keywords'),
				creator: fallback(original.creator, 'Creator'),
				producer: fallback(original.producer, 'Producer')
			};
		} catch {
			// The file's basic properties remain available when its metadata dictionary is unreadable.
		}
	};
	const openInfo = () => {
		toolsOpen = false;
		if (!infoDialog.open) infoDialog.showModal();
	};
	$: metadataRows = importedMetadata
		? [
				{ label: 'Version', value: importedMetadata.version },
				{ label: 'Titre', value: importedMetadata.title },
				{ label: 'Auteur', value: importedMetadata.author },
				{ label: 'Sujet', value: importedMetadata.subject },
				{ label: 'Mots-clés', value: importedMetadata.keywords },
				{ label: 'Créé avec', value: importedMetadata.creator },
				{ label: 'Producteur', value: importedMetadata.producer },
				{ label: 'Date de création', value: importedMetadata.created },
				{ label: 'Dernière modification', value: importedMetadata.modified }
			]
		: [];

	$: if (mounted && $processedFile) void renderDocument($processedFile, scale, sidebarOpen);

	async function renderDocument(document: PDFDocumentProxy, zoom: number, showSidebar: boolean) {
		const token = ++refreshToken;
		activeRender?.cancel();
		activeRender = undefined;
		pages = Array.from({ length: document.numPages }, (_, index) => index + 1);
		if (pageItems.length !== document.numPages) setPageIds(pages.map(() => ++nextPageId));
		selectedPage = Math.min(selectedPage, pages.length);
		await tick();
		if (token !== refreshToken) return;
		for (const pageNumber of pages) {
			if (token !== refreshToken) return;
			try {
				const page = await document.getPage(pageNumber);
				if (token !== refreshToken) return;
				const thumbCanvas =
					window.document.querySelectorAll<HTMLCanvasElement>('.thumbnail-item canvas')[
						pageNumber - 1
					];
				const canvas = pageCanvases[pageNumber - 1];
				const layer = textLayers[pageNumber - 1];
				if (!canvas || !layer) continue;
				if (showSidebar && thumbCanvas) {
					const thumbnailViewport = page.getViewport({ scale: 0.2 });
					thumbCanvas.width = Math.round(thumbnailViewport.width);
					thumbCanvas.height = Math.round(thumbnailViewport.height);
					const thumbContext = thumbCanvas.getContext('2d');
					if (thumbContext) {
						const task = (activeRender = page.render({
							canvasContext: thumbContext,
							viewport: thumbnailViewport
						}));
						await task.promise;
						if (activeRender === task) activeRender = undefined;
						if (token !== refreshToken) return;
					}
				}

				const viewport = page.getViewport({ scale: zoom });
				const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
				canvas.width = Math.round(viewport.width * pixelRatio);
				canvas.height = Math.round(viewport.height * pixelRatio);
				canvas.style.width = `${viewport.width}px`;
				canvas.style.height = `${viewport.height}px`;
				const sheet = pageElements[pageNumber - 1];
				if (sheet) {
					sheet.style.width = `${viewport.width}px`;
					sheet.style.height = `${viewport.height}px`;
					sheet.style.setProperty('--scale-factor', String(zoom));
				}
				const context = canvas.getContext('2d');
				if (!context) continue;
				const task = (activeRender = page.render({
					canvasContext: context,
					viewport,
					transform: [pixelRatio, 0, 0, pixelRatio, 0, 0]
				}));
				await task.promise;
				if (activeRender === task) activeRender = undefined;
				if (token !== refreshToken) return;
				layer.replaceChildren();
				layer.style.width = `${viewport.width}px`;
				layer.style.height = `${viewport.height}px`;
				const textContent = await page.getTextContent();
				await new TextLayer({
					textContentSource: textContent,
					container: layer,
					viewport
				}).render();
			} catch {
				if (token === refreshToken) error = `La page ${pageNumber} n’a pas pu être affichée.`;
			}
		}
	}

	const goToPage = (pageNumber: number) => {
		selectedPage = pageNumber;
		pageElements[pageNumber - 1]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
		if (window.innerWidth <= 760) sidebarOpen = false;
	};

	const applyDocument = async (
		document: PDFDocument,
		updatedIds?: number[],
		animateMove = false
	) => {
		const bytes = await document.save();
		const preview = await parsePDFjs(new Blob([bytes], { type: 'application/pdf' }));
		if (updatedIds) {
			if (animateMove) {
				refreshToken++;
				activeRender?.cancel();
				animatingReorder = true;
			}
			setPageIds(updatedIds);
			await tick();
			if (animateMove && moveDuration)
				await new Promise<void>((resolve) => setTimeout(resolve, moveDuration));
			animatingReorder = false;
		}
		$updatedFile = document;
		$processedFile = preview;
		dirty = true;
	};

	const runAction = async (action: () => Promise<void>, success: string) => {
		if (busy) return;
		busy = true;
		error = '';
		status = '';
		try {
			await action();
			status = success;
		} catch {
			error = 'L’opération a échoué. Votre document reste ouvert.';
		} finally {
			busy = false;
		}
	};

	const duplicate = (pageNumber: number) =>
		void runAction(async () => {
			const next = await duplicatePage($updatedFile, pageNumber);
			const ids = pageItems.map(({ id }) => id);
			ids.splice(pageNumber, 0, ++nextPageId);
			await applyDocument(next, ids);
			selectedPage = pageNumber + 1;
		}, 'Page dupliquée. Pensez à exporter le PDF.');

	const remove = async (pageNumber: number) => {
		if (busy) return;
		if (pages.length <= 1) {
			error = 'Un PDF doit conserver au moins une page.';
			return;
		}
		pageToDelete = pageNumber;
		await tick();
		if (!deleteDialog.open) deleteDialog.showModal();
	};

	const confirmRemoval = () => {
		const pageNumber = pageToDelete;
		deleteDialog.close();
		pageToDelete = null;
		if (pageNumber === null) return;
		void runAction(async () => {
			const next = await removePage($updatedFile, pageNumber);
			const ids = pageItems.map(({ id }) => id);
			ids.splice(pageNumber - 1, 1);
			await applyDocument(next, ids);
			selectedPage = Math.min(pageNumber, next.getPageCount());
		}, 'Page supprimée. Pensez à exporter le PDF.');
	};

	const reorder = (fromPage: number, toPage: number) => {
		if (
			busy ||
			fromPage === toPage ||
			fromPage < 1 ||
			toPage < 1 ||
			fromPage > pages.length ||
			toPage > pages.length
		)
			return;
		void runAction(async () => {
			const next = await reorderPage($updatedFile, fromPage, toPage);
			const ids = pageItems.map(({ id }) => id);
			const [moved] = ids.splice(fromPage - 1, 1);
			ids.splice(toPage - 1, 0, moved);
			await applyDocument(next, ids, true);
			selectedPage = toPage;
		}, 'Ordre des pages modifié. Pensez à exporter le PDF.');
	};
	const move = (pageNumber: number, direction: -1 | 1) =>
		reorder(pageNumber, pageNumber + direction);

	const startPageDrag = (event: DragEvent, pageNumber: number) => {
		if (busy) {
			event.preventDefault();
			return;
		}
		draggedPage = pageNumber;
		if (event.dataTransfer) {
			event.dataTransfer.effectAllowed = 'move';
			event.dataTransfer.setData('text/plain', String(pageNumber));
		}
	};
	const overPage = (event: DragEvent, pageNumber: number) => {
		if (draggedPage === null || draggedPage === pageNumber) return;
		event.preventDefault();
		if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
		dropTargetPage = pageNumber;
	};
	const dropPage = (event: DragEvent, pageNumber: number) => {
		if (draggedPage === null) return;
		event.preventDefault();
		const fromPage = draggedPage;
		draggedPage = null;
		dropTargetPage = null;
		reorder(fromPage, pageNumber);
	};
	const endPageDrag = () => {
		draggedPage = null;
		dropTargetPage = null;
	};

	const merge = (event: Event) => {
		const file = (event.currentTarget as HTMLInputElement).files?.[0];
		if (!file) return;
		void runAction(async () => {
			const next = await mergePDFs($updatedFile, file);
			const ids = pageItems.map(({ id }) => id);
			while (ids.length < next.getPageCount()) ids.push(++nextPageId);
			await applyDocument(next, ids);
		}, 'Document ajouté. Pensez à exporter le PDF.');
		mergeInput.value = '';
	};

	const save = () =>
		void runAction(async () => {
			await savePDF();
			dirty = false;
		}, 'PDF exporté dans vos téléchargements.');
	const describeOcrProgress = (progress: OcrProgress) => {
		switch (progress.phase) {
			case 'checking':
				return `Analyse du texte existant · page ${progress.page}/${progress.total}`;
			case 'loading':
				return `Chargement du moteur OCR · ${progress.percent} %`;
			case 'recognizing':
				return `Reconnaissance · page ${progress.page}/${progress.total} · ${progress.percent} %`;
			case 'saving':
				return 'Création du texte sélectionnable…';
		}
	};
	const ocr = async () => {
		if (busy) return;
		toolsOpen = false;
		busy = true;
		error = '';
		status = '';
		ocrProgress = 'Analyse du document…';
		try {
			const result = await applyOcrToPdf($updatedFile, $processedFile, ocrLanguage, (progress) => {
				ocrProgress = describeOcrProgress(progress);
			});
			if (result.wordsAdded) {
				await applyDocument(result.document);
				status = `Texte ajouté à ${result.pagesUpdated} ${result.pagesUpdated === 1 ? 'page' : 'pages'}. Exportez le PDF pour le conserver.`;
			} else if (result.pagesProcessed) {
				status = 'Aucun texte reconnu sur les pages sans texte.';
			} else {
				status = 'Toutes les pages contiennent déjà du texte sélectionnable.';
			}
		} catch {
			error =
				'L’OCR a échoué. Vérifiez votre connexion lors du premier téléchargement du modèle de langue, puis réessayez.';
		} finally {
			ocrProgress = '';
			busy = false;
		}
	};
	const back = () => {
		if (busy) return;
		if (
			!dirty ||
			window.confirm('Les modifications non exportées seront perdues. Revenir à l’accueil ?')
		)
			void goto('/');
	};
	const setZoom = (change: number) => {
		scale = Math.max(0.6, Math.min(1.6, Math.round((scale + change) * 10) / 10));
	};
</script>

<svelte:window
	on:keydown={(event) => {
		if (event.key === 'Escape' && toolsOpen) {
			toolsOpen = false;
			toolsButton?.focus();
		}
	}}
/>

<svelte:head><title>{$fileName || 'Document'} — Inscribe</title></svelte:head>

<div class="editor-shell">
	<header class="editor-header">
		<div class="editor-identity">
			<button
				class="icon-button back-button"
				type="button"
				on:click={back}
				disabled={busy}
				aria-label="Retour à l’accueil"
				title="Retour à l’accueil"><ArrowLeft size={19} /></button
			>
			<span class="brand-mark compact">i<span>.</span></span>
			<div class="document-identity">
				<strong title={$fileName}>{$fileName || 'Document sans titre'}</strong><small
					>{dirty ? 'Modifications non exportées' : 'Document ouvert'}</small
				>
			</div>
		</div>
		<div class="editor-actions">
			<input
				bind:this={mergeInput}
				type="file"
				accept=".pdf,application/pdf"
				class="visually-hidden"
				on:change={merge}
				aria-label="Choisir un PDF à ajouter"
			/>
			<button
				class="toolbar-button merge-button"
				type="button"
				on:click={() => mergeInput.click()}
				disabled={busy}
				aria-label="Ajouter un PDF"><FilePlus2 size={18} /> <span>Ajouter un PDF</span></button
			>
			<button
				bind:this={infoButton}
				class="icon-button info-button"
				type="button"
				on:click={openInfo}
				aria-label="Informations sur le PDF"
				aria-haspopup="dialog"
				title="Informations sur le PDF"><Info size={20} strokeWidth={1.8} /></button
			>
			<div class="tools-wrap">
				<button
					bind:this={toolsButton}
					class="icon-button tools-button"
					type="button"
					on:click={() => (toolsOpen = !toolsOpen)}
					aria-label="Autres outils"
					aria-haspopup="true"
					aria-expanded={toolsOpen}
					title="Autres outils"><Menu size={20} /></button
				>{#if toolsOpen}<div
						class="tools-popover"
						role="group"
						aria-label="Reconnaissance de texte"
					>
						<strong><ScanText size={17} /> Reconnaître le texte</strong>
						<p>Ajoute du texte sélectionnable aux pages qui n’en contiennent pas.</p>
						<label for="ocr-language">Langue du document</label>
						<select id="ocr-language" bind:value={ocrLanguage} disabled={busy}>
							<option value="fra">Français</option>
							<option value="eng">Anglais</option>
							<option value="eng+fra">Français et anglais</option>
						</select>
						<small
							>Le modèle de langue est téléchargé au premier lancement. Le PDF reste sur cet
							appareil.</small
						>
						<button class="ocr-start" type="button" on:click={ocr} disabled={busy}
							>Lancer l’OCR</button
						>
					</div>{/if}
			</div>
			<button
				class="export-button"
				type="button"
				on:click={save}
				disabled={busy}
				aria-label="Exporter le PDF"><Download size={18} /><span>Exporter le PDF</span></button
			>
		</div>
	</header>
	<dialog
		bind:this={infoDialog}
		class="pdf-info-dialog"
		aria-labelledby="pdf-info-title"
		on:close={() => infoButton?.focus()}
	>
		<div class="pdf-info-header">
			<div class="pdf-info-heading">
				<span class="pdf-info-mark"><Info size={20} strokeWidth={1.8} /></span>
				<div>
					<span class="section-index">DOCUMENT IMPORTÉ</span>
					<h2 id="pdf-info-title">Informations sur le PDF</h2>
				</div>
			</div>
			<button
				class="icon-button"
				type="button"
				on:click={() => infoDialog.close()}
				aria-label="Fermer les informations"><X size={18} /></button
			>
		</div>
		{#if importedMetadata}
			<div class="pdf-info-file">
				<FileText size={22} strokeWidth={1.7} />
				<div>
					<strong>{importedMetadata.name}</strong>
					<span
						>{importedMetadata.size} · {importedMetadata.pages}
						{importedMetadata.pages === 1 ? 'page' : 'pages'}</span
					>
				</div>
			</div>
			<dl class="pdf-metadata-list">
				{#each metadataRows as row}
					<div>
						<dt>{row.label}</dt>
						<dd>{row.value}</dd>
					</div>
				{/each}
			</dl>
		{:else}
			<p class="pdf-info-loading">Lecture des métadonnées…</p>
		{/if}
	</dialog>
	<dialog
		bind:this={deleteDialog}
		class="pdf-info-dialog delete-confirm-dialog"
		aria-labelledby="delete-page-title"
		on:close={() => (pageToDelete = null)}
	>
		<div class="delete-confirm-body">
			<span class="delete-confirm-icon"><Trash2 size={21} strokeWidth={1.8} /></span>
			<h2 id="delete-page-title">Supprimer la page {pageToDelete} ?</h2>
			<p>
				Cette page sera retirée du PDF en cours. Vous pourrez conserver le résultat en l’exportant.
			</p>
		</div>
		<div class="delete-confirm-actions">
			<button type="button" class="toolbar-button" on:click={() => deleteDialog.close()}
				>Annuler</button
			>
			<button type="button" class="delete-confirm-button" on:click={confirmRemoval}
				>Supprimer la page</button
			>
		</div>
	</dialog>
	<div class="editor-subbar">
		<div class="subbar-left">
			<button
				class="icon-button sidebar-toggle"
				type="button"
				on:click={() => (sidebarOpen = !sidebarOpen)}
				aria-label={sidebarOpen ? 'Masquer les pages' : 'Afficher les pages'}
				aria-expanded={sidebarOpen}><Menu size={18} /></button
			><span class="subbar-label">ÉDITION DU DOCUMENT</span><span class="subbar-divider"
			></span><span>{pages.length} {pages.length === 1 ? 'page' : 'pages'}</span>
		</div>
		<div class="zoom-controls">
			<button
				class="icon-button"
				type="button"
				on:click={() => setZoom(-0.1)}
				aria-label="Réduire le zoom"
				disabled={scale <= 0.6}><Minus size={17} /></button
			><span aria-live="polite">{Math.round(scale * 100)} %</span><button
				class="icon-button"
				type="button"
				on:click={() => setZoom(0.1)}
				aria-label="Augmenter le zoom"
				disabled={scale >= 1.6}><Plus size={17} /></button
			>
		</div>
	</div>
	{#if error || status || ocrProgress}<div
			class:error
			class="editor-notice"
			role={error ? 'alert' : 'status'}
		>
			{error || ocrProgress || status}<button
				type="button"
				on:click={() => {
					error = '';
					status = '';
				}}
				disabled={busy}
				aria-label="Fermer le message"><X size={16} /></button
			>
		</div>{/if}
	<div class="editor-body">
		{#if sidebarOpen}<aside class="page-sidebar" aria-label="Pages du document">
				<div class="sidebar-heading">
					<span>PAGES</span><span>{String(pages.length).padStart(2, '0')}</span>
				</div>
				<ContextMenu.Root>
					<ContextMenu.Trigger class="thumbnail-list">
						{#each pageItems as { id, page } (id)}<button
								animate:flip={{ duration: animatingReorder ? moveDuration : 0, easing: cubicOut }}
								class:active={selectedPage === page}
								class:dragging={draggedPage === page}
								class:drop-before={dropTargetPage === page &&
									draggedPage !== null &&
									draggedPage > page}
								class:drop-after={dropTargetPage === page &&
									draggedPage !== null &&
									draggedPage < page}
								class="thumbnail-item"
								type="button"
								draggable={!busy}
								on:dragstart={(event) => startPageDrag(event, page)}
								on:dragover={(event) => overPage(event, page)}
								on:drop={(event) => dropPage(event, page)}
								on:dragend={endPageDrag}
								on:click={() => goToPage(page)}
								on:contextmenu={() => (contextMenuPage = page)}
								aria-label={`Aller à la page ${page}`}
								aria-describedby="page-reorder-hint"
								aria-current={selectedPage === page ? 'page' : undefined}
								><span class="thumbnail-paper"><canvas></canvas></span><span
									class="thumbnail-caption"
									><span>{String(page).padStart(2, '0')}</span><span>Page {page}</span></span
								></button
							>{/each}
					</ContextMenu.Trigger>
					<ContextMenu.Content class="page-context-menu">
						<ContextMenu.Item
							on:click={() => contextMenuPage !== null && move(contextMenuPage, -1)}
							disabled={busy || contextMenuPage === null || contextMenuPage === 1}
							><ChevronUp size={16} /> Monter la page</ContextMenu.Item
						>
						<ContextMenu.Item
							on:click={() => contextMenuPage !== null && move(contextMenuPage, 1)}
							disabled={busy || contextMenuPage === null || contextMenuPage === pages.length}
							><ChevronDown size={16} /> Descendre la page</ContextMenu.Item
						>
						<ContextMenu.Separator />
						<ContextMenu.Item
							on:click={() => contextMenuPage !== null && duplicate(contextMenuPage)}
							disabled={busy || contextMenuPage === null}
							><Copy size={16} /> Dupliquer la page</ContextMenu.Item
						>
						<ContextMenu.Item
							on:click={() => contextMenuPage !== null && remove(contextMenuPage)}
							disabled={busy || contextMenuPage === null || pages.length <= 1}
							class="context-danger"><Trash2 size={16} /> Supprimer la page</ContextMenu.Item
						>
					</ContextMenu.Content>
				</ContextMenu.Root>
				<div class="sidebar-footer" id="page-reorder-hint">
					<FileText size={15} /><span class="desktop-hint"
						>Glissez pour réordonner · clic droit pour les actions</span
					><span class="touch-hint">Utilisez les flèches sous chaque page</span>
				</div>
			</aside>{/if}
		<main class="document-stage" aria-label="Aperçu du document">
			<div class="stage-inner">
				<div class="stage-heading">
					<span>APERÇU DU DOCUMENT</span><span>Page {selectedPage} sur {pages.length}</span>
				</div>
				{#each pages as page (page)}<section class="page-section" aria-label={`Page ${page}`}>
						<div class="pdf-sheet" bind:this={pageElements[page - 1]}>
							<canvas bind:this={pageCanvases[page - 1]}></canvas>
							<div bind:this={textLayers[page - 1]} class="textLayer"></div>
						</div>
						<div class="page-actions">
							<span>PAGE {String(page).padStart(2, '0')}</span>
							<div>
								<button
									type="button"
									on:click={() => move(page, -1)}
									disabled={busy || page === 1}
									aria-label={`Déplacer la page ${page} vers le haut`}
									title="Monter"><ChevronUp size={17} /></button
								><button
									type="button"
									on:click={() => move(page, 1)}
									disabled={busy || page === pages.length}
									aria-label={`Déplacer la page ${page} vers le bas`}
									title="Descendre"><ChevronDown size={17} /></button
								><button
									type="button"
									on:click={() => duplicate(page)}
									disabled={busy}
									aria-label={`Dupliquer la page ${page}`}
									title="Dupliquer"><Copy size={17} /></button
								><button
									type="button"
									class="danger-action"
									on:click={() => remove(page)}
									disabled={busy || pages.length <= 1}
									aria-label={`Supprimer la page ${page}`}
									title="Supprimer"><Trash2 size={17} /></button
								>
							</div>
						</div>
					</section>{/each}
			</div>
		</main>
	</div>
</div>
