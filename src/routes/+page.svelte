<script lang="ts">
	import ActionButton from '#lib/components/ActionButton.svelte';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import {
		ArrowRight,
		Clock3,
		FileText,
		FolderOpen,
		LockKeyhole,
		ShieldCheck,
		UploadCloud,
		X
	} from '@lucide/svelte';
	import { fileSession, getProcessedFile, setProcessedFile } from '../stores/FileStore.svelte';
	import * as PDFLibHelper from '#lib/utils/PDFLibHelper.js';
	import * as PDFjsHelper from '#lib/utils/PDFjsHelper.js';
	import { listRecentFiles, openRecentDatabase, saveRecentFile } from '#lib/utils/IndexDBUtils.js';
	import type { RecentFile } from '../types/recentFile';

	let input: HTMLInputElement = $state(null!);
	let db: IDBDatabase | undefined;
	let dbPromise: Promise<IDBDatabase> | undefined;
	let recentFiles: RecentFile[] = $state([]);
	let isLoading = $state(false);
	let isDragging = $state(false);
	let error = $state('');
	let passwordDialog: HTMLDialogElement = $state(null!);
	let passwordInput: HTMLInputElement = $state(null!);
	let protectedFile: { file: File; remember: boolean } | null = $state(null);
	let openingPassword = $state('');
	let passwordError = $state('');

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
					error = "L'historique local est indisponible. Vous pouvez toujours ouvrir un PDF.";
			});
		return () => {
			active = false;
			db?.close();
		};
	});

	const openPdf = async (file: File, remember = true, password?: string) => {
		if (isLoading) return;
		if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
			error = 'Choisissez un fichier PDF pour continuer.';
			return;
		}
		isLoading = true;
		error = '';
		try {
			let workingFile = file;
			if (password !== undefined) {
				const { decryptPDF } = await import('@pdfsmaller/pdf-decrypt');
				const bytes = await decryptPDF(new Uint8Array(await file.arrayBuffer()), password);
				workingFile = new File([new Uint8Array(bytes)], file.name, { type: 'application/pdf' });
			}
			const document = await PDFLibHelper.load(workingFile);
			const preview = await PDFjsHelper.parse(workingFile);
			const previousPreview = getProcessedFile();
			fileSession.fileName = file.name;
			fileSession.openedFile = workingFile;
			fileSession.updatedFile = document;
			setProcessedFile(preview);
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
			if (passwordDialog?.open) passwordDialog.close();
			await goto('/pdf');
		} catch (cause) {
			if (
				password === undefined &&
				cause instanceof Error &&
				/Input document.*is encrypted/i.test(cause.message)
			) {
				protectedFile = { file, remember };
				passwordError = '';
				openingPassword = '';
				passwordDialog.showModal();
				passwordInput.focus();
			} else if (password !== undefined) {
				passwordError =
					cause instanceof Error && /incorrect password/i.test(cause.message)
						? 'Mot de passe incorrect. Réessayez.'
						: 'Ce PDF protégé ne peut pas être ouvert.';
			} else {
				error = "Impossible d'ouvrir ce PDF. Vérifiez qu'il n'est pas endommagé.";
			}
		} finally {
			isLoading = false;
			if (input) input.value = '';
		}
	};
	const submitPassword = () => {
		if (protectedFile && openingPassword) {
			passwordError = '';
			void openPdf(protectedFile.file, protectedFile.remember, openingPassword);
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

<dialog
	bind:this={passwordDialog}
	class="w-[min(420px,calc(100vw-32px))] m-auto p-0 rounded-xl border border-(--line) bg-(--paper) text-(--ink) shadow-[0_24px_70px_#17241c40] backdrop:bg-[#17241c99]"
	aria-labelledby="open-password-title"
	oncancel={(event) => {
		if (isLoading) event.preventDefault();
	}}
	onclose={() => {
		protectedFile = null;
		openingPassword = '';
		passwordError = '';
	}}
>
	<form
		onsubmit={(event) => {
			event.preventDefault();
			submitPassword();
		}}
	>
		<div class="flex items-center justify-between gap-3 border-b border-(--line) px-6 py-5">
			<div class="flex items-center gap-3">
				<span class="grid size-10 place-items-center rounded-[9px] bg-[#e4eee6] text-(--accent)"
					><LockKeyhole size={20} /></span
				>
				<h2 id="open-password-title" class="text-[17px] font-extrabold">PDF protégé</h2>
			</div>
			<ActionButton
				type="button"
				onclick={() => passwordDialog.close()}
				disabled={isLoading}
				aria-label="Fermer"
				class="grid size-10 place-items-center rounded-[7px] hover:bg-[#eef1eb] focus-visible:outline-(--ring) cursor-pointer disabled:cursor-not-allowed disabled:opacity-48 focus-visible:outline-3 focus-visible:outline-offset-3 motion-reduce:transition-none motion-reduce:animate-none"
				><X size={18} /></ActionButton
			>
		</div>
		<div class="space-y-3 px-6 py-5">
			<p class="wrap-anywhere text-[12px] leading-normal text-(--muted-ink)">
				Saisissez le mot de passe pour ouvrir {protectedFile?.file.name}.
			</p>
			<label for="open-password" class="block text-[12px] font-extrabold"
				>Mot de passe d’ouverture</label
			>
			<input
				id="open-password"
				bind:this={passwordInput}
				bind:value={openingPassword}
				oninput={() => (passwordError = '')}
				type="password"
				autocomplete="current-password"
				required
				class="min-h-11 w-full rounded-[7px] border border-(--line) bg-white px-3 text-[14px] text-(--ink) focus-visible:outline-(--ring) cursor-pointer disabled:cursor-not-allowed disabled:opacity-48 focus-visible:outline-3 focus-visible:outline-offset-3 motion-reduce:transition-none motion-reduce:animate-none"
			/>
			{#if passwordError}<p role="alert" class="text-[12px] font-bold text-[#a4492e]">
					{passwordError}
				</p>{/if}
		</div>
		<div class="flex justify-end gap-2 border-t border-(--line) px-6 py-4">
			<button
				type="button"
				onclick={() => passwordDialog.close()}
				disabled={isLoading}
				class="min-h-10 rounded-[7px] border border-(--line) px-4 text-[12px] font-extrabold hover:bg-[#eef1eb] cursor-pointer disabled:cursor-not-allowed disabled:opacity-48 focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-(--ring) motion-reduce:transition-none motion-reduce:animate-none"
				>Annuler</button
			>
			<button
				type="submit"
				disabled={isLoading || !openingPassword}
				class="min-h-10 rounded-[7px] bg-(--accent) px-4 text-[12px] font-extrabold text-white hover:bg-(--accent-dark) disabled:opacity-60 cursor-pointer disabled:cursor-not-allowed focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-(--ring) motion-reduce:transition-none motion-reduce:animate-none"
				>{isLoading ? 'Ouverture…' : 'Ouvrir le PDF'}</button
			>
		</div>
	</form>
</dialog>

<div class="home-shell min-h-screen flex flex-col">
	<header
		class="home-header h-20.5 p-[0_clamp(24px,6.3vw,104px)] border-b border-b-(--line) flex items-center justify-between bg-(--paper) max-[760px]:h-17.25"
	>
		<a
			href="/"
			class="brand text-(--ink) inline-flex items-center gap-3 text-[24px] font-extrabold tracking-[-0.065em] no-underline cursor-pointer disabled:cursor-not-allowed disabled:opacity-48 focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-(--ring) motion-reduce:transition-none motion-reduce:animate-none"
			aria-label="Inscribe, accueil"
			><span
				class="brand-mark inline-flex justify-center items-center w-9.5 h-9.5 rounded-[10px] bg-(--accent) text-white text-[27px] font-extrabold leading-none -tracking-widest pr-0.75"
				>i<span class="text-[#dfb394]">.</span></span
			><span>inscribe</span></a
		>
		<span
			class="header-note inline-flex items-center gap-2.25 text-(--muted-ink) text-[12px] font-bold tracking-wide max-[520px]:text-[0]"
			><ShieldCheck
				class="text-(--accent) max-[520px]:h-4.5 max-[520px]:w-4.5"
				size={16}
				strokeWidth={1.8}
			/> Espace de travail local</span
		>
	</header>
	<main
		class="home-main w-[min(100%-48px,1200px)] m-[0_auto] flex-1 p-[clamp(46px,6.5vw,96px)_0_75px] max-[760px]:pt-11.75 max-[520px]:w-[calc(100%-32px)]"
	>
		<section class="welcome mb-12 max-[760px]:mb-8.5" aria-labelledby="welcome-title">
			<div
				class="eyebrow text-[11px] text-(--accent) tracking-[0.15em] font-extrabold flex items-center gap-2.5 mb-5.75"
			>
				<span class="eyebrow-line w-6 h-0.5 bg-(--orange)"></span> VOTRE ATELIER PDF
			</div>
			<h1
				id="welcome-title"
				class="m-0 max-w-232.5 text-[clamp(42px,5.5vw,74px)] font-extrabold leading-[1.13] tracking-[-0.07em] max-[520px]:text-[clamp(36px,10vw,52px)]"
			>
				Vos documents,<br /><em class="not-italic text-(--accent)">entre de bonnes mains.</em>
			</h1>
			<p
				class="mt-6 max-w-140 text-[17px] leading-[1.7] text-(--muted-ink) max-[760px]:text-[15px] max-[520px]:mt-4"
			>
				Ouvrez un PDF, organisez ses pages et exportez votre travail en quelques gestes.
			</p>
		</section>
		<section
			class="workspace-card grid grid-cols-[minmax(260px,0.86fr)_minmax(320px,1.14fr)] border border-(--line) rounded-[14px] bg-(--paper) shadow-[0_18px_55px_rgba(46,55,44,0.045)] overflow-hidden max-[760px]:grid-cols-[1fr]"
			aria-label="Ouvrir un document"
		>
			<div
				class="workspace-copy p-[clamp(30px,4vw,56px)] flex flex-col items-start max-[760px]:p-[28px_27px_16px]"
			>
				<span class="section-index text-[11px] text-(--accent) tracking-[0.15em] font-extrabold"
					>01 / COMMENCER</span
				>
				<h2
					class="my-8.5 mb-3.75 text-[clamp(31px,3vw,45px)] font-extrabold leading-[1.16] tracking-[-0.055em] max-[760px]:mt-4.25"
				>
					Quel document ouvre-t-on ?
				</h2>
				<p class="m-0 max-w-82.5 text-[15px] leading-[1.75] text-(--muted-ink)">
					Votre fichier reste sur cet appareil. Faites-le glisser ici ou choisissez-le dans vos
					dossiers.
				</p>
				<div
					class="file-assurance flex items-center gap-2.25 mt-auto pt-10 text-(--accent) text-[12px] font-extrabold max-[760px]:pt-5"
				>
					<FileText size={17} strokeWidth={1.8} /> Fichiers PDF uniquement
				</div>
			</div>
			<div
				class:dragging={isDragging}
				class="dropzone m-3 min-h-86.25 p-[30px_20px] border-[1.5px] border-dashed border-[#afc4b8] rounded-[9px] bg-[#f1f5f0] flex items-center justify-center flex-col text-center transition-[background,border-color] duration-180 ease-linear cursor-pointer hover:bg-[#e7f0e8] hover:border-(--accent) [&.dragging]:bg-[#e7f0e8] [&.dragging]:border-(--accent) max-[760px]:min-h-72.5 disabled:cursor-not-allowed disabled:opacity-48 focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-(--ring) motion-reduce:transition-none motion-reduce:animate-none"
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
					class="dropzone-icon w-16.25 h-16.25 border border-[#cfddd2] rounded-[17px] bg-[#fffefa] text-(--accent) grid place-items-center mb-4.75"
				>
					<UploadCloud size={30} strokeWidth={1.6} />
				</div>
				<strong class="text-[19px] tracking-tight"
					>{isLoading ? 'Ouverture du document…' : 'Déposez votre PDF ici'}</strong
				>
				<span class="my-2.25 mb-4 text-[12px] text-(--muted-ink)">ou</span>
				<div
					class="primary-button min-h-11 inline-flex items-center justify-center gap-2.5 p-[0_19px] border-0 rounded-[7px] bg-(--accent) text-white text-[13px] font-extrabold transition-[background,transform] duration-150 ease-linear hover:bg-(--accent-dark)"
				>
					<FolderOpen size={18} strokeWidth={1.8} /> Parcourir les fichiers <ArrowRight
						class="ml-3"
						size={17}
					/>
				</div>
				<small class="mt-5 text-[11px] text-(--muted-ink)"
					>PDF uniquement · traitement sur votre appareil</small
				>
			</div>
			<input
				bind:this={input}
				type="file"
				accept=".pdf,application/pdf"
				class="sr-only cursor-pointer disabled:cursor-not-allowed disabled:opacity-48 focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-(--ring) motion-reduce:transition-none motion-reduce:animate-none"
				onchange={handleFileSelection}
				aria-label="Sélectionner un fichier PDF"
			/>
		</section>
		{#if error}<div
				class="notice error mt-4 p-[13px_16px] rounded-[7px] border border-[#e8c3b2] bg-[#fff0e8] text-[#8d3e27] text-[13px]"
				role="alert"
			>
				{error}
			</div>{/if}
		<section class="recent-section mt-17.5 max-[760px]:mt-12.75" aria-labelledby="recent-title">
			<div class="section-heading flex justify-between items-end gap-5 mb-5.25">
				<div>
					<span class="section-index text-[11px] text-(--accent) tracking-[0.15em] font-extrabold"
						>02 / REPRENDRE</span
					>
					<h2 id="recent-title" class="mt-2.5 mb-0 text-[25px] leading-[1.2] tracking-[-0.045em]">
						Documents récents
					</h2>
				</div>
				<span class="recent-count text-(--muted-ink) text-[12px] font-bold pb-0.75"
					>{recentFiles.length} {recentFiles.length === 1 ? 'document' : 'documents'}</span
				>
			</div>
			{#if recentFiles.length}
				<div class="recent-list border-t border-t-(--line)">
					{#each recentFiles as record (record.id)}
						<button
							class="recent-row w-full flex items-center gap-4.5 p-[14px_5px] border-0 border-b border-b-(--line) bg-transparent text-left transition-[background] duration-150 ease-linear hover:bg-[#f0f1eb] cursor-pointer disabled:cursor-not-allowed disabled:opacity-48 focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-(--ring) motion-reduce:transition-none motion-reduce:animate-none"
							type="button"
							onclick={() => openRecent(record)}
							disabled={isLoading}
						>
							<span
								class="recent-file-icon flex-none grid place-items-center w-11.5 h-13 rounded-sm bg-[#e5ece5] text-(--accent)"
								><FileText size={21} strokeWidth={1.6} /></span
							>
							<span class="recent-file-info min-w-0 flex flex-col gap-1"
								><strong
									class="overflow-hidden text-[14px] text-ellipsis whitespace-nowrap"
									title={record.name}>{record.name}</strong
								><small class="text-[12px] text-(--muted-ink)"
									>Ouvert le {formatDate(record.createdAt)}</small
								></span
							>
							<ArrowRight
								size={20}
								class="recent-arrow text-(--accent) ml-auto flex-none"
								aria-hidden="true"
							/>
						</button>
					{/each}
				</div>
			{:else}
				<div
					class="recent-empty flex items-start gap-4 border border-(--line) rounded-[9px] p-6 bg-[#fdfcf9] text-(--accent)"
				>
					<Clock3 size={22} strokeWidth={1.6} />
					<div>
						<strong class="text-[14px] text-(--ink)">Votre espace est prêt.</strong>
						<p class="mt-1.25 mb-0 text-[13px] leading-[1.6] text-(--muted-ink)">
							Les documents ouverts apparaîtront ici pour les retrouver rapidement.
						</p>
					</div>
				</div>
			{/if}
		</section>
	</main>
	<footer
		class="home-footer min-h-16 p-[0_clamp(24px,6.3vw,104px)] flex justify-between items-center gap-3 border-t border-t-(--line) text-(--muted-ink) text-[11px]"
	>
		<span>Inscribe <span class="footer-dot text-(--orange) m-[0_4px]">✳</span> Édition PDF</span
		><span class="max-[520px]:hidden">Un espace clair pour vos idées.</span>
	</footer>
</div>
