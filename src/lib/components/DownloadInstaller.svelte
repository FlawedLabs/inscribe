<script lang="ts">
	import { onMount } from 'svelte';
	import { isTauri } from '@tauri-apps/api/core';
	import { Download, MonitorDown } from '@lucide/svelte';
	import {
		detectVisitorOS,
		installerLinks,
		releaseApi,
		releasesUrl,
		type InstallerTarget
	} from '#lib/utils/Installers.js';

	let visible = $state(false);
	let mobile = $state(false);
	let target = $state<InstallerTarget | ''>('');
	let mac = $state(false);
	let status = $state<'loading' | 'ready' | 'empty' | 'error'>('loading');
	let links = $state<Partial<Record<InstallerTarget, string>>>({});
	let version = $state('');
	let controller: AbortController | undefined;
	const labels: Record<InstallerTarget, string> = {
		windows: 'Windows · 64 bits',
		linux: 'Linux · AppImage 64 bits',
		'mac-arm': 'macOS · Apple Silicon',
		'mac-intel': 'macOS · Intel'
	};
	const href = $derived(target ? links[target] : undefined);

	async function loadRelease() {
		controller?.abort();
		controller = new AbortController();
		const current = controller;
		const timeout = setTimeout(() => current.abort(), 10_000);
		status = 'loading';
		try {
			const response = await fetch(releaseApi, { signal: current.signal, credentials: 'omit' });
			if (response.status === 404) {
				status = 'empty';
				return;
			}
			if (!response.ok) throw new Error('Release unavailable');
			const release = await response.json();
			links = installerLinks(release);
			version = typeof release.tag_name === 'string' ? release.tag_name : '';
			status = Object.keys(links).length ? 'ready' : 'empty';
		} catch {
			if (controller === current) status = 'error';
		} finally {
			clearTimeout(timeout);
		}
	}

	onMount(() => {
		if (isTauri()) return;
		visible = true;
		const hints = navigator as Navigator & { userAgentData?: { platform: string } };
		const os = detectVisitorOS(
			navigator.userAgent,
			hints.userAgentData?.platform ?? navigator.platform,
			navigator.maxTouchPoints
		);
		mobile = os === 'mobile';
		mac = os === 'mac';
		if (os === 'windows' || os === 'linux') target = os;
		void loadRelease();
		return () => {
			controller?.abort();
			controller = undefined;
		};
	});
</script>

{#if visible}
	<section
		aria-labelledby="installer-title"
		class="mt-7 flex flex-wrap items-center gap-x-6 gap-y-4 border-t border-(--line) pt-5"
	>
		<div class="flex min-w-0 flex-1 items-start gap-3">
			<MonitorDown size={23} class="mt-0.5 shrink-0 text-(--accent)" aria-hidden="true" />
			<div>
				<h2 id="installer-title" class="text-[14px] font-extrabold text-(--ink)">
					Inscribe sur votre ordinateur
				</h2>
				<p class="mt-1 text-[12px] leading-relaxed text-(--muted-ink)">
					{mobile
						? 'Disponible sur macOS, Windows et Linux. Ici, vous pouvez utiliser la version web.'
						: 'Retrouvez votre atelier PDF dans une application dédiée.'}
				</p>
			</div>
		</div>
		<div class="flex w-full flex-wrap items-end gap-3 sm:w-auto">
			{#if !mobile}
				<div class="w-full min-w-0 sm:w-auto">
					<label for="installer-target" class="mb-1 block text-[11px] font-bold text-(--muted-ink)"
						>Version à télécharger</label
					>
					<select
						id="installer-target"
						bind:value={target}
						class="min-h-11 w-full rounded-[7px] border border-(--line) bg-(--paper) px-3 text-[12px] text-(--ink) focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-(--ring)"
					>
						<option value="" disabled
							>{mac ? 'Mac : choisissez votre puce' : 'Choisir un système'}</option
						>
						{#each Object.entries(labels) as [value, label]}<option {value}>{label}</option>{/each}
					</select>
				</div>
				{#if status === 'ready' && href}
					<a
						{href}
						class="inline-flex min-h-11 items-center justify-center gap-2 rounded-[7px] bg-(--accent) px-4 text-[12px] font-extrabold text-white hover:bg-(--accent-dark) focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-(--ring)"
						aria-label={`Télécharger Inscribe pour ${labels[target as InstallerTarget]}`}
						><Download size={16} aria-hidden="true" />Télécharger {version}</a
					>
				{:else}
					<p role="status" class="max-w-60 self-center text-[12px] text-(--muted-ink)">
						{status === 'loading'
							? 'Recherche de l’installateur…'
							: status === 'error'
								? 'Téléchargement indisponible ici.'
								: status === 'empty'
									? 'Les installateurs seront bientôt disponibles.'
									: !target
										? 'Choisissez la version adaptée.'
										: 'Cette version n’est pas disponible.'}
					</p>
					{#if status === 'error'}<button
							type="button"
							onclick={() => void loadRelease()}
							class="min-h-11 text-[12px] font-bold text-(--accent) underline underline-offset-4 focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-(--ring)"
							>Réessayer</button
						>{/if}
				{/if}
			{/if}
			<a
				href={releasesUrl}
				class="min-h-11 content-center text-[12px] font-bold text-(--accent) underline underline-offset-4 focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-(--ring)"
				>Tous les installateurs</a
			>
		</div>
	</section>
{/if}
