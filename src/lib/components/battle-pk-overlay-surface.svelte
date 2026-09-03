<script lang="ts">
	import type { BattleContestant, BattleSide } from "$lib/app-types";

	export let contestants: BattleContestant[] = [];
	export let countdownLabel = "00:00";
	export let showCenterLine = true;

	function placeholderContestant(side: BattleSide): BattleContestant {
		return {
			id: `${side}-placeholder`,
			side,
			name: side === "left" ? "Left Cast" : "Right Cast",
			avatar: side === "left" ? "L" : "R",
			gifts: [],
			score: 0,
			voters: 0,
		};
	}

	function clamp(value: number, min: number, max: number) {
		return Math.min(Math.max(value, min), max);
	}

	function paddedGifts(contestant: BattleContestant) {
		const selectedGifts = (contestant.gifts ?? [])
			.filter(Boolean)
			.slice(0, 9);

		if (selectedGifts.length === 0) {
			return [];
		}

		// Repeat the user's actual sticker selection 3 times.
		// This creates a seamless infinite scrolling track.
		return [...selectedGifts, ...selectedGifts, ...selectedGifts];
	}

	let leftContestant = placeholderContestant("left");
	let rightContestant = placeholderContestant("right");
	let leftShare = 0.5;
	let rightShare = 0.5;

	$: leftContestant =
		contestants.find((contestant) => contestant.side === "left") ??
		contestants[0] ??
		placeholderContestant("left");
	$: rightContestant =
		contestants.find((contestant) => contestant.side === "right") ??
		contestants[1] ??
		placeholderContestant("right");

	$: {
		const totalScore = leftContestant.score + rightContestant.score;
		if (totalScore <= 0) {
			leftShare = 0.5;
			rightShare = 0.5;
		} else {
			leftShare = clamp(leftContestant.score / totalScore, 0.18, 0.82);
			rightShare = clamp(rightContestant.score / totalScore, 0.18, 0.82);
		}
	}
</script>

<div
	id="sp-battle-overlay"
	class="battle-surface"
	data-sp-overlay="battle-ladder"
>
	<div id="sp-battle-board" class="battle-board">
		<div id="sp-battle-header" class="battle-header">
			<div
				id="sp-battle-left-name-stack"
				class="battle-name-stack battle-name-stack--left"
			>
				<div
					id="sp-battle-left-name"
					class="battle-name-pill battle-name-pill--left"
				>
					{leftContestant.name}
				</div>
			</div>

			<div id="sp-battle-center-stack" class="battle-center-stack">
				<div id="sp-battle-timer" class="battle-timer">
					{countdownLabel}
				</div>
			</div>

			<div
				id="sp-battle-right-name-stack"
				class="battle-name-stack battle-name-stack--right"
			>
				<div
					id="sp-battle-right-name"
					class="battle-name-pill battle-name-pill--right"
				>
					{rightContestant.name}
				</div>
			</div>
		</div>

		<div id="sp-battle-progress-shell" class="battle-progress-shell">
			<div id="sp-battle-progress" class="battle-progress-track">
				<div
					id="sp-battle-progress-left"
					class="battle-progress-fill battle-progress-fill--left"
					style={`width: ${(leftShare * 100).toFixed(2)}%`}
				>
					<div
						id="sp-battle-left-score"
						class="battle-score-pill battle-score-pill--left"
					>
						{leftContestant.score.toLocaleString()}
					</div>
				</div>

				<div
					id="sp-battle-progress-right"
					class="battle-progress-fill battle-progress-fill--right"
					style={`width: ${(rightShare * 100).toFixed(2)}%`}
				>
					<div
						id="sp-battle-right-score"
						class="battle-score-pill battle-score-pill--right"
					>
						{rightContestant.score.toLocaleString()}
					</div>
				</div>

				{#if showCenterLine}
					<div
						id="sp-battle-progress-break"
						class="battle-progress-break"
						style={`left: ${(leftShare * 100).toFixed(2)}%`}
					></div>
				{/if}
			</div>
		</div>

		<div id="sp-battle-body" class="battle-stage-body">
			{#if showCenterLine}
				<div
					id="sp-battle-center-spine"
					class="battle-center-spine"
				></div>
			{/if}

			<div id="sp-battle-gift-grid" class="battle-gift-grid">
				<!-- LEFT: scrolls continuously toward the LEFT -->
				<div
					id="sp-battle-left-gifts"
					class="battle-gift-lane battle-gift-lane--left"
				>
					<div class="battle-gift-track battle-gift-track--left">
						{#each paddedGifts(leftContestant) as gift, giftIndex}
							<div
								id={`sp-battle-left-gift-${giftIndex + 1}`}
								class="battle-gift-slot"
								style={`--gift-index: ${giftIndex};`}
								data-sp-battle-gift-side="left"
								data-sp-battle-gift-index={giftIndex + 1}
							>
								{#if gift?.giftImageUrl}
									<img
										id={`sp-battle-left-gift-image-${giftIndex + 1}`}
										src={gift.giftImageUrl}
										alt={gift.giftName}
										class="battle-gift-image"
									/>
								{:else if gift}
									<span
										id={`sp-battle-left-gift-fallback-${giftIndex + 1}`}
										class="battle-gift-fallback"
									>
										🎁
									</span>
								{:else}
									<span
										id={`sp-battle-left-gift-empty-${giftIndex + 1}`}
										class="battle-empty-dot"
									></span>
								{/if}
							</div>
						{/each}
					</div>
				</div>

				<!-- RIGHT: scrolls continuously toward the RIGHT -->
				<div
					id="sp-battle-right-gifts"
					class="battle-gift-lane battle-gift-lane--right"
				>
					<div class="battle-gift-track battle-gift-track--right">
						{#each paddedGifts(rightContestant) as gift, giftIndex}
							<div
								id={`sp-battle-right-gift-${giftIndex + 1}`}
								class="battle-gift-slot"
								style={`--gift-index: ${giftIndex};`}
								data-sp-battle-gift-side="right"
								data-sp-battle-gift-index={giftIndex + 1}
							>
								{#if gift?.giftImageUrl}
									<img
										id={`sp-battle-right-gift-image-${giftIndex + 1}`}
										src={gift.giftImageUrl}
										alt={gift.giftName}
										class="battle-gift-image"
									/>
								{:else if gift}
									<span
										id={`sp-battle-right-gift-fallback-${giftIndex + 1}`}
										class="battle-gift-fallback"
									>
										🎁
									</span>
								{:else}
									<span
										id={`sp-battle-right-gift-empty-${giftIndex + 1}`}
										class="battle-empty-dot"
									></span>
								{/if}
							</div>
						{/each}
					</div>
				</div>
			</div>
		</div>
	</div>
</div>

<style>
	.battle-surface {
		--unit: calc(100cqw / 1080);
		position: relative;
		width: 100%;
		height: 100%;
		overflow: hidden;
		container-type: size;
	}

	.battle-board {
		position: relative;
		z-index: 4;
		display: grid;
		grid-template-rows: auto auto minmax(0, 1fr);
		align-content: start;
		gap: calc(18 * var(--unit));
		padding: calc(22 * var(--unit)) calc(24 * var(--unit))
			calc(18 * var(--unit));
	}

	.battle-header {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
		align-items: start;
		gap: calc(18 * var(--unit));
	}

	.battle-name-stack {
		display: grid;
		gap: calc(8 * var(--unit));
	}

	.battle-name-stack--left {
		justify-items: start;
	}

	.battle-name-stack--right {
		justify-items: end;
	}

	.battle-name-pill {
		max-width: 100%;
		padding: calc(12 * var(--unit)) calc(24 * var(--unit));
		border-radius: calc(999 * var(--unit));
		color: white;
		font-size: calc(30 * var(--unit));
		font-weight: 900;
		line-height: 1;
		letter-spacing: -0.03em;
		backdrop-filter: blur(calc(16 * var(--unit)));
		box-shadow: 0 calc(14 * var(--unit)) calc(28 * var(--unit))
			rgba(4, 12, 24, 0.3);
	}

	.battle-name-pill--left {
		background: linear-gradient(
			90deg,
			rgba(40, 223, 255, 0.98),
			rgba(53, 149, 255, 0.88)
		);
	}

	.battle-name-pill--right {
		background: linear-gradient(
			90deg,
			rgba(255, 89, 179, 0.9),
			rgba(255, 120, 156, 0.98)
		);
	}

	.battle-center-stack {
		display: grid;
		justify-items: center;
		gap: calc(8 * var(--unit));
	}

	.battle-timer {
		padding: calc(12 * var(--unit)) calc(24 * var(--unit));
		border-radius: calc(999 * var(--unit));
		border: calc(1 * var(--unit)) solid rgba(255, 255, 255, 0.18);
		background: rgba(4, 9, 18, 0.78);
		color: white;
		font-size: calc(36 * var(--unit));
		font-weight: 900;
		line-height: 1;
		letter-spacing: 0.1em;
		box-shadow: 0 calc(14 * var(--unit)) calc(28 * var(--unit))
			rgba(3, 8, 18, 0.34);
	}

	.battle-progress-shell {
		display: grid;
	}

	.battle-progress-track {
		position: relative;
		height: calc(72 * var(--unit));
		border-radius: calc(999 * var(--unit));
		border: calc(1 * var(--unit)) solid rgba(255, 255, 255, 0.2);
		background: linear-gradient(
				180deg,
				rgba(255, 255, 255, 0.1),
				rgba(255, 255, 255, 0.03)
			),
			rgba(7, 12, 23, 0.56);
		box-shadow:
			inset 0 calc(1 * var(--unit)) 0 rgba(255, 255, 255, 0.18),
			0 calc(14 * var(--unit)) calc(30 * var(--unit))
				rgba(5, 10, 20, 0.24);
		overflow: hidden;
		backdrop-filter: blur(calc(14 * var(--unit)));
	}

	.battle-progress-fill {
		position: absolute;
		top: 0;
		bottom: 0;
		display: flex;
		align-items: center;
		padding: 0 calc(10 * var(--unit));
		transition: width 240ms ease;
	}

	.battle-progress-fill--left {
		left: 0;
		justify-content: flex-start;
		background: linear-gradient(
			90deg,
			rgba(44, 229, 255, 0.98),
			rgba(77, 201, 255, 0.9)
		);
	}

	.battle-progress-fill--right {
		right: 0;
		justify-content: flex-end;
		background: linear-gradient(
			90deg,
			rgba(255, 108, 193, 0.88),
			rgba(255, 58, 160, 0.98)
		);
	}

	.battle-score-pill {
		padding: calc(8 * var(--unit)) calc(20 * var(--unit));
		border-radius: calc(999 * var(--unit));
		background: rgba(4, 12, 24, 0.36);
		color: white;
		font-size: calc(30 * var(--unit));
		font-weight: 900;
		line-height: 1;
		letter-spacing: -0.03em;
		box-shadow: inset 0 calc(1 * var(--unit)) 0 rgba(255, 255, 255, 0.18);
	}

	.battle-progress-break {
		position: absolute;
		top: calc(-10 * var(--unit));
		bottom: calc(-10 * var(--unit));
		width: calc(6 * var(--unit));
		border-radius: calc(999 * var(--unit));
		background: linear-gradient(
				180deg,
				rgba(255, 255, 255, 0.96),
				rgba(171, 231, 255, 0.72)
			),
			radial-gradient(circle, rgba(160, 223, 255, 0.72), transparent 70%);
		box-shadow:
			0 0 calc(18 * var(--unit)) rgba(141, 220, 255, 0.58),
			0 0 calc(32 * var(--unit)) rgba(118, 172, 255, 0.26);
		transform: translateX(-50%);
	}

	.battle-gift-grid {
		display: grid;
		position: relative;
		z-index: 4;
		height: 100%;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		align-items: start;
		gap: calc(175 * var(--unit));
	}

	.battle-stage-body {
		position: relative;
		min-height: 0;
	}

	.battle-gift-lane {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: calc(12 * var(--unit));
	}

	.battle-gift-lane--left {
		justify-self: stretch;
	}

	.battle-gift-lane--right {
		justify-self: stretch;
	}

	.battle-gift-slot {
		display: grid;
		justify-items: center;
		gap: calc(8 * var(--unit));
		padding: calc(10 * var(--unit)) calc(8 * var(--unit))
			calc(12 * var(--unit));
		border-radius: calc(24 * var(--unit));
		border: calc(1 * var(--unit)) solid rgba(255, 255, 255, 0.18);
		background: linear-gradient(
				180deg,
				rgba(255, 255, 255, 0.12),
				rgba(255, 255, 255, 0.04)
			),
			rgba(6, 10, 20, 0.46);
		box-shadow:
			inset 0 calc(1 * var(--unit)) 0 rgba(255, 255, 255, 0.18),
			0 calc(12 * var(--unit)) calc(28 * var(--unit)) rgba(4, 10, 20, 0.2);
		backdrop-filter: blur(calc(14 * var(--unit)));
	}

	.battle-gift-image {
		width: calc(70 * var(--unit));
		height: calc(70 * var(--unit));
		object-fit: contain;
		filter: drop-shadow(
			0 calc(8 * var(--unit)) calc(16 * var(--unit)) rgba(0, 0, 0, 0.22)
		);
		animation: battle-gift-bob 4.2s ease-in-out infinite;
		animation-delay: calc(var(--gift-index, 0) * 120ms);
	}

	.battle-gift-fallback {
		font-size: calc(40 * var(--unit));
		line-height: 1;
	}

	.battle-empty-dot {
		width: calc(9 * var(--unit));
		height: calc(9 * var(--unit));
		border-radius: 999px;
		background: rgba(158, 171, 193, 0.5);
	}

	.battle-center-spine {
		position: absolute;
		top: 0;
		bottom: 0;
		left: 50%;
		width: calc(8 * var(--unit));
		transform: translateX(-50%);
		border-radius: calc(999 * var(--unit));
		background: linear-gradient(
			180deg,
			rgba(255, 255, 255, 0.98),
			rgba(167, 227, 255, 0.74)
		);
		box-shadow:
			0 0 calc(24 * var(--unit)) rgba(154, 225, 255, 0.55),
			0 0 calc(44 * var(--unit)) rgba(86, 145, 255, 0.22);
		z-index: 7;
		pointer-events: none;
	}

	.battle-center-spine::before {
		content: "";
		position: absolute;
		inset: calc(-10 * var(--unit)) calc(-14 * var(--unit));
		border-radius: inherit;
		background: radial-gradient(
			circle,
			rgba(188, 236, 255, 0.36),
			transparent 70%
		);
		filter: blur(calc(10 * var(--unit)));
	}

	@keyframes battle-gift-bob {
		0%,
		100% {
			transform: translateY(0);
		}

		50% {
			transform: translateY(calc(-6 * var(--unit)));
		}
	}

	.battle-gift-grid {
		position: relative;
		display: grid;
		grid-template-columns: 1fr 1fr;
		width: 100%;
		overflow: hidden;
	}

	.battle-gift-lane {
		position: relative;
		width: 100%;
		overflow: hidden;
		display: flex;
		align-items: center;
	}

	.battle-gift-track {
		display: flex;
		align-items: center;
		width: max-content;
		flex-shrink: 0;
		will-change: transform;
	}

	.battle-gift-track--left {
		animation: battle-gifts-scroll-left 14s linear infinite;
	}

	.battle-gift-track--right {
		animation: battle-gifts-scroll-right 14s linear infinite;
	}
	
	.battle-gift-slot {
		flex: 0 0 auto;
		width: calc(86 * var(--unit));
		height: calc(94 * var(--unit));
		margin: 0 calc(4 * var(--unit));
		display: grid;
		place-items: center;
		border-radius: calc(24 * var(--unit));
		border: calc(1 * var(--unit)) solid rgba(255, 255, 255, 0.18);
		background: linear-gradient(
				180deg,
				rgba(255, 255, 255, 0.12),
				rgba(255, 255, 255, 0.04)
			),
			rgba(6, 10, 20, 0.46);
		box-shadow:
			inset 0 calc(1 * var(--unit)) 0 rgba(255, 255, 255, 0.18),
			0 calc(12 * var(--unit)) calc(28 * var(--unit)) rgba(4, 10, 20, 0.2);
		backdrop-filter: blur(calc(14 * var(--unit)));
		overflow: hidden;
	}

	.battle-gift-image {
		width: calc(70 * var(--unit));
		height: calc(70 * var(--unit));
		object-fit: contain;
		display: block;
		filter: drop-shadow(
			0 calc(8 * var(--unit)) calc(16 * var(--unit)) rgba(0, 0, 0, 0.22)
		);
		animation: battle-gift-bob 4.2s ease-in-out infinite;
		animation-delay: calc(var(--gift-index, 0) * 120ms);
	}

	.battle-gift-fallback {
		font-size: calc(40 * var(--unit));
		line-height: 1;
	}

	.battle-empty-dot {
		width: calc(9 * var(--unit));
		height: calc(9 * var(--unit));
		border-radius: 999px;
		background: rgba(158, 171, 193, 0.5);
	}

	.battle-gift-track--left {
		animation: battle-gifts-scroll-left 14s linear infinite;
	}

	.battle-gift-track--right {
		animation: battle-gifts-scroll-right 14s linear infinite;
	}

	@keyframes battle-gifts-scroll-left {
		from {
			transform: translate3d(0, 0, 0);
		}

		to {
			transform: translate3d(-33.333333%, 0, 0);
		}
	}

	@keyframes battle-gifts-scroll-right {
		from {
			transform: translate3d(-33.333333%, 0, 0);
		}

		to {
			transform: translate3d(0, 0, 0);
		}
	}

	/* Optional: pause while hovering */
	.battle-gift-lane:hover .battle-gift-track {
		animation-play-state: paused;
	}

	@media (prefers-reduced-motion: reduce) {
		.battle-gift-track {
			animation: none;
		}
	}
</style>
