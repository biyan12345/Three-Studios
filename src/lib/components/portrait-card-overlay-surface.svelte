<script lang="ts">
	import type { GroupPkContestant, PkVisualEffect, StickerDanceContestant } from '$lib/app-types';

	export let mode: 'group-sticker' | 'group-pk';
	export let stickerContestants: StickerDanceContestant[] = [];
	export let groupPkContestants: GroupPkContestant[] = [];
	export let countdownLabel = '00:00';
	export let visualEffect: PkVisualEffect = 'gift-blast';

	const PK_ACCENTS = [
		{ start: '#f45fa8', end: '#ff86c2', rail: 'rgba(244, 95, 168, 0.24)' },
		{ start: '#27bff3', end: '#6ce8ff', rail: 'rgba(39, 191, 243, 0.24)' },
		{ start: '#edc056', end: '#f8d77b', rail: 'rgba(237, 192, 86, 0.24)' },
		{ start: '#8f57f1', end: '#bc6aff', rail: 'rgba(143, 87, 241, 0.24)' },
		{ start: '#f15a69', end: '#ff7b76', rail: 'rgba(241, 90, 105, 0.24)' }
	] as const;

	let stickerLeaderScore = 0;
	let pkLeaderScore = 0;

	$: stickerLeaderScore = stickerContestants.reduce(
		(maxScore, contestant) => Math.max(maxScore, contestant.score),
		0
	);

	$: pkLeaderScore = groupPkContestants.reduce(
		(maxScore, contestant) => Math.max(maxScore, contestant.score),
		0
	);

	function paddedGroupPkGifts(contestant: GroupPkContestant) {
		return Array.from({ length: 3 }, (_, index) => contestant.gifts[index] ?? null);
	}

	function pkAccentStyle(index: number) {
		const accent = PK_ACCENTS[index % PK_ACCENTS.length];
		return `--pk-accent-start: ${accent.start}; --pk-accent-end: ${accent.end}; --pk-accent-rail: ${accent.rail};`;
	}
</script>

{#if mode === 'group-sticker'}
	<div
		id="sp-group-sticker-overlay"
		class={`surface sticker-surface surface--${visualEffect}`}
		data-sp-overlay="group-sticker"
		data-sp-effect={visualEffect}
	>
		<div class="pk-effect-layer" aria-hidden="true"></div>
		<div id="sp-group-sticker-row" class="sticker-row">
			{#each stickerContestants as contestant, index}
				{@const isLeader = stickerLeaderScore > 0 && contestant.score === stickerLeaderScore}
				<div
					id={`sp-group-sticker-cast-${index + 1}`}
					class="sticker-card"
					class:sticker-card--leader={isLeader}
					style={`--sticker-index: ${index};`}
					data-sp-cast-index={index + 1}
					data-sp-cast-name={contestant.name}
				>
					{#if isLeader}
						<div id={`sp-group-sticker-leader-border-${index + 1}`} class="leader-border" aria-hidden="true"></div>
						<div id={`sp-group-sticker-sparkles-${index + 1}`} class="leader-sparkles" aria-hidden="true">
							<span></span>
							<span></span>
							<span></span>
							<span></span>
						</div>
					{/if}
					<div id={`sp-group-sticker-icon-wrap-${index + 1}`} class="sticker-icon-wrap">
						<div
							id={`sp-group-sticker-icon-${index + 1}`}
							class="sticker-icon"
							class:sticker-icon--leader={isLeader}
						>
							{#if contestant.giftImageUrl}
								<img
									id={`sp-group-sticker-gift-image-${index + 1}`}
									src={contestant.giftImageUrl}
									alt={contestant.giftName}
									class="sticker-gift-image"
								/>
							{:else}
								<span id={`sp-group-sticker-gift-fallback-${index + 1}`}>🎁</span>
							{/if}
						</div>
					</div>
					<div
						id={`sp-group-sticker-score-${index + 1}`}
						class="sticker-score"
						class:sticker-score--leader={isLeader}
					>
						{contestant.score.toLocaleString()}
					</div>
					<div
						id={`sp-group-sticker-name-${index + 1}`}
						class="sticker-name"
						class:sticker-name--leader={isLeader}
					>
						{contestant.name}
					</div>
				</div>
			{/each}
		</div>
	</div>
{:else}
	<div
		id="sp-group-pk-overlay"
		class={`surface pk-surface surface--${visualEffect}`}
		data-sp-overlay="group-pk"
		data-sp-effect={visualEffect}
	>
		<div class="pk-effect-layer" aria-hidden="true"></div>
		<div id="sp-group-pk-board" class="pk-board">
			<div id="sp-group-pk-row" class="pk-row">
				{#each groupPkContestants as contestant, index}
					{@const isLeader = pkLeaderScore > 0 && contestant.score === pkLeaderScore}
					<div
						id={`sp-group-pk-cast-${index + 1}`}
						class="pk-column"
						class:pk-column--leader={isLeader}
						style={pkAccentStyle(index)}
						data-sp-cast-index={index + 1}
						data-sp-cast-name={contestant.name}
					>
						{#if isLeader}
							<div id={`sp-group-pk-leader-border-${index + 1}`} class="leader-border" aria-hidden="true"></div>
							<div id={`sp-group-pk-sparkles-${index + 1}`} class="leader-sparkles" aria-hidden="true">
								<span></span>
								<span></span>
								<span></span>
								<span></span>
							</div>
						{/if}
						<div id={`sp-group-pk-name-pill-${index + 1}`} class="pk-name-pill">
							<!-- <div class="pk-avatar">{contestant.avatar}</div> -->
							<div id={`sp-group-pk-name-${index + 1}`} class="pk-name">{contestant.name}</div>
						</div>
						<div
							id={`sp-group-pk-score-${index + 1}`}
							class="pk-score-bar"
							class:pk-score-bar--leader={isLeader}
						>
							{contestant.score.toLocaleString()}
						</div>
						<div
							id={`sp-group-pk-gifts-${index + 1}`}
							class="pk-gift-strip"
							class:pk-gift-strip--leader={isLeader}
						>
							{#each paddedGroupPkGifts(contestant) as gift, giftIndex}
								<div
									id={`sp-group-pk-cast-${index + 1}-gift-${giftIndex + 1}`}
									class="pk-gift-slot"
									class:pk-gift-slot--empty={!gift}
									style={`--pk-gift-index: ${giftIndex};`}
									data-sp-gift-index={giftIndex + 1}
								>
									{#if gift?.giftImageUrl}
										<img
											id={`sp-group-pk-cast-${index + 1}-gift-image-${giftIndex + 1}`}
											src={gift.giftImageUrl}
											alt={gift.giftName}
											class="pk-gift-image"
										/>
									{:else if gift}
										<span id={`sp-group-pk-cast-${index + 1}-gift-fallback-${giftIndex + 1}`} class="pk-gift-fallback">🎁</span>
									{:else}
										<span id={`sp-group-pk-cast-${index + 1}-gift-empty-${giftIndex + 1}`} class="pk-empty-dot"></span>
									{/if}
								</div>
							{/each}
						</div>
					</div>
				{/each}
			</div>
			<div id="sp-group-pk-countdown" class="pk-countdown">{countdownLabel}</div>
		</div>
	</div>
{/if}

<style>
	.surface {
		position: relative;
		width: 100%;
		height: 100%;
		display: grid;
		justify-items: stretch;
		align-items: stretch;
		align-content: start;
		overflow: hidden;
		container-type: size;
	}

	.pk-effect-layer {
		position: absolute;
		inset: 0;
		z-index: 20;
		pointer-events: none;
		opacity: 0;
		mix-blend-mode: screen;
	}

	.surface--freeze .pk-effect-layer {
		opacity: 0.84;
		background:
			linear-gradient(135deg, rgba(178, 235, 255, 0.28), rgba(255, 255, 255, 0.18), rgba(67, 176, 255, 0.22)),
			repeating-linear-gradient(42deg, transparent 0 28px, rgba(255, 255, 255, 0.36) 29px 31px, transparent 32px 64px);
		backdrop-filter: blur(calc(1.6 * var(--design-unit)));
		animation: pk-freeze-bloom 1.7s ease-in-out infinite alternate;
	}

	.surface--fire .pk-effect-layer {
		opacity: 0.86;
		background:
			radial-gradient(ellipse at 20% 105%, rgba(255, 246, 160, 0.95) 0 6%, rgba(255, 97, 22, 0.78) 18%, transparent 42%),
			radial-gradient(ellipse at 62% 108%, rgba(255, 218, 86, 0.9) 0 8%, rgba(232, 45, 18, 0.68) 20%, transparent 44%),
			linear-gradient(0deg, rgba(190, 24, 24, 0.46), transparent 72%);
		filter: saturate(1.35);
		animation: pk-fire-rise 780ms linear infinite;
	}

	.surface--thunder .pk-effect-layer {
		opacity: 0.9;
		background:
			linear-gradient(118deg, transparent 0 37%, rgba(185, 235, 255, 0.95) 38% 40%, transparent 41% 49%, rgba(75, 175, 255, 0.78) 50% 52%, transparent 53%),
			radial-gradient(circle at 50% 40%, rgba(56, 189, 248, 0.34), transparent 42%);
		filter: drop-shadow(0 0 calc(18 * var(--design-unit)) rgba(125, 211, 252, 0.9));
		animation: pk-thunder-flash 1.15s steps(2, end) infinite;
	}

	.surface--gold-crown .pk-effect-layer {
		opacity: 0.88;
		background:
			radial-gradient(circle at 50% 10%, rgba(255, 248, 180, 0.95) 0 3%, transparent 8%),
			conic-gradient(from 0deg at 50% 50%, transparent, rgba(255, 215, 90, 0.38), transparent 24%, rgba(255, 246, 180, 0.45), transparent 48%),
			linear-gradient(180deg, rgba(255, 215, 90, 0.24), transparent 72%);
		filter: drop-shadow(0 0 calc(22 * var(--design-unit)) rgba(250, 204, 21, 0.9));
		animation: pk-gold-sweep 2.3s linear infinite;
	}

	.surface--gift-blast .pk-effect-layer {
		opacity: 0.92;
		background-image:
			radial-gradient(circle, rgba(255, 255, 255, 0.95) 0 2px, transparent 3px),
			radial-gradient(circle, rgba(255, 99, 180, 0.9) 0 2px, transparent 3px),
			radial-gradient(circle, rgba(93, 224, 255, 0.86) 0 2px, transparent 3px),
			radial-gradient(circle, rgba(255, 215, 88, 0.92) 0 2px, transparent 3px);
		background-size: 58px 58px, 72px 72px, 86px 86px, 104px 104px;
		background-position: 8px 14px, 32px 44px, 64px 18px, 88px 56px;
		animation: pk-gift-blast 1.45s ease-out infinite;
	}

	@keyframes pk-freeze-bloom {
		from { filter: brightness(0.96) saturate(0.74); transform: scale(1); }
		to { filter: brightness(1.16) saturate(0.92); transform: scale(1.025); }
	}

	@keyframes pk-fire-rise {
		from { background-position: 0 18px, 0 28px, 0 0; }
		to { background-position: 0 -24px, 0 -32px, 0 0; }
	}

	@keyframes pk-thunder-flash {
		0%, 72%, 100% { opacity: 0.18; transform: translateX(-2%); }
		76%, 82% { opacity: 1; transform: translateX(2%); }
	}

	@keyframes pk-gold-sweep {
		from { transform: rotate(0deg) scale(1.12); }
		to { transform: rotate(360deg) scale(1.12); }
	}

	@keyframes pk-gift-blast {
		0% { opacity: 0; transform: scale(0.72) rotate(0deg); }
		28% { opacity: 1; }
		100% { opacity: 0; transform: scale(1.25) rotate(16deg); }
	}

	@property --snake-angle {
		syntax: '<angle>';
		initial-value: 0deg;
		inherits: false;
	}

	.sticker-surface {
		--design-unit: min(calc(100cqw / 994), calc(100cqh / 307));
		padding: calc(8 * var(--design-unit)) calc(2 * var(--design-unit)) 0;
	}

	.pk-surface {
		--design-unit: min(calc(100cqw / 910), calc(100cqh / 292));
		padding: calc(8 * var(--design-unit)) calc(8 * var(--design-unit)) 0;
	}

	.sticker-row {
		width: 100%;
		display: grid;
		grid-template-columns: repeat(
			auto-fit,
			minmax(calc(118 * var(--design-unit)), 1fr)
		);
		gap: calc(12 * var(--design-unit));
		align-content: start;
		align-items: start;
		/* padding: calc(18 * var(--design-unit)) calc(10 * var(--design-unit)) calc(6 * var(--design-unit)); */
		padding: calc(52 * var(--design-unit)) calc(10 * var(--design-unit))
			calc(6 * var(--design-unit));

		overflow: visible;
	}

	.pk-row {
		width: 100%;
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(calc(118 * var(--design-unit)), 1fr));
		gap: calc(8 * var(--design-unit));
		align-content: start;
		align-items: start;
	}

	.sticker-card {
		position: relative;
		isolation: isolate;
		display: grid;
		align-content: start;
		justify-items: center;
		gap: calc(8 * var(--design-unit));
		min-height: calc(126 * var(--design-unit));
		padding: calc(36 * var(--design-unit)) calc(11 * var(--design-unit))
			calc(12 * var(--design-unit));
		border-radius: calc(18 * var(--design-unit));
		/* background:
			linear-gradient(180deg, rgba(245, 246, 250, 0.34), rgba(223, 226, 234, 0.22)),
			radial-gradient(circle at 50% -10%, rgba(255, 255, 255, 0.24), transparent 56%);
		border: calc(1 * var(--design-unit)) solid rgba(255, 255, 255, 0.22);
		box-shadow:
			inset 0 calc(1 * var(--design-unit)) 0 rgba(255, 255, 255, 0.34),
			0 calc(10 * var(--design-unit)) calc(24 * var(--design-unit)) rgba(19, 17, 21, 0.14);
		backdrop-filter: blur(calc(18 * var(--design-unit))) saturate(1.18); */

			background: linear-gradient(
				180deg,
				rgba(36, 40, 50, 0.82) 0%,
				rgba(22, 26, 34, 0.68) 100%
			);

			border: calc(1 * var(--design-unit)) solid rgba(255, 255, 255, 0.16);

			box-shadow:
				inset 0 calc(1 * var(--design-unit)) 0 rgba(255, 255, 255, 0.18),
				0 calc(8 * var(--design-unit)) calc(24 * var(--design-unit))
					rgba(0, 0, 0, 0.26);

			backdrop-filter: blur(calc(30 * var(--design-unit))) saturate(1.35);
			-webkit-backdrop-filter: blur(calc(30 * var(--design-unit))) saturate(1.35);

		overflow: visible;
		transform-origin: center bottom;
		transition:
			transform 220ms ease,
			box-shadow 220ms ease,
			background 220ms ease,
			border-color 220ms ease;
	}

	.sticker-card::before {
		content: '';
		position: absolute;
		inset: calc(1 * var(--design-unit));
		border-radius: calc(17 * var(--design-unit));
		z-index: 0;
		/* background: linear-gradient(
				180deg,
				rgba(255, 255, 255, 0.2),
				transparent 34%
			),
			linear-gradient(180deg, rgba(255, 255, 255, 0.05), transparent 72%); */
			background: linear-gradient(
				180deg,
				rgba(255, 255, 255, 0.18),
				transparent 40%
			);
		opacity: 1;
		pointer-events: none;
	}

	.sticker-card--leader::before {
		background: linear-gradient(
				180deg,
				rgba(255, 251, 233, 0.34),
				transparent 30%
			),
			linear-gradient(180deg, rgba(255, 231, 156, 0.12), transparent 76%);
	}

	.leader-border {
		position: absolute;
		inset: calc(-4 * var(--design-unit));
		z-index: 3;
		padding: calc(5 * var(--design-unit));
		border-radius: calc(22 * var(--design-unit));
		--snake-angle: 0deg;
		background:
			conic-gradient(
				from var(--snake-angle),
				rgba(255, 207, 70, 0) 0deg,
				rgba(255, 207, 70, 0) 56deg,
				rgba(255, 224, 111, 0.94) 82deg,
				#fff8cf 104deg,
				#ffc93d 132deg,
				rgba(255, 166, 20, 0.82) 158deg,
				rgba(255, 207, 70, 0) 192deg,
				rgba(255, 207, 70, 0) 360deg
			),
			linear-gradient(135deg, rgba(255, 236, 158, 0.78), rgba(255, 174, 25, 0.78));
		filter:
			drop-shadow(0 0 calc(9 * var(--design-unit)) rgba(255, 204, 67, 0.72))
			drop-shadow(0 0 calc(18 * var(--design-unit)) rgba(255, 167, 24, 0.32));
		-webkit-mask:
			linear-gradient(#000 0 0) content-box,
			linear-gradient(#000 0 0);
		-webkit-mask-composite: xor;
		mask:
			linear-gradient(#000 0 0) content-box,
			linear-gradient(#000 0 0);
		mask-composite: exclude;
		pointer-events: none;
		animation: leader-snake-border 1.8s linear infinite;
	}

	.leader-border::after {
		content: '';
		position: absolute;
		inset: calc(2 * var(--design-unit));
		border-radius: inherit;
		border: calc(1 * var(--design-unit)) solid rgba(255, 247, 196, 0.74);
		box-shadow:
			inset 0 0 calc(7 * var(--design-unit)) rgba(255, 228, 126, 0.34),
			0 0 calc(8 * var(--design-unit)) rgba(255, 209, 72, 0.42);
	}

	.leader-sparkles {
		position: absolute;
		inset: calc(8 * var(--design-unit));
		z-index: 1;
		border-radius: calc(14 * var(--design-unit));
		overflow: hidden;
		pointer-events: none;
	}

	.leader-sparkles span {
		position: absolute;
		width: calc(4 * var(--design-unit));
		height: calc(4 * var(--design-unit));
		border-radius: 999px;
		background: rgba(255, 250, 212, 0.95);
		box-shadow:
			0 0 calc(5 * var(--design-unit)) rgba(255, 245, 179, 0.88),
			0 0 calc(12 * var(--design-unit)) rgba(255, 184, 43, 0.42);
		opacity: 0;
		transform: scale(0.35);
		animation: leader-sparkle 3.4s ease-in-out infinite;
	}

	.leader-sparkles span:nth-child(1) {
		left: 18%;
		top: 34%;
		animation-delay: 0.15s;
	}

	.leader-sparkles span:nth-child(2) {
		left: 78%;
		top: 24%;
		animation-delay: 0.9s;
	}

	.leader-sparkles span:nth-child(3) {
		left: 62%;
		top: 72%;
		animation-delay: 1.7s;
	}

	.leader-sparkles span:nth-child(4) {
		left: 32%;
		top: 64%;
		animation-delay: 2.35s;
	}

	.sticker-card--leader {
		background: linear-gradient(
			180deg,
			rgba(255, 187, 51, 0.95),
			rgba(255, 140, 0, 0.92)
		);

		border-color: rgba(255, 255, 255, 0.35);

		box-shadow:
			0 calc(14 * var(--design-unit)) calc(36 * var(--design-unit))
				rgba(255, 170, 0, 0.4),
			0 0 calc(20 * var(--design-unit)) rgba(255, 204, 0, 0.25);

		transform: translateY(calc(-6 * var(--design-unit))) scale(1.04);
		animation: sticker-leader-breathe 3.2s ease-in-out infinite;
	}

	.sticker-card--leader .leader-border {
		inset: calc(-4 * var(--design-unit));
		border-radius: calc(22 * var(--design-unit));
	}

	.sticker-card--leader .leader-sparkles {
		inset: calc(12 * var(--design-unit)) calc(9 * var(--design-unit));
		border-radius: calc(14 * var(--design-unit));
	}

	.pk-board {
		display: grid;
		gap: calc(10 * var(--design-unit));
		align-content: start;
	}

	.pk-column {
		position: relative;
		isolation: isolate;
		display: grid;
		grid-template-rows: auto auto auto;
		align-content: start;
		gap: calc(4 * var(--design-unit));
		transform-origin: center top;
		transition:
			transform 200ms ease,
			filter 200ms ease;
	}

	.pk-column--leader {
		padding: calc(8 * var(--design-unit));
		border-radius: calc(16 * var(--design-unit));
		background:
			linear-gradient(180deg, rgba(255, 236, 171, 0.14), rgba(255, 180, 44, 0.07)),
			radial-gradient(circle at 50% 0%, rgba(255, 248, 207, 0.16), transparent 64%);
		transform: translateY(calc(-2 * var(--design-unit)));
		filter:
			drop-shadow(0 calc(6 * var(--design-unit)) calc(14 * var(--design-unit)) rgba(33, 36, 46, 0.14))
			drop-shadow(0 0 calc(10 * var(--design-unit)) rgba(255, 202, 78, 0.18));
	}

	.pk-column--leader .leader-border {
		inset: calc(-3 * var(--design-unit));
		border-radius: calc(18 * var(--design-unit));
	}

	.pk-column--leader .leader-sparkles {
		inset: calc(6 * var(--design-unit));
		border-radius: calc(14 * var(--design-unit));
	}

	.sticker-score,
	.sticker-name,
	.pk-name-pill,
	.pk-score-bar,
	.pk-gift-strip {
		position: relative;
		z-index: 2;
	}

	.pk-name-pill {
		/* width: 100%; */
		min-height: calc(34 * var(--design-unit));
		/* display: grid; */
		/* grid-template-columns: auto minmax(0, 1fr); */
		/* align-items: center; */
		/* gap: calc(5 * var(--design-unit)); */
		padding: calc(4 * var(--design-unit)) calc(12 * var(--design-unit)) calc(4 * var(--design-unit))
			calc(12 * var(--design-unit));
		border-radius: calc(999 * var(--design-unit));
		background: linear-gradient(90deg, var(--pk-accent-start), var(--pk-accent-end));
		box-shadow:
			inset 0 calc(1 * var(--design-unit)) 0 rgba(255, 255, 255, 0.22),
			0 calc(4 * var(--design-unit)) calc(10 * var(--design-unit)) var(--pk-accent-rail);
	}

	.sticker-icon-wrap {
		position: absolute;
		/* top: calc(-24 * var(--design-unit)); */
		top: calc(-52 * var(--design-unit));
		left: 50%;
		transform: translateX(-50%);
		z-index: 6;
		pointer-events: none;
	}

	.sticker-icon {
		display: grid;
		place-items: center;
		width: calc(82 * var(--design-unit));
		height: calc(82 * var(--design-unit));
		line-height: 1;
		animation: sticker-icon-float 4.2s ease-in-out infinite;
		animation-delay: calc(var(--sticker-index, 0) * 140ms);
		filter: drop-shadow(
			0 calc(10 * var(--design-unit)) calc(18 * var(--design-unit))
				rgba(0, 0, 0, 0.35)
		);
	}

	.sticker-icon--leader {
		transform: scale(1.06);
	}

	.pk-gift-strip {
		width: 100%;
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: calc(12 * var(--design-unit));
		/* min-height: calc(34 * var(--design-unit)); */
		padding: calc(6 * var(--design-unit));
		border-radius: calc(11 * var(--design-unit));
		background:
			linear-gradient(180deg, rgba(235, 239, 247, 0.92), rgba(219, 225, 236, 0.88)),
			radial-gradient(circle at 50% 0%, rgba(255, 255, 255, 0.34), transparent 60%);
		border: calc(1 * var(--design-unit)) solid rgba(255, 255, 255, 0.28);
		box-shadow:
			inset 0 calc(1 * var(--design-unit)) 0 rgba(255, 255, 255, 0.52),
			0 calc(6 * var(--design-unit)) calc(14 * var(--design-unit)) rgba(18, 24, 39, 0.08);
	}

	.pk-gift-strip--leader {
		border-color: rgba(255, 255, 255, 0.4);
		box-shadow:
			inset 0 calc(1 * var(--design-unit)) 0 rgba(255, 255, 255, 0.66),
			0 calc(8 * var(--design-unit)) calc(18 * var(--design-unit)) var(--pk-accent-rail);
	}

	.pk-gift-slot {
		display: grid;
		place-items: center;
		width: 100%;
		height: calc(45 * var(--design-unit));
		border-radius: calc(8 * var(--design-unit));
		background:
			linear-gradient(180deg, rgba(255, 255, 255, 0.38), rgba(255, 255, 255, 0.16)),
			radial-gradient(circle at 50% 0%, rgba(255, 243, 186, 0.24), transparent 58%);
		border: calc(1 * var(--design-unit)) solid rgba(255, 255, 255, 0.32);
		overflow: visible;
		box-shadow:
			inset 0 calc(1 * var(--design-unit)) 0 rgba(255, 255, 255, 0.38),
			0 calc(4 * var(--design-unit)) calc(10 * var(--design-unit)) rgba(18, 24, 39, 0.08);
	}

	.pk-gift-slot--empty {
		background: rgba(190, 197, 210, 0.18);
	}

	.pk-empty-dot {
		width: calc(6 * var(--design-unit));
		height: calc(6 * var(--design-unit));
		border-radius: 999px;
		background: rgba(112, 120, 136, 0.52);
	}

	.sticker-gift-image {
		width: calc(76 * var(--design-unit));
		height: calc(76 * var(--design-unit));
		object-fit: contain;
	}

	.pk-gift-image {
		width: 100%;
		height: auto;
		/* width: calc(45 * var(--design-unit)); */
		/* height: calc(45 * var(--design-unit)); */
		object-fit: contain;
		/* transform: translateY(calc(-3 * var(--design-unit))); */
		filter: drop-shadow(0 calc(3 * var(--design-unit)) calc(6 * var(--design-unit)) rgba(0, 0, 0, 0.14));
		animation: pk-gift-bob 4.8s ease-in-out infinite;
		animation-delay: calc(var(--pk-gift-index, 0) * 110ms);
	}

	.sticker-score {
		min-width: calc(52 * var(--design-unit));
		padding: calc(5 * var(--design-unit)) calc(19 * var(--design-unit));
		border-radius: 999px;
		/* background: rgba(90, 92, 104, 0.78);
		color: white; */
		font-weight: 700;
		font-size: calc(24 * var(--design-unit));
		line-height: 1;
		letter-spacing: -0.02em;
		text-align: center;
		/* box-shadow: inset 0 calc(1 * var(--design-unit)) 0
			rgba(255, 255, 255, 0.08); */

		background: linear-gradient(
			180deg,
			rgba(255, 255, 255, 0.1),
			rgba(255, 255, 255, 0.05)
		);

		border: calc(1 * var(--design-unit)) solid rgba(255, 255, 255, 0.08);

		color: rgba(255, 255, 255, 0.96);

		box-shadow: inset 0 calc(1 * var(--design-unit)) 0
			rgba(255, 255, 255, 0.06);
	}

	/* .sticker-score--leader {
		background: rgba(90, 66, 11, 0.9);
		box-shadow: inset 0 calc(1 * var(--design-unit)) 0
			rgba(255, 255, 255, 0.2);
	} */

	.sticker-score--leader {
		background: linear-gradient(135deg, #8a4b00, #5d3200);
	}

	.sticker-name {
		max-width: 100%;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: calc(22 * var(--design-unit));
		line-height: 1.05;
		letter-spacing: -0.02em;
		/* color: rgba(60, 66, 78, 0.96); 
			font-weight: 600;
		*/
		color: rgba(255, 255, 255, 0.95);
		font-weight: 700;
	}

	.sticker-name--leader {
		color: rgba(255, 252, 244, 0.96);
		text-shadow: 0 calc(1 * var(--design-unit)) calc(2 * var(--design-unit))
			rgba(90, 66, 11, 0.24);
	}

	.pk-countdown {
		justify-self: center;
		border-radius: 999px;
		padding: calc(8 * var(--design-unit)) calc(22 * var(--design-unit));
		background: rgba(147, 156, 171, 0.42);
		border: calc(1 * var(--design-unit)) solid rgba(255, 255, 255, 0.3);
		color: white;
		font-size: calc(25 * var(--design-unit));
		font-weight: 700;
		letter-spacing: 0.1em;
		line-height: 1;
		backdrop-filter: blur(calc(10 * var(--design-unit)));
		box-shadow: 0 calc(6 * var(--design-unit)) calc(16 * var(--design-unit)) rgba(27, 31, 40, 0.08);
	}

	.pk-score-bar {
		width: 100%;
		min-height: calc(36 * var(--design-unit));
		display: grid;
		align-items: center;
		padding: calc(4 * var(--design-unit)) calc(8 * var(--design-unit));
		border-radius: calc(10 * var(--design-unit));
		background: linear-gradient(90deg, var(--pk-accent-start), color-mix(in srgb, var(--pk-accent-end) 92%, white 8%));
		color: white;
		font-size: calc(25 * var(--design-unit));
		font-weight: 800;
		line-height: 1;
		text-align: center;
		box-shadow:
			inset 0 calc(1 * var(--design-unit)) 0 rgba(255, 255, 255, 0.22),
			0 calc(4 * var(--design-unit)) calc(10 * var(--design-unit)) var(--pk-accent-rail);
	}

	.pk-score-bar--leader {
		box-shadow:
			inset 0 calc(1 * var(--design-unit)) 0 rgba(255, 255, 255, 0.26),
			0 calc(6 * var(--design-unit)) calc(14 * var(--design-unit)) var(--pk-accent-rail);
	}

	.pk-name {
		width: 100%;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: calc(19 * var(--design-unit));
		font-weight: 800;
		line-height: 1.1;
		letter-spacing: -0.01em;
		color: rgba(255, 255, 255, 0.96);
	}

	.pk-gift-fallback {
		font-size: calc(20 * var(--design-unit));
		line-height: 1;
		transform: translateY(calc(-1 * var(--design-unit)));
	}

	@keyframes sticker-icon-float {
		0%,
		100% {
			transform: translateY(0);
		}

		50% {
			transform: translateY(calc(-3 * var(--design-unit)));
		}
	}

	@keyframes leader-snake-border {
		to {
			--snake-angle: 360deg;
		}
	}

	@keyframes leader-sparkle {
		0%,
		100% {
			opacity: 0;
			transform: translateY(0) scale(0.25);
		}

		18% {
			opacity: 0.9;
			transform: translateY(calc(-1 * var(--design-unit))) scale(1);
		}

		38% {
			opacity: 0;
			transform: translateY(calc(-8 * var(--design-unit))) scale(0.45);
		}
	}

	@keyframes sticker-leader-breathe {
		0%,
		100% {
			transform: translateY(calc(-4 * var(--design-unit))) scale(1.02);
			box-shadow:
				inset 0 calc(1 * var(--design-unit)) 0 rgba(255, 255, 255, 0.48),
				0 calc(12 * var(--design-unit)) calc(30 * var(--design-unit))
					rgba(93, 70, 14, 0.26),
				0 0 calc(14 * var(--design-unit)) rgba(255, 219, 98, 0.2);
		}

		50% {
			transform: translateY(calc(-5 * var(--design-unit))) scale(1.03);
			box-shadow:
				inset 0 calc(1 * var(--design-unit)) 0 rgba(255, 255, 255, 0.52),
				0 calc(14 * var(--design-unit)) calc(36 * var(--design-unit))
					rgba(93, 70, 14, 0.34),
				0 0 calc(18 * var(--design-unit)) rgba(255, 219, 98, 0.3);
		}
	}

	@keyframes sticker-leader-sheen {
		0%,
		18% {
			transform: translateX(0) skewX(-18deg);
		}

		42%,
		100% {
			transform: translateX(calc(170 * var(--design-unit))) skewX(-18deg);
		}
	}

	@keyframes pk-gift-bob {
		0%,
		100% {
			transform: translateY(calc(-2 * var(--design-unit)));
		}

		50% {
			transform: translateY(calc(-4 * var(--design-unit)));
		}
	}
</style>
