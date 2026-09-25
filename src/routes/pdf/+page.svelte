<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { goto } from '$app/navigation';
	import {
		ArrowLeft,
		ChevronDown,
		ChevronUp,
		Copy,
		Download,
		FilePlus2,
		FileText,
		Menu,
		Minus,
		Plus,
		ScanText,
		Trash2,
		X
	} from 'lucide-svelte';
	import { PDFDocument } from 'pdf-lib';
	import { TextLayer, type PDFDocumentProxy } from 'pdfjs-dist/legacy/build/pdf.mjs';
	import 'pdfjs-dist/web/pdf_viewer.css';
	import { fileName, processedFile, updatedFile } from '../../stores/FileStore';
	import { load as loadPDFjs } from '@/utils/PDFjsHelper';
	import { save as savePDF } from '@/utils/PDFLibHelper';
	import { openAndMergePDFs, duplicatePage } from '@/utils/PDFEdition';
	import { applyOcrToPdf, type OcrLanguage, type OcrProgress } from '@/utils/OCR';

	let pages: number[] = [];
	let thumbnails: HTMLCanvasElement[] = [];
	let pageCanvases: HTMLCanvasElement[] = [];
	let textLayers: HTMLDivElement[] = [];
	let pageElements: HTMLElement[] = [];
	let mergeInput: HTMLInputElement;
	let toolsButton: HTMLButtonElement;
	let selectedPage = 1;
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

	onMount(() => {
		if (!$processedFile || !$updatedFile) {
			void goto('/');
			return;
		}
		sidebarOpen = window.innerWidth > 760;
		const availableWidth =
			window.innerWidth - (sidebarOpen ? 222 : 0) - (window.innerWidth <= 760 ? 32 : 100);
		scale = Math.max(0.6, Math.min(1, Math.floor((availableWidth / 595) * 10) / 10));
		mounted = true;
		return () => {
			refreshToken++;
		};
	});

	$: if (mounted && $processedFile) void renderDocument($processedFile, scale, sidebarOpen);

	async function renderDocument(document: PDFDocumentProxy, zoom: number, showSidebar: boolean) {
		const token = ++refreshToken;
		pages = Array.from({ length: document.numPages }, (_, index) => index + 1);
		selectedPage = Math.min(selectedPage, pages.length);
		await tick();
		if (token !== refreshToken) return;
		for (const pageNumber of pages) {
			if (token !== refreshToken) return;
			try {
				const page = await document.getPage(pageNumber);
				const thumbCanvas = thumbnails[pageNumber - 1];
				const canvas = pageCanvases[pageNumber - 1];
				const layer = textLayers[pageNumber - 1];
				if (!canvas || !layer) continue;
				if (showSidebar && thumbCanvas) {
					const thumbnailViewport = page.getViewport({ scale: 0.2 });
					thumbCanvas.width = Math.round(thumbnailViewport.width);
					thumbCanvas.height = Math.round(thumbnailViewport.height);
					const thumbContext = thumbCanvas.getContext('2d');
					if (thumbContext)
						await page.render({ canvasContext: thumbContext, viewport: thumbnailViewport }).promise;
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
				await page.render({
					canvasContext: context,
					viewport,
					transform: [pixelRatio, 0, 0, pixelRatio, 0, 0]
				}).promise;
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
				error = `La page ${pageNumber} n’a pas pu être affichée.`;
			}
		}
	}

	const goToPage = (pageNumber: number) => {
		selectedPage = pageNumber;
		pageElements[pageNumber - 1]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
		if (window.innerWidth <= 760) sidebarOpen = false;
	};

	const syncPdf = async () => {
		const bytes = await $updatedFile.save();
		await loadPDFjs(new Blob([bytes], { type: 'application/pdf' }));
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
			$updatedFile = await duplicatePage(pageNumber);
			selectedPage = pageNumber + 1;
			await syncPdf();
		}, 'Page dupliquée. Pensez à exporter le PDF.');

	const remove = (pageNumber: number) => {
		if (pages.length <= 1) {
			error = 'Un PDF doit conserver au moins une page.';
			return;
		}
		if (!window.confirm(`Supprimer la page ${pageNumber} ?`)) return;
		void runAction(async () => {
			$updatedFile.removePage(pageNumber - 1);
			selectedPage = Math.min(pageNumber, pages.length - 1);
			await syncPdf();
		}, 'Page supprimée. Pensez à exporter le PDF.');
	};

	const move = (pageNumber: number, direction: -1 | 1) => {
		const target = pageNumber - 1 + direction;
		if (target < 0 || target >= pages.length) return;
		void runAction(async () => {
			const source = $updatedFile;
			const order = source.getPageIndices();
			[order[pageNumber - 1], order[target]] = [order[target], order[pageNumber - 1]];
			const reordered = await PDFDocument.create();
			for (const page of await reordered.copyPages(source, order)) reordered.addPage(page);
			$updatedFile = reordered;
			selectedPage = target + 1;
			await syncPdf();
		}, 'Ordre des pages modifié. Pensez à exporter le PDF.');
	};

	const merge = (event: Event) => {
		const file = (event.currentTarget as HTMLInputElement).files?.[0];
		if (!file) return;
		void runAction(async () => {
			$updatedFile = await openAndMergePDFs(file);
			await syncPdf();
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
				$updatedFile = result.document;
				await syncPdf();
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
				<div class="thumbnail-list">
					{#each pages as page (page)}<button
							class:active={selectedPage === page}
							class="thumbnail-item"
							type="button"
							on:click={() => goToPage(page)}
							aria-label={`Aller à la page ${page}`}
							aria-current={selectedPage === page ? 'page' : undefined}
							><span class="thumbnail-paper"
								><canvas bind:this={thumbnails[page - 1]}></canvas></span
							><span class="thumbnail-caption"
								><span>{String(page).padStart(2, '0')}</span><span>Page {page}</span></span
							></button
						>{/each}
				</div>
				<div class="sidebar-footer"><FileText size={15} /> Glissez le contenu pour lire</div>
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
