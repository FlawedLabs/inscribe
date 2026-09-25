<script lang="ts">
	import { untrack } from 'svelte';

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
		Highlighter,
		Info,
		Menu,
		Minus,
		MessageSquarePlus,
		MessageSquareText,
		Plus,
		ScanText,
		Trash2,
		X
	} from '@lucide/svelte';
	import type { PDFDocument } from 'pdf-lib';
	import {
		TextLayer,
		type PDFDocumentProxy,
		type RenderTask
	} from 'pdfjs-dist/legacy/build/pdf.mjs';
	import 'pdfjs-dist/web/pdf_viewer.css';
	import { fileSession } from '../../stores/FileStore.svelte';
	import { parse as parsePDFjs } from '#lib/utils/PDFjsHelper.js';
	import { save as savePDF } from '#lib/utils/PDFLibHelper.js';
	import { mergePDFs, duplicatePage, removePage, reorderPage } from '#lib/utils/PDFEdition.js';
	import { addNote, listNotes, removeNote, updateNote, type PDFNote } from '#lib/utils/PDFNotes.js';
	import {
		addHighlight,
		listHighlights,
		removeHighlight,
		type PDFHighlight,
		type PDFQuad
	} from '#lib/utils/PDFHighlights.js';
	import ColorWheel from '#lib/components/ColorWheel.svelte';
	import { applyOcrToPdf, type OcrLanguage, type OcrProgress } from '#lib/utils/OCR.js';
	import { ContextMenu } from 'bits-ui';

	let pages: number[] = $state([]);
	let pageItems: { id: number; page: number }[] = $state([]);
	let nextPageId = 0;
	let moveDuration = $state(300);
	let animatingReorder = $state(false);
	const setPageIds = (ids: number[]) => {
		pageItems = ids.map((id, index) => ({ id, page: index + 1 }));
	};
	const pageSection = (pageNumber: number) =>
		window.document.querySelectorAll<HTMLElement>('.page-section')[pageNumber - 1];
	let mergeInput: HTMLInputElement = $state(null!);
	let toolsButton: HTMLButtonElement = $state(null!);
	let infoButton: HTMLButtonElement = $state(null!);
	let infoDialog: HTMLDialogElement = $state(null!);
	let deleteDialog: HTMLDialogElement = $state(null!);
	let pageToDelete: number | null = $state(null);
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
	} | null = $state(null);
	let selectedPage = $state(1);
	let contextMenuPage: number | null = $state(null);
	let draggedPage: number | null = $state(null);
	let dropTargetPage: number | null = $state(null);
	let scale = $state(1);
	const minZoom = 0.6;
	const maxZoom = 2.4;
	let documentStage: HTMLElement = $state(null!);
	let pinchFactor = $state(1);
	type ZoomAnchor = { page: number; x: number; y: number; clientX: number; clientY: number };
	let pinch: {
		distance: number;
		startScale: number;
		currentScale: number;
		anchor: ZoomAnchor;
	} | null = $state(null);
	let pendingZoomAnchor: ZoomAnchor | null = $state(null);
	let sidebarOpen = $state(true);
	let toolsOpen = $state(false);
	let ocrLanguage: OcrLanguage = $state('fra');
	let ocrProgress = $state('');
	let busy = $state(false);
	let dirty = $state(false);
	let status = $state('');
	let error = $state('');
	let mounted = $state(false);
	let refreshToken = 0;
	let activeRender: RenderTask | undefined;
	let layoutReadyToken = 0;
	let renderedPages = $state(new Set<number>());
	let renderedThumbnails = new Set<number>();
	let renderLoopActive = false;
	let renderAgain = false;
	let scrollFrame = 0;
	let notes: PDFNote[] = $state([]);
	let noteMarkers: { id: string; page: number; text: string; left: number; top: number }[] = $state(
		[]
	);
	let noteMode = $state(false);
	let noteModeButton: HTMLButtonElement = $state(null!);
	let noteDialog: HTMLDialogElement = $state(null!);
	let noteTextArea: HTMLTextAreaElement = $state(null!);
	let noteText = $state('');
	let editingNote: PDFNote | null = $state(null);
	let pendingNote: { page: number; x: number; y: number } | null = $state(null);
	let noteTrigger: HTMLElement | null = $state(null);
	const highlightColors = [
		{ name: 'Jaune', value: '#f6d76b' },
		{ name: 'Menthe', value: '#a9ddac' },
		{ name: 'Rose', value: '#f0afc4' }
	];
	let highlights: PDFHighlight[] = [];
	let highlightRects: {
		id: string;
		page: number;
		color: string;
		left: number;
		top: number;
		width: number;
		height: number;
	}[] = $state([]);
	let selectedText: { page: number; text: string; quads: PDFQuad[] } | null = $state(null);
	let customColor = $state('#c96a42');
	let colorWheelOpen = $state(false);
	let selectionToken = 0;
	let lastHighlightId: string | null = $state(null);

	onMount(() => {
		if (!fileSession.processedFile || !fileSession.updatedFile || !fileSession.openedFile) {
			void goto('/');
			return;
		}
		void loadImportedMetadata(
			fileSession.openedFile,
			fileSession.updatedFile,
			fileSession.processedFile
		);
		notes = listNotes(fileSession.updatedFile);
		highlights = listHighlights(fileSession.updatedFile);
		sidebarOpen = window.innerWidth > 760;
		const availableWidth =
			window.innerWidth - (sidebarOpen ? 222 : 0) - (window.innerWidth <= 760 ? 32 : 100);
		scale = Math.max(0.6, Math.min(1, Math.floor((availableWidth / 595) * 10) / 10));
		moveDuration = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 300;
		const closeSidebarOnMobile = () => {
			if (window.innerWidth <= 760) sidebarOpen = false;
		};
		window.addEventListener('resize', closeSidebarOnMobile);
		mounted = true;
		return () => {
			window.removeEventListener('resize', closeSidebarOnMobile);
			cancelAnimationFrame(scrollFrame);
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

	async function renderDocument(document: PDFDocumentProxy, zoom: number) {
		const token = ++refreshToken;
		layoutReadyToken = 0;
		activeRender?.cancel();
		activeRender = undefined;
		renderedPages = new Set();
		renderedThumbnails = new Set();
		for (const canvas of window.document.querySelectorAll<HTMLCanvasElement>(
			'.pdf-sheet canvas, .thumbnail-item canvas'
		)) {
			canvas.width = 0;
			canvas.height = 0;
		}
		pages = Array.from({ length: document.numPages }, (_, index) => index + 1);
		noteMarkers = [];
		highlightRects = [];
		if (pageItems.length !== document.numPages) setPageIds(pages.map(() => ++nextPageId));
		selectedPage = Math.min(selectedPage, pages.length);
		await tick();
		if (token !== refreshToken) return;
		for (const pageNumber of pages) {
			if (token !== refreshToken) return;
			try {
				const page = await document.getPage(pageNumber);
				if (token !== refreshToken) return;
				const sheet = pageSection(pageNumber)?.querySelector<HTMLElement>('.pdf-sheet');
				const canvas = sheet?.querySelector<HTMLCanvasElement>('canvas');
				const layer = sheet?.querySelector<HTMLDivElement>('.textLayer');
				if (!canvas || !layer) continue;
				canvas.width = 0;
				canvas.height = 0;

				const viewport = page.getViewport({ scale: zoom });
				noteMarkers = [
					...noteMarkers.filter((note) => note.page !== pageNumber),
					...notes
						.filter((note) => note.page === pageNumber)
						.map((note) => {
							const [left, top] = viewport.convertToViewportPoint(note.x, note.y + 24);
							return { id: note.id, page: pageNumber, text: note.text, left, top };
						})
				];
				highlightRects = [
					...highlightRects.filter((item) => item.page !== pageNumber),
					...highlights
						.filter((item) => item.page === pageNumber)
						.flatMap((item) =>
							item.quads.map((quad) => {
								const points = [0, 2, 4, 6].map((index) =>
									viewport.convertToViewportPoint(quad[index], quad[index + 1])
								);
								const xs = points.map(([x]) => x);
								const ys = points.map(([, y]) => y);
								const left = Math.min(...xs);
								const top = Math.min(...ys);
								return {
									id: item.id,
									page: pageNumber,
									color: item.color,
									left,
									top,
									width: Math.max(...xs) - left,
									height: Math.max(...ys) - top
								};
							})
						)
				];
				canvas.style.width = `${viewport.width}px`;
				canvas.style.height = `${viewport.height}px`;
				layer.replaceChildren();
				layer.style.width = `${viewport.width}px`;
				layer.style.height = `${viewport.height}px`;
				if (sheet) {
					sheet.style.width = `${viewport.width}px`;
					sheet.style.height = `${viewport.height}px`;
					sheet.style.setProperty('--scale-factor', String(zoom));
					sheet.style.setProperty('--total-scale-factor', String(zoom * page.userUnit));
					if (pendingZoomAnchor?.page === pageNumber) {
						const anchor = pendingZoomAnchor;
						pinchFactor = 1;
						await tick();
						const bounds = sheet.getBoundingClientRect();
						documentStage.scrollLeft += bounds.left + bounds.width * anchor.x - anchor.clientX;
						documentStage.scrollTop += bounds.top + bounds.height * anchor.y - anchor.clientY;
						pendingZoomAnchor = null;
					}
				}
			} catch {
				if (token === refreshToken) error = `La page ${pageNumber} n’a pas pu être affichée.`;
			}
		}
		if (token !== refreshToken) return;
		layoutReadyToken = token;
		void renderVisiblePages();
	}

	const scheduleVisibleRender = () => {
		cancelAnimationFrame(scrollFrame);
		scrollFrame = requestAnimationFrame(() => void renderVisiblePages());
	};
	const visiblePageNumbers = () => {
		if (!documentStage) return [];
		const viewport = documentStage.getBoundingClientRect();
		const margin = viewport.height * 0.6;
		return pages.filter((number) => {
			const bounds = pageSection(number)?.getBoundingClientRect();
			return (
				bounds && bounds.bottom >= viewport.top - margin && bounds.top <= viewport.bottom + margin
			);
		});
	};
	const visibleThumbnailNumbers = () => {
		const list = window.document.querySelector<HTMLElement>('.thumbnail-list');
		if (!list) return [];
		const viewport = list.getBoundingClientRect();
		const items = list.querySelectorAll<HTMLElement>('.thumbnail-item');
		return pages.filter((number) => {
			const bounds = items[number - 1]?.getBoundingClientRect();
			return bounds && bounds.bottom >= viewport.top - 250 && bounds.top <= viewport.bottom + 250;
		});
	};
	const releasePageCanvas = (number: number, document: PDFDocumentProxy) => {
		const sheet = pageSection(number)?.querySelector<HTMLElement>('.pdf-sheet');
		const canvas = sheet?.querySelector<HTMLCanvasElement>('canvas');
		const layer = sheet?.querySelector<HTMLElement>('.textLayer');
		if (canvas) {
			canvas.width = 0;
			canvas.height = 0;
		}
		layer?.replaceChildren();
		void document
			.getPage(number)
			.then((page) => page.cleanup())
			.catch(() => undefined);
	};
	const renderVisiblePages = async () => {
		if (renderLoopActive) {
			renderAgain = true;
			return;
		}
		renderLoopActive = true;
		try {
			do {
				renderAgain = false;
				const token = refreshToken;
				if (layoutReadyToken !== token || !documentStage || !fileSession.processedFile) break;
				const document = fileSession.processedFile;
				const zoom = scale;
				const wanted = visiblePageNumbers();
				for (const number of renderedPages) {
					if (wanted.includes(number)) continue;
					releasePageCanvas(number, document);
					renderedPages.delete(number);
				}
				renderedPages = new Set(renderedPages);
				for (const number of wanted) {
					if (token !== refreshToken || renderAgain) break;
					if (renderedPages.has(number)) continue;
					const sheet = pageSection(number)?.querySelector<HTMLElement>('.pdf-sheet');
					const canvas = sheet?.querySelector<HTMLCanvasElement>('canvas');
					const layer = sheet?.querySelector<HTMLDivElement>('.textLayer');
					if (!canvas || !layer) continue;
					try {
						const page = await document.getPage(number);
						if (token !== refreshToken) break;
						const viewport = page.getViewport({ scale: zoom });
						const pixelRatio = Math.min(window.devicePixelRatio || 1, 2, maxZoom / zoom);
						canvas.width = Math.round(viewport.width * pixelRatio);
						canvas.height = Math.round(viewport.height * pixelRatio);
						const task = (activeRender = page.render({
							canvas,
							viewport,
							transform: [pixelRatio, 0, 0, pixelRatio, 0, 0]
						}));
						await task.promise;
						if (activeRender === task) activeRender = undefined;
						if (token !== refreshToken) break;
						const textContent = await page.getTextContent();
						if (token !== refreshToken) break;
						layer.replaceChildren();
						await new TextLayer({
							textContentSource: textContent,
							container: layer,
							viewport
						}).render();
						if (token !== refreshToken) break;
						renderedPages = new Set([...renderedPages, number]);
					} catch (cause) {
						activeRender = undefined;
						if (
							token === refreshToken &&
							!(cause instanceof Error && cause.name === 'RenderingCancelledException')
						)
							error = `La page ${number} n’a pas pu être affichée.`;
					}
				}
				if (token !== refreshToken || renderAgain) continue;
				for (const number of visibleThumbnailNumbers()) {
					if (token !== refreshToken || renderAgain) break;
					if (renderedThumbnails.has(number)) continue;
					const canvas =
						window.document.querySelectorAll<HTMLCanvasElement>('.thumbnail-item canvas')[
							number - 1
						];
					if (!canvas) continue;
					try {
						const page = await document.getPage(number);
						if (token !== refreshToken) break;
						const viewport = page.getViewport({ scale: 0.2 });
						canvas.width = Math.round(viewport.width);
						canvas.height = Math.round(viewport.height);
						const task = (activeRender = page.render({ canvas, viewport }));
						await task.promise;
						if (activeRender === task) activeRender = undefined;
						if (token !== refreshToken) break;
						renderedThumbnails = new Set([...renderedThumbnails, number]);
					} catch (cause) {
						activeRender = undefined;
						if (
							token === refreshToken &&
							!(cause instanceof Error && cause.name === 'RenderingCancelledException')
						)
							error = `La miniature ${number} n’a pas pu être affichée.`;
					}
				}
			} while (renderAgain);
		} finally {
			renderLoopActive = false;
			if (renderAgain) void renderVisiblePages();
		}
	};

	const goToPage = (pageNumber: number) => {
		selectedPage = pageNumber;
		pageSection(pageNumber)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
		if (window.innerWidth <= 760) sidebarOpen = false;
	};

	const applyDocument = async (
		document: PDFDocument,
		updatedIds?: number[],
		animateMove = false
	) => {
		const bytes = await document.save();
		const preview = await parsePDFjs(
			new Blob([new Uint8Array(bytes)], { type: 'application/pdf' })
		);
		if (updatedIds) {
			if (animateMove) {
				refreshToken++;
				activeRender?.cancel();
				animatingReorder = true;
			}
			setPageIds(updatedIds);
			await tick();
			if (animateMove && moveDuration) {
				await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
				const animations = window.document.querySelectorAll<HTMLElement>(
					'.thumbnail-item, .page-section'
				);
				await Promise.all(
					Array.from(animations).flatMap((element) =>
						element.getAnimations().map((animation) => animation.finished.catch(() => undefined))
					)
				);
			}
			animatingReorder = false;
		}
		const previousPreview = fileSession.processedFile;
		refreshToken++;
		activeRender?.cancel();
		try {
			await previousPreview.loadingTask.destroy();
		} catch {
			// The new preview remains usable if the previous renderer already stopped.
		}
		fileSession.updatedFile = document;
		notes = listNotes(document);
		highlights = listHighlights(document);
		selectionToken++;
		selectedText = null;
		fileSession.processedFile = preview;
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
			const next = await duplicatePage(fileSession.updatedFile, pageNumber);
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
			const next = await removePage(fileSession.updatedFile, pageNumber);
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
			const next = await reorderPage(fileSession.updatedFile, fromPage, toPage);
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
			const next = await mergePDFs(fileSession.updatedFile, file);
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
			const result = await applyOcrToPdf(
				fileSession.updatedFile,
				fileSession.processedFile,
				ocrLanguage,
				(progress) => {
					ocrProgress = describeOcrProgress(progress);
				}
			);
			if (result.wordsAdded) {
				await applyDocument(result.document);
				status = `Texte ajouté à ${result.pagesUpdated} ${result.pagesUpdated === 1 ? 'page' : 'pages'}. Exportez le PDF pour le conserver.`;
			} else if (result.pagesProcessed) {
				status = 'Aucun texte reconnu sur les pages sans texte.';
			} else {
				status = 'Toutes les pages contiennent déjà du texte sélectionnable.';
			}
		} catch (cause) {
			console.error('OCR failed:', cause);
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
		scale = Math.max(minZoom, Math.min(maxZoom, Math.round((scale + change) * 100) / 100));
	};
	const touchDistance = (touches: TouchList) =>
		Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY);
	const touchCenter = (touches: TouchList) => ({
		x: (touches[0].clientX + touches[1].clientX) / 2,
		y: (touches[0].clientY + touches[1].clientY) / 2
	});
	const zoomAnchor = (touches: TouchList): ZoomAnchor | null => {
		const center = touchCenter(touches);
		const sheets = Array.from(documentStage.querySelectorAll<HTMLElement>('.pdf-sheet'));
		const sheet =
			sheets.find((item) => {
				const bounds = item.getBoundingClientRect();
				return (
					center.x >= bounds.left &&
					center.x <= bounds.right &&
					center.y >= bounds.top &&
					center.y <= bounds.bottom
				);
			}) || sheets[Math.max(0, selectedPage - 1)];
		if (!sheet) return null;
		const bounds = sheet.getBoundingClientRect();
		return {
			page: Number(sheet.closest<HTMLElement>('.page-section')?.dataset.page || 1),
			x: Math.max(0, Math.min(1, (center.x - bounds.left) / bounds.width)),
			y: Math.max(0, Math.min(1, (center.y - bounds.top) / bounds.height)),
			clientX: center.x,
			clientY: center.y
		};
	};
	const keepZoomAnchor = (anchor: ZoomAnchor) => {
		const sheet = pageSection(anchor.page)?.querySelector<HTMLElement>('.pdf-sheet');
		if (!sheet) return;
		const bounds = sheet.getBoundingClientRect();
		documentStage.scrollLeft += bounds.left + bounds.width * anchor.x - anchor.clientX;
		documentStage.scrollTop += bounds.top + bounds.height * anchor.y - anchor.clientY;
	};
	const startPinch = (event: TouchEvent) => {
		if (event.touches.length !== 2 || busy) return;
		const anchor = zoomAnchor(event.touches);
		if (!anchor) return;
		event.preventDefault();
		clearTextSelection();
		pinch = {
			distance: touchDistance(event.touches),
			startScale: scale,
			currentScale: scale,
			anchor
		};
	};
	const movePinch = (event: TouchEvent) => {
		if (event.touches.length !== 2 || !pinch) return;
		event.preventDefault();
		pinch.currentScale = Math.max(
			minZoom,
			Math.min(
				maxZoom,
				(pinch.startScale * touchDistance(event.touches)) / Math.max(1, pinch.distance)
			)
		);
		const center = touchCenter(event.touches);
		pinch.anchor.clientX = center.x;
		pinch.anchor.clientY = center.y;
		pinchFactor = pinch.currentScale / pinch.startScale;
		const anchor = { ...pinch.anchor };
		void tick().then(() => {
			if (pinch) keepZoomAnchor(anchor);
		});
	};
	const endPinch = (event: TouchEvent) => {
		if (!pinch || event.touches.length >= 2) return;
		const gesture = pinch;
		pinch = null;
		const nextScale = Math.round(gesture.currentScale * 100) / 100;
		if (nextScale === scale) {
			pinchFactor = 1;
			return;
		}
		pendingZoomAnchor = gesture.anchor;
		scale = nextScale;
	};
	const pinchListeners = (node: HTMLElement) => {
		node.addEventListener('touchstart', startPinch, { passive: false });
		node.addEventListener('touchmove', movePinch, { passive: false });
		return () => {
			node.removeEventListener('touchstart', startPinch);
			node.removeEventListener('touchmove', movePinch);
		};
	};
	const clearTextSelection = () => {
		selectionToken++;
		selectedText = null;
		colorWheelOpen = false;
		window.getSelection()?.removeAllRanges();
	};
	const captureTextSelection = async () => {
		if (busy || noteMode) return;
		const selection = window.getSelection();
		if (
			!selection ||
			selection.isCollapsed ||
			!selection.toString().trim() ||
			!selection.rangeCount
		)
			return;
		const sheetFor = (node: Node | null) =>
			(node instanceof Element ? node : node?.parentElement)?.closest<HTMLElement>('.pdf-sheet');
		const sheet = sheetFor(selection.anchorNode);
		if (!sheet || sheet !== sheetFor(selection.focusNode)) return;
		const layer = sheet.querySelector('.textLayer');
		if (!layer?.contains(selection.anchorNode) || !layer.contains(selection.focusNode)) return;
		const section = sheet.closest<HTMLElement>('.page-section');
		const pageNumber = Number(section?.dataset.page || 0);
		if (!pageNumber) return;
		const sheetRect = sheet.getBoundingClientRect();
		const rectangles = Array.from(selection.getRangeAt(0).getClientRects())
			.filter((rect) => rect.width > 2 && rect.height > 2)
			.map((rect) => ({
				left: Math.max(0, rect.left - sheetRect.left),
				top: Math.max(0, rect.top - sheetRect.top),
				right: Math.min(sheetRect.width, rect.right - sheetRect.left),
				bottom: Math.min(sheetRect.height, rect.bottom - sheetRect.top)
			}))
			.filter((rect) => rect.right > rect.left && rect.bottom > rect.top);
		if (!rectangles.length) return;
		const text = selection.toString().trim();
		const token = ++selectionToken;
		const pdfPage = await fileSession.processedFile.getPage(pageNumber);
		if (token !== selectionToken) return;
		const viewport = pdfPage.getViewport({ scale });
		const quads = rectangles.map(({ left, top, right, bottom }) => {
			const upperLeft = viewport.convertToPdfPoint(left, top);
			const upperRight = viewport.convertToPdfPoint(right, top);
			const lowerLeft = viewport.convertToPdfPoint(left, bottom);
			const lowerRight = viewport.convertToPdfPoint(right, bottom);
			return [...upperLeft, ...upperRight, ...lowerLeft, ...lowerRight] as PDFQuad;
		});
		selectedText = { page: pageNumber, text, quads };
	};
	const highlightSelection = (color: string) => {
		if (!selectedText || busy) return;
		const selection = selectedText;
		void runAction(async () => {
			const knownIds = new Set(highlights.map((item) => item.id));
			const next = await addHighlight(
				fileSession.updatedFile,
				selection.page,
				selection.quads,
				color
			);
			const added = listHighlights(next).find((item) => !knownIds.has(item.id));
			await applyDocument(next);
			lastHighlightId = added?.id || null;
			clearTextSelection();
		}, 'Texte surligné. Pensez à exporter le PDF.');
	};
	const undoHighlight = () => {
		if (!lastHighlightId || busy) return;
		const id = lastHighlightId;
		void runAction(async () => {
			await applyDocument(await removeHighlight(fileSession.updatedFile, id));
			lastHighlightId = null;
		}, 'Surlignage annulé.');
	};
	const openNote = (note: PDFNote, trigger: HTMLElement) => {
		noteTrigger = trigger;
		editingNote = note;
		pendingNote = null;
		noteText = note.text;
		noteDialog.showModal();
		noteTextArea.focus();
	};
	const createNoteAt = async (
		pageNumber: number,
		left?: number,
		top?: number,
		trigger?: HTMLElement
	) => {
		if (busy) return;
		const page = await fileSession.processedFile.getPage(pageNumber);
		const viewport = page.getViewport({ scale });
		const [x, topY] = viewport.convertToPdfPoint(
			Math.max(4, Math.min(left ?? viewport.width - 48, viewport.width - 32)),
			Math.max(4, Math.min(top ?? 24, viewport.height - 32))
		);
		pendingNote = { page: pageNumber, x, y: topY - 24 };
		editingNote = null;
		noteText = '';
		noteTrigger = trigger?.classList.contains('note-placement-target')
			? noteModeButton
			: trigger || (window.document.activeElement as HTMLElement);
		noteMode = false;
		noteDialog.showModal();
		noteTextArea.focus();
	};
	const onSheetClick = (event: MouseEvent, pageNumber: number) => {
		if (!noteMode || busy) return;
		const target = event.currentTarget as HTMLElement;
		if (event.detail === 0) {
			void createNoteAt(pageNumber, undefined, undefined, target);
			return;
		}
		const rect = target.getBoundingClientRect();
		void createNoteAt(pageNumber, event.clientX - rect.left, event.clientY - rect.top, target);
	};
	const saveNote = () => {
		if (!noteText.trim() || busy) return;
		const current = editingNote;
		const pending = pendingNote;
		void runAction(async () => {
			const next = current
				? await updateNote(fileSession.updatedFile, current.id, noteText)
				: pending
					? await addNote(fileSession.updatedFile, pending.page, pending.x, pending.y, noteText)
					: null;
			if (!next) return;
			await applyDocument(next);
			noteTrigger = noteModeButton;
			noteDialog.close();
		}, 'Note enregistrée. Pensez à exporter le PDF.');
	};
	const deleteNote = () => {
		if (!editingNote || busy || !window.confirm('Supprimer cette note ?')) return;
		const id = editingNote.id;
		void runAction(async () => {
			await applyDocument(await removeNote(fileSession.updatedFile, id));
			noteTrigger = noteModeButton;
			noteDialog.close();
		}, 'Note supprimée. Pensez à exporter le PDF.');
	};
	let metadataRows = $derived.by(() => {
		const metadata = importedMetadata;
		if (!metadata) return [];
		return [
			{ label: 'Version', value: metadata.version },
			{ label: 'Titre', value: metadata.title },
			{ label: 'Auteur', value: metadata.author },
			{ label: 'Sujet', value: metadata.subject },
			{ label: 'Mots-clés', value: metadata.keywords },
			{ label: 'Créé avec', value: metadata.creator },
			{ label: 'Producteur', value: metadata.producer },
			{ label: 'Date de création', value: metadata.created },
			{ label: 'Dernière modification', value: metadata.modified }
		];
	});
	$effect(() => {
		const document = fileSession.processedFile;
		const zoom = scale;
		if (mounted && document) untrack(() => void renderDocument(document, zoom));
	});
	$effect(() => {
		if (mounted && sidebarOpen) void tick().then(scheduleVisibleRender);
	});
</script>

<svelte:window
	onkeydown={(event) => {
		if (event.key === 'Escape' && toolsOpen) {
			toolsOpen = false;
			toolsButton?.focus();
		}
		if (event.key === 'Escape' && noteMode) {
			noteMode = false;
			noteModeButton?.focus();
		}
		if (event.key === 'Escape' && selectedText) clearTextSelection();
	}}
	onpointerdown={(event) => {
		if (
			selectedText &&
			event.target instanceof Element &&
			!event.target.closest('.highlight-toolbar, .textLayer')
		)
			clearTextSelection();
	}}
/>
<svelte:document onselectionchange={() => void captureTextSelection()} />

<svelte:head><title>{fileSession.fileName || 'Document'} — Inscribe</title></svelte:head>

<div
	class="editor-shell h-[100vh] min-h-[480px] flex flex-col overflow-hidden [background:#eaece8]"
>
	<header
		class="editor-header h-[72px] flex-none flex items-center justify-between gap-[20px] p-[0_22px] [border-bottom:1px_solid_var(--line)] [background:var(--paper)] max-[760px]:h-[64px] max-[760px]:p-[0_12px] max-[760px]:gap-[8px] max-[520px]:[&_.brand-mark]:hidden"
	>
		<div class="editor-identity flex items-center min-w-0 gap-[13px] max-[760px]:gap-[7px]">
			<button
				class="icon-button back-button [border:1px_solid_transparent] bg-transparent [color:var(--ink)] rounded-[7px] min-w-[38px] h-[38px] inline-flex items-center justify-center gap-[8px] [&:hover]:[background:#eef1eb] max-[520px]:min-w-[32px]"
				type="button"
				onclick={back}
				disabled={busy}
				aria-label="Retour à l’accueil"
				title="Retour à l’accueil"><ArrowLeft size={19} /></button
			>
			<span
				class="brand-mark compact inline-flex justify-center items-center w-[38px] h-[38px] rounded-[10px] [background:var(--accent)] text-white text-[27px] font-extrabold leading-[1] tracking-[-0.1em] pr-[3px] [&_span]:[color:#dfb394] [&.compact]:w-[32px] [&.compact]:h-[32px] [&.compact]:text-[23px] [&.compact]:rounded-[8px] [&.compact]:flex-none"
				>i<span>.</span></span
			>
			<div
				class="document-identity flex flex-col min-w-0 gap-[3px] [&_strong]:max-w-[min(32vw,_420px)] [&_strong]:overflow-hidden [&_strong]:whitespace-nowrap [&_strong]:text-ellipsis [&_strong]:text-[14px] [&_strong]:font-extrabold [&_small]:[color:var(--muted-ink)] [&_small]:text-[11px] max-[760px]:[&_strong]:max-w-[29vw] max-[760px]:[&_strong]:text-[12px] max-[760px]:[&_small]:text-[10px] max-[520px]:[&_strong]:max-w-[32vw]"
			>
				<strong title={fileSession.fileName}>{fileSession.fileName || 'Document sans titre'}</strong
				><small>{dirty ? 'Modifications non exportées' : 'Document ouvert'}</small>
			</div>
		</div>
		<div class="editor-actions flex items-center gap-[8px] flex-none max-[760px]:gap-[3px]">
			<button
				bind:this={noteModeButton}
				class="toolbar-button note-mode-button [border:1px_solid_transparent] bg-transparent [color:var(--ink)] rounded-[7px] min-w-[38px] h-[38px] inline-flex items-center justify-center gap-[8px] [&:hover]:[background:#eef1eb] [border-color:var(--line)] p-[0_12px] text-[12px] font-extrabold [&.active]:[background:#fbece5] [&.active]:[border-color:#dcae98] [&.active]:[color:#8d3e27] max-[760px]:[&_span]:hidden max-[760px]:p-0 max-[760px]:min-w-[38px]"
				class:active={noteMode}
				type="button"
				onclick={() => (noteMode = !noteMode)}
				disabled={busy}
				aria-pressed={noteMode}
				aria-label="Ajouter une note sur une page"
				title="Ajouter une note sur une page"
				><MessageSquarePlus size={18} /><span>Ajouter une note</span></button
			>
			<input
				bind:this={mergeInput}
				type="file"
				accept=".pdf,application/pdf"
				class="visually-hidden absolute w-[1px] h-[1px] p-0 m-[-1px] overflow-hidden [clip:rect(0,_0,_0,_0)] whitespace-nowrap border-0"
				onchange={merge}
				aria-label="Choisir un PDF à ajouter"
			/>
			<button
				class="toolbar-button merge-button [border:1px_solid_transparent] bg-transparent [color:var(--ink)] rounded-[7px] min-w-[38px] h-[38px] inline-flex items-center justify-center gap-[8px] [&:hover]:[background:#eef1eb] [border-color:var(--line)] p-[0_12px] text-[12px] font-extrabold max-[760px]:[&_span]:hidden max-[760px]:p-0 max-[760px]:min-w-[38px]"
				type="button"
				onclick={() => mergeInput.click()}
				disabled={busy}
				aria-label="Ajouter un PDF"><FilePlus2 size={18} /> <span>Ajouter un PDF</span></button
			>
			<button
				bind:this={infoButton}
				class="icon-button info-button [border:1px_solid_transparent] bg-transparent [color:var(--ink)] rounded-[7px] min-w-[38px] h-[38px] inline-flex items-center justify-center gap-[8px] [&:hover]:[background:#eef1eb] [border-color:var(--line)]"
				type="button"
				onclick={openInfo}
				aria-label="Informations sur le PDF"
				aria-haspopup="dialog"
				title="Informations sur le PDF"><Info size={20} strokeWidth={1.8} /></button
			>
			<div class="tools-wrap relative">
				<button
					bind:this={toolsButton}
					class="icon-button tools-button [border:1px_solid_transparent] bg-transparent [color:var(--ink)] rounded-[7px] min-w-[38px] h-[38px] inline-flex items-center justify-center gap-[8px] [&:hover]:[background:#eef1eb]"
					type="button"
					onclick={() => (toolsOpen = !toolsOpen)}
					aria-label="Autres outils"
					aria-haspopup="true"
					aria-expanded={toolsOpen}
					title="Autres outils"><Menu size={20} /></button
				>{#if toolsOpen}<div
						class="tools-popover absolute right-[0] top-[44px] z-[20] w-[min(300px,_calc(100vw_-_24px))] p-[18px] [background:var(--paper)] [border:1px_solid_var(--line)] rounded-[8px] [box-shadow:0_12px_30px_#24342822] [&_strong]:flex [&_strong]:items-center [&_strong]:gap-[8px] [&_strong]:text-[13px] [&_p]:m-[10px_0_16px] [&_p]:[color:var(--muted-ink)] [&_p]:text-[12px] [&_p]:leading-[1.55] [&_label]:block [&_label]:mb-[7px] [&_label]:text-[11px] [&_label]:font-extrabold [&_select]:w-full [&_select]:min-h-[38px] [&_select]:p-[0_9px] [&_select]:[border:1px_solid_var(--line)] [&_select]:rounded-[6px] [&_select]:bg-white [&_select]:[color:var(--ink)] [&_select]:text-[12px] [&_small]:block [&_small]:mt-[11px] [&_small]:[color:var(--muted-ink)] [&_small]:text-[10px] [&_small]:leading-[1.5] [&_button.ocr-start]:w-full [&_button.ocr-start]:flex [&_button.ocr-start]:justify-center [&_button.ocr-start]:p-[10px] [&_button.ocr-start]:mt-[16px] [&_button.ocr-start]:[background:var(--accent)] [&_button.ocr-start]:text-white [&_button.ocr-start]:border-0 [&_button.ocr-start]:rounded-[5px] [&_button.ocr-start]:text-[12px] [&_button.ocr-start]:font-extrabold [&_button.ocr-start:hover]:[background:var(--accent-dark)]"
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
						<button class="ocr-start" type="button" onclick={ocr} disabled={busy}
							>Lancer l’OCR</button
						>
					</div>{/if}
			</div>
			<button
				class="export-button min-h-[44px] inline-flex items-center justify-center gap-[10px] p-[0_19px] border-0 rounded-[7px] [background:var(--accent)] text-white text-[13px] font-extrabold [transition:background_0.15s,_transform_0.15s] [&:hover]:[background:var(--accent-dark)] min-h-[39px] text-[12px] max-[760px]:p-[0_11px] max-[760px]:[&_span]:hidden"
				type="button"
				onclick={save}
				disabled={busy}
				aria-label="Exporter le PDF"><Download size={18} /><span>Exporter le PDF</span></button
			>
		</div>
	</header>
	<dialog
		bind:this={infoDialog}
		class="pdf-info-dialog w-[min(480px,_calc(100vw_-_32px))] max-h-[calc(100vh_-_32px)] m-auto p-0 [border:1px_solid_var(--line)] rounded-[12px] [background:var(--paper)] [color:var(--ink)] [box-shadow:0_24px_70px_#17241c40] [&::backdrop]:[background:#17241c99]"
		aria-labelledby="pdf-info-title"
		onclose={() => infoButton?.focus()}
	>
		<div
			class="pdf-info-header sticky top-0 z-[1] flex items-center justify-between gap-[16px] p-[20px_23px] [border-bottom:1px_solid_var(--line)] [background:var(--paper)]"
		>
			<div
				class="pdf-info-heading flex items-center gap-[13px] [&_h2]:m-[4px_0_0] [&_h2]:text-[17px] [&_h2]:leading-[1.2]"
			>
				<span
					class="pdf-info-mark w-[38px] h-[38px] rounded-[9px] grid place-items-center [background:#e4eee6] [color:var(--accent)]"
					><Info size={20} strokeWidth={1.8} /></span
				>
				<div>
					<span
						class="section-index text-[11px] [color:var(--accent)] tracking-[0.15em] font-extrabold"
						>DOCUMENT IMPORTÉ</span
					>
					<h2 id="pdf-info-title">Informations sur le PDF</h2>
				</div>
			</div>
			<button
				class="icon-button [border:1px_solid_transparent] bg-transparent [color:var(--ink)] rounded-[7px] min-w-[38px] h-[38px] inline-flex items-center justify-center gap-[8px] [&:hover]:[background:#eef1eb]"
				type="button"
				onclick={() => infoDialog.close()}
				aria-label="Fermer les informations"><X size={18} /></button
			>
		</div>
		{#if importedMetadata}
			<div
				class="pdf-info-file flex items-center gap-[13px] m-[20px_23px_7px] p-[15px] [border:1px_solid_#dce6dc] rounded-[8px] [background:#f1f6f0] [color:var(--accent)] [&_>_svg]:flex-none [&_div]:min-w-0 [&_div]:flex [&_div]:flex-col [&_div]:gap-[4px] [&_strong]:text-[13px] [&_strong]:wrap-anywhere [&_span]:text-[11px] [&_span]:[color:var(--muted-ink)]"
			>
				<FileText size={22} strokeWidth={1.7} />
				<div>
					<strong>{importedMetadata.name}</strong>
					<span
						>{importedMetadata.size} · {importedMetadata.pages}
						{importedMetadata.pages === 1 ? 'page' : 'pages'}</span
					>
				</div>
			</div>
			<dl
				class="pdf-metadata-list m-0 p-[10px_23px_24px] [&_>_div]:grid [&_>_div]:grid-cols-[145px_minmax(0,_1fr)] [&_>_div]:gap-[14px] [&_>_div]:p-[11px_0] [&_>_div]:[border-bottom:1px_solid_var(--line)] [&_>_div]:text-[12px] [&_>_div]:leading-[1.5] [&_>_div:last-child]:[border-bottom:0] [&_dt]:[color:var(--muted-ink)] [&_dd]:m-0 [&_dd]:font-bold [&_dd]:wrap-anywhere"
			>
				{#each metadataRows as row}
					<div>
						<dt>{row.label}</dt>
						<dd>{row.value}</dd>
					</div>
				{/each}
			</dl>
		{:else}
			<p class="pdf-info-loading p-[20px_23px] text-[12px] [color:var(--muted-ink)]">
				Lecture des métadonnées…
			</p>
		{/if}
	</dialog>
	<dialog
		bind:this={noteDialog}
		class="pdf-info-dialog note-dialog w-[min(480px,_calc(100vw_-_32px))] max-h-[calc(100vh_-_32px)] m-auto p-0 [border:1px_solid_var(--line)] rounded-[12px] [background:var(--paper)] [color:var(--ink)] [box-shadow:0_24px_70px_#17241c40] [&::backdrop]:[background:#17241c99]"
		aria-labelledby="note-dialog-title"
		onclose={() => (noteTrigger?.isConnected ? noteTrigger : noteModeButton)?.focus()}
	>
		<form
			onsubmit={(event) => {
				event.preventDefault();
				saveNote();
			}}
		>
			<div
				class="pdf-info-header sticky top-0 z-[1] flex items-center justify-between gap-[16px] p-[20px_23px] [border-bottom:1px_solid_var(--line)] [background:var(--paper)]"
			>
				<div
					class="pdf-info-heading flex items-center gap-[13px] [&_h2]:m-[4px_0_0] [&_h2]:text-[17px] [&_h2]:leading-[1.2]"
				>
					<span
						class="pdf-info-mark w-[38px] h-[38px] rounded-[9px] grid place-items-center [background:#e4eee6] [color:var(--accent)]"
						><MessageSquareText size={20} /></span
					>
					<div>
						<span
							class="section-index text-[11px] [color:var(--accent)] tracking-[0.15em] font-extrabold"
							>ANNOTATION PDF</span
						>
						<h2 id="note-dialog-title">{editingNote ? 'Modifier la note' : 'Nouvelle note'}</h2>
					</div>
				</div>
				<button
					class="icon-button [border:1px_solid_transparent] bg-transparent [color:var(--ink)] rounded-[7px] min-w-[38px] h-[38px] inline-flex items-center justify-center gap-[8px] [&:hover]:[background:#eef1eb]"
					type="button"
					onclick={() => noteDialog.close()}
					aria-label="Fermer la note"><X size={18} /></button
				>
			</div>
			<div
				class="note-dialog-body p-[20px_23px] [&_p]:m-[0_0_18px] [&_p]:[color:var(--muted-ink)] [&_p]:text-[12px] [&_label]:block [&_label]:mb-[8px] [&_label]:text-[12px] [&_label]:font-extrabold [&_textarea]:w-full [&_textarea]:min-h-[140px] [&_textarea]:p-[12px] [&_textarea]:resize-y [&_textarea]:[border:1px_solid_var(--line)] [&_textarea]:rounded-[7px] [&_textarea]:bg-white [&_textarea]:[color:var(--ink)] [&_textarea]:[font:inherit] [&_textarea]:text-[13px] [&_textarea]:leading-[1.5] [&_textarea:focus-visible]:[outline:3px_solid_var(--ring)] [&_textarea:focus-visible]:[outline-offset:2px]"
			>
				<p>
					Page {editingNote?.page ?? pendingNote?.page} · Cette note sera intégrée au PDF exporté.
				</p>
				<label for="note-text">Texte de la note</label>
				<textarea
					id="note-text"
					bind:this={noteTextArea}
					bind:value={noteText}
					required
					rows="6"
					placeholder="Écrivez votre note ici…"></textarea>
			</div>
			<div
				class="note-dialog-actions flex justify-end items-center flex-wrap gap-[9px] p-[16px_23px] [border-top:1px_solid_var(--line)]"
			>
				{#if editingNote}<button
						class="note-delete min-h-[38px] inline-flex items-center gap-[7px] p-[0_13px] border-0 rounded-[7px] text-[12px] font-extrabold mr-[auto] bg-transparent [color:#a4492e] [&:hover]:[background:#fbece5]"
						type="button"
						onclick={deleteNote}
						disabled={busy}><Trash2 size={16} /> Supprimer</button
					>{/if}
				<button
					class="toolbar-button [border:1px_solid_transparent] bg-transparent [color:var(--ink)] rounded-[7px] min-w-[38px] h-[38px] inline-flex items-center justify-center gap-[8px] [&:hover]:[background:#eef1eb] [border-color:var(--line)] p-[0_12px] text-[12px] font-extrabold"
					type="button"
					onclick={() => noteDialog.close()}>Annuler</button
				>
				<button
					class="note-save min-h-[38px] inline-flex items-center gap-[7px] p-[0_13px] border-0 rounded-[7px] text-[12px] font-extrabold [background:var(--accent)] text-white [&:hover]:[background:var(--accent-dark)]"
					type="submit"
					disabled={busy || !noteText.trim()}
					>{busy ? 'Enregistrement…' : 'Enregistrer la note'}</button
				>
			</div>
		</form>
	</dialog>
	<dialog
		bind:this={deleteDialog}
		class="pdf-info-dialog delete-confirm-dialog w-[min(480px,_calc(100vw_-_32px))] max-h-[calc(100vh_-_32px)] m-auto p-0 [border:1px_solid_var(--line)] rounded-[12px] [background:var(--paper)] [color:var(--ink)] [box-shadow:0_24px_70px_#17241c40] [&::backdrop]:[background:#17241c99] w-[min(420px,_calc(100vw_-_32px))]"
		aria-labelledby="delete-page-title"
		onclose={() => (pageToDelete = null)}
	>
		<div
			class="delete-confirm-body p-[27px_27px_18px] [&_h2]:m-0 [&_h2]:text-[18px] [&_h2]:leading-[1.3] [&_p]:m-[10px_0_0] [&_p]:[color:var(--muted-ink)] [&_p]:text-[12px] [&_p]:leading-[1.6]"
		>
			<span
				class="delete-confirm-icon grid place-items-center w-[40px] h-[40px] mb-[17px] rounded-[9px] [background:#fbece5] [color:#a4492e]"
				><Trash2 size={21} strokeWidth={1.8} /></span
			>
			<h2 id="delete-page-title">Supprimer la page {pageToDelete} ?</h2>
			<p>
				Cette page sera retirée du PDF en cours. Vous pourrez conserver le résultat en l’exportant.
			</p>
		</div>
		<div
			class="delete-confirm-actions flex justify-end gap-[9px] p-[16px_27px] [border-top:1px_solid_var(--line)]"
		>
			<button
				type="button"
				class="toolbar-button [border:1px_solid_transparent] bg-transparent [color:var(--ink)] rounded-[7px] min-w-[38px] h-[38px] inline-flex items-center justify-center gap-[8px] [&:hover]:[background:#eef1eb] [border-color:var(--line)] p-[0_12px] text-[12px] font-extrabold"
				onclick={() => deleteDialog.close()}>Annuler</button
			>
			<button
				type="button"
				class="delete-confirm-button min-h-[38px] p-[0_14px] border-0 rounded-[7px] [background:#a4492e] text-white text-[12px] font-extrabold [&:hover]:[background:#873b26]"
				onclick={confirmRemoval}>Supprimer la page</button
			>
		</div>
	</dialog>
	<div
		class="editor-subbar h-[47px] flex-none [background:#f5f6f1] [border-bottom:1px_solid_var(--line)] flex justify-between items-center p-[0_22px] text-[11px] [color:var(--muted-ink)] max-[760px]:p-[0_12px]"
	>
		<div class="subbar-left flex items-center gap-[14px]">
			<button
				class="icon-button sidebar-toggle [border:1px_solid_transparent] bg-transparent [color:var(--ink)] rounded-[7px] min-w-[38px] h-[38px] inline-flex items-center justify-center gap-[8px] [&:hover]:[background:#eef1eb]"
				type="button"
				onclick={() => (sidebarOpen = !sidebarOpen)}
				aria-label={sidebarOpen ? 'Masquer les pages' : 'Afficher les pages'}
				aria-expanded={sidebarOpen}><Menu size={18} /></button
			><span
				class="subbar-label [color:var(--accent)] font-extrabold text-[10px] tracking-[0.13em] max-[760px]:hidden"
				>ÉDITION DU DOCUMENT</span
			><span class="subbar-divider w-[1px] h-[14px] [background:#ced2c9] max-[760px]:hidden"
			></span><span>{pages.length} {pages.length === 1 ? 'page' : 'pages'}</span>
		</div>
		<div
			class="zoom-controls flex items-center gap-[3px] [&_span]:min-w-[50px] [&_span]:text-center [&_span]:text-[11px] [&_span]:font-extrabold [&_span]:[color:var(--ink)] [&_.icon-button]:h-[30px] [&_.icon-button]:min-w-[30px]"
		>
			<button
				class="icon-button [border:1px_solid_transparent] bg-transparent [color:var(--ink)] rounded-[7px] min-w-[38px] h-[38px] inline-flex items-center justify-center gap-[8px] [&:hover]:[background:#eef1eb]"
				type="button"
				onclick={() => setZoom(-0.1)}
				aria-label="Réduire le zoom"
				disabled={scale <= minZoom}><Minus size={17} /></button
			><span aria-live="polite">{Math.round(scale * 100)} %</span><button
				class="icon-button [border:1px_solid_transparent] bg-transparent [color:var(--ink)] rounded-[7px] min-w-[38px] h-[38px] inline-flex items-center justify-center gap-[8px] [&:hover]:[background:#eef1eb]"
				type="button"
				onclick={() => setZoom(0.1)}
				aria-label="Augmenter le zoom"
				disabled={scale >= maxZoom}><Plus size={17} /></button
			>
		</div>
	</div>
	{#if noteMode}<div
			class="note-placement-banner flex items-center justify-between gap-[12px] p-[9px_22px] [background:#fbece5] [color:#8d3e27] text-[12px] font-extrabold [&_button]:border-0 [&_button]:bg-transparent [&_button]:[color:inherit] [&_button]:text-[inherit] [&_button]:font-extrabold [&_button]:[text-decoration:underline]"
			role="status"
		>
			<span>Cliquez ou touchez une page pour placer la note.</span>
			<button
				type="button"
				onclick={() => {
					noteMode = false;
					noteModeButton.focus();
				}}>Annuler</button
			>
		</div>{/if}
	{#if error || status || ocrProgress}<div
			class:error
			class="editor-notice z-[5] flex items-center justify-between gap-[15px] p-[9px_22px] [background:#e7efe8] [color:var(--accent-dark)] text-[12px] font-bold [&.error]:[background:#fff0e8] [&.error]:[color:#8d3e27] [&_button]:[background:none] [&_button]:border-0 [&_button]:[color:inherit] [&_button]:grid [&_button]:place-items-center [&_.notice-undo]:ml-auto [&_.notice-undo]:text-[11px] [&_.notice-undo]:font-extrabold [&_.notice-undo]:[text-decoration:underline] [&_.notice-undo]:whitespace-nowrap"
			role={error ? 'alert' : 'status'}
		>
			{error || ocrProgress || status}
			{#if status.startsWith('Texte surligné') && lastHighlightId}<button
					type="button"
					class="notice-undo"
					onclick={undoHighlight}
					disabled={busy}>Annuler le surlignage</button
				>{/if}
			<button
				type="button"
				onclick={() => {
					error = '';
					status = '';
				}}
				disabled={busy}
				aria-label="Fermer le message"><X size={16} /></button
			>
		</div>{/if}
	{#if selectedText}<div
			class="highlight-toolbar fixed z-[30] left-[50%] bottom-[20px] [transform:translateX(-50%)] w-[min(360px,_calc(100vw_-_24px))] max-h-[calc(100dvh_-_24px)] overflow-y-auto p-[13px] [border:1px_solid_#c8d1c6] rounded-[10px] [background:var(--paper)] [box-shadow:0_12px_36px_#20302535] max-[760px]:bottom-[10px]"
			role="toolbar"
			aria-label="Surligner le texte sélectionné"
		>
			<div
				class="highlight-toolbar-title flex items-center gap-[9px] [color:var(--accent)] text-[12px] font-extrabold [&_>_svg]:flex-none [&_span]:min-w-0 [&_span]:flex-1 [&_span]:overflow-hidden [&_span]:text-ellipsis [&_span]:whitespace-nowrap [&_strong]:[color:var(--ink)] [&_strong]:font-bold [&_button]:grid [&_button]:place-items-center [&_button]:w-[28px] [&_button]:h-[28px] [&_button]:border-0 [&_button]:rounded-[5px] [&_button]:bg-transparent [&_button]:[color:var(--muted-ink)] [&_button:hover]:[background:#e9eee7]"
			>
				<Highlighter size={17} /><span
					>Surligner <strong
						>« {selectedText.text.length > 48
							? `${selectedText.text.slice(0, 48)}…`
							: selectedText.text} »</strong
					></span
				><button type="button" onclick={clearTextSelection} aria-label="Fermer les couleurs"
					><X size={16} /></button
				>
			</div>
			<div class="highlight-colors flex items-center gap-[9px] mt-[11px]">
				{#each highlightColors as color}<button
						type="button"
						class="highlight-swatch w-[34px] h-[34px] flex-none [border:1px_solid_#0003] rounded-[6px] [box-shadow:inset_0_0_0_3px_#fff8] [&:hover]:[transform:translateY(-2px)] [&:hover]:[box-shadow:inset_0_0_0_3px_#fff8,_0_3px_8px_#0002]"
						style:background={color.value}
						onclick={() => highlightSelection(color.value)}
						disabled={busy}
						aria-label={`Surligner en ${color.name}`}
						title={color.name}
					></button>{/each}
				<button
					type="button"
					class="highlight-custom-toggle flex items-center gap-[7px] min-h-[34px] ml-auto p-[0_8px] [border:1px_solid_var(--line)] rounded-[6px] bg-transparent [color:var(--ink)] text-[11px] font-extrabold [&:hover]:[background:#eef1eb]"
					onclick={() => (colorWheelOpen = !colorWheelOpen)}
					aria-expanded={colorWheelOpen}
					aria-label="Choisir une couleur personnalisée"
					><span
						class="highlight-custom-icon w-[16px] h-[16px] [border:1px_solid_#0002] rounded-full [background:conic-gradient(red,_yellow,_lime,_cyan,_blue,_magenta,_red)]"
						aria-hidden="true"
					></span> Personnaliser</button
				>
			</div>
			{#if colorWheelOpen}<div
					class="highlight-wheel-panel grid justify-items-center gap-[12px] mt-[13px] pt-[14px] [border-top:1px_solid_var(--line)]"
				>
					<ColorWheel bind:value={customColor} /><button
						type="button"
						class="highlight-apply w-full min-h-[38px] border-0 rounded-[6px] [background:var(--accent)] text-white text-[12px] font-extrabold [&:hover]:[background:var(--accent-dark)]"
						onclick={() => highlightSelection(customColor)}
						disabled={busy}>Surligner avec cette couleur</button
					>
				</div>{/if}
		</div>{/if}
	<div class="editor-body flex min-h-[0] flex-1">
		{#if sidebarOpen}<aside
				class="page-sidebar w-[222px] flex-none min-h-[0] flex flex-col [background:#f6f6f2] [border-right:1px_solid_var(--line)] max-[760px]:absolute max-[760px]:z-[10] max-[760px]:top-[111px] max-[760px]:bottom-[0] max-[760px]:w-[min(78vw,_250px)] max-[760px]:[box-shadow:12px_0_20px_#24342817]"
				aria-label="Pages du document"
				onscrollcapture={scheduleVisibleRender}
			>
				<div
					class="sidebar-heading [color:var(--accent)] font-extrabold text-[10px] tracking-[0.13em] p-[21px_22px_15px] flex justify-between"
				>
					<span>PAGES</span><span>{String(pages.length).padStart(2, '0')}</span>
				</div>
				<ContextMenu.Root>
					<ContextMenu.Trigger class="thumbnail-list overflow-y-auto p-[0_13px_22px]">
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
								class="thumbnail-item relative flex flex-col items-center w-full p-[13px_10px] [border:1px_solid_transparent] rounded-[8px] bg-transparent [color:var(--ink)] cursor-grab [&.dragging]:opacity-[0.55] [&.dragging]:cursor-grabbing [&.drop-before::before]:[content:''] [&.drop-before::before]:absolute [&.drop-before::before]:left-[7px] [&.drop-before::before]:right-[7px] [&.drop-before::before]:h-[3px] [&.drop-before::before]:rounded-[3px] [&.drop-before::before]:[background:var(--orange)] [&.drop-after::after]:[content:''] [&.drop-after::after]:absolute [&.drop-after::after]:left-[7px] [&.drop-after::after]:right-[7px] [&.drop-after::after]:h-[3px] [&.drop-after::after]:rounded-[3px] [&.drop-after::after]:[background:var(--orange)] [&.drop-before::before]:top-0 [&.drop-after::after]:bottom-[0] [&:hover]:[background:#e9eee7] [&.active]:[background:#e4eee6] [&.active]:[border-color:#c6d8c9] [&.active_.thumbnail-paper]:[border-color:var(--accent)]"
								type="button"
								draggable={!busy}
								ondragstart={(event) => startPageDrag(event, page)}
								ondragover={(event) => overPage(event, page)}
								ondrop={(event) => dropPage(event, page)}
								ondragend={endPageDrag}
								onclick={() => goToPage(page)}
								oncontextmenu={() => (contextMenuPage = page)}
								aria-label={`Aller à la page ${page}`}
								aria-describedby="page-reorder-hint"
								aria-current={selectedPage === page ? 'page' : undefined}
								><span
									class="thumbnail-paper w-[120px] min-h-[158px] grid place-items-center p-[3px] [border:1px_solid_#d3d6ce] [box-shadow:0_2px_8px_#24342816] bg-white [&_canvas]:block [&_canvas]:w-[auto] [&_canvas]:max-w-[112px] [&_canvas]:max-h-[150px]"
									><canvas width="0" height="0"></canvas></span
								><span
									class="thumbnail-caption flex justify-between w-full mt-[10px] text-[11px] font-bold [&_span:first-child]:[color:var(--accent)] [&_span:first-child]:font-extrabold"
									><span>{String(page).padStart(2, '0')}</span><span>Page {page}</span></span
								></button
							>{/each}
					</ContextMenu.Trigger>
					<ContextMenu.Portal>
						<ContextMenu.Content
							class="page-context-menu z-[50] min-w-[192px] p-[4px] [border:1px_solid_var(--line)] rounded-[8px] [background:var(--paper)] [color:var(--ink)] [box-shadow:0_12px_32px_#24342825] [&_[role='menuitem']]:flex [&_[role='menuitem']]:items-center [&_[role='menuitem']]:gap-[10px] [&_[role='menuitem']]:min-h-[34px] [&_[role='menuitem']]:p-[6px_9px] [&_[role='menuitem']]:rounded-[5px] [&_[role='menuitem']]:[outline:none] [&_[role='separator']]:h-[1px] [&_[role='separator']]:m-[4px_-4px] [&_[role='separator']]:[background:var(--line)] [&_[role='menuitem'][data-highlighted]]:[background:#e9eee7] [&_[role='menuitem'][data-disabled]]:opacity-[0.45] [&_.context-danger]:[color:#a4492e]"
						>
							<ContextMenu.Item
								onSelect={() => contextMenuPage !== null && move(contextMenuPage, -1)}
								disabled={busy || contextMenuPage === null || contextMenuPage === 1}
								><ChevronUp size={16} /> Monter la page</ContextMenu.Item
							>
							<ContextMenu.Item
								onSelect={() => contextMenuPage !== null && move(contextMenuPage, 1)}
								disabled={busy || contextMenuPage === null || contextMenuPage === pages.length}
								><ChevronDown size={16} /> Descendre la page</ContextMenu.Item
							>
							<ContextMenu.Separator />
							<ContextMenu.Item
								onSelect={() => contextMenuPage !== null && duplicate(contextMenuPage)}
								disabled={busy || contextMenuPage === null}
								><Copy size={16} /> Dupliquer la page</ContextMenu.Item
							>
							<ContextMenu.Item
								onSelect={() => contextMenuPage !== null && remove(contextMenuPage)}
								disabled={busy || contextMenuPage === null || pages.length <= 1}
								class="context-danger"><Trash2 size={16} /> Supprimer la page</ContextMenu.Item
							>
						</ContextMenu.Content>
					</ContextMenu.Portal>
				</ContextMenu.Root>
				<div
					class="sidebar-footer mt-auto p-[14px_18px] [border-top:1px_solid_var(--line)] [color:var(--muted-ink)] text-[10px] flex items-center gap-[8px] [&_.touch-hint]:hidden max-[760px]:[&_.desktop-hint]:hidden max-[760px]:[&_.touch-hint]:inline"
					id="page-reorder-hint"
				>
					<FileText size={15} /><span class="desktop-hint"
						>Glissez pour réordonner · clic droit pour les actions</span
					><span class="touch-hint">Utilisez les flèches sous chaque page</span>
				</div>
			</aside>{/if}
		<main
			bind:this={documentStage}
			class="document-stage flex-1 min-w-0 overflow-auto scroll-smooth [touch-action:pan-x_pan-y] overscroll-contain [&.pinching]:scroll-auto motion-reduce:scroll-auto"
			class:pinching={pinch !== null || pendingZoomAnchor !== null}
			aria-label="Aperçu du document"
			onscroll={scheduleVisibleRender}
			{@attach pinchListeners}
			ontouchend={endPinch}
			ontouchcancel={endPinch}
		>
			<div
				class="stage-inner w-fit min-w-[100%] p-[28px_clamp(20px,_5vw,_70px)_50px] m-auto max-[760px]:p-[20px_16px_40px]"
			>
				<div
					class="stage-heading [color:var(--accent)] font-extrabold text-[10px] tracking-[0.13em] flex justify-between gap-[20px] max-w-[1000px] m-[0_auto_24px] [&_span:last-child]:[color:var(--muted-ink)] max-[520px]:text-[9px]"
				>
					<span>APERÇU DU DOCUMENT</span><span>Page {selectedPage} sur {pages.length}</span>
				</div>
				{#each pageItems as { id, page } (id)}<section
						animate:flip={{ duration: animatingReorder ? moveDuration : 0, easing: cubicOut }}
						class="page-section w-fit m-[0_auto_42px]"
						data-page={page}
						aria-label={`Page ${page}`}
					>
						<div
							class="pdf-sheet relative bg-white [box-shadow:0_12px_36px_#2b352429,_0_1px_3px_#2b352419] [&.placing-note]:cursor-crosshair [&.placing-note_.textLayer]:cursor-crosshair [&.placing-note_.textLayer]:pointer-events-none [&_canvas]:block [&_canvas]:max-w-none [&_.textLayer]:absolute [&_.textLayer]:z-[2] [&_.textLayer]:top-0 [&_.textLayer]:left-0 [&_.textLayer]:overflow-hidden"
							class:placing-note={noteMode}
							style:zoom={pinchFactor}
						>
							<canvas width="0" height="0"></canvas>
							{#if !renderedPages.has(page)}<div
									class="page-loading absolute inset-0 grid place-items-center p-[20px] bg-white [color:var(--muted-ink)] text-[12px] font-bold"
									aria-hidden="true"
								>
									Chargement de la page {page}…
								</div>{/if}
							<div
								class="highlight-layer absolute z-[1] inset-0 pointer-events-none mix-blend-multiply"
								aria-hidden="true"
							>
								{#each highlightRects.filter((item) => item.page === page) as highlight}<span
										class="highlight-rect absolute rounded-[2px] opacity-[0.5]"
										style:left={`${highlight.left}px`}
										style:top={`${highlight.top}px`}
										style:width={`${highlight.width}px`}
										style:height={`${highlight.height}px`}
										style:background={highlight.color}
									></span>{/each}
							</div>
							<div class="textLayer"></div>
							{#if noteMode}<button
									class="note-placement-target absolute z-[2] inset-0 w-full h-full p-0 border-0 bg-transparent cursor-crosshair [&:focus-visible]:[outline:3px_solid_var(--ring)] [&:focus-visible]:[outline-offset:2px]"
									type="button"
									aria-label={`Placer une note sur la page ${page}`}
									onclick={(event) => onSheetClick(event, page)}
								></button>{/if}
							{#each noteMarkers.filter((note) => note.page === page) as note (note.id)}<button
									class="note-marker absolute z-[3] grid place-items-center w-[28px] h-[28px] p-0 [border:1px_solid_#9c4a2e] rounded-[5px] [background:#f8d6a1] [color:#70351f] [box-shadow:0_2px_7px_#33221844] [&:hover]:[background:#ffbf78] [&:focus-visible]:[outline:3px_solid_var(--ring)] [&:focus-visible]:[outline-offset:2px]"
									type="button"
									style:left={`${note.left}px`}
									style:top={`${note.top}px`}
									title={note.text}
									aria-label={`Lire la note de la page ${page} : ${note.text}`}
									onclick={(event) => {
										event.stopPropagation();
										const source = notes.find((item) => item.id === note.id);
										if (source) openNote(source, event.currentTarget);
									}}><MessageSquareText size={16} /></button
								>{/each}
						</div>
						<div
							class="page-actions [&_>_span]:[color:var(--accent)] [&_>_span]:font-extrabold [&_>_span]:text-[10px] [&_>_span]:tracking-[0.13em] flex justify-between items-center mt-[13px] [color:var(--muted-ink)] [&_>_div]:flex [&_>_div]:items-center [&_>_div]:gap-[3px] [&_button]:[border:1px_solid_transparent] [&_button]:bg-transparent [&_button]:[color:#58615a] [&_button]:grid [&_button]:place-items-center [&_button]:w-[33px] [&_button]:h-[32px] [&_button]:rounded-[5px] [&_button:hover]:[background:#dce5db] [&_button:hover]:[color:var(--accent)] [&_button.danger-action:hover]:[background:#f6dfd5] [&_button.danger-action:hover]:[color:#9c442a]"
						>
							<span>PAGE {String(page).padStart(2, '0')}</span>
							<div>
								<button
									type="button"
									onclick={(event) =>
										void createNoteAt(page, undefined, undefined, event.currentTarget)}
									disabled={busy}
									aria-label={`Ajouter une note à la page ${page}`}
									title="Ajouter une note"><MessageSquarePlus size={17} /></button
								>
								<button
									type="button"
									onclick={() => move(page, -1)}
									disabled={busy || page === 1}
									aria-label={`Déplacer la page ${page} vers le haut`}
									title="Monter"><ChevronUp size={17} /></button
								><button
									type="button"
									onclick={() => move(page, 1)}
									disabled={busy || page === pages.length}
									aria-label={`Déplacer la page ${page} vers le bas`}
									title="Descendre"><ChevronDown size={17} /></button
								><button
									type="button"
									onclick={() => duplicate(page)}
									disabled={busy}
									aria-label={`Dupliquer la page ${page}`}
									title="Dupliquer"><Copy size={17} /></button
								><button
									type="button"
									class="danger-action"
									onclick={() => remove(page)}
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
