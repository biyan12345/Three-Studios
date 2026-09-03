<script lang="ts">
	import type { SceneRandomizerId, SceneRandomizerRun } from '$lib/app-types';

	export let randomizerId: SceneRandomizerId = 'lucky-wheel';
	export let options: string[] = [];
	export let run: SceneRandomizerRun | null = null;
	export let preview = false;

	const MAX_VISIBLE_OPTIONS = 12;
	const fallbackOptions = [''];
	const palette = ['#f8c34a', '#ef476f', '#40c7f4', '#8bd450', '#a78bfa', '#ff8a3d', '#2dd4bf', '#f472b6'];

	function normalizedOptions(value: string[]) {
		const cleaned = value.map((entry) => entry.trim()).filter(Boolean);
		return cleaned.length > 0 ? cleaned : fallbackOptions;
	}

	function displayOptionsForWheel(values: string[], selectedIndex: number) {
		if (values.length <= MAX_VISIBLE_OPTIONS) {
			return values;
		}

		if (selectedIndex < MAX_VISIBLE_OPTIONS - 1) {
			return values.slice(0, MAX_VISIBLE_OPTIONS);
		}

		return [...values.slice(0, MAX_VISIBLE_OPTIONS - 1), values[selectedIndex] ?? values[0] ?? ''];
	}

	function wheelGradient(values: string[]) {
		const segment = 360 / Math.max(values.length, 1);
		return values
			.map((_, index) => {
				const start = index * segment;
				const end = (index + 1) * segment;
				return `${palette[index % palette.length]} ${start}deg ${end}deg`;
			})
			.join(', ');
	}

	function labelPositionStyle(index: number, optionCount: number, angleStep: number) {
		const safeOptionCount = Math.max(optionCount, 1);
		const angle = index * angleStep + angleStep / 2 - 90;
		const radians = (angle * Math.PI) / 180;
		const radius = safeOptionCount <= 4 ? 29 : safeOptionCount <= 8 ? 31 : 33;
		const width = safeOptionCount <= 4 ? 34 : safeOptionCount <= 8 ? 28 : 22;
		const x = 50 + Math.cos(radians) * radius;
		const y = 50 + Math.sin(radians) * radius;
		return `--label-x: ${x.toFixed(2)}%; --label-y: ${y.toFixed(2)}%; --label-width: ${width}%;`;
	}

	$: activeOptions = normalizedOptions(run?.options?.length ? run.options : options);
	$: selectedIndex = Math.max(0, Math.min(run?.resultIndex ?? 0, activeOptions.length - 1));
	$: selectedValue = run?.result ?? activeOptions[selectedIndex] ?? activeOptions[0] ?? '';
	$: visibleOptions = displayOptionsForWheel(activeOptions, selectedIndex);
	$: visibleSelectedIndex = Math.max(0, visibleOptions.findIndex((option) => option === selectedValue));
	$: segmentAngle = 360 / Math.max(visibleOptions.length, 1);
	$: labelStyles = visibleOptions.map((_, index) =>
		labelPositionStyle(index, visibleOptions.length, segmentAngle)
	);
	$: wheelRotation = 2160 + (360 - visibleSelectedIndex * segmentAngle - segmentAngle / 2);
	$: runKey = run?.id ?? `${randomizerId}-preview-${activeOptions.join('|')}-${selectedValue}`;
	$: wheelStyle = `--wheel-gradient: ${wheelGradient(visibleOptions)}; --wheel-rotation: ${wheelRotation.toFixed(2)}deg;`;
	$: overlayElementId = `sp-${randomizerId}-overlay`;
</script>

<div
	id={overlayElementId}
	class={`lucky-wheel-stage ${preview ? 'is-preview' : ''}`}
	data-sp-overlay="scene-randomizer"
	data-sp-randomizer={randomizerId}
>
	<div id={`sp-${randomizerId}-glow`} class="wheel-glow"></div>

	<div id={`sp-${randomizerId}-wrap`} class="wheel-wrap">
		<div id={`sp-${randomizerId}-pointer`} class="wheel-pointer"></div>
		{#key runKey}
			<div id={`sp-${randomizerId}-wheel`} class="wheel" style={wheelStyle}>
				<div id={`sp-${randomizerId}-shine`} class="wheel-shine"></div>
				{#each visibleOptions as option, index (`${option}-${index}`)}
					<div
						id={`sp-${randomizerId}-option-${index + 1}`}
						class="wheel-label"
						style={labelStyles[index]}
						data-sp-wheel-option-index={index + 1}
					>
						<span id={`sp-${randomizerId}-option-label-${index + 1}`}>{option}</span>
					</div>
				{/each}
			</div>
		{/key}
		<div id={`sp-${randomizerId}-center`} class="wheel-center">
			<span>SPIN</span>
		</div>
	</div>

	{#key `${runKey}-result`}
		<div id={`sp-${randomizerId}-result`} class="result-ribbon">
			<span id={`sp-${randomizerId}-result-text`}>{selectedValue}</span>
		</div>
	{/key}
</div>

<style>
	.lucky-wheel-stage {
		container-type: size;
		position: relative;
		display: grid;
		width: 100%;
		height: 100%;
		min-width: 0;
		min-height: 0;
		place-items: center;
		overflow: visible;
		color: #f8fbff;
		font-family: "IBM Plex Sans", sans-serif;
	}

	.wheel-glow {
		position: absolute;
		left: 50%;
		top: 45%;
		width: 84cqmin;
		aspect-ratio: 1;
		transform: translate(-50%, -50%);
		border-radius: 50%;
		background: radial-gradient(circle, rgba(255, 214, 89, 0.34), rgba(59, 130, 246, 0.18) 44%, transparent 70%);
		filter: blur(12px);
		opacity: 0.82;
	}

	.wheel-wrap {
		position: absolute;
		left: 50%;
		top: 4%;
		width: 78cqmin;
		aspect-ratio: 1;
		transform: translateX(-50%);
		filter: drop-shadow(0 20px 28px rgba(0, 0, 0, 0.34));
	}

	.wheel {
		position: absolute;
		inset: 0;
		overflow: hidden;
		border-radius: 50%;
		background: conic-gradient(var(--wheel-gradient));
		border: clamp(5px, 2.2cqmin, 18px) solid rgba(255, 255, 255, 0.96);
		box-shadow:
			inset 0 0 0 clamp(1px, 0.5cqmin, 5px) rgba(57, 36, 0, 0.22),
			inset 0 -18px 32px rgba(0, 0, 0, 0.22),
			0 0 0 clamp(2px, 0.8cqmin, 7px) rgba(255, 210, 83, 0.32),
			0 0 32px rgba(255, 205, 80, 0.32);
		animation: wheel-spin 5.2s cubic-bezier(0.12, 0.76, 0.08, 1) both;
	}

	.is-preview .wheel {
		animation: none;
		transform: none;
	}

	.wheel-shine {
		position: absolute;
		inset: 9%;
		z-index: 2;
		pointer-events: none;
		border-radius: 50%;
		background:
			radial-gradient(circle at 32% 22%, rgba(255, 255, 255, 0.4), transparent 25%),
			radial-gradient(circle, transparent 58%, rgba(255, 255, 255, 0.28) 59%, transparent 61%);
		mix-blend-mode: screen;
	}

	.wheel-label {
		position: absolute;
		left: var(--label-x);
		top: var(--label-y);
		z-index: 3;
		display: grid;
		width: var(--label-width);
		min-height: 1.7em;
		place-items: center;
		transform: translate(-50%, -50%);
		color: #fff;
		font-size: clamp(7px, 3.5cqmin, 28px);
		font-weight: 900;
		line-height: 1.08;
		text-align: center;
		text-shadow: 0 2px 5px rgba(0, 0, 0, 0.58);
	}

	.wheel-label span {
		display: -webkit-box;
		max-width: 100%;
		max-height: 2.2em;
		overflow: hidden;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		overflow-wrap: anywhere;
	}

	.wheel-pointer {
		position: absolute;
		left: 50%;
		top: -4%;
		z-index: 8;
		width: 0;
		height: 0;
		transform: translateX(-50%);
		border-left: clamp(8px, 5cqmin, 36px) solid transparent;
		border-right: clamp(8px, 5cqmin, 36px) solid transparent;
		border-top: clamp(16px, 9cqmin, 64px) solid #fff2a7;
		filter: drop-shadow(0 5px 6px rgba(0, 0, 0, 0.38));
	}

	.wheel-center {
		position: absolute;
		left: 50%;
		top: 50%;
		z-index: 9;
		display: grid;
		width: 24%;
		aspect-ratio: 1;
		place-items: center;
		transform: translate(-50%, -50%);
		border-radius: 50%;
		background: radial-gradient(circle at 35% 24%, #fff7c5, #f3bf36 48%, #b96d0a);
		color: #3d2600;
		font-size: clamp(7px, 4cqmin, 32px);
		font-weight: 950;
		letter-spacing: 0;
		box-shadow:
			inset 0 2px 5px rgba(255, 255, 255, 0.46),
			0 7px 18px rgba(0, 0, 0, 0.35);
	}

	.result-ribbon {
		position: absolute;
		left: 50%;
		bottom: 3%;
		z-index: 10;
		display: inline-flex;
		max-width: 94%;
		min-height: 18%;
		align-items: center;
		justify-content: center;
		transform: translateX(-50%);
		border-radius: 999px;
		border: 1px solid rgba(255, 230, 144, 0.58);
		background: linear-gradient(180deg, rgba(34, 22, 3, 0.86), rgba(9, 12, 18, 0.78));
		box-shadow: 0 12px 28px rgba(0, 0, 0, 0.34), 0 0 28px rgba(255, 204, 82, 0.28);
		opacity: 0;
		padding: 0.1em 0.75em;
		color: #fff6c9;
		font-size: clamp(10px, 6cqmin, 48px);
		font-weight: 950;
		line-height: 1.05;
		text-align: center;
		text-shadow: 0 2px 6px rgba(0, 0, 0, 0.58);
		animation: result-reveal 660ms cubic-bezier(0.16, 0.84, 0.22, 1) 5.45s both;
	}

	.result-ribbon span {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.is-preview .result-ribbon {
		opacity: 1;
		animation: none;
	}

	@keyframes wheel-spin {
		0% {
			transform: rotate(0deg) scale(0.96);
			filter: blur(0.45px);
		}
		100% {
			transform: rotate(var(--wheel-rotation)) scale(1);
			filter: blur(0);
		}
	}

	@keyframes result-reveal {
		0% {
			opacity: 0;
			transform: translateX(-50%) translateY(22%) scale(0.86);
		}
		100% {
			opacity: 1;
			transform: translateX(-50%) translateY(0) scale(1);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.wheel,
		.result-ribbon {
			animation: none;
		}

		.result-ribbon {
			opacity: 1;
		}
	}
</style>
