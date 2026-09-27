<script lang="ts">
	import { onMount } from 'svelte';
	import { dev } from '$app/env';
	import { isTauri } from '@tauri-apps/api/core';
	import { check, type DownloadEvent, type Update } from '@tauri-apps/plugin-updater';
	import { relaunch } from '@tauri-apps/plugin-process';
	import { ChevronDown, CircleAlert, Download, RotateCw, Sparkles } from '@lucide/svelte';

	type Status = 'idle' | 'checking' | 'downloading' | 'ready' | 'installing' | 'error';
	type RetryAction = 'check' | 'install';

	let status = $state<Status>('idle');
	let update = $state<Update | null>(null);
	let version = $state('');
	let progress = $state<number | null>(null);
	let errorMessage = $state('');
	let retryAction = $state<RetryAction>('check');
	let isCompact = $state(false);
	let expanded = $state(true);
	let checking = false;

	let downloadedBytes = 0;
	let contentLength = 0;

	const pollInterval = 6 * 60 * 60 * 1000;

	function handleDownloadEvent(event: DownloadEvent) {
		if (event.event === 'Started') {
			contentLength = event.data.contentLength ?? 0;
			downloadedBytes = 0;
			progress = contentLength > 0 ? 0 : null;
			return;
		}

		if (event.event === 'Progress') {
			downloadedBytes += event.data.chunkLength;
			progress = contentLength > 0 ? Math.min(100, (downloadedBytes / contentLength) * 100) : null;
			return;
		}

		progress = 100;
	}

	async function checkAndDownload() {
		if (dev || !isTauri() || checking || status === 'installing' || status === 'ready') return;

		checking = true;
		status = 'checking';
		errorMessage = '';
		progress = null;

		try {
			const nextUpdate = await check({ timeout: 20_000 });
			if (!nextUpdate) {
				if (update) await update.close();
				update = null;
				version = '';
				status = 'idle';
				return;
			}

			if (update && update !== nextUpdate) await update.close();
			update = nextUpdate;
			version = nextUpdate.version;
			status = 'downloading';
			await nextUpdate.download(handleDownloadEvent);
			progress = 100;
			status = 'ready';
		} catch {
			retryAction = 'check';
			errorMessage = 'La vérification a échoué. Vérifiez votre connexion puis réessayez.';
			status = 'error';
		} finally {
			checking = false;
		}
	}

	async function installUpdate() {
		if (!update || status === 'installing') return;

		status = 'installing';
		errorMessage = '';
		try {
			await update.install();
			await relaunch();
		} catch {
			retryAction = 'install';
			errorMessage = 'L’installation a échoué. Vous pouvez réessayer.';
			status = 'error';
		}
	}

	function retry() {
		if (retryAction === 'install') {
			void installUpdate();
			return;
		}
		void checkAndDownload();
	}

	function headline() {
		switch (status) {
			case 'checking':
				return 'Recherche de mises à jour';
			case 'downloading':
				return 'Téléchargement en arrière-plan';
			case 'ready':
				return 'Mise à jour prête';
			case 'installing':
				return 'Installation en cours';
			case 'error':
				return isCompact ? 'Échec de mise à jour' : 'Mise à jour interrompue';
			default:
				return 'Mise à jour disponible';
		}
	}

	onMount(() => {
		if (dev || !isTauri()) return;

		const compactQuery = window.matchMedia('(max-width: 520px)');
		const syncCompactMode = () => {
			isCompact = compactQuery.matches;
			expanded = !isCompact;
		};
		syncCompactMode();
		compactQuery.addEventListener('change', syncCompactMode);

		const firstCheck = window.setTimeout(() => void checkAndDownload(), 1200);
		const periodicCheck = window.setInterval(() => void checkAndDownload(), pollInterval);

		return () => {
			window.clearTimeout(firstCheck);
			window.clearInterval(periodicCheck);
			compactQuery.removeEventListener('change', syncCompactMode);
			if (update) void update.close();
		};
	});
</script>

{#if status !== 'idle'}
	<aside
		class="fixed right-3 bottom-3 z-50 max-w-[calc(100vw-1.5rem)] rounded-xl border border-(--line) bg-(--paper) p-3 text-(--ink) shadow-xl sm:right-5 sm:bottom-5 sm:p-4"
		style:width={isCompact
			? 'min(16rem, calc(100vw - 1.5rem))'
			: 'min(22rem, calc(100vw - 1.5rem))'}
		aria-label="Mise à jour de l’application"
		aria-live="polite"
	>
		<div class="flex items-start gap-2.5">
			<div
				class="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-(--canvas) {status ===
				'error'
					? 'text-(--orange)'
					: 'text-(--accent)'}"
				aria-hidden="true"
			>
				{#if status === 'downloading'}
					<Download size={16} />
				{:else if status === 'checking' || status === 'installing'}
					<RotateCw size={16} class="animate-spin motion-reduce:animate-none" />
				{:else if status === 'error'}
					<CircleAlert size={16} />
				{:else}
					<Sparkles size={16} />
				{/if}
			</div>

			<div class="min-w-0 flex-1">
				<button
					type="button"
					class="flex min-h-8 w-full items-center justify-between gap-2 rounded-md text-left focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-(--ring)"
					aria-expanded={expanded}
					aria-controls="update-notice-details"
					onclick={() => (expanded = !expanded)}
				>
					<span class="min-w-0">
						<span class="block truncate text-[13px] leading-5 font-bold">{headline()}</span>
						{#if version && (!isCompact || status !== 'error')}
							<span class="block text-[11px] leading-4 text-(--muted-ink)">Version {version}</span>
						{/if}
					</span>
					<ChevronDown
						size={16}
						class="shrink-0 text-(--muted-ink) transition-transform duration-150 motion-reduce:transition-none {expanded
							? 'rotate-180'
							: ''}"
					/>
				</button>
			</div>
			{#if isCompact && status === 'error'}
				<button
					type="button"
					class="min-h-10 shrink-0 cursor-pointer rounded-lg border border-(--line) bg-(--canvas) px-2 text-[11px] font-bold text-(--ink) hover:bg-white focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-(--ring)"
					onclick={retry}
				>
					Réessayer
				</button>
			{/if}
		</div>

		{#if status === 'checking'}
			<p class="mt-2 pl-[2.625rem] text-xs text-(--muted-ink)">Vérification automatique…</p>
		{:else if status === 'downloading'}
			<div class="mt-2 pl-[2.625rem]">
				<div class="mb-1.5 flex justify-between gap-3 text-[11px] text-(--muted-ink)">
					<span>Téléchargement sécurisé</span>
					{#if progress !== null}<span>{Math.round(progress)} %</span>{/if}
				</div>
				<div
					class="h-1.5 overflow-hidden rounded-full bg-(--canvas)"
					role="progressbar"
					aria-label="Progression du téléchargement"
					aria-valuemin="0"
					aria-valuemax="100"
					aria-valuenow={progress === null ? undefined : Math.round(progress)}
				>
					<div
						class="h-full rounded-full bg-(--accent) transition-[width] duration-200 motion-reduce:transition-none"
						class:animate-update-progress={progress === null}
						style:width={progress === null ? '35%' : `${progress}%`}
					></div>
				</div>
			</div>
		{:else if status === 'installing'}
			<p class="mt-2 pl-[2.625rem] text-xs text-(--muted-ink)">L’application va redémarrer.</p>
		{:else if status === 'ready'}
			<div class="mt-2 pl-[2.625rem]">
				<button
					type="button"
					class="min-h-10 w-full cursor-pointer rounded-lg bg-(--accent) px-3 text-xs font-bold text-white transition-colors hover:bg-(--accent-dark) focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-(--ring)"
					onclick={installUpdate}
				>
					Redémarrer pour installer
				</button>
				<p class="mt-2 text-[11px] leading-4 text-(--muted-ink)">
					Enregistrez vos changements : les documents ouverts se fermeront.
				</p>
			</div>
		{:else if status === 'error'}
			<div class="mt-2 pl-[2.625rem]">
				{#if !isCompact || expanded}
					<p class="text-xs leading-5 text-(--muted-ink)" role="alert">{errorMessage}</p>
				{/if}
				{#if !isCompact}
					<button
						type="button"
						class="mt-2 min-h-10 w-full cursor-pointer rounded-lg border border-(--line) bg-(--canvas) px-3 text-xs font-bold text-(--ink) hover:bg-white focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-(--ring)"
						onclick={retry}
					>
						Réessayer
					</button>
				{/if}
			</div>
		{/if}

		<div id="update-notice-details" class="mt-3 border-t border-(--line) pt-3" hidden={!expanded}>
			{#if status === 'ready'}
				{#if update?.body}
					<p class="line-clamp-3 text-xs leading-5 text-(--muted-ink)">{update.body}</p>
				{/if}
				<p class="mt-2 text-[11px] leading-4 text-(--muted-ink)">
					Enregistrez vos changements : l’application redémarrera et fermera les documents ouverts.
				</p>
			{:else if status === 'error'}
				<p class="text-[11px] leading-4 text-(--muted-ink)">
					La vérification reprendra automatiquement plus tard.
				</p>
			{:else if status === 'downloading'}
				<p class="text-[11px] leading-4 text-(--muted-ink)">
					Vous pouvez continuer à travailler pendant le téléchargement.
				</p>
			{:else if status === 'installing'}
				<p class="text-[11px] leading-4 text-(--muted-ink)">
					Gardez l’application ouverte le temps du redémarrage.
				</p>
			{:else if status === 'checking'}
				<p class="text-[11px] leading-4 text-(--muted-ink)">
					La recherche ne bloque pas l’ouverture de vos documents.
				</p>
			{/if}
		</div>
	</aside>
{/if}

<style>
	@keyframes update-progress {
		from {
			transform: translateX(-100%);
		}
		to {
			transform: translateX(300%);
		}
	}

	.animate-update-progress {
		animation: update-progress 1.2s ease-in-out infinite;
	}

	@media (prefers-reduced-motion: reduce) {
		.animate-update-progress {
			animation: none;
		}
	}
</style>
