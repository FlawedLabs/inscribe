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
	import { fileSession } from '../stores/FileStore.svelte';
	import * as PDFLibHelper from '#lib/utils/PDFLibHelper.js';
	import * as PDFjsHelper from '#lib/utils/PDFjsHelper.js';
	import * as pdfJS from 'pdfjs-dist';
	import pdfJSWorkerURL from 'pdfjs-dist/legacy/build/pdf.worker.mjs?url';
	import { listRecentFiles, openRecentDatabase, saveRecentFile } from '#lib/utils/IndexDBUtils.js';
	import type { RecentFile } from '../types/recentFile';

	let input: HTMLInputElement = $state(null!);
	let db: IDBDatabase | undefined;
	let dbPromise: Promise<IDBDatabase> | undefined;
	let recentFiles: RecentFile[] = $state([]);
	let isLoading = $state(false);
	let isDragging = $state(false);
	let error = $state('');

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
			const previousPreview = fileSession.processedFile;
			fileSession.fileName = file.name;
			fileSession.openedFile = file;
			fileSession.updatedFile = document;
			fileSession.processedFile = preview;
			if (previousPreview && previousPreview !== preview)
				void previousPreview.loadingTask.destroy().catch(() => undefined);
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

<div class="home-shell min-h-[100vh] flex flex-col">
	<header
		class="home-header h-[82px] p-[0_clamp(24px,_6.3vw,_104px)] [border-bottom:1px_solid_var(--line)] flex items-center justify-between [background:var(--paper)] max-[760px]:h-[69px]"
	>
		<a
			href="/"
			class="brand [color:var(--ink)] inline-flex items-center gap-[12px] text-[24px] font-extrabold tracking-[-0.065em] [text-decoration:none]"
			aria-label="Inscribe, accueil"
			><span
				class="brand-mark inline-flex justify-center items-center w-[38px] h-[38px] rounded-[10px] [background:var(--accent)] text-white text-[27px] font-extrabold leading-[1] tracking-[-0.1em] pr-[3px] [&_span]:[color:#dfb394] [&.compact]:w-[32px] [&.compact]:h-[32px] [&.compact]:text-[23px] [&.compact]:rounded-[8px] [&.compact]:flex-none"
				>i<span>.</span></span
			><span>inscribe</span></a
		>
		<span
			class="header-note inline-flex items-center gap-[9px] [color:var(--muted-ink)] text-[12px] font-bold tracking-[0.025em] [&_svg]:[color:var(--accent)] max-[520px]:text-[0] max-[520px]:[&_svg]:w-[18px] max-[520px]:[&_svg]:h-[18px]"
			><ShieldCheck size={16} strokeWidth={1.8} /> Espace de travail local</span
		>
	</header>
	<main
		class="home-main w-[min(100%_-_48px,_1200px)] m-[0_auto] flex-1 p-[clamp(46px,_6.5vw,_96px)_0_75px] max-[760px]:pt-[47px] max-[520px]:w-[calc(100%_-_32px)]"
	>
		<section
			class="welcome mb-[48px] [&_h1]:m-0 [&_h1]:max-w-[930px] [&_h1]:text-[clamp(42px,_5.5vw,_74px)] [&_h1]:leading-[1.13] [&_h1]:tracking-[-0.07em] [&_h1]:font-extrabold [&_h1_em]:not-italic [&_h1_em]:[color:var(--accent)] [&_p]:max-w-[560px] [&_p]:m-[24px_0_0] [&_p]:[color:var(--muted-ink)] [&_p]:text-[17px] [&_p]:leading-[1.7] max-[760px]:mb-[34px] max-[760px]:[&_p]:text-[15px] max-[520px]:[&_h1]:text-[clamp(36px,_10vw,_52px)] max-[520px]:[&_p]:mt-[16px]"
			aria-labelledby="welcome-title"
		>
			<div
				class="eyebrow text-[11px] [color:var(--accent)] tracking-[0.15em] font-extrabold flex items-center gap-[10px] mb-[23px]"
			>
				<span class="eyebrow-line w-[24px] h-[2px] [background:var(--orange)]"></span> VOTRE ATELIER PDF
			</div>
			<h1 id="welcome-title">Vos documents,<br /><em>entre de bonnes mains.</em></h1>
			<p>Ouvrez un PDF, organisez ses pages et exportez votre travail en quelques gestes.</p>
		</section>
		<section
			class="workspace-card grid grid-cols-[minmax(260px,_0.86fr)_minmax(320px,_1.14fr)] [border:1px_solid_var(--line)] rounded-[14px] [background:var(--paper)] [box-shadow:0_18px_55px_rgba(46,_55,_44,_0.045)] overflow-hidden max-[760px]:grid-cols-[1fr]"
			aria-label="Ouvrir un document"
		>
			<div
				class="workspace-copy p-[clamp(30px,_4vw,_56px)] flex flex-col items-start [&_h2]:m-[34px_0_15px] [&_h2]:text-[clamp(31px,_3vw,_45px)] [&_h2]:leading-[1.16] [&_h2]:tracking-[-0.055em] [&_h2]:font-extrabold [&_p]:m-0 [&_p]:max-w-[330px] [&_p]:[color:var(--muted-ink)] [&_p]:text-[15px] [&_p]:leading-[1.75] max-[760px]:p-[28px_27px_16px] max-[760px]:[&_h2]:mt-[17px]"
			>
				<span
					class="section-index text-[11px] [color:var(--accent)] tracking-[0.15em] font-extrabold"
					>01 / COMMENCER</span
				>
				<h2>Quel document ouvre-t-on ?</h2>
				<p>
					Votre fichier reste sur cet appareil. Faites-le glisser ici ou choisissez-le dans vos
					dossiers.
				</p>
				<div
					class="file-assurance flex items-center gap-[9px] mt-auto pt-[40px] [color:var(--accent)] text-[12px] font-extrabold max-[760px]:pt-[20px]"
				>
					<FileText size={17} strokeWidth={1.8} /> Fichiers PDF uniquement
				</div>
			</div>
			<div
				class:dragging={isDragging}
				class="dropzone m-[12px] min-h-[345px] p-[30px_20px] [border:1.5px_dashed_#afc4b8] rounded-[9px] [background:#f1f5f0] flex items-center justify-center flex-col text-center [transition:background_0.18s,_border-color_0.18s] cursor-pointer [&:hover]:[background:#e7f0e8] [&:hover]:[border-color:var(--accent)] [&.dragging]:[background:#e7f0e8] [&.dragging]:[border-color:var(--accent)] [&_strong]:text-[19px] [&_strong]:tracking-[-0.025em] [&_>_span]:text-[12px] [&_>_span]:[color:var(--muted-ink)] [&_>_span]:m-[9px_0_16px] [&:hover_.primary-button]:[background:var(--accent-dark)] [&_small]:mt-[20px] [&_small]:[color:var(--muted-ink)] [&_small]:text-[11px] max-[760px]:min-h-[290px]"
				role="button"
				tabindex="0"
				aria-label="Choisir un fichier PDF"
				aria-busy={isLoading}
				onclick={() => input.click()}
				onkeydown={(event) => {
					if (event.key === 'Enter' || event.key === ' ') {
						event.preventDefault();
						input.click();
					}
				}}
				ondragover={(event) => {
					event.preventDefault();
					isDragging = true;
				}}
				ondragleave={() => (isDragging = false)}
				ondrop={handleDrop}
			>
				<div
					class="dropzone-icon w-[65px] h-[65px] [border:1px_solid_#cfddd2] rounded-[17px] [background:#fffefa] [color:var(--accent)] grid place-items-center mb-[19px]"
				>
					<UploadCloud size={30} strokeWidth={1.6} />
				</div>
				<strong>{isLoading ? 'Ouverture du document…' : 'Déposez votre PDF ici'}</strong>
				<span>ou</span>
				<div
					class="primary-button min-h-[44px] inline-flex items-center justify-center gap-[10px] p-[0_19px] border-0 rounded-[7px] [background:var(--accent)] text-white text-[13px] font-extrabold [transition:background_0.15s,_transform_0.15s] [&_svg:last-child]:ml-[12px]"
				>
					<FolderOpen size={18} strokeWidth={1.8} /> Parcourir les fichiers <ArrowRight size={17} />
				</div>
				<small>PDF uniquement · traitement sur votre appareil</small>
			</div>
			<input
				bind:this={input}
				type="file"
				accept=".pdf,application/pdf"
				class="visually-hidden absolute w-[1px] h-[1px] p-0 m-[-1px] overflow-hidden [clip:rect(0,_0,_0,_0)] whitespace-nowrap border-0"
				onchange={handleFileSelection}
				aria-label="Sélectionner un fichier PDF"
			/>
		</section>
		{#if error}<div
				class="notice error mt-[16px] p-[13px_16px] rounded-[7px] text-[13px] [&.error]:[background:#fff0e8] [&.error]:[color:#8d3e27] [&.error]:[border:1px_solid_#e8c3b2]"
				role="alert"
			>
				{error}
			</div>{/if}
		<section class="recent-section mt-[70px] max-[760px]:mt-[51px]" aria-labelledby="recent-title">
			<div
				class="section-heading flex justify-between [align-items:end] gap-[20px] mb-[21px] [&_h2]:m-[10px_0_0] [&_h2]:text-[25px] [&_h2]:leading-[1.2] [&_h2]:tracking-[-0.045em]"
			>
				<div>
					<span
						class="section-index text-[11px] [color:var(--accent)] tracking-[0.15em] font-extrabold"
						>02 / REPRENDRE</span
					>
					<h2 id="recent-title">Documents récents</h2>
				</div>
				<span class="recent-count [color:var(--muted-ink)] text-[12px] font-bold pb-[3px]"
					>{recentFiles.length} {recentFiles.length === 1 ? 'document' : 'documents'}</span
				>
			</div>
			{#if recentFiles.length}
				<div class="recent-list [border-top:1px_solid_var(--line)]">
					{#each recentFiles as record (record.id)}
						<button
							class="recent-row w-full flex items-center gap-[18px] p-[14px_5px] border-0 [border-bottom:1px_solid_var(--line)] bg-transparent text-left [transition:background_0.15s] [&:hover]:[background:#f0f1eb]"
							type="button"
							onclick={() => openRecent(record)}
							disabled={isLoading}
						>
							<span
								class="recent-file-icon flex-none grid place-items-center w-[46px] h-[52px] rounded-[4px] [background:#e5ece5] [color:var(--accent)]"
								><FileText size={21} strokeWidth={1.6} /></span
							>
							<span
								class="recent-file-info min-w-0 flex flex-col gap-[4px] [&_strong]:text-[14px] [&_strong]:overflow-hidden [&_strong]:text-ellipsis [&_strong]:whitespace-nowrap [&_small]:[color:var(--muted-ink)] [&_small]:text-[12px]"
								><strong title={record.name}>{record.name}</strong><small
									>Ouvert le {formatDate(record.createdAt)}</small
								></span
							>
							<ArrowRight
								size={20}
								class="recent-arrow [color:var(--accent)] ml-auto flex-none"
								aria-hidden="true"
							/>
						</button>
					{/each}
				</div>
			{:else}
				<div
					class="recent-empty flex items-start gap-[16px] [border:1px_solid_var(--line)] rounded-[9px] p-[24px] [background:#fdfcf9] [color:var(--accent)] [&_strong]:[color:var(--ink)] [&_strong]:text-[14px] [&_p]:[color:var(--muted-ink)] [&_p]:m-[5px_0_0] [&_p]:text-[13px] [&_p]:leading-[1.6]"
				>
					<Clock3 size={22} strokeWidth={1.6} />
					<div>
						<strong>Votre espace est prêt.</strong>
						<p>Les documents ouverts apparaîtront ici pour les retrouver rapidement.</p>
					</div>
				</div>
			{/if}
		</section>
	</main>
	<footer
		class="home-footer min-h-[64px] p-[0_clamp(24px,_6.3vw,_104px)] flex justify-between items-center gap-[12px] [border-top:1px_solid_var(--line)] [color:var(--muted-ink)] text-[11px] max-[520px]:[&_span:last-child]:hidden"
	>
		<span
			>Inscribe <span class="footer-dot [color:var(--orange)] m-[0_4px]">✳</span> Édition PDF</span
		><span>Un espace clair pour vos idées.</span>
	</footer>
</div>
