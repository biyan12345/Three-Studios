<script lang="ts">
	import type { PkVisualEffect } from '$lib/app-types';

	export let scoreMode: 'target' | 'freedom' = 'target';
	export let contestantName = 'Solo Stage';
	export let countdownLabel = '00:00';
	export let scoreLabel = '0';
	export let targetScoreLabel: string | null = null;
	export let colorTier: 'blue' | 'purple' | 'gold' = 'blue';
	export let progressPercent = 0;
	export let visualEffect: PkVisualEffect = 'gold-crown';

	let previousTier = colorTier;

	$: safeProgress = Math.min(Math.max(progressPercent, 0), 100);
	$: normalizedScoreMode = scoreMode === 'freedom' ? 'freedom' : 'target';
	$: showTargetScore = normalizedScoreMode === 'target' && Boolean(targetScoreLabel);
	$: isFreedomMode = normalizedScoreMode === 'freedom';
	$: scoreAnimationKey = `${normalizedScoreMode}-${colorTier}-${scoreLabel}-${safeProgress.toFixed(2)}`;

	$: if (colorTier !== previousTier) {
		previousTier = colorTier;
	}
</script>

<div
	id="sp-solo-overlay"
	class={`solo-shell solo-shell--${normalizedScoreMode}`}
	data-sp-overlay="solo-stage"
	data-sp-solo-mode={normalizedScoreMode}
>
	<div
		id="sp-solo-card"
		class={`solo-card solo-card--${colorTier} solo-card--${normalizedScoreMode} solo-card--effect-${visualEffect}`}
		data-sp-solo-card
		data-sp-solo-color-tier={colorTier}
		data-sp-effect={visualEffect}
	>
		<div class="solo-effect-layer" aria-hidden="true"></div>
		{#key scoreAnimationKey}
			<div id="sp-solo-impact-ring" class="solo-impact-ring" aria-hidden="true"></div>
			<div id="sp-solo-burst" class="solo-burst" aria-hidden="true">
				<span></span>
				<span></span>
				<span></span>
				<span></span>
				<span></span>
				<span></span>
			</div>
		{/key}

		<div id="sp-solo-content" class="solo-content">
			<div id="sp-solo-ribbon" class="solo-ribbon">
				<span id="sp-solo-name">{contestantName}</span>
			</div>

			<div id="sp-solo-main" class="solo-main">
			<div id="sp-solo-target-timer-crystal" class="solo-timer-crystal">
						<div id="sp-solo-target-timer" class="solo-timer">{countdownLabel}</div>
					</div>
				<!-- {#if isFreedomMode}
					<div id="sp-solo-freedom-score" class="solo-freedom-score">
						<div id="sp-solo-score-label" class="solo-score-label">Score</div>
						{#key scoreLabel}
							<div id="sp-solo-freedom-score-value" class="solo-score solo-score--freedom">
								{scoreLabel}
							</div>
						{/key}
					</div>
				{:else}
					
				{/if} -->
			</div>

			{#if isFreedomMode}
				<div id="sp-solo-freedom-footer" class="solo-freedom-footer">
					<div class="solo-timer-crystal--compact" style="text-align: center;">
						<div id="sp-solo-freedom-timer" class="solo-timer solo-timer--compact">
							{scoreLabel}
						</div>
					</div>
				</div>
			{:else}
				<div id="sp-solo-progress-wrap" class="solo-progress-wrap">
					<div id="sp-solo-progress" class="solo-progress">
						<div
							id="sp-solo-progress-fill"
							class="solo-progress-fill"
							style={`width: ${safeProgress.toFixed(2)}%`}
						></div>
						<div
							id="sp-solo-progress-flare"
							class="solo-progress-flare"
							style={`--progress-edge: ${safeProgress.toFixed(2)}%;`}
							aria-hidden="true"
						></div>
						{#if showTargetScore}
							<div id="sp-solo-score-row" class="solo-score-row">
								{#key scoreLabel}
									<div id="sp-solo-score-current" class="solo-score solo-score--current">
										{scoreLabel}
									</div>
								{/key}
								<div id="sp-solo-score-target" class="solo-score solo-score--target">
									{targetScoreLabel}
								</div>
							</div>
						{:else}
							{#key scoreLabel}
								<div id="sp-solo-target-score-center" class="solo-score solo-score--center">
									{scoreLabel}
								</div>
							{/key}
						{/if}
					</div>
				</div>
			{/if}
		</div>
	</div>
</div>

<style>
	.solo-shell {
		width: 100%;
		height: 100%;
		display: grid;
		place-items: center;
		container-type: size;
		--u: min(calc(100cqw / 960), calc(100cqh / 320));
	}

	.solo-card {
		--tier-a: 56, 189, 248;
		--tier-b: 37, 99, 235;
		--tier-c: 12, 32, 84;
		--glow: 56, 189, 248;
		--fill-a: 170, 255, 255;
		--fill-b: 58, 197, 255;
		--text-dark: #062637;

		position: relative;
		width: 100%;
		max-height: 100%;
		aspect-ratio: 3 / 1;
		overflow: hidden;
		border-radius: calc(36 * var(--u));
		background:
			radial-gradient(circle at 14% 12%, rgba(255, 255, 255, 0.42), transparent 18%),
			radial-gradient(circle at 86% 20%, rgba(var(--glow), 0.34), transparent 28%),
			linear-gradient(
				135deg,
				rgba(var(--tier-a), 0.94),
				rgba(var(--tier-b), 0.92) 52%,
				rgba(var(--tier-c), 0.96)
			);
		box-shadow:
			0 0 calc(62 * var(--u)) rgba(var(--glow), 0.42),
			0 calc(18 * var(--u)) calc(54 * var(--u)) rgba(0, 0, 0, 0.45),
			inset 0 calc(2 * var(--u)) 0 rgba(255, 255, 255, 0.18);
		font-family: 'IBM Plex Sans', sans-serif;
		backdrop-filter: blur(calc(28 * var(--u)));
		-webkit-backdrop-filter: blur(calc(28 * var(--u)));
		animation:
			card-impact 620ms cubic-bezier(0.16, 1, 0.3, 1),
			card-aura 2.8s ease-in-out 620ms infinite;
	}

	.solo-card--purple {
		--tier-a: 168, 85, 247;
		--tier-b: 126, 58, 242;
		--tier-c: 35, 20, 76;
		--glow: 168, 85, 247;
		--fill-a: 235, 213, 255;
		--fill-b: 192, 132, 252;
		--text-dark: #2b104d;
	}

	.solo-card--gold {
		--tier-a: 255, 210, 74;
		--tier-b: 245, 158, 11;
		--tier-c: 93, 55, 8;
		--glow: 245, 200, 79;
		--fill-a: 255, 247, 180;
		--fill-b: 251, 191, 36;
		--text-dark: #4a2c05;
	}

	.solo-card--freedom {
		--tier-a: 45, 212, 191;
		--tier-b: 26, 86, 219;
		--tier-c: 38, 24, 92;
		--glow: 45, 212, 191;
		--fill-a: 204, 251, 241;
		--fill-b: 34, 211, 238;
		--text-dark: #062a2a;
	}

	.solo-card::before {
		content: '';
		position: absolute;
		inset: 0;
		z-index: 1;
		pointer-events: none;
		background:
			linear-gradient(180deg, rgba(255, 255, 255, 0.14), transparent 38%),
			repeating-linear-gradient(
				110deg,
				rgba(255, 255, 255, 0.06) 0,
				rgba(255, 255, 255, 0.06) calc(1 * var(--u)),
				transparent calc(1 * var(--u)),
				transparent calc(18 * var(--u))
			);
		mix-blend-mode: screen;
	}

	.solo-card::after {
		content: '';
		position: absolute;
		inset: 0;
		z-index: 2;
		pointer-events: none;
		background:
			radial-gradient(circle at 17% 26%, rgba(255, 255, 255, 0.9) 0 calc(1.5 * var(--u)), transparent calc(3.2 * var(--u))),
			radial-gradient(circle at 78% 18%, rgba(255, 255, 255, 0.84) 0 calc(1.8 * var(--u)), transparent calc(3.7 * var(--u))),
			radial-gradient(circle at 86% 72%, rgba(255, 255, 255, 0.78) 0 calc(1.4 * var(--u)), transparent calc(3.2 * var(--u))),
			radial-gradient(circle at 24% 82%, rgba(255, 255, 255, 0.74) 0 calc(1.7 * var(--u)), transparent calc(3.6 * var(--u)));
		animation: sparkle-drift 2.4s ease-in-out infinite alternate;
	}

	.solo-effect-layer {
		position: absolute;
		inset: 0;
		z-index: 4;
		pointer-events: none;
		opacity: 0;
		mix-blend-mode: screen;
	}

	.solo-card--effect-freeze .solo-effect-layer {
		opacity: 0.78;
		background:
			linear-gradient(135deg, rgba(190, 240, 255, 0.3), rgba(255, 255, 255, 0.2), rgba(96, 165, 250, 0.24)),
			repeating-linear-gradient(38deg, transparent 0 calc(18 * var(--u)), rgba(255, 255, 255, 0.36) calc(19 * var(--u)) calc(20 * var(--u)), transparent calc(21 * var(--u)) calc(42 * var(--u)));
		backdrop-filter: blur(calc(1.4 * var(--u)));
		animation: solo-freeze-bloom 1.9s ease-in-out infinite alternate;
	}

	.solo-card--effect-fire .solo-effect-layer {
		opacity: 0.82;
		background:
			radial-gradient(ellipse at 22% 115%, rgba(255, 246, 170, 0.96) 0 8%, rgba(249, 115, 22, 0.78) 20%, transparent 48%),
			radial-gradient(ellipse at 72% 112%, rgba(255, 220, 100, 0.88) 0 7%, rgba(220, 38, 38, 0.64) 22%, transparent 50%),
			linear-gradient(0deg, rgba(185, 28, 28, 0.42), transparent 76%);
		animation: solo-fire-rise 820ms linear infinite;
	}

	.solo-card--effect-thunder .solo-effect-layer {
		opacity: 0.92;
		background:
			linear-gradient(118deg, transparent 0 38%, rgba(219, 245, 255, 0.96) 39% 41%, transparent 42% 48%, rgba(59, 130, 246, 0.74) 49% 51%, transparent 52%),
			radial-gradient(circle at 50% 48%, rgba(125, 211, 252, 0.32), transparent 45%);
		filter: drop-shadow(0 0 calc(22 * var(--u)) rgba(125, 211, 252, 0.94));
		animation: solo-thunder-flash 1.2s steps(2, end) infinite;
	}

	.solo-card--effect-gold-crown .solo-effect-layer {
		opacity: 0.82;
		background:
			radial-gradient(circle at 50% 8%, rgba(255, 250, 190, 0.92) 0 calc(8 * var(--u)), transparent calc(22 * var(--u))),
			conic-gradient(from 0deg at 50% 50%, transparent, rgba(250, 204, 21, 0.42), transparent 24%, rgba(255, 247, 180, 0.48), transparent 48%);
		filter: drop-shadow(0 0 calc(28 * var(--u)) rgba(250, 204, 21, 0.88));
		animation: solo-gold-sweep 2.4s linear infinite;
	}

	.solo-card--effect-gift-blast .solo-effect-layer {
		opacity: 0.9;
		background-image:
			radial-gradient(circle, rgba(255, 255, 255, 0.95) 0 calc(2 * var(--u)), transparent calc(3 * var(--u))),
			radial-gradient(circle, rgba(255, 99, 180, 0.88) 0 calc(2 * var(--u)), transparent calc(3 * var(--u))),
			radial-gradient(circle, rgba(93, 224, 255, 0.86) 0 calc(2 * var(--u)), transparent calc(3 * var(--u))),
			radial-gradient(circle, rgba(255, 215, 88, 0.9) 0 calc(2 * var(--u)), transparent calc(3 * var(--u)));
		background-size: calc(46 * var(--u)) calc(46 * var(--u)), calc(62 * var(--u)) calc(62 * var(--u)), calc(78 * var(--u)) calc(78 * var(--u)), calc(94 * var(--u)) calc(94 * var(--u));
		animation: solo-gift-blast 1.35s ease-out infinite;
	}

	@keyframes solo-freeze-bloom {
		from { filter: brightness(0.94) saturate(0.7); transform: scale(1); }
		to { filter: brightness(1.16) saturate(0.94); transform: scale(1.025); }
	}

	@keyframes solo-fire-rise {
		from { background-position: 0 calc(18 * var(--u)), 0 calc(28 * var(--u)), 0 0; }
		to { background-position: 0 calc(-24 * var(--u)), 0 calc(-32 * var(--u)), 0 0; }
	}

	@keyframes solo-thunder-flash {
		0%, 72%, 100% { opacity: 0.16; transform: translateX(-2%); }
		76%, 82% { opacity: 1; transform: translateX(2%); }
	}

	@keyframes solo-gold-sweep {
		from { transform: rotate(0deg) scale(1.12); }
		to { transform: rotate(360deg) scale(1.12); }
	}

	@keyframes solo-gift-blast {
		0% { opacity: 0; transform: scale(0.72) rotate(0deg); }
		28% { opacity: 1; }
		100% { opacity: 0; transform: scale(1.24) rotate(16deg); }
	}

	.solo-impact-ring {
		position: absolute;
		inset: calc(-8 * var(--u));
		z-index: 0;
		border: calc(5 * var(--u)) solid rgba(var(--glow), 0.7);
		border-radius: inherit;
		opacity: 0;
		pointer-events: none;
		animation: impact-ring 780ms ease-out both;
	}

	.solo-burst {
		position: absolute;
		inset: 0;
		z-index: 3;
		overflow: hidden;
		pointer-events: none;
	}

	.solo-burst span {
		position: absolute;
		left: 50%;
		top: 55%;
		width: calc(10 * var(--u));
		height: calc(10 * var(--u));
		border-radius: 999px;
		background: rgba(255, 255, 255, 0.92);
		box-shadow: 0 0 calc(18 * var(--u)) rgba(var(--glow), 0.86);
		opacity: 0;
		animation: score-particle 820ms cubic-bezier(0.16, 0.84, 0.22, 1) both;
	}

	.solo-burst span:nth-child(1) {
		--burst-x: -35;
		--burst-y: -34;
		animation-delay: 20ms;
	}

	.solo-burst span:nth-child(2) {
		--burst-x: 42;
		--burst-y: -30;
		animation-delay: 70ms;
	}

	.solo-burst span:nth-child(3) {
		--burst-x: -46;
		--burst-y: 8;
		animation-delay: 110ms;
	}

	.solo-burst span:nth-child(4) {
		--burst-x: 48;
		--burst-y: 14;
		animation-delay: 150ms;
	}

	.solo-burst span:nth-child(5) {
		--burst-x: -18;
		--burst-y: 42;
		animation-delay: 190ms;
	}

	.solo-burst span:nth-child(6) {
		--burst-x: 20;
		--burst-y: 46;
		animation-delay: 230ms;
	}

	.solo-content {
		position: relative;
		z-index: 4;
		display: grid;
		grid-template-rows: auto 1fr auto;
		gap: calc(10 * var(--u));
		box-sizing: border-box;
		height: 100%;
		padding: calc(14 * var(--u));
	}

	.solo-ribbon {
		justify-self: center;
		width: min(86%, calc(680 * var(--u)));
		box-sizing: border-box;
		overflow: hidden;
		border-radius: 999px;
		padding: calc(5 * var(--u)) calc(28 * var(--u));
		background:
			linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(var(--fill-a), 0.9)),
			linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.8), transparent);
		box-shadow:
			0 0 calc(34 * var(--u)) rgba(var(--glow), 0.46),
			inset 0 calc(2 * var(--u)) 0 rgba(255, 255, 255, 0.7);
		color: var(--text-dark);
		text-align: center;
		animation: ribbon-pop 650ms cubic-bezier(0.2, 1.3, 0.3, 1);
	}

	.solo-ribbon span {
		display: block;
		overflow: hidden;
		font-size: calc(40 * var(--u));
		font-weight: 900;
		letter-spacing: 0;
		line-height: 1.08;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.solo-main {
		display: grid;
		min-height: 0;
		place-items: center;
	}

	.solo-timer-crystal {
		display: grid;
		min-width: calc(260 * var(--u));
		place-items: center;
		border: calc(2 * var(--u)) solid rgba(255, 255, 255, 0.22);
		border-radius: calc(28 * var(--u));
		padding: calc(14 * var(--u)) calc(36 * var(--u));
		background:
			radial-gradient(circle at 28% 18%, rgba(255, 255, 255, 0.5), transparent 24%),
			linear-gradient(180deg, rgba(255, 255, 255, 0.2), rgba(255, 255, 255, 0.06));
		box-shadow:
			0 0 calc(28 * var(--u)) rgba(255, 255, 255, 0.24),
			inset 0 calc(2 * var(--u)) 0 rgba(255, 255, 255, 0.24);
		animation: crystal-pulse 1.4s ease-in-out infinite;
	}

	.solo-timer-crystal--compact {
		min-width: calc(210 * var(--u));
		padding: calc(10 * var(--u)) calc(28 * var(--u));
		animation:
			crystal-pulse 1.4s ease-in-out infinite,
			footer-pop 620ms cubic-bezier(0.16, 1, 0.3, 1);
	}

	.solo-timer {
		color: #fff;
		font-size: calc(62 * var(--u));
		font-variant-numeric: tabular-nums;
		font-weight: 950;
		letter-spacing: 0;
		line-height: 1;
		text-shadow:
			0 calc(2 * var(--u)) 0 rgba(0, 0, 0, 0.2),
			0 0 calc(26 * var(--u)) rgba(255, 255, 255, 0.72);
	}

	.solo-timer--compact {
		font-size: calc(44 * var(--u));
	}

	.solo-progress-wrap,
	.solo-freedom-footer {
		box-sizing: border-box;
		margin: 0 calc(-14 * var(--u)) calc(-14 * var(--u));
		border-top: calc(3 * var(--u)) solid rgba(255, 255, 255, 0.3);
		background: rgba(255, 255, 255, 0.16);
		box-shadow:
			0 calc(-10 * var(--u)) calc(28 * var(--u)) rgba(var(--glow), 0.18),
			inset 0 calc(2 * var(--u)) 0 rgba(255, 255, 255, 0.26);
	}

	.solo-progress-wrap {
		height: calc(82 * var(--u));
		padding: calc(7 * var(--u));
	}

	.solo-progress {
		position: relative;
		display: grid;
		width: 100%;
		height: 100%;
		overflow: hidden;
		place-items: center;
		border: calc(2 * var(--u)) solid rgba(255, 255, 255, 0.3);
		border-radius: 999px;
		background: rgba(255, 255, 255, 0.22);
	}

	.solo-progress::before {
		content: '';
		position: absolute;
		inset: calc(-12 * var(--u));
		z-index: 1;
		border-radius: inherit;
		background: radial-gradient(circle at 50% 50%, rgba(var(--glow), 0.44), transparent 68%);
		opacity: 0;
		animation: progress-shockwave 680ms ease-out both;
	}

	.solo-progress-fill {
		position: absolute;
		inset: 0 auto 0 0;
		border-radius: inherit;
		background:
			linear-gradient(90deg, rgba(var(--fill-a), 0.98), rgba(var(--fill-b), 0.98)),
			repeating-linear-gradient(
				-45deg,
				rgba(255, 255, 255, 0.16) 0,
				rgba(255, 255, 255, 0.16) calc(10 * var(--u)),
				transparent calc(10 * var(--u)),
				transparent calc(20 * var(--u))
			);
		box-shadow:
			0 0 calc(24 * var(--u)) rgba(var(--glow), 0.48),
			inset 0 calc(2 * var(--u)) 0 rgba(255, 255, 255, 0.42);
		transition: width 550ms cubic-bezier(0.18, 0.85, 0.25, 1);
		animation: energy-charge 720ms cubic-bezier(0.16, 1, 0.3, 1);
	}

	.solo-progress-fill::after {
		content: '';
		position: absolute;
		inset: 0;
		transform: translateX(-100%);
		background: linear-gradient(
			110deg,
			transparent 20%,
			rgba(255, 255, 255, 0.7) 50%,
			transparent 80%
		);
		animation: fill-shimmer 1.25s linear infinite;
	}

	.solo-progress-flare {
		position: absolute;
		top: 50%;
		left: clamp(5%, var(--progress-edge, 50%), 95%);
		z-index: 2;
		width: calc(56 * var(--u));
		height: calc(56 * var(--u));
		transform: translate(-50%, -50%);
		border-radius: 999px;
		background: radial-gradient(circle, rgba(255, 255, 255, 0.9), rgba(var(--glow), 0.22) 42%, transparent 70%);
		filter: blur(calc(3 * var(--u)));
		opacity: 0;
		animation: progress-flare 700ms ease-out both;
	}

	.solo-score-row {
		position: relative;
		z-index: 3;
		display: flex;
		width: 100%;
		min-width: 0;
		align-items: center;
		justify-content: space-between;
		box-sizing: border-box;
		gap: calc(16 * var(--u));
		padding: 0 calc(28 * var(--u));
		pointer-events: none;
	}

	.solo-score {
		min-width: 0;
		max-width: 48%;
		overflow: hidden;
		color: var(--text-dark);
		font-size: calc(46 * var(--u));
		font-variant-numeric: tabular-nums;
		font-weight: 950;
		letter-spacing: 0;
		line-height: 1;
		text-overflow: ellipsis;
		text-shadow:
			0 calc(2 * var(--u)) 0 rgba(255, 255, 255, 0.48),
			0 0 calc(20 * var(--u)) rgba(255, 255, 255, 0.58);
		white-space: nowrap;
		animation: score-beat 1.15s ease-in-out infinite;
	}

	.solo-score--current,
	.solo-score--center {
		animation:
			score-impact 680ms cubic-bezier(0.16, 1, 0.3, 1),
			score-beat 1.15s ease-in-out 680ms infinite;
	}

	.solo-score--center {
		position: relative;
		z-index: 3;
		max-width: 92%;
		font-size: calc(52 * var(--u));
		pointer-events: none;
	}

	.solo-score--target {
		text-align: right;
	}

	.solo-freedom-score {
		display: grid;
		min-width: 0;
		max-width: 90%;
		justify-items: center;
		gap: calc(10 * var(--u));
		border: calc(2 * var(--u)) solid rgba(255, 255, 255, 0.2);
		border-radius: calc(34 * var(--u));
		padding: calc(8 * var(--u)) calc(36 * var(--u)) calc(12 * var(--u));
		background:
			radial-gradient(circle at 50% 16%, rgba(255, 255, 255, 0.36), transparent 36%),
			linear-gradient(180deg, rgba(255, 255, 255, 0.16), rgba(255, 255, 255, 0.06));
		box-shadow:
			0 0 calc(44 * var(--u)) rgba(var(--glow), 0.36),
			inset 0 calc(2 * var(--u)) 0 rgba(255, 255, 255, 0.22);
		animation: freedom-score-pop 760ms cubic-bezier(0.16, 1, 0.3, 1);
	}

	.solo-score-label {
		color: rgba(255, 255, 255, 0.76);
		font-size: calc(18 * var(--u));
		font-weight: 850;
		letter-spacing: 0;
		line-height: 1;
		text-transform: uppercase;
	}

	.solo-score--freedom {
		max-width: 100%;
		color: #fff;
		font-size: calc(84 * var(--u));
		text-align: center;
		text-shadow:
			0 calc(4 * var(--u)) calc(10 * var(--u)) rgba(0, 0, 0, 0.3),
			0 0 calc(34 * var(--u)) rgba(255, 255, 255, 0.58),
			0 0 calc(54 * var(--u)) rgba(var(--glow), 0.7);
		animation:
			score-impact 680ms cubic-bezier(0.16, 1, 0.3, 1),
			score-beat 850ms ease-in-out 680ms infinite;
	}

	.solo-freedom-footer {
		display: grid;
		min-height: calc(72 * var(--u));
		place-items: center;
		padding: calc(8 * var(--u));
	}

	@keyframes card-impact {
		0% {
			transform: scale(0.985);
		}

		40% {
			transform: scale(1.018);
		}

		100% {
			transform: scale(1);
		}
	}

	@keyframes card-aura {
		0%,
		100% {
			filter: saturate(1);
		}

		50% {
			filter: saturate(1.12) brightness(1.04);
		}
	}

	@keyframes sparkle-drift {
		0% {
			opacity: 0.36;
			transform: translateY(0) scale(1);
		}

		100% {
			opacity: 0.95;
			transform: translateY(calc(-3 * var(--u))) scale(1.03);
		}
	}

	@keyframes impact-ring {
		0% {
			opacity: 0.86;
			transform: scale(0.96);
		}

		100% {
			opacity: 0;
			transform: scale(1.12);
		}
	}

	@keyframes score-particle {
		0% {
			opacity: 0;
			transform: translate(-50%, -50%) scale(0.4);
		}

		20% {
			opacity: 1;
		}

		100% {
			opacity: 0;
			transform:
				translate(
					calc(-50% + var(--burst-x) * var(--u)),
					calc(-50% + var(--burst-y) * var(--u))
				)
				scale(1.2);
		}
	}

	@keyframes ribbon-pop {
		0% {
			opacity: 0;
			transform: translateY(calc(-12 * var(--u))) scale(0.94);
		}

		100% {
			opacity: 1;
			transform: translateY(0) scale(1);
		}
	}

	@keyframes crystal-pulse {
		0%,
		100% {
			transform: scale(1);
		}

		50% {
			transform: scale(1.035);
		}
	}

	@keyframes energy-charge {
		0% {
			filter: brightness(1);
			transform: scaleX(0.985);
		}

		34% {
			filter: brightness(1.55) saturate(1.32);
			transform: scaleX(1.01);
		}

		100% {
			filter: brightness(1) saturate(1);
			transform: scaleX(1);
		}
	}

	@keyframes fill-shimmer {
		100% {
			transform: translateX(220%);
		}
	}

	@keyframes progress-shockwave {
		0% {
			opacity: 0;
			transform: scaleX(0.24);
		}

		35% {
			opacity: 0.9;
		}

		100% {
			opacity: 0;
			transform: scaleX(1);
		}
	}

	@keyframes progress-flare {
		0% {
			opacity: 0.9;
			transform: translate(-50%, -50%) scale(0.45);
		}

		100% {
			opacity: 0;
			transform: translate(-50%, -50%) scale(1.25);
		}
	}

	@keyframes score-impact {
		0% {
			transform: scale(0.9);
		}

		52% {
			transform: scale(1.08);
		}

		100% {
			transform: scale(1);
		}
	}

	@keyframes score-beat {
		0%,
		100% {
			transform: scale(1);
		}

		50% {
			transform: scale(1.045);
		}
	}

	@keyframes freedom-score-pop {
		0% {
			opacity: 0;
			transform: translateY(calc(10 * var(--u))) scale(0.94);
		}

		100% {
			opacity: 1;
			transform: translateY(0) scale(1);
		}
	}

	@keyframes footer-pop {
		0% {
			transform: translateY(calc(7 * var(--u))) scale(0.96);
		}

		100% {
			transform: translateY(0) scale(1);
		}
	}
</style>
