<script lang="ts">
	interface Props {
		value?: string;
	}

	let { value = $bindable('#c96a42') }: Props = $props();

	const toHex = (channel: number) =>
		Math.round(channel * 255)
			.toString(16)
			.padStart(2, '0');
	const fromHsv = (hue: number, saturation: number, brightness: number) => {
		const chroma = brightness * saturation;
		const section = hue / 60;
		const second = chroma * (1 - Math.abs((section % 2) - 1));
		const [red, green, blue] =
			section < 1
				? [chroma, second, 0]
				: section < 2
					? [second, chroma, 0]
					: section < 3
						? [0, chroma, second]
						: section < 4
							? [0, second, chroma]
							: section < 5
								? [second, 0, chroma]
								: [chroma, 0, second];
		const offset = brightness - chroma;
		return `#${[red, green, blue].map((channel) => toHex(channel + offset)).join('')}`;
	};
	const toHsv = (hex: string) => {
		const channels = [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16) / 255);
		const high = Math.max(...channels);
		const low = Math.min(...channels);
		const chroma = high - low;
		let hue = 0;
		if (chroma) {
			if (high === channels[0]) hue = ((channels[1] - channels[2]) / chroma) % 6;
			else if (high === channels[1]) hue = (channels[2] - channels[0]) / chroma + 2;
			else hue = (channels[0] - channels[1]) / chroma + 4;
		}
		return { hue: (hue * 60 + 360) % 360, saturation: high ? chroma / high : 0, brightness: high };
	};

	let { hue, saturation, brightness } = $state(toHsv(value));
	let lastGenerated = $state(value);
	$effect(() => {
		if (value !== lastGenerated && /^#[0-9a-fA-F]{6}$/.test(value)) {
			({ hue, saturation, brightness } = toHsv(value));
			lastGenerated = value;
		}
	});
	const updateValue = () => {
		value = fromHsv(hue, saturation, brightness);
		lastGenerated = value;
	};
	const pick = (event: PointerEvent) => {
		const wheel = event.currentTarget as HTMLElement;
		const rect = wheel.getBoundingClientRect();
		const dx = event.clientX - rect.left - rect.width / 2;
		const dy = event.clientY - rect.top - rect.height / 2;
		hue = ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360;
		saturation = Math.min(1, Math.hypot(dx, dy) / (rect.width / 2));
		updateValue();
	};
</script>

<div class="grid w-52.5 gap-1.75">
	<div
		class="color-wheel relative w-42 h-42 m-[0_auto_6px] rounded-full bg-[radial-gradient(circle,#fff_0%,#fff0_74%),conic-gradient(red,yellow,lime,cyan,blue,magenta,red)] border border-[#c9cbc3] cursor-crosshair touch-none focus-visible:outline-offset-3 disabled:cursor-not-allowed disabled:opacity-48 focus-visible:outline-3 focus-visible:outline-(--ring) motion-reduce:transition-none motion-reduce:animate-none"
		role="slider"
		tabindex="0"
		aria-label="Roue de couleur, teinte"
		aria-valuemin="0"
		aria-valuemax="359"
		aria-valuenow={Math.round(hue)}
		onpointerdown={(event) => {
			event.currentTarget.setPointerCapture(event.pointerId);
			pick(event);
		}}
		onpointermove={(event) => {
			if (event.buttons) pick(event);
		}}
		onkeydown={(event) => {
			if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') hue = (hue + 359) % 360;
			else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') hue = (hue + 1) % 360;
			else return;
			event.preventDefault();
			updateValue();
		}}
	>
		<span
			class="color-wheel-thumb absolute w-3.25 h-3.25 border-2 border-white rounded-full shadow-[0_0_0_1px_#30342d,0_1px_5px_#0008] transform-[translate(-50%,-50%)] pointer-events-none"
			style:left={`${50 + Math.sin((hue * Math.PI) / 180) * saturation * 50}%`}
			style:top={`${50 - Math.cos((hue * Math.PI) / 180) * saturation * 50}%`}
		></span>
	</div>
	<label class="text-[11px] font-extrabold" for="color-saturation">Saturation</label>
	<input
		id="color-saturation"
		class="w-full accent-(--accent) focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-(--ring)"
		type="range"
		min="0"
		max="100"
		value={Math.round(saturation * 100)}
		oninput={(event) => {
			saturation = Number(event.currentTarget.value) / 100;
			updateValue();
		}}
	/>
	<label class="text-[11px] font-extrabold" for="color-brightness">Luminosité</label>
	<input
		id="color-brightness"
		class="w-full accent-(--accent) focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-(--ring)"
		type="range"
		min="0"
		max="100"
		value={Math.round(brightness * 100)}
		oninput={(event) => {
			brightness = Number(event.currentTarget.value) / 100;
			updateValue();
		}}
	/>
	<div class="flex items-center gap-2 mt-1.25">
		<span
			class="color-wheel-preview w-6.25 h-6.25 border border-(--line) rounded-[5px]"
			style:background={value}
		></span><label class="text-[11px] font-extrabold" for="custom-color">Couleur</label><input
			id="custom-color"
			class="w-9.5 h-7 ml-auto border-0 bg-transparent cursor-pointer disabled:cursor-not-allowed disabled:opacity-48 focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-(--ring) motion-reduce:transition-none motion-reduce:animate-none"
			type="color"
			bind:value
		/>
	</div>
</div>
