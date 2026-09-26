<script lang="ts">
	import ActionButton from '#lib/components/ActionButton.svelte';
	import PDFContentTools from '#lib/components/PDFContentTools.svelte';
	import { listFormFields, type ContentKind, type PDFFormField } from '#lib/utils/PDFContent.js';
	import { onMount, tick, untrack } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { flip } from 'svelte/animate';
	import { cubicOut } from 'svelte/easing';
	import { goto } from '$app/navigation';
	import {
		ArrowLeft,
		ChevronDown,
		ChevronUp,
		Copy,
		Download,
		Pipette,
		FilePlus2,
		FileText,
		Highlighter,
		Info,
		LockKeyhole,
		Menu,
		Minus,
		MessageSquarePlus,
		MessageSquareText,
		Plus,
		RotateCw,
		ScanText,
		Trash2,
		Undo2,
		X
	} from '@lucide/svelte';
	import type { PDFDocument } from 'pdf-lib';
	import {
		TextLayer,
		type PDFDocumentProxy,
		type RenderTask
	} from 'pdfjs-dist/legacy/build/pdf.mjs';
	import 'pdfjs-dist/web/pdf_viewer.css';
	import { fileSession, getProcessedFile, setProcessedFile } from '../../stores/FileStore.svelte';
	import { parse as parsePDFjs } from '#lib/utils/PDFjsHelper.js';
	import { save as savePDF } from '#lib/utils/PDFLibHelper.js';
	import { downloadBlob } from '#lib/utils/Download.js';
	import {
		readPDFMetadata,
		loadPDFMetadata,
		type ImportedPDFMetadata
	} from '#lib/utils/PDFMetadata.js';
	import {
		mergePDFs,
		duplicatePage,
		removePage,
		reorderPage,
		rotatePage
	} from '#lib/utils/PDFEdition.js';
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
	import { extractPDFText, type ExtractedPDFText } from '#lib/utils/PDFText.js';
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
	let exportButton: HTMLButtonElement = $state(null!);
	let exportDialog: HTMLDialogElement = $state(null!);
	let exportPasswordInput: HTMLInputElement = $state(null!);
	let exportPassword = $state('');
	let exportPasswordConfirmation = $state('');
	let exportError = $state('');
	let deleteDialog: HTMLDialogElement = $state(null!);
	let pageToDelete: number | null = $state(null);
	let importedMetadata: ImportedPDFMetadata | null = $state(null);
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
	let textDialog: HTMLDialogElement = $state(null!);
	let textArea: HTMLTextAreaElement = $state(null!);
	let extractedText: ExtractedPDFText | null = $state(null);
	let extractionProgress = $state('');
	let extractionError = $state('');
	let extractionFeedback = $state('');
	let extractionRunning = $state(false);
	let extractionController: AbortController | undefined;
	let busy = $state(false);
	let dirty = $state(false);
	let mounted = $state(false);
	const feedbackId = 'editor-feedback';
	const notePlacementId = 'editor-note-placement';
	const notifySuccess = (message: string) => {
		if (mounted)
			toast.success(message, {
				id: feedbackId,
				duration: 6000,
				important: false,
				action: undefined
			});
	};
	const notifyError = (message: string) => {
		if (mounted)
			toast.error(message, {
				id: feedbackId,
				duration: Infinity,
				important: true,
				action: undefined
			});
	};
	const notifyOcrProgress = (message: string) => {
		if (mounted)
			toast.loading(message, {
				id: feedbackId,
				duration: Infinity,
				important: false,
				action: undefined
			});
	};
	let refreshToken = 0;
	let activeRender: RenderTask | undefined;
	let layoutDocument: PDFDocumentProxy | null = null;
	let layoutReadyToken = 0;
	let renderedPages = $state(new Set<number>());
	let renderedPageIds = $state(new Set<number>());
	let renderedThumbnails = new Set<number>();
	let renderLoopActive = false;
	let renderAgain = false;
	let scrollFrame = 0;
	let syncPreviewOnNextFrame = false;
	let notes: PDFNote[] = $state([]);
	let noteMarkers: { id: string; page: number; text: string; left: number; top: number }[] = $state(
		[]
	);
	let noteMode = $state(false);
	let placingContent: ContentKind | null = $state(null);
	let contentTools: PDFContentTools = $state(null!);
	let formFields: PDFFormField[] = [];
	let formRects: {
		field: PDFFormField;
		left: number;
		top: number;
		width: number;
		height: number;
	}[] = $state([]);
	let fieldDrag = $state.raw<{
		field: PDFFormField;
		pointerId: number;
		startX: number;
		startY: number;
		startLeft: number;
		startTop: number;
		moved: boolean;
	} | null>(null);
	let suppressFieldClick = false;
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
		if (!getProcessedFile() || !fileSession.updatedFile || !fileSession.openedFile) {
			void goto('/');
			return;
		}
		void loadImportedMetadata(fileSession.openedFile, fileSession.updatedFile, getProcessedFile());
		notes = listNotes(fileSession.updatedFile);
		formFields = listFormFields(fileSession.updatedFile);
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
			mounted = false;
			toast.dismiss(feedbackId);
			toast.dismiss(notePlacementId);
			extractionController?.abort();
			window.removeEventListener('resize', closeSidebarOnMobile);
			cancelAnimationFrame(scrollFrame);
			refreshToken++;
			activeRender?.cancel();
		};
	});

	const loadImportedMetadata = async (
		file: File,
		document: PDFDocument,
		viewer: PDFDocumentProxy
	) => {
		const original = readPDFMetadata(file, document);
		importedMetadata = original;
		const complete = await loadPDFMetadata(original, viewer);
		if (mounted) importedMetadata = complete;
	};
	const openInfo = () => {
		toolsOpen = false;
		if (!infoDialog.open) infoDialog.showModal();
	};

	async function renderDocument(document: PDFDocumentProxy, zoom: number) {
		const token = ++refreshToken;
		const documentChanged = layoutDocument !== document;
		layoutDocument = document;
		layoutReadyToken = 0;
		activeRender?.cancel();
		activeRender = undefined;
		renderedPages = new Set();
		if (documentChanged) renderedThumbnails = new Set();
		pages = Array.from({ length: document.numPages }, (_, index) => index + 1);
		if (pageItems.length !== document.numPages) setPageIds(pages.map(() => ++nextPageId));
		const currentPageIds = new Set(pageItems.map(({ id }) => id));
		renderedPageIds = new Set([...renderedPageIds].filter((id) => currentPageIds.has(id)));
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

				const viewport = page.getViewport({ scale: zoom });
				formRects = [
					...formRects.filter((item) => item.field.page !== pageNumber),
					...formFields
						.filter((field) => field.page === pageNumber)
						.map((field) => {
							const [x1, y1] = viewport.convertToViewportPoint(field.rect[0], field.rect[1]);
							const [x2, y2] = viewport.convertToViewportPoint(field.rect[2], field.rect[3]);
							return {
								field,
								left: Math.min(x1, x2),
								top: Math.min(y1, y2),
								width: Math.abs(x2 - x1),
								height: Math.abs(y2 - y1)
							};
						})
				];
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
				if (token === refreshToken) notifyError(`La page ${pageNumber} n’a pas pu être affichée.`);
			}
		}
		if (token !== refreshToken) return;
		layoutReadyToken = token;
		void renderVisiblePages();
	}

	const keepThumbnailVisible = (pageNumber: number) => {
		const list = window.document.querySelector<HTMLElement>('.thumbnail-list');
		const thumbnail = list?.querySelectorAll<HTMLElement>('.thumbnail-item')[pageNumber - 1];
		if (!list || !thumbnail) return;
		const viewport = list.getBoundingClientRect();
		const bounds = thumbnail.getBoundingClientRect();
		const padding = 12;
		if (bounds.top < viewport.top + padding) {
			list.scrollTop += bounds.top - viewport.top - padding;
		} else if (bounds.bottom > viewport.bottom - padding) {
			list.scrollTop += bounds.bottom - viewport.bottom + padding;
		}
	};
	const syncPageFromPreview = () => {
		if (!documentStage || !pages.length) return;
		const viewport = documentStage.getBoundingClientRect();
		let currentPage = selectedPage;
		let largestVisibleHeight = 0;
		for (const pageNumber of pages) {
			const bounds = pageSection(pageNumber)?.getBoundingClientRect();
			if (!bounds) continue;
			const visibleHeight = Math.max(
				0,
				Math.min(bounds.bottom, viewport.bottom) - Math.max(bounds.top, viewport.top)
			);
			if (visibleHeight > largestVisibleHeight) {
				largestVisibleHeight = visibleHeight;
				currentPage = pageNumber;
			}
		}
		if (largestVisibleHeight && currentPage !== selectedPage) {
			selectedPage = currentPage;
			keepThumbnailVisible(currentPage);
		}
	};
	const scheduleVisibleRender = (syncPreview = false) => {
		syncPreviewOnNextFrame ||= syncPreview;
		cancelAnimationFrame(scrollFrame);
		scrollFrame = requestAnimationFrame(() => {
			const shouldSyncPreview = syncPreviewOnNextFrame;
			syncPreviewOnNextFrame = false;
			if (shouldSyncPreview) syncPageFromPreview();
			void renderVisiblePages();
		});
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
		const pageId = pageItems[number - 1]?.id;
		if (pageId !== undefined && renderedPageIds.has(pageId)) {
			renderedPageIds = new Set([...renderedPageIds].filter((id) => id !== pageId));
		}
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
				if (layoutReadyToken !== token || !documentStage || !getProcessedFile()) break;
				const document = getProcessedFile();
				const zoom = scale;
				const wanted = visiblePageNumbers();
				const wantedSet = new Set(wanted);
				for (const number of pages) {
					if (wantedSet.has(number)) continue;
					const canvas = pageSection(number)?.querySelector<HTMLCanvasElement>('.pdf-sheet canvas');
					if (!canvas || (canvas.width === 0 && canvas.height === 0)) continue;
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
					if (!sheet || !canvas || !layer) continue;
					try {
						const page = await document.getPage(number);
						if (token !== refreshToken) break;
						const viewport = page.getViewport({ scale: zoom });
						const pixelRatio = Math.min(window.devicePixelRatio || 1, 2, maxZoom / zoom);
						const nextCanvas = canvas.cloneNode(false) as HTMLCanvasElement;
						nextCanvas.width = Math.round(viewport.width * pixelRatio);
						nextCanvas.height = Math.round(viewport.height * pixelRatio);
						const task = (activeRender = page.render({
							canvas: nextCanvas,
							viewport,
							transform: [pixelRatio, 0, 0, pixelRatio, 0, 0]
						}));
						await task.promise;
						if (activeRender === task) activeRender = undefined;
						if (token !== refreshToken) break;
						const textContent = await page.getTextContent();
						if (token !== refreshToken) break;
						const nextTextLayer = window.document.createElement('div');
						await new TextLayer({
							textContentSource: textContent,
							container: nextTextLayer,
							viewport
						}).render();
						if (token !== refreshToken) break;
						if (!canvas.isConnected || sheet.querySelector('canvas') !== canvas) continue;
						canvas.replaceWith(nextCanvas);
						layer.style.cssText = nextTextLayer.style.cssText;
						const mainRotation = nextTextLayer.getAttribute('data-main-rotation');
						if (mainRotation === null) layer.removeAttribute('data-main-rotation');
						else layer.setAttribute('data-main-rotation', mainRotation);
						layer.replaceChildren(...Array.from(nextTextLayer.childNodes));
						renderedPages = new Set([...renderedPages, number]);
						const pageId = pageItems[number - 1]?.id;
						if (pageId !== undefined) renderedPageIds = new Set([...renderedPageIds, pageId]);
					} catch (cause) {
						activeRender = undefined;
						if (
							token === refreshToken &&
							!(cause instanceof Error && cause.name === 'RenderingCancelledException')
						)
							notifyError(`La page ${number} n’a pas pu être affichée.`);
					}
				}
				if (token !== refreshToken || renderAgain) continue;
				for (const number of visibleThumbnailNumbers()) {
					if (token !== refreshToken || renderAgain) break;
					const canvas =
						window.document.querySelectorAll<HTMLCanvasElement>('.thumbnail-item canvas')[
							number - 1
						];
					if (!canvas) continue;
					if (renderedThumbnails.has(number) && canvas.width > 0 && canvas.height > 0) continue;
					try {
						const page = await document.getPage(number);
						if (token !== refreshToken) break;
						const viewport = page.getViewport({ scale: 0.2 });
						const nextCanvas = canvas.cloneNode(false) as HTMLCanvasElement;
						nextCanvas.width = Math.round(viewport.width);
						nextCanvas.height = Math.round(viewport.height);
						const task = (activeRender = page.render({ canvas: nextCanvas, viewport }));
						await task.promise;
						if (activeRender === task) activeRender = undefined;
						if (token !== refreshToken) break;
						if (
							!canvas.isConnected ||
							!sidebarOpen ||
							canvas.parentElement?.querySelector('canvas') !== canvas
						)
							continue;
						canvas.replaceWith(nextCanvas);
						renderedThumbnails = new Set([...renderedThumbnails, number]);
					} catch (cause) {
						activeRender = undefined;
						if (
							token === refreshToken &&
							!(cause instanceof Error && cause.name === 'RenderingCancelledException')
						)
							notifyError(`La miniature ${number} n’a pas pu être affichée.`);
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
		const previousPreview = getProcessedFile();
		refreshToken++;
		activeRender?.cancel();
		try {
			await previousPreview.loadingTask.destroy();
		} catch {
			// The new preview remains usable if the previous renderer already stopped.
		}
		fileSession.updatedFile = document;
		formFields = listFormFields(document);
		notes = listNotes(document);
		highlights = listHighlights(document);
		selectionToken++;
		selectedText = null;
		setProcessedFile(preview);
		dirty = true;
	};

	const startFieldDrag = (event: PointerEvent, field: PDFFormField, left: number, top: number) => {
		if (busy || event.button !== 0) return;
		event.preventDefault();
		(event.currentTarget as HTMLButtonElement).setPointerCapture(event.pointerId);
		fieldDrag = {
			field,
			pointerId: event.pointerId,
			startX: event.clientX,
			startY: event.clientY,
			startLeft: left,
			startTop: top,
			moved: false
		};
	};
	const previewFieldDrag = (event: PointerEvent) => {
		const drag = fieldDrag;
		if (!drag || event.pointerId !== drag.pointerId) return;
		const deltaX = event.clientX - drag.startX;
		const deltaY = event.clientY - drag.startY;
		if (!drag.moved && Math.hypot(deltaX, deltaY) < 4) return;
		drag.moved = true;
		formRects = formRects.map((item) =>
			item.field.name === drag.field.name &&
			item.field.page === drag.field.page &&
			item.field.widgetIndex === drag.field.widgetIndex
				? { ...item, left: drag.startLeft + deltaX, top: drag.startTop + deltaY }
				: item
		);
	};
	const resetFieldDragPreview = (drag: NonNullable<typeof fieldDrag>) => {
		formRects = formRects.map((item) =>
			item.field.name === drag.field.name &&
			item.field.page === drag.field.page &&
			item.field.widgetIndex === drag.field.widgetIndex
				? { ...item, left: drag.startLeft, top: drag.startTop }
				: item
		);
	};
	const finishFieldDrag = async (event: PointerEvent) => {
		const drag = fieldDrag;
		if (!drag || event.pointerId !== drag.pointerId) return;
		fieldDrag = null;
		if (!drag.moved) return;
		suppressFieldClick = true;
		window.setTimeout(() => (suppressFieldClick = false), 0);
		try {
			const sheet = pageSection(drag.field.page)?.querySelector<HTMLElement>('.pdf-sheet');
			const bounds = sheet?.getBoundingClientRect();
			if (!bounds || bounds.width <= 0) throw new Error('La page du champ est indisponible.');
			const page = await getProcessedFile().getPage(drag.field.page);
			const baseViewport = page.getViewport({ scale: 1 });
			const viewport = page.getViewport({ scale: bounds.width / baseViewport.width });
			const [startX, startY] = viewport.convertToPdfPoint(
				drag.startX - bounds.left,
				drag.startY - bounds.top
			);
			const [endX, endY] = viewport.convertToPdfPoint(
				event.clientX - bounds.left,
				event.clientY - bounds.top
			);
			const moved = await contentTools.move(drag.field, endX - startX, endY - startY);
			if (!moved) resetFieldDragPreview(drag);
		} catch {
			resetFieldDragPreview(drag);
		}
	};
	const cancelFieldDrag = (event: PointerEvent) => {
		const drag = fieldDrag;
		if (!drag || event.pointerId !== drag.pointerId) return;
		fieldDrag = null;
		resetFieldDragPreview(drag);
	};
	const moveFieldWithKeyboard = async (
		event: KeyboardEvent,
		field: PDFFormField,
		left: number,
		top: number,
		width: number,
		height: number
	) => {
		if (!event.altKey || !event.key.startsWith('Arrow') || busy) return;
		event.preventDefault();
		const sheet = pageSection(field.page)?.querySelector<HTMLElement>('.pdf-sheet');
		const bounds = sheet?.getBoundingClientRect();
		if (!bounds || bounds.width <= 0) return;
		const page = await getProcessedFile().getPage(field.page);
		const baseViewport = page.getViewport({ scale: 1 });
		const viewport = page.getViewport({ scale: bounds.width / baseViewport.width });
		const centerX = left + width / 2;
		const centerY = top + height / 2;
		const step = event.shiftKey ? 24 : 8;
		const screenDeltas: Record<string, [number, number]> = {
			ArrowLeft: [-step, 0],
			ArrowRight: [step, 0],
			ArrowUp: [0, -step],
			ArrowDown: [0, step]
		};
		const screenDelta = screenDeltas[event.key];
		if (!screenDelta) return;
		const [startX, startY] = viewport.convertToPdfPoint(centerX, centerY);
		const [endX, endY] = viewport.convertToPdfPoint(
			centerX + screenDelta[0],
			centerY + screenDelta[1]
		);
		await contentTools.move(field, endX - startX, endY - startY);
	};

	const runAction = async (action: () => Promise<void>, success?: string) => {
		if (busy) return;
		busy = true;
		if (success) toast.dismiss(feedbackId);
		try {
			await action();
			if (success) notifySuccess(success);
		} catch {
			notifyError('L’opération a échoué. Votre document reste ouvert.');
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
			notifyError('Un PDF doit conserver au moins une page.');
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
	const rotate = (pageNumber: number) =>
		void runAction(async () => {
			const next = await rotatePage(fileSession.updatedFile, pageNumber);
			await applyDocument(next);
			selectedPage = pageNumber;
		}, 'Page tournée. Pensez à exporter le PDF.');

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

	const save = () => {
		exportError = '';
		exportDialog.showModal();
		exportPasswordInput.focus();
	};
	const savePlain = () => {
		exportDialog.close();
		void runAction(async () => {
			await savePDF(fileSession.updatedFile, fileSession.fileName);
			dirty = false;
		}, 'PDF exporté dans vos téléchargements.');
	};
	const saveProtected = async () => {
		if (busy) return;
		if (!exportPassword || exportPassword !== exportPasswordConfirmation) {
			exportError = exportPassword
				? 'Les mots de passe ne correspondent pas.'
				: 'Saisissez un mot de passe.';
			return;
		}
		busy = true;
		exportError = '';
		toast.dismiss(feedbackId);
		try {
			await savePDF(fileSession.updatedFile, fileSession.fileName, exportPassword);
			dirty = false;
			notifySuccess('PDF protégé exporté dans vos téléchargements.');
			exportDialog.close();
		} catch {
			exportError = 'Le PDF protégé n’a pas pu être créé. Réessayez.';
		} finally {
			busy = false;
		}
	};
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
		notifyOcrProgress('Analyse du document…');
		try {
			const result = await applyOcrToPdf(
				fileSession.updatedFile,
				getProcessedFile(),
				ocrLanguage,
				(progress) => {
					notifyOcrProgress(describeOcrProgress(progress));
				}
			);
			if (result.wordsAdded) {
				await applyDocument(result.document);
				notifySuccess(
					`Texte ajouté à ${result.pagesUpdated} ${result.pagesUpdated === 1 ? 'page' : 'pages'}. Exportez le PDF pour le conserver.`
				);
			} else if (result.pagesProcessed) {
				notifySuccess('Aucun texte reconnu sur les pages sans texte.');
			} else {
				notifySuccess('Toutes les pages contiennent déjà du texte sélectionnable.');
			}
		} catch (cause) {
			console.error('OCR failed:', cause);
			notifyError(
				'L’OCR a échoué. Vérifiez votre connexion lors du premier téléchargement du modèle de langue, puis réessayez.'
			);
		} finally {
			busy = false;
		}
	};
	const openTextExtraction = async () => {
		if (busy) return;
		toolsOpen = false;
		extractedText = null;
		extractionError = '';
		extractionFeedback = '';
		extractionProgress = `Extraction de la page 1 sur ${getProcessedFile().numPages}…`;
		extractionController = new AbortController();
		extractionRunning = true;
		busy = true;
		textDialog.showModal();
		try {
			extractedText = await extractPDFText(
				getProcessedFile(),
				(page, total) => {
					extractionProgress = `Extraction de la page ${page} sur ${total}…`;
				},
				extractionController.signal
			);
		} catch (cause) {
			if (!(cause instanceof DOMException && cause.name === 'AbortError'))
				extractionError = 'Le texte n’a pas pu être extrait. Réessayez.';
		} finally {
			extractionProgress = '';
			extractionRunning = false;
			busy = false;
			extractionController = undefined;
		}
	};
	const copyExtractedText = async () => {
		if (!extractedText?.text) return;
		try {
			await navigator.clipboard.writeText(extractedText.text);
		} catch {
			textArea.select();
			if (!window.document.execCommand('copy')) {
				extractionFeedback = 'Copie impossible. Sélectionnez le texte et copiez-le manuellement.';
				return;
			}
		}
		extractionFeedback = 'Texte copié dans le presse-papiers.';
	};
	const downloadExtractedText = () => {
		if (!extractedText?.text) return;
		const blob = new Blob([extractedText.text], { type: 'text/plain;charset=utf-8' });
		downloadBlob(blob, `${fileSession.fileName.replace(/\.pdf$/i, '')}.txt`);
		extractionFeedback = 'Texte téléchargé au format .txt.';
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
	const zoomAnchorAt = (clientX: number, clientY: number): ZoomAnchor | null => {
		const sheets = Array.from(documentStage.querySelectorAll<HTMLElement>('.pdf-sheet'));
		const sheet =
			sheets.find((item) => {
				const bounds = item.getBoundingClientRect();
				return (
					clientX >= bounds.left &&
					clientX <= bounds.right &&
					clientY >= bounds.top &&
					clientY <= bounds.bottom
				);
			}) || sheets[Math.max(0, selectedPage - 1)];
		if (!sheet) return null;
		const bounds = sheet.getBoundingClientRect();
		return {
			page: Number(sheet.closest<HTMLElement>('.page-section')?.dataset.page || 1),
			x: Math.max(0, Math.min(1, (clientX - bounds.left) / bounds.width)),
			y: Math.max(0, Math.min(1, (clientY - bounds.top) / bounds.height)),
			clientX,
			clientY
		};
	};
	const zoomAnchor = (touches: TouchList): ZoomAnchor | null => {
		const center = touchCenter(touches);
		return zoomAnchorAt(center.x, center.y);
	};
	const zoomWithWheel = (event: WheelEvent) => {
		if ((!event.ctrlKey && !event.metaKey) || event.deltaY === 0 || busy) return;
		event.preventDefault();
		const anchor = zoomAnchorAt(event.clientX, event.clientY);
		if (!anchor) return;
		const nextScale = Math.max(
			minZoom,
			Math.min(maxZoom, Math.round((scale + (event.deltaY < 0 ? 0.1 : -0.1)) * 100) / 100)
		);
		if (nextScale === scale) return;
		pendingZoomAnchor = anchor;
		scale = nextScale;
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
	const resetHighlightSelection = () => {
		selectionToken++;
		selectedText = null;
		colorWheelOpen = false;
	};
	const clearTextSelection = () => {
		resetHighlightSelection();
		window.getSelection()?.removeAllRanges();
	};
	const captureTextSelection = async () => {
		const token = ++selectionToken;
		const selection = window.getSelection();
		if (
			!selection ||
			selection.isCollapsed ||
			!selection.toString().trim() ||
			!selection.rangeCount
		) {
			resetHighlightSelection();
			return;
		}
		if (busy || noteMode || placingContent) return;
		const sheetFor = (node: Node | null) =>
			(node instanceof Element ? node : node?.parentElement)?.closest<HTMLElement>('.pdf-sheet');
		const sheet = sheetFor(selection.anchorNode);
		if (!sheet || sheet !== sheetFor(selection.focusNode)) {
			resetHighlightSelection();
			return;
		}
		const layer = sheet.querySelector('.textLayer');
		if (!layer?.contains(selection.anchorNode) || !layer.contains(selection.focusNode)) {
			resetHighlightSelection();
			return;
		}
		const section = sheet.closest<HTMLElement>('.page-section');
		const pageNumber = Number(section?.dataset.page || 0);
		if (!pageNumber) {
			resetHighlightSelection();
			return;
		}
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
		if (!rectangles.length) {
			resetHighlightSelection();
			return;
		}
		const text = selection.toString().trim();
		const pdfPage = await getProcessedFile().getPage(pageNumber);
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
		});
	};
	const undoHighlight = () => {
		if (!lastHighlightId || busy) return;
		const id = lastHighlightId;
		void runAction(async () => {
			await applyDocument(await removeHighlight(fileSession.updatedFile, id));
			lastHighlightId = null;
		});
	};
	$effect(() => {
		if (!mounted) return;
		if (noteMode) {
			untrack(() => {
				toast.info('Cliquez ou touchez une page pour placer la note.', {
					id: notePlacementId,
					duration: Infinity,
					closeButton: false,
					dismissible: false,
					action: {
						label: 'Annuler',
						onClick: () => {
							noteMode = false;
							noteModeButton.focus();
						}
					}
				});
			});
		} else {
			toast.dismiss(notePlacementId);
		}
	});
	$effect(() => {
		if (placingContent) {
			noteMode = false;
			untrack(clearTextSelection);
		}
	});
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
		const page = await getProcessedFile().getPage(pageNumber);
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
		const document = getProcessedFile();
		const zoom = scale;
		if (mounted && document) untrack(() => void renderDocument(document, zoom));
	});
	$effect(() => {
		if (!mounted) return;
		renderedThumbnails.clear();
		if (sidebarOpen)
			void tick().then(() => {
				keepThumbnailVisible(selectedPage);
				scheduleVisibleRender();
			});
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
	onpointermove={previewFieldDrag}
	onpointerup={(event) => void finishFieldDrag(event)}
	onpointercancel={cancelFieldDrag}
	onpointerdown={(event) => {
		if (
			selectedText &&
			event.target instanceof Element &&
			event.target.closest('.highlight-toolbar')
		) {
			const control = event.target.closest<HTMLElement>('button, [role="slider"]');
			if (control) {
				// Keep the PDF selection while retaining keyboard access to the color controls.
				event.preventDefault();
				control.focus({ preventScroll: true });
			}
			return;
		}
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

<div class="editor-shell h-screen min-h-120 flex flex-col overflow-hidden bg-[#eaece8]">
	<header
		class="editor-header h-18 flex-none flex items-center justify-between gap-5 p-[0_22px] border-b border-b-(--line) bg-(--paper) max-[760px]:h-16 max-[760px]:p-[0_12px] max-[760px]:gap-2"
	>
		<div class="editor-identity flex items-center min-w-0 gap-3.25 max-[760px]:gap-1.75">
			<ActionButton
				class="icon-button back-button border border-transparent bg-transparent text-(--ink) rounded-[7px] min-w-9.5 h-9.5 inline-flex items-center justify-center gap-2 hover:bg-[#eef1eb] max-[520px]:min-w-8 cursor-pointer disabled:cursor-not-allowed disabled:opacity-48 focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-(--ring) motion-reduce:transition-none motion-reduce:animate-none"
				type="button"
				onclick={back}
				disabled={busy}
				aria-label="Retour à l’accueil"
				title="Retour à l’accueil"><ArrowLeft size={19} /></ActionButton
			>
			<span
				class="brand-mark compact inline-flex justify-center items-center bg-(--accent) text-white font-extrabold leading-none -tracking-widest pr-0.75 w-8 h-8 text-[23px] rounded-lg flex-none max-[520px]:hidden"
				>i<span class="text-[#dfb394]">.</span></span
			>
			<div class="document-identity flex flex-col min-w-0 gap-0.75">
				<strong
					class="max-w-[min(32vw,420px)] overflow-hidden whitespace-nowrap text-ellipsis text-[14px] font-extrabold max-[760px]:max-w-[29vw] max-[760px]:text-[12px] max-[520px]:max-w-[32vw]"
					title={fileSession.fileName}>{fileSession.fileName || 'Document sans titre'}</strong
				><small class="text-(--muted-ink) text-[11px] max-[760px]:text-[10px]"
					>{dirty ? 'Modifications non exportées' : 'Document ouvert'}</small
				>
			</div>
		</div>
		<div class="editor-actions flex items-center gap-2 flex-none max-[760px]:gap-0.75">
			<ActionButton
				bind:ref={noteModeButton}
				class="toolbar-button note-mode-button border {noteMode
					? 'bg-[#fbece5] text-[#8d3e27]'
					: 'bg-transparent text-(--ink)'} rounded-[7px] min-w-9.5 h-9.5 inline-flex items-center justify-center gap-2 hover:bg-[#eef1eb] {noteMode
					? 'border-[#dcae98]'
					: 'border-(--line)'} p-[0_12px] text-[12px] font-extrabold max-[760px]:p-0 max-[760px]:min-w-9.5 cursor-pointer disabled:cursor-not-allowed disabled:opacity-48 focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-(--ring) motion-reduce:transition-none motion-reduce:animate-none"
				type="button"
				onclick={() => {
					placingContent = null;
					noteMode = !noteMode;
				}}
				disabled={busy}
				aria-pressed={noteMode}
				aria-label="Ajouter une note sur une page"
				title="Ajouter une note sur une page"
				><MessageSquarePlus size={18} /><span class="max-[760px]:hidden">Ajouter une note</span
				></ActionButton
			>
			<input
				bind:this={mergeInput}
				type="file"
				accept=".pdf,application/pdf"
				class="sr-only cursor-pointer disabled:cursor-not-allowed disabled:opacity-48 focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-(--ring) motion-reduce:transition-none motion-reduce:animate-none"
				onchange={merge}
				aria-label="Choisir un PDF à ajouter"
			/>
			<ActionButton
				class="toolbar-button merge-button border bg-transparent text-(--ink) rounded-[7px] min-w-9.5 h-9.5 inline-flex items-center justify-center gap-2 hover:bg-[#eef1eb] border-(--line) p-[0_12px] text-[12px] font-extrabold max-[760px]:p-0 max-[760px]:min-w-9.5 cursor-pointer disabled:cursor-not-allowed disabled:opacity-48 focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-(--ring) motion-reduce:transition-none motion-reduce:animate-none"
				type="button"
				onclick={() => mergeInput.click()}
				disabled={busy}
				aria-label="Ajouter un PDF"
				><FilePlus2 size={18} />
				<span class="max-[760px]:hidden">Ajouter un PDF</span></ActionButton
			>
			<ActionButton
				bind:ref={infoButton}
				class="icon-button info-button border bg-transparent text-(--ink) rounded-[7px] min-w-9.5 h-9.5 inline-flex items-center justify-center gap-2 hover:bg-[#eef1eb] border-(--line) cursor-pointer disabled:cursor-not-allowed disabled:opacity-48 focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-(--ring) motion-reduce:transition-none motion-reduce:animate-none"
				type="button"
				onclick={openInfo}
				aria-label="Informations sur le PDF"
				aria-haspopup="dialog"
				title="Informations sur le PDF"><Info size={20} strokeWidth={1.8} /></ActionButton
			>
			<div class="tools-wrap relative">
				<ActionButton
					bind:ref={toolsButton}
					class="icon-button tools-button border border-transparent bg-transparent text-(--ink) rounded-[7px] min-w-9.5 h-9.5 inline-flex items-center justify-center gap-2 hover:bg-[#eef1eb] cursor-pointer disabled:cursor-not-allowed disabled:opacity-48 focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-(--ring) motion-reduce:transition-none motion-reduce:animate-none"
					type="button"
					onclick={() => (toolsOpen = !toolsOpen)}
					aria-label="Outils texte : OCR et extraction"
					aria-haspopup="true"
					aria-expanded={toolsOpen}
					title="Outils texte : OCR et extraction"
					><ScanText size={20} strokeWidth={1.9} /></ActionButton
				>{#if toolsOpen}<div
						class="tools-popover absolute right-0 top-11 z-20 w-[min(300px,calc(100vw-24px))] p-4.5 bg-(--paper) border border-(--line) rounded-lg shadow-[0_12px_30px_#24342822]"
						role="group"
						aria-label="Outils texte"
					>
						<strong class="flex items-center gap-2 text-[13px]"
							><ScanText size={17} /> Reconnaître le texte</strong
						>
						<p class="m-[10px_0_16px] text-[12px] leading-[1.55] text-(--muted-ink)">
							Ajoute du texte sélectionnable aux pages qui n’en contiennent pas.
						</p>
						<label class="block mb-1.75 text-[11px] font-extrabold" for="ocr-language"
							>Langue du document</label
						>
						<select
							class="w-full min-h-9.5 p-[0_9px] border border-(--line) rounded-md bg-white text-(--ink) text-[12px] cursor-pointer disabled:cursor-not-allowed disabled:opacity-48 focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-(--ring) motion-reduce:transition-none motion-reduce:animate-none"
							id="ocr-language"
							bind:value={ocrLanguage}
							disabled={busy}
						>
							<option value="fra">Français</option>
							<option value="eng">Anglais</option>
							<option value="eng+fra">Français et anglais</option>
						</select>
						<small class="block mt-2.75 text-(--muted-ink) text-[10px] leading-normal"
							>Le modèle de langue est téléchargé au premier lancement. Le PDF reste sur cet
							appareil.</small
						>
						<button
							class="w-full flex justify-center p-2.5 mt-4 bg-(--accent) text-white border-0 rounded-[5px] text-[12px] font-extrabold hover:bg-(--accent-dark) cursor-pointer disabled:cursor-not-allowed disabled:opacity-48 focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-(--ring) motion-reduce:transition-none motion-reduce:animate-none"
							type="button"
							onclick={ocr}
							disabled={busy}>Lancer l’OCR</button
						>
						<div class="mt-4 border-t border-(--line) pt-4">
							<strong class="flex items-center gap-2 text-[13px]"
								><FileText size={17} /> Extraire le texte</strong
							>
							<p>Récupère le texte de toutes les pages pour le copier ou le télécharger.</p>
							<button
								type="button"
								onclick={() => void openTextExtraction()}
								disabled={busy}
								class="flex min-h-10 w-full items-center justify-center gap-2 rounded-md border border-(--line) bg-white text-[12px] font-extrabold text-(--ink) hover:bg-[#eef1eb] focus-visible:outline-(--ring) cursor-pointer disabled:cursor-not-allowed disabled:opacity-48 focus-visible:outline-3 focus-visible:outline-offset-3 motion-reduce:transition-none motion-reduce:animate-none"
								><FileText size={16} /> Extraire tout le texte</button
							>
						</div>
					</div>{/if}
			</div>
			<ActionButton
				bind:ref={exportButton}
				class="export-button inline-flex items-center justify-center gap-2.5 p-[0_19px] border-0 rounded-[7px] bg-(--accent) text-white font-extrabold transition-[background,transform] duration-150 ease-linear hover:bg-(--accent-dark) min-h-9.75 text-[12px] max-[760px]:p-[0_11px] cursor-pointer disabled:cursor-not-allowed disabled:opacity-48 focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-(--ring) motion-reduce:transition-none motion-reduce:animate-none"
				type="button"
				onclick={save}
				disabled={busy}
				aria-haspopup="dialog"
				aria-label="Exporter le PDF"
				><Download size={18} /><span class="max-[760px]:hidden">Exporter le PDF</span></ActionButton
			>
		</div>
	</header>
	<dialog
		bind:this={textDialog}
		class="w-[min(680px,calc(100vw-32px))] max-h-[calc(100vh-32px)] m-auto p-0 flex-col [[open]]:flex border border-(--line) rounded-xl bg-(--paper) text-(--ink) shadow-[0_24px_70px_#17241c40] backdrop:bg-[#17241c99]"
		aria-labelledby="text-dialog-title"
		onclose={() => {
			extractionController?.abort();
			toolsButton?.focus();
		}}
	>
		<div class="flex items-center justify-between gap-4 border-b border-(--line) px-6 py-5">
			<div class="flex items-center gap-3">
				<span class="grid size-10 place-items-center rounded-[9px] bg-[#e4eee6] text-(--accent)"
					><FileText size={20} /></span
				>
				<div>
					<span class="text-[10px] font-extrabold tracking-[0.14em] text-(--accent)"
						>OUTILS TEXTE</span
					>
					<h2 id="text-dialog-title" class="mt-1 text-[17px] font-extrabold">Texte du document</h2>
				</div>
			</div>
			<ActionButton
				type="button"
				onclick={() => textDialog.close()}
				aria-label="Fermer le texte extrait"
				class="grid size-10 place-items-center rounded-[7px] hover:bg-[#eef1eb] focus-visible:outline-(--ring) cursor-pointer disabled:cursor-not-allowed disabled:opacity-48 focus-visible:outline-3 focus-visible:outline-offset-3 motion-reduce:transition-none motion-reduce:animate-none"
				><X size={18} /></ActionButton
			>
		</div>
		<div class="min-h-0 flex-1 overflow-y-auto px-6 py-5">
			{#if extractionRunning}
				<p role="status" class="text-[13px] font-bold text-(--accent)">
					{extractionProgress}
				</p>
			{:else if extractionError}
				<p role="alert" class="text-[13px] font-bold text-[#a4492e]">{extractionError}</p>
			{:else if extractedText}
				<p class="mb-3 text-[12px] text-(--muted-ink)">
					{extractedText.pagesWithText}
					{extractedText.pagesWithText === 1 ? 'page avec texte' : 'pages avec texte'} sur {pages.length}
				</p>
				{#if extractedText.pagesWithoutText.length}
					<p
						role="status"
						class="mb-4 rounded-[7px] bg-[#fff4e7] px-3 py-2 text-[12px] leading-normal text-[#7b4a19]"
					>
						{extractedText.pagesWithoutText.length}
						{extractedText.pagesWithoutText.length === 1
							? 'page ne contient'
							: 'pages ne contiennent'} pas de texte détectable. Pour un scan, lancez l’OCR puis relancez
						l’extraction.
					</p>
				{/if}
				{#if extractedText.text}
					<label for="extracted-document-text" class="mb-2 block text-[12px] font-extrabold"
						>Texte extrait, par page</label
					>
					<textarea
						id="extracted-document-text"
						bind:this={textArea}
						readonly
						spellcheck="false"
						value={extractedText.text}
						class="h-[min(50vh,400px)] min-h-45 w-full resize-y rounded-[7px] border border-(--line) bg-white p-3 font-mono text-[12px] leading-[1.6] text-(--ink) focus-visible:outline-(--ring) max-[520px]:h-60 cursor-pointer disabled:cursor-not-allowed disabled:opacity-48 focus-visible:outline-3 focus-visible:outline-offset-3 motion-reduce:transition-none motion-reduce:animate-none"
					></textarea>
				{:else}
					<p class="text-[13px] leading-normal text-(--muted-ink)">
						Aucun texte à copier ou à télécharger dans ce document.
					</p>
				{/if}
			{/if}
		</div>
		<div
			class="flex flex-none flex-wrap items-center justify-end gap-2 border-t border-(--line) px-6 py-4"
		>
			{#if extractionFeedback}<span
					role="status"
					class="mr-auto text-[11px] font-bold text-(--accent)">{extractionFeedback}</span
				>{/if}
			<button
				type="button"
				onclick={copyExtractedText}
				disabled={!extractedText?.text || extractionRunning}
				class="inline-flex min-h-10 items-center gap-2 rounded-[7px] border border-(--line) px-3 text-[12px] font-extrabold hover:bg-[#eef1eb] disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-(--ring) motion-reduce:transition-none motion-reduce:animate-none"
				><Copy size={16} /> Copier le texte</button
			>
			<button
				type="button"
				onclick={downloadExtractedText}
				disabled={!extractedText?.text || extractionRunning}
				class="inline-flex min-h-10 items-center gap-2 rounded-[7px] bg-(--accent) px-3 text-[12px] font-extrabold text-white hover:bg-(--accent-dark) disabled:opacity-50 max-[520px]:w-full max-[520px]:justify-center cursor-pointer disabled:cursor-not-allowed focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-(--ring) motion-reduce:transition-none motion-reduce:animate-none"
				><Download size={16} /> Télécharger le .txt</button
			>
		</div>
	</dialog>
	<dialog
		bind:this={exportDialog}
		class="w-[min(440px,calc(100vw-32px))] max-h-[calc(100vh-32px)] m-auto p-0 border border-(--line) rounded-xl bg-(--paper) text-(--ink) shadow-[0_24px_70px_#17241c40] backdrop:bg-[#17241c99]"
		aria-labelledby="export-dialog-title"
		oncancel={(event) => {
			if (busy) event.preventDefault();
		}}
		onclose={() => {
			exportPassword = '';
			exportPasswordConfirmation = '';
			exportError = '';
			exportButton?.focus();
		}}
	>
		<form
			onsubmit={(event) => {
				event.preventDefault();
				void saveProtected();
			}}
		>
			<div class="flex items-center justify-between gap-4 border-b border-(--line) px-6 py-5">
				<div class="flex items-center gap-3">
					<span class="grid size-10 place-items-center rounded-[9px] bg-[#e4eee6] text-(--accent)"
						><LockKeyhole size={20} /></span
					>
					<div>
						<span class="text-[10px] font-extrabold tracking-[0.14em] text-(--accent)"
							>EXPORT PDF</span
						>
						<h2 id="export-dialog-title" class="mt-1 text-[17px] font-extrabold">
							Exporter le document
						</h2>
					</div>
				</div>
				<ActionButton
					type="button"
					onclick={() => exportDialog.close()}
					disabled={busy}
					aria-label="Fermer l’export"
					class="grid size-10 place-items-center rounded-[7px] text-(--ink) hover:bg-[#eef1eb] focus-visible:outline-(--ring) cursor-pointer disabled:cursor-not-allowed disabled:opacity-48 focus-visible:outline-3 focus-visible:outline-offset-3 motion-reduce:transition-none motion-reduce:animate-none"
					><X size={18} /></ActionButton
				>
			</div>
			<div class="px-6 py-5">
				<p class="mb-4 text-[12px] leading-[1.55] text-(--muted-ink)">
					Téléchargez le PDF tel quel ou protégez son ouverture par un mot de passe.
				</p>
				<button
					type="button"
					onclick={savePlain}
					disabled={busy}
					class="flex min-h-11 w-full items-center justify-center gap-2 rounded-[7px] border border-(--line) text-[12px] font-extrabold text-(--ink) hover:bg-[#eef1eb] focus-visible:outline-(--ring) cursor-pointer disabled:cursor-not-allowed disabled:opacity-48 focus-visible:outline-3 focus-visible:outline-offset-3 motion-reduce:transition-none motion-reduce:animate-none"
					><Download size={17} /> Télécharger sans mot de passe</button
				>
				<div
					class="my-5 flex items-center gap-3 text-[11px] text-(--muted-ink) before:h-px before:flex-1 before:bg-(--line) after:h-px after:flex-1 after:bg-(--line)"
				>
					OU
				</div>
				<div class="space-y-3">
					<div>
						<label for="export-password" class="mb-1.5 block text-[12px] font-extrabold"
							>Mot de passe d’ouverture</label
						>
						<input
							id="export-password"
							bind:this={exportPasswordInput}
							bind:value={exportPassword}
							oninput={() => (exportError = '')}
							type="password"
							autocomplete="new-password"
							class="min-h-11 w-full rounded-[7px] border border-(--line) bg-white px-3 text-[14px] text-(--ink) focus-visible:outline-(--ring) cursor-pointer disabled:cursor-not-allowed disabled:opacity-48 focus-visible:outline-3 focus-visible:outline-offset-3 motion-reduce:transition-none motion-reduce:animate-none"
						/>
					</div>
					<div>
						<label
							for="export-password-confirmation"
							class="mb-1.5 block text-[12px] font-extrabold">Confirmer le mot de passe</label
						>
						<input
							id="export-password-confirmation"
							bind:value={exportPasswordConfirmation}
							oninput={() => (exportError = '')}
							type="password"
							autocomplete="new-password"
							class="min-h-11 w-full rounded-[7px] border border-(--line) bg-white px-3 text-[14px] text-(--ink) focus-visible:outline-(--ring) cursor-pointer disabled:cursor-not-allowed disabled:opacity-48 focus-visible:outline-3 focus-visible:outline-offset-3 motion-reduce:transition-none motion-reduce:animate-none"
						/>
					</div>
					<p class="text-[11px] leading-normal text-(--muted-ink)">
						Conservez ce mot de passe : Inscribe ne pourra pas le récupérer. Vous en aurez besoin
						pour rouvrir ce PDF.
					</p>
					{#if exportError}<p role="alert" class="text-[12px] font-bold text-[#a4492e]">
							{exportError}
						</p>{/if}
				</div>
			</div>
			<div class="flex justify-end gap-2 border-t border-(--line) px-6 py-4">
				<button
					type="button"
					onclick={() => exportDialog.close()}
					disabled={busy}
					class="min-h-10 rounded-[7px] border border-(--line) px-4 text-[12px] font-extrabold hover:bg-[#eef1eb] cursor-pointer disabled:cursor-not-allowed disabled:opacity-48 focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-(--ring) motion-reduce:transition-none motion-reduce:animate-none"
					>Annuler</button
				>
				<button
					type="submit"
					disabled={busy}
					class="min-h-10 rounded-[7px] bg-(--accent) px-4 text-[12px] font-extrabold text-white hover:bg-(--accent-dark) disabled:opacity-60 cursor-pointer disabled:cursor-not-allowed focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-(--ring) motion-reduce:transition-none motion-reduce:animate-none"
					>{busy ? 'Protection…' : 'Protéger et télécharger'}</button
				>
			</div>
		</form>
	</dialog>
	<dialog
		bind:this={infoDialog}
		class="pdf-info-dialog w-[min(480px,calc(100vw-32px))] max-h-[calc(100vh-32px)] m-auto p-0 border border-(--line) rounded-xl bg-(--paper) text-(--ink) shadow-[0_24px_70px_#17241c40] backdrop:bg-[#17241c99]"
		aria-labelledby="pdf-info-title"
		onclose={() => infoButton?.focus()}
	>
		<div
			class="pdf-info-header sticky top-0 z-1 flex items-center justify-between gap-4 p-[20px_23px] border-b border-b-(--line) bg-(--paper)"
		>
			<div class="pdf-info-heading flex items-center gap-3.25">
				<span
					class="pdf-info-mark w-9.5 h-9.5 rounded-[9px] grid place-items-center bg-[#e4eee6] text-(--accent)"
					><Info size={20} strokeWidth={1.8} /></span
				>
				<div>
					<span class="section-index text-[11px] text-(--accent) tracking-[0.15em] font-extrabold"
						>DOCUMENT IMPORTÉ</span
					>
					<h2 class="mt-1 text-[17px] leading-[1.2]" id="pdf-info-title">
						Informations sur le PDF
					</h2>
				</div>
			</div>
			<ActionButton
				class="icon-button border border-transparent bg-transparent text-(--ink) rounded-[7px] min-w-9.5 h-9.5 inline-flex items-center justify-center gap-2 hover:bg-[#eef1eb] cursor-pointer disabled:cursor-not-allowed disabled:opacity-48 focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-(--ring) motion-reduce:transition-none motion-reduce:animate-none"
				type="button"
				onclick={() => infoDialog.close()}
				aria-label="Fermer les informations"><X size={18} /></ActionButton
			>
		</div>
		{#if importedMetadata}
			<div
				class="pdf-info-file flex items-center gap-3.25 m-[20px_23px_7px] p-3.75 border border-[#dce6dc] rounded-lg bg-[#f1f6f0] text-(--accent)"
			>
				<FileText class="shrink-0" size={22} strokeWidth={1.7} />
				<div class="min-w-0 flex flex-col gap-1">
					<strong class="wrap-anywhere text-[13px]">{importedMetadata.name}</strong>
					<span class="text-[11px] text-(--muted-ink)"
						>{importedMetadata.size} · {importedMetadata.pages}
						{importedMetadata.pages === 1 ? 'page' : 'pages'}</span
					>
				</div>
			</div>
			<dl class="pdf-metadata-list m-0 p-[10px_23px_24px]">
				{#each metadataRows as row}
					<div
						class="grid grid-cols-[145px_minmax(0,1fr)] gap-3.5 p-[11px_0] border-b border-b-(--line) text-[12px] leading-normal last:border-b-0"
					>
						<dt class="text-(--muted-ink)">{row.label}</dt>
						<dd class="m-0 font-bold wrap-anywhere">{row.value}</dd>
					</div>
				{/each}
			</dl>
		{:else}
			<p class="pdf-info-loading p-[20px_23px] text-[12px] text-(--muted-ink)">
				Lecture des métadonnées…
			</p>
		{/if}
	</dialog>
	<dialog
		bind:this={noteDialog}
		class="pdf-info-dialog note-dialog w-[min(480px,calc(100vw-32px))] max-h-[calc(100vh-32px)] m-auto p-0 border border-(--line) rounded-xl bg-(--paper) text-(--ink) shadow-[0_24px_70px_#17241c40] backdrop:bg-[#17241c99]"
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
				class="pdf-info-header sticky top-0 z-1 flex items-center justify-between gap-4 p-[20px_23px] border-b border-b-(--line) bg-(--paper)"
			>
				<div class="pdf-info-heading flex items-center gap-3.25">
					<span
						class="pdf-info-mark w-9.5 h-9.5 rounded-[9px] grid place-items-center bg-[#e4eee6] text-(--accent)"
						><MessageSquareText size={20} /></span
					>
					<div>
						<span class="section-index text-[11px] text-(--accent) tracking-[0.15em] font-extrabold"
							>ANNOTATION PDF</span
						>
						<h2 class="mt-1 text-[17px] leading-[1.2]" id="note-dialog-title">
							{editingNote ? 'Modifier la note' : 'Nouvelle note'}
						</h2>
					</div>
				</div>
				<ActionButton
					class="icon-button border border-transparent bg-transparent text-(--ink) rounded-[7px] min-w-9.5 h-9.5 inline-flex items-center justify-center gap-2 hover:bg-[#eef1eb] cursor-pointer disabled:cursor-not-allowed disabled:opacity-48 focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-(--ring) motion-reduce:transition-none motion-reduce:animate-none"
					type="button"
					onclick={() => noteDialog.close()}
					aria-label="Fermer la note"><X size={18} /></ActionButton
				>
			</div>
			<div class="note-dialog-body p-[20px_23px]">
				<p class="mb-4.5 text-[12px] text-(--muted-ink)">
					Page {editingNote?.page ?? pendingNote?.page} · Cette note sera intégrée au PDF exporté.
				</p>
				<label class="block mb-2 text-[12px] font-extrabold" for="note-text">Texte de la note</label
				>
				<textarea
					class="w-full min-h-35 p-3 resize-y border border-(--line) rounded-[7px] bg-white text-(--ink) text-[13px] leading-normal cursor-pointer disabled:cursor-not-allowed disabled:opacity-48 focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-(--ring) motion-reduce:transition-none motion-reduce:animate-none"
					id="note-text"
					bind:this={noteTextArea}
					bind:value={noteText}
					required
					rows="6"
					placeholder="Écrivez votre note ici…"></textarea>
			</div>
			<div
				class="note-dialog-actions flex justify-end items-center flex-wrap gap-2.25 p-[16px_23px] border-t border-t-(--line)"
			>
				{#if editingNote}<button
						class="note-delete min-h-9.5 inline-flex items-center gap-1.75 p-[0_13px] border-0 rounded-[7px] text-[12px] font-extrabold mr-auto bg-transparent text-[#a4492e] hover:bg-[#fbece5] cursor-pointer disabled:cursor-not-allowed disabled:opacity-48 focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-(--ring) motion-reduce:transition-none motion-reduce:animate-none"
						type="button"
						onclick={deleteNote}
						disabled={busy}><Trash2 size={16} /> Supprimer</button
					>{/if}
				<button
					class="toolbar-button border bg-transparent text-(--ink) rounded-[7px] min-w-9.5 h-9.5 inline-flex items-center justify-center gap-2 hover:bg-[#eef1eb] border-(--line) p-[0_12px] text-[12px] font-extrabold cursor-pointer disabled:cursor-not-allowed disabled:opacity-48 focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-(--ring) motion-reduce:transition-none motion-reduce:animate-none"
					type="button"
					onclick={() => noteDialog.close()}>Annuler</button
				>
				<button
					class="note-save min-h-9.5 inline-flex items-center gap-1.75 p-[0_13px] border-0 rounded-[7px] text-[12px] font-extrabold bg-(--accent) text-white hover:bg-(--accent-dark) cursor-pointer disabled:cursor-not-allowed disabled:opacity-48 focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-(--ring) motion-reduce:transition-none motion-reduce:animate-none"
					type="submit"
					disabled={busy || !noteText.trim()}
					>{busy ? 'Enregistrement…' : 'Enregistrer la note'}</button
				>
			</div>
		</form>
	</dialog>
	<dialog
		bind:this={deleteDialog}
		class="pdf-info-dialog delete-confirm-dialog max-h-[calc(100vh-32px)] m-auto p-0 border border-(--line) rounded-xl bg-(--paper) text-(--ink) shadow-[0_24px_70px_#17241c40] backdrop:bg-[#17241c99] w-[min(420px,calc(100vw-32px))]"
		aria-labelledby="delete-page-title"
		onclose={() => (pageToDelete = null)}
	>
		<div class="delete-confirm-body p-[27px_27px_18px]">
			<span
				class="delete-confirm-icon grid place-items-center w-10 h-10 mb-4.25 rounded-[9px] bg-[#fbece5] text-[#a4492e]"
				><Trash2 size={21} strokeWidth={1.8} /></span
			>
			<h2 class="m-0 text-[18px] leading-[1.3]" id="delete-page-title">
				Supprimer la page {pageToDelete} ?
			</h2>
			<p>
				Cette page sera retirée du PDF en cours. Vous pourrez conserver le résultat en l’exportant.
			</p>
		</div>
		<div
			class="delete-confirm-actions flex justify-end gap-2.25 p-[16px_27px] border-t border-t-(--line)"
		>
			<button
				type="button"
				class="toolbar-button border bg-transparent text-(--ink) rounded-[7px] min-w-9.5 h-9.5 inline-flex items-center justify-center gap-2 hover:bg-[#eef1eb] border-(--line) p-[0_12px] text-[12px] font-extrabold cursor-pointer disabled:cursor-not-allowed disabled:opacity-48 focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-(--ring) motion-reduce:transition-none motion-reduce:animate-none"
				onclick={() => deleteDialog.close()}>Annuler</button
			>
			<button
				type="button"
				class="delete-confirm-button min-h-9.5 p-[0_14px] border-0 rounded-[7px] bg-[#a4492e] text-white text-[12px] font-extrabold hover:bg-[#873b26] cursor-pointer disabled:cursor-not-allowed disabled:opacity-48 focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-(--ring) motion-reduce:transition-none motion-reduce:animate-none"
				onclick={confirmRemoval}>Supprimer la page</button
			>
		</div>
	</dialog>
	<div
		class="editor-subbar h-11.75 flex-none bg-[#f5f6f1] border-b border-b-(--line) flex justify-between items-center gap-2 p-[0_22px] text-[11px] text-(--muted-ink) max-[760px]:h-auto max-[760px]:min-h-11.75 max-[760px]:flex-wrap max-[760px]:gap-y-0.5 max-[760px]:p-[4px_12px]"
	>
		<div class="subbar-left flex items-center gap-3.5">
			<ActionButton
				class="icon-button sidebar-toggle border border-transparent bg-transparent text-(--ink) rounded-[7px] min-w-9.5 h-9.5 inline-flex items-center justify-center gap-2 hover:bg-[#eef1eb] cursor-pointer disabled:cursor-not-allowed disabled:opacity-48 focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-(--ring) motion-reduce:transition-none motion-reduce:animate-none"
				type="button"
				onclick={() => (sidebarOpen = !sidebarOpen)}
				aria-label={sidebarOpen ? 'Masquer les pages' : 'Afficher les pages'}
				aria-expanded={sidebarOpen}><Menu size={18} /></ActionButton
			><span
				class="subbar-label text-(--accent) font-extrabold text-[10px] tracking-[0.13em] max-[760px]:hidden"
				>ÉDITION DU DOCUMENT</span
			><span class="subbar-divider w-px h-3.5 bg-[#ced2c9] max-[760px]:hidden"></span><span
				class="text-(--muted-ink)">Page {selectedPage} sur {pages.length}</span
			>
		</div>
		<div
			class="page-toolbar flex items-center gap-0.5 max-[760px]:order-3 max-[760px]:w-full max-[760px]:justify-center max-[760px]:border-t max-[760px]:border-t-(--line) max-[760px]:pt-0.5"
			role="group"
			aria-label={`Actions pour la page ${selectedPage}`}
		>
			<PDFContentTools
				bind:this={contentTools}
				bind:busy
				bind:placing={placingContent}
				onApply={applyDocument}
			/>
			<ActionButton
				class="grid size-8 cursor-pointer place-items-center rounded-md border border-transparent bg-transparent text-(--ink) hover:bg-[#e5ebe3] hover:text-(--accent) disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-(--ring)"
				type="button"
				onclick={undoHighlight}
				disabled={busy || !lastHighlightId}
				aria-label="Annuler le surlignage"
				title="Annuler le dernier surlignage"><Undo2 size={16} /></ActionButton
			>
			<ActionButton
				class="grid place-items-center w-8 h-8 border border-transparent rounded-[5px] bg-transparent text-(--ink) hover:bg-[#e5ebe3] hover:text-(--accent) focus-visible:outline-(--ring) disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed focus-visible:outline-3 focus-visible:outline-offset-3 motion-reduce:transition-none motion-reduce:animate-none"
				type="button"
				onclick={(event) =>
					void createNoteAt(selectedPage, undefined, undefined, event.currentTarget)}
				disabled={busy || pages.length === 0}
				aria-label={`Ajouter une note à la page ${selectedPage}`}
				title="Ajouter une note"><MessageSquarePlus size={16} /></ActionButton
			><ActionButton
				class="grid place-items-center w-8 h-8 border border-transparent rounded-[5px] bg-transparent text-(--ink) hover:bg-[#e5ebe3] hover:text-(--accent) focus-visible:outline-(--ring) disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed focus-visible:outline-3 focus-visible:outline-offset-3 motion-reduce:transition-none motion-reduce:animate-none"
				type="button"
				onclick={() => move(selectedPage, -1)}
				disabled={busy || selectedPage <= 1}
				aria-label={`Monter la page ${selectedPage}`}
				title="Monter la page"><ChevronUp size={17} /></ActionButton
			><ActionButton
				class="grid place-items-center w-8 h-8 border border-transparent rounded-[5px] bg-transparent text-(--ink) hover:bg-[#e5ebe3] hover:text-(--accent) focus-visible:outline-(--ring) disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed focus-visible:outline-3 focus-visible:outline-offset-3 motion-reduce:transition-none motion-reduce:animate-none"
				type="button"
				onclick={() => move(selectedPage, 1)}
				disabled={busy || selectedPage >= pages.length}
				aria-label={`Descendre la page ${selectedPage}`}
				title="Descendre la page"><ChevronDown size={17} /></ActionButton
			><ActionButton
				class="grid place-items-center w-8 h-8 border border-transparent rounded-[5px] bg-transparent text-(--ink) hover:bg-[#e5ebe3] hover:text-(--accent) focus-visible:outline-(--ring) disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed focus-visible:outline-3 focus-visible:outline-offset-3 motion-reduce:transition-none motion-reduce:animate-none"
				type="button"
				onclick={() => rotate(selectedPage)}
				disabled={busy || pages.length === 0}
				aria-label={`Tourner la page ${selectedPage} de 90 degrés`}
				title="Tourner de 90°"><RotateCw size={16} /></ActionButton
			><ActionButton
				class="grid place-items-center w-8 h-8 border border-transparent rounded-[5px] bg-transparent text-(--ink) hover:bg-[#e5ebe3] hover:text-(--accent) focus-visible:outline-(--ring) disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed focus-visible:outline-3 focus-visible:outline-offset-3 motion-reduce:transition-none motion-reduce:animate-none"
				type="button"
				onclick={() => duplicate(selectedPage)}
				disabled={busy || pages.length === 0}
				aria-label={`Dupliquer la page ${selectedPage}`}
				title="Dupliquer la page"><Copy size={16} /></ActionButton
			><ActionButton
				class="grid place-items-center w-8 h-8 border border-transparent rounded-[5px] bg-transparent text-(--ink) last:text-[#9c442e] last:hover:bg-[#f6dfd5] focus-visible:outline-(--ring) disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed focus-visible:outline-3 focus-visible:outline-offset-3 motion-reduce:transition-none motion-reduce:animate-none"
				type="button"
				onclick={() => void remove(selectedPage)}
				disabled={busy || pages.length <= 1}
				aria-label={`Supprimer la page ${selectedPage}`}
				title="Supprimer la page"><Trash2 size={16} /></ActionButton
			>
		</div>
		<div class="zoom-controls flex items-center gap-0.75 max-[760px]:ml-auto">
			<ActionButton
				class="icon-button border border-transparent bg-transparent text-(--ink) rounded-[7px] min-w-7.5 h-7.5 inline-flex items-center justify-center gap-2 hover:bg-[#eef1eb] cursor-pointer disabled:cursor-not-allowed disabled:opacity-48 focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-(--ring) motion-reduce:transition-none motion-reduce:animate-none"
				type="button"
				onclick={() => setZoom(-0.1)}
				aria-label="Réduire le zoom"
				disabled={scale <= minZoom}><Minus size={17} /></ActionButton
			><span
				class="min-w-12.5 text-center text-[11px] font-extrabold text-(--ink)"
				aria-live="polite">{Math.round(scale * 100)} %</span
			><ActionButton
				class="icon-button border border-transparent bg-transparent text-(--ink) rounded-[7px] min-w-7.5 h-7.5 inline-flex items-center justify-center gap-2 hover:bg-[#eef1eb] cursor-pointer disabled:cursor-not-allowed disabled:opacity-48 focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-(--ring) motion-reduce:transition-none motion-reduce:animate-none"
				type="button"
				onclick={() => setZoom(0.1)}
				aria-label="Augmenter le zoom"
				disabled={scale >= maxZoom}><Plus size={17} /></ActionButton
			>
		</div>
	</div>
	{#if selectedText}<div
			class="highlight-toolbar fixed z-30 left-[50%] bottom-5 transform-[translateX(-50%)] w-[min(360px,calc(100vw-24px))] max-h-[calc(100dvh-24px)] overflow-y-auto p-3.25 border border-[#c8d1c6] rounded-[10px] bg-(--paper) shadow-[0_12px_36px_#20302535] max-[760px]:bottom-2.5"
			role="toolbar"
			aria-label="Surligner le texte sélectionné"
		>
			<div
				class="highlight-toolbar-title flex items-center gap-2.25 text-(--accent) text-[12px] font-extrabold"
			>
				<Highlighter class="flex-none" size={17} /><span
					class="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap"
					>Surligner <strong class="text-(--ink) font-bold"
						>« {selectedText.text.length > 48
							? `${selectedText.text.slice(0, 48)}…`
							: selectedText.text} »</strong
					></span
				><ActionButton
					class="grid w-7 h-7 place-items-center border-0 rounded-[5px] bg-transparent text-(--muted-ink) hover:bg-[#e9eee7] cursor-pointer disabled:cursor-not-allowed disabled:opacity-48 focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-(--ring) motion-reduce:transition-none motion-reduce:animate-none"
					type="button"
					onclick={clearTextSelection}
					aria-label="Fermer les couleurs"><X size={16} /></ActionButton
				>
			</div>
			<div class="highlight-colors flex items-center gap-2.25 mt-2.75">
				{#each highlightColors as color}<ActionButton
						type="button"
						class="highlight-swatch w-8.5 h-8.5 flex-none border border-[#0003] rounded-md shadow-[inset_0_0_0_3px_#fff8] hover:transform-[translateY(-2px)] hover:shadow-[inset_0_0_0_3px_#fff8,0_3px_8px_#0002] cursor-pointer disabled:cursor-not-allowed disabled:opacity-48 focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-(--ring) motion-reduce:transition-none motion-reduce:animate-none"
						style={`background: ${color.value}`}
						onclick={() => highlightSelection(color.value)}
						disabled={busy}
						aria-label={`Surligner en ${color.name}`}
						title={color.name}
					></ActionButton>{/each}
				<ActionButton
					type="button"
					class="highlight-custom-toggle flex items-center gap-1.75 min-h-8.5 ml-auto p-[0_8px] border border-(--line) rounded-md bg-transparent text-(--ink) text-[11px] font-extrabold hover:bg-[#eef1eb] cursor-pointer disabled:cursor-not-allowed disabled:opacity-48 focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-(--ring) motion-reduce:transition-none motion-reduce:animate-none"
					onclick={() => (colorWheelOpen = !colorWheelOpen)}
					aria-expanded={colorWheelOpen}
					aria-label="Choisir une couleur personnalisée"
					><Pipette size={16} class="shrink-0" aria-hidden="true" /> Personnaliser</ActionButton
				>
			</div>
			{#if colorWheelOpen}<div
					class="highlight-wheel-panel grid justify-items-center gap-3 mt-3.25 pt-3.5 border-t border-t-(--line)"
				>
					<ColorWheel bind:value={customColor} /><button
						type="button"
						class="highlight-apply w-full min-h-9.5 border-0 rounded-md bg-(--accent) text-white text-[12px] font-extrabold hover:bg-(--accent-dark) cursor-pointer disabled:cursor-not-allowed disabled:opacity-48 focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-(--ring) motion-reduce:transition-none motion-reduce:animate-none"
						onclick={() => highlightSelection(customColor)}
						disabled={busy}>Surligner avec cette couleur</button
					>
				</div>{/if}
		</div>{/if}
	<div class="editor-body flex min-h-0 flex-1">
		{#if sidebarOpen}<aside
				class="page-sidebar w-55.5 flex-none min-h-0 flex flex-col bg-[#f6f6f2] border-r border-r-(--line) max-[760px]:absolute max-[760px]:z-10 max-[760px]:top-36.75 max-[760px]:bottom-0 max-[760px]:w-[min(78vw,250px)] max-[760px]:shadow-[12px_0_20px_#24342817]"
				aria-label="Pages du document"
				onscrollcapture={() => scheduleVisibleRender()}
			>
				<div
					class="sidebar-heading text-(--accent) font-extrabold text-[10px] tracking-[0.13em] p-[21px_22px_15px] flex justify-between"
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
								class="thumbnail-item relative flex flex-col items-center w-full p-[13px_10px] border border-transparent rounded-lg bg-transparent text-(--ink) cursor-grab [&.dragging]:opacity-[0.55] [&.dragging]:cursor-grabbing [&.drop-before::before]:content-[''] [&.drop-before::before]:absolute [&.drop-before::before]:left-1.75 [&.drop-before::before]:right-1.75 [&.drop-before::before]:h-0.75 [&.drop-before::before]:rounded-[3px] [&.drop-before::before]:bg-(--orange) [&.drop-after::after]:content-[''] [&.drop-after::after]:absolute [&.drop-after::after]:left-1.75 [&.drop-after::after]:right-1.75 [&.drop-after::after]:h-0.75 [&.drop-after::after]:rounded-[3px] [&.drop-after::after]:bg-(--orange) [&.drop-before::before]:top-0 [&.drop-after::after]:bottom-0 hover:bg-[#e9eee7] [&.active]:bg-[#e4eee6] [&.active]:border-[#c6d8c9] disabled:cursor-not-allowed disabled:opacity-48 focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-(--ring) motion-reduce:transition-none motion-reduce:animate-none"
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
									class="thumbnail-paper w-30 min-h-39.5 grid place-items-center p-0.75 border shadow-[0_2px_8px_#24342816] bg-white {selectedPage ===
									page
										? 'border-(--accent)'
										: 'border-[#d3d6ce]'}"
									><canvas class="block w-auto max-w-28 max-h-37.5" width="0" height="0"
									></canvas></span
								><span
									class="thumbnail-caption flex justify-between w-full mt-2.5 text-[11px] font-bold"
									><span class="text-(--accent) font-extrabold"
										>{String(page).padStart(2, '0')}</span
									><span>Page {page}</span></span
								></button
							>{/each}
					</ContextMenu.Trigger>
					<ContextMenu.Portal>
						<ContextMenu.Content
							class="page-context-menu z-50 min-w-48 p-1 border border-(--line) rounded-lg bg-(--paper) text-(--ink) shadow-[0_12px_32px_#24342825]"
						>
							<ContextMenu.Item
								class="flex min-h-8.5 items-center gap-2.5 p-[6px_9px] rounded-[5px] outline-none data-highlighted:bg-[#e9eee7] data-disabled:opacity-[0.45]"
								onSelect={() => contextMenuPage !== null && move(contextMenuPage, -1)}
								disabled={busy || contextMenuPage === null || contextMenuPage === 1}
								><ChevronUp size={16} /> Monter la page</ContextMenu.Item
							>
							<ContextMenu.Item
								class="flex min-h-8.5 items-center gap-2.5 p-[6px_9px] rounded-[5px] outline-none data-highlighted:bg-[#e9eee7] data-disabled:opacity-[0.45]"
								onSelect={() => contextMenuPage !== null && move(contextMenuPage, 1)}
								disabled={busy || contextMenuPage === null || contextMenuPage === pages.length}
								><ChevronDown size={16} /> Descendre la page</ContextMenu.Item
							>
							<ContextMenu.Separator class="h-px m-[4px_-4px] bg-(--line)" />
							<ContextMenu.Item
								class="flex min-h-8.5 items-center gap-2.5 p-[6px_9px] rounded-[5px] outline-none data-highlighted:bg-[#e9eee7] data-disabled:opacity-[0.45]"
								onSelect={() => contextMenuPage !== null && duplicate(contextMenuPage)}
								disabled={busy || contextMenuPage === null}
								><Copy size={16} /> Dupliquer la page</ContextMenu.Item
							>
							<ContextMenu.Item
								onSelect={() => contextMenuPage !== null && remove(contextMenuPage)}
								disabled={busy || contextMenuPage === null || pages.length <= 1}
								class="flex min-h-8.5 items-center gap-2.5 p-[6px_9px] rounded-[5px] outline-none data-highlighted:bg-[#e9eee7] data-disabled:opacity-[0.45] text-[#a4492e]"
								><Trash2 size={16} /> Supprimer la page</ContextMenu.Item
							>
						</ContextMenu.Content>
					</ContextMenu.Portal>
				</ContextMenu.Root>
				<div
					class="sidebar-footer mt-auto p-[14px_18px] border-t border-t-(--line) text-(--muted-ink) text-[10px] flex items-center gap-2"
					id="page-reorder-hint"
				>
					<FileText size={15} /><span class="desktop-hint max-[760px]:hidden"
						>Glissez pour réordonner · clic droit pour les actions</span
					><span class="touch-hint hidden max-[760px]:inline"
						>Utilisez les flèches sous chaque page</span
					>
				</div>
			</aside>{/if}
		<main
			bind:this={documentStage}
			class="document-stage flex-1 min-w-0 overflow-auto scroll-smooth touch-pan-x touch-pan-y overscroll-contain [&.pinching]:scroll-auto motion-reduce:scroll-auto"
			class:pinching={pinch !== null || pendingZoomAnchor !== null}
			aria-label="Aperçu du document"
			onscroll={() => scheduleVisibleRender(true)}
			onwheel={zoomWithWheel}
			{@attach pinchListeners}
			ontouchend={endPinch}
			ontouchcancel={endPinch}
		>
			<div
				class="stage-inner w-fit min-w-full p-[28px_clamp(20px,5vw,70px)_50px] m-auto max-[760px]:p-[20px_16px_40px]"
			>
				<div
					class="stage-heading text-(--accent) font-extrabold text-[10px] tracking-[0.13em] flex justify-between gap-5 max-w-250 m-[0_auto_24px] max-[520px]:text-[9px]"
				>
					<span>APERÇU DU DOCUMENT</span><span class="text-(--muted-ink)"
						>Page {selectedPage} sur {pages.length}</span
					>
				</div>
				{#each pageItems as { id, page } (id)}<section
						animate:flip={{ duration: animatingReorder ? moveDuration : 0, easing: cubicOut }}
						class="page-section w-fit m-[0_auto_42px]"
						data-page={page}
						aria-label={`Page ${page}`}
					>
						<div
							class="pdf-sheet relative bg-white shadow-[0_12px_36px_#2b352429,0_1px_3px_#2b352419] [&.placing-note]:cursor-crosshair"
							class:placing-note={noteMode}
							style:zoom={pinchFactor}
						>
							<canvas class="block max-w-none" width="0" height="0"></canvas>
							{#if !renderedPageIds.has(pageItems[page - 1]?.id ?? -1)}<div
									class="page-loading absolute inset-0 grid place-items-center p-5 bg-white text-(--muted-ink) text-[12px] font-bold"
									aria-hidden="true"
								>
									Chargement de la page {page}…
								</div>{/if}
							<div
								class="highlight-layer absolute z-1 inset-0 pointer-events-none mix-blend-multiply"
								aria-hidden="true"
							>
								{#each highlightRects.filter((item) => item.page === page) as highlight}<span
										class="highlight-rect absolute rounded-xs opacity-[0.5]"
										style:left={`${highlight.left}px`}
										style:top={`${highlight.top}px`}
										style:width={`${highlight.width}px`}
										style:height={`${highlight.height}px`}
										style:background={highlight.color}
									></span>{/each}
							</div>
							<div
								class="textLayer absolute z-2 top-0 left-0 overflow-hidden"
								class:pointer-events-none={noteMode}
								class:cursor-crosshair={noteMode}
							></div>
							{#if placingContent}
								<button
									type="button"
									class="absolute inset-0 z-5 size-full cursor-crosshair border-0 bg-transparent focus-visible:outline-3 focus-visible:outline-(--ring)"
									aria-label={`Placer le contenu sur la page ${page}`}
									onclick={(event) => {
										const bounds = event.currentTarget.getBoundingClientRect();
										void contentTools.place(
											page,
											event.detail === 0 ? 0.1 : (event.clientX - bounds.left) / bounds.width,
											event.detail === 0 ? 0.15 : (event.clientY - bounds.top) / bounds.height
										);
									}}
								></button>
							{/if}
							{#if !placingContent && !noteMode}
								{#each formRects.filter((item) => item.field.page === page) as item}
									<ActionButton
										class="absolute z-4 cursor-move touch-none rounded-xs border border-dashed border-transparent bg-transparent hover:border-(--accent) hover:bg-(--accent)/8 focus-visible:outline-3 focus-visible:outline-(--ring)"
										style={`left: ${item.left}px; top: ${item.top}px; width: ${item.width}px; height: ${item.height}px`}
										aria-label={item.field.kind === 'placed-text'
											? 'Modifier ou déplacer le texte ajouté'
											: `Déplacer ou modifier le champ ${item.field.name}`}
										tooltip={item.field.kind === 'placed-text'
											? 'Cliquer pour modifier ou supprimer · glisser pour déplacer · Alt + flèches au clavier'
											: 'Glisser pour déplacer · cliquer pour modifier · Alt + flèches au clavier'}
										disabled={busy}
										onpointerdown={(event) =>
											startFieldDrag(event, item.field, item.left, item.top)}
										onkeydown={(event) =>
											void moveFieldWithKeyboard(
												event,
												item.field,
												item.left,
												item.top,
												item.width,
												item.height
											)}
										onclick={() => {
											if (suppressFieldClick) {
												suppressFieldClick = false;
												return;
											}
											contentTools.edit(item.field);
										}}
									></ActionButton>
								{/each}
							{/if}
							{#if noteMode}<button
									class="note-placement-target absolute z-2 inset-0 w-full h-full p-0 border-0 bg-transparent cursor-crosshair disabled:cursor-not-allowed disabled:opacity-48 focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-(--ring) motion-reduce:transition-none motion-reduce:animate-none"
									type="button"
									aria-label={`Placer une note sur la page ${page}`}
									onclick={(event) => onSheetClick(event, page)}
								></button>{/if}
							{#each noteMarkers.filter((note) => note.page === page) as note (note.id)}<button
									class="note-marker absolute z-3 grid place-items-center w-7 h-7 p-0 border border-[#9c4a2e] rounded-[5px] bg-[#f8d6a1] text-[#70351f] shadow-[0_2px_7px_#33221844] hover:bg-[#ffbf78] cursor-pointer disabled:cursor-not-allowed disabled:opacity-48 focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-(--ring) motion-reduce:transition-none motion-reduce:animate-none"
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
						<div class="page-actions flex justify-between items-center mt-3.25 text-(--muted-ink)">
							<span class="text-(--accent) font-extrabold text-[10px] tracking-[0.13em]"
								>PAGE {String(page).padStart(2, '0')}</span
							>
							<div class="flex items-center gap-0.75">
								<ActionButton
									class="grid place-items-center w-8.25 h-8 border border-transparent rounded-[5px] bg-transparent text-[#58615a] hover:bg-[#dce5db] hover:text-(--accent) cursor-pointer disabled:cursor-not-allowed disabled:opacity-48 focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-(--ring) motion-reduce:transition-none motion-reduce:animate-none"
									type="button"
									onclick={(event) =>
										void createNoteAt(page, undefined, undefined, event.currentTarget)}
									disabled={busy}
									aria-label={`Ajouter une note à la page ${page}`}
									title="Ajouter une note"><MessageSquarePlus size={17} /></ActionButton
								>
								<ActionButton
									class="grid place-items-center w-8.25 h-8 border border-transparent rounded-[5px] bg-transparent text-[#58615a] hover:bg-[#dce5db] hover:text-(--accent) cursor-pointer disabled:cursor-not-allowed disabled:opacity-48 focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-(--ring) motion-reduce:transition-none motion-reduce:animate-none"
									type="button"
									onclick={() => move(page, -1)}
									disabled={busy || page === 1}
									aria-label={`Déplacer la page ${page} vers le haut`}
									title="Monter"><ChevronUp size={17} /></ActionButton
								><ActionButton
									class="grid place-items-center w-8.25 h-8 border border-transparent rounded-[5px] bg-transparent text-[#58615a] hover:bg-[#dce5db] hover:text-(--accent) cursor-pointer disabled:cursor-not-allowed disabled:opacity-48 focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-(--ring) motion-reduce:transition-none motion-reduce:animate-none"
									type="button"
									onclick={() => move(page, 1)}
									disabled={busy || page === pages.length}
									aria-label={`Déplacer la page ${page} vers le bas`}
									title="Descendre"><ChevronDown size={17} /></ActionButton
								><ActionButton
									class="grid place-items-center w-8.25 h-8 border border-transparent rounded-[5px] bg-transparent text-[#58615a] hover:bg-[#dce5db] hover:text-(--accent) cursor-pointer disabled:cursor-not-allowed disabled:opacity-48 focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-(--ring) motion-reduce:transition-none motion-reduce:animate-none"
									type="button"
									onclick={() => rotate(page)}
									disabled={busy}
									aria-label={`Tourner la page ${page} de 90 degrés`}
									title="Tourner de 90°"><RotateCw size={17} /></ActionButton
								><ActionButton
									class="grid place-items-center w-8.25 h-8 border border-transparent rounded-[5px] bg-transparent text-[#58615a] hover:bg-[#dce5db] hover:text-(--accent) cursor-pointer disabled:cursor-not-allowed disabled:opacity-48 focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-(--ring) motion-reduce:transition-none motion-reduce:animate-none"
									type="button"
									onclick={() => duplicate(page)}
									disabled={busy}
									aria-label={`Dupliquer la page ${page}`}
									title="Dupliquer"><Copy size={17} /></ActionButton
								><ActionButton
									class="grid place-items-center w-8.25 h-8 border border-transparent rounded-[5px] bg-transparent text-[#58615a] hover:bg-[#f6dfd5] hover:text-[#9c442e] cursor-pointer disabled:cursor-not-allowed disabled:opacity-48 focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-(--ring) motion-reduce:transition-none motion-reduce:animate-none"
									type="button"
									onclick={() => remove(page)}
									disabled={busy || pages.length <= 1}
									aria-label={`Supprimer la page ${page}`}
									title="Supprimer"><Trash2 size={17} /></ActionButton
								>
							</div>
						</div>
					</section>{/each}
			</div>
		</main>
	</div>
</div>
