<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import {
		ArrowRight,
		Clock3,
		FileText,
		FolderOpen,
		ShieldCheck,
		UploadCloud
	} from '@lucide/svelte';
	import { fileName, openedFile, processedFile, updatedFile } from '../stores/FileStore';
	import * as PDFLibHelper from '#lib/utils/PDFLibHelper.js';
	import * as PDFjsHelper from '#lib/utils/PDFjsHelper.js';
	import * as pdfJS from 'pdfjs-dist';
	import pdfJSWorkerURL from 'pdfjs-dist/legacy/build/pdf.worker.mjs?url';
	import { listRecentFiles, openRecentDatabase, saveRecentFile } from '#lib/utils/IndexDBUtils.js';
	import type { RecentFile } from '../types/recentFile';

	let input: HTMLInputElement;
	let db: IDBDatabase | undefined;
	let dbPromise: Promise<IDBDatabase> | undefined;
	let recentFiles: RecentFile[] = [];
	let isLoading = false;
	let isDragging = false;
	let error = '';

	pdfJS.GlobalWorkerOptions.workerSrc = pdfJSWorkerURL;

	onMount(() => {
		let active = true;
		dbPromise = openRecentDatabase();
		void dbPromise
			.then(async (database) => {
				if (!active) {
					database.close();
					return;
				}
				db = database;
				const files = await listRecentFiles(database);
				if (active) recentFiles = files;
			})
			.catch(() => {
				if (active)
					error = 'L’historique local est indisponible. Vous pouvez toujours ouvrir un PDF.';
			});
		return () => {
			active = false;
			db?.close();
		};
	});

	const openPdf = async (file: File, remember = true) => {
		if (isLoading) return;
		if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
			error = 'Choisissez un fichier PDF pour continuer.';
			return;
		}
		isLoading = true;
		error = '';
		try {
			const document = await PDFLibHelper.load(file);
			const preview = await PDFjsHelper.parse(file);
			$fileName = file.name;
			$openedFile = file;
			$updatedFile = document;
			$processedFile = preview;
			if (remember) {
				try {
					const database = db ?? (await dbPromise);
					if (database) await saveRecentFile(database, file);
				} catch {
					/* Editing remains available when history cannot be saved. */
				}
			}
			await goto('/pdf');
		} catch {
			error =
				'Impossible d’ouvrir ce PDF. Vérifiez qu’il n’est pas endommagé ou protégé par mot de passe.';
		} finally {
			isLoading = false;
			if (input) input.value = '';
		}
	};

	const handleFileSelection = (event: Event) => {
		const file = (event.currentTarget as HTMLInputElement).files?.[0];
		if (file) void openPdf(file);
	};
	const handleDrop = (event: DragEvent) => {
		event.preventDefault();
		isDragging = false;
		const file = event.dataTransfer?.files?.[0];
		if (file) void openPdf(file);
	};
	const openRecent = (record: RecentFile) => {
		void openPdf(
			new File([record.blob], record.name, {
				type: 'application/pdf',
				lastModified: record.lastModified ?? Date.now()
			}),
			false
		);
	};
	const formatDate = (date: Date) =>
		new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }).format(
			new Date(date)
		);
</script>

<svelte:head>
	<title>Inscribe — Votre espace PDF</title>
	<meta name="description" content="Ouvrez et organisez vos documents PDF dans Inscribe." />
</svelte:head>

<div class="home-shell">
	<header class="home-header">
		<a href="/" class="brand" aria-label="Inscribe, accueil"
			><span class="brand-mark">i<span>.</span></span><span>inscribe</span></a
		>
		<span class="header-note"
			><ShieldCheck size={16} strokeWidth={1.8} /> Espace de travail local</span
		>
	</header>
	<main class="home-main">
		<section class="welcome" aria-labelledby="welcome-title">
			<div class="eyebrow"><span class="eyebrow-line"></span> VOTRE ATELIER PDF</div>
			<h1 id="welcome-title">Vos documents,<br /><em>entre de bonnes mains.</em></h1>
			<p>Ouvrez un PDF, organisez ses pages et exportez votre travail en quelques gestes.</p>
		</section>
		<section class="workspace-card" aria-label="Ouvrir un document">
			<div class="workspace-copy">
				<span class="section-index">01 / COMMENCER</span>
				<h2>Quel document ouvre-t-on ?</h2>
				<p>
					Votre fichier reste sur cet appareil. Faites-le glisser ici ou choisissez-le dans vos
					dossiers.
				</p>
				<div class="file-assurance">
					<FileText size={17} strokeWidth={1.8} /> Fichiers PDF uniquement
				</div>
			</div>
			<div
				class:dragging={isDragging}
				class="dropzone"
				role="button"
				tabindex="0"
				aria-label="Choisir un fichier PDF"
				aria-busy={isLoading}
				on:click={() => input.click()}
				on:keydown={(event) => {
					if (event.key === 'Enter' || event.key === ' ') {
						event.preventDefault();
						input.click();
					}
				}}
				on:dragover={(event) => {
					event.preventDefault();
					isDragging = true;
				}}
				on:dragleave={() => (isDragging = false)}
				on:drop={handleDrop}
			>
				<div class="dropzone-icon"><UploadCloud size={30} strokeWidth={1.6} /></div>
				<strong>{isLoading ? 'Ouverture du document…' : 'Déposez votre PDF ici'}</strong>
				<span>ou</span>
				<div class="primary-button">
					<FolderOpen size={18} strokeWidth={1.8} /> Parcourir les fichiers <ArrowRight size={17} />
				</div>
				<small>PDF uniquement · traitement sur votre appareil</small>
			</div>
			<input
				bind:this={input}
				type="file"
				accept=".pdf,application/pdf"
				class="visually-hidden"
				on:change={handleFileSelection}
				aria-label="Sélectionner un fichier PDF"
			/>
		</section>
		{#if error}<div class="notice error" role="alert">{error}</div>{/if}
		<section class="recent-section" aria-labelledby="recent-title">
			<div class="section-heading">
				<div>
					<span class="section-index">02 / REPRENDRE</span>
					<h2 id="recent-title">Documents récents</h2>
				</div>
				<span class="recent-count"
					>{recentFiles.length} {recentFiles.length === 1 ? 'document' : 'documents'}</span
				>
			</div>
			{#if recentFiles.length}
				<div class="recent-list">
					{#each recentFiles as record (record.id)}
						<button
							class="recent-row"
							type="button"
							on:click={() => openRecent(record)}
							disabled={isLoading}
						>
							<span class="recent-file-icon"><FileText size={21} strokeWidth={1.6} /></span>
							<span class="recent-file-info"
								><strong title={record.name}>{record.name}</strong><small
									>Ouvert le {formatDate(record.createdAt)}</small
								></span
							>
							<ArrowRight size={20} class="recent-arrow" aria-hidden="true" />
						</button>
					{/each}
				</div>
			{:else}
				<div class="recent-empty">
					<Clock3 size={22} strokeWidth={1.6} />
					<div>
						<strong>Votre espace est prêt.</strong>
						<p>Les documents ouverts apparaîtront ici pour les retrouver rapidement.</p>
					</div>
				</div>
			{/if}
		</section>
	</main>
	<footer class="home-footer">
		<span>Inscribe <span class="footer-dot">✳</span> Édition PDF</span><span
			>Un espace clair pour vos idées.</span
		>
	</footer>
</div>
