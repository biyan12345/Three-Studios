<script lang="ts">
	import type {
		BattleContestant,
		BattleLineStyle,
		BattlePhase,
		BattleScoreEffect,
		BattleSide,
		RuntimeOverlayFrame
	} from '$lib/app-types';

	export let contestants: BattleContestant[] = [];
	export let phase: BattlePhase = 'idle';
	export let lineFrame: RuntimeOverlayFrame = {
		x: 0.496,
		y: 0.31,
		width: 0.008,
		height: 0.28
	};
	export let lineStyle: BattleLineStyle = 'white';
	export let scoreEffect: BattleScoreEffect = 'freeze';
	export let previewSide: BattleSide | null = null;
	export let fullStagePreview = false;

	function clamp(value: number, min: number, max: number) {
		return Math.min(Math.max(value, min), max);
	}

	let frozenSide: BattleSide | null = null;
	let leftFrostWidth = 0;
	let rightFrostWidth = 0;

	$: {
		const leftContestant =
			contestants.find((contestant) => contestant.side === 'left') ?? contestants[0] ?? null;
		const rightContestant =
			contestants.find((contestant) => contestant.side === 'right') ?? contestants[1] ?? null;

		frozenSide = phase !== 'live' && previewSide
			? previewSide
			: phase === 'live' &&
			leftContestant &&
			rightContestant &&
			leftContestant.score !== rightContestant.score
				? leftContestant.score < rightContestant.score
					? 'left'
					: 'right'
				: null;
	}

	$: {
		const frameWidth = Math.max(Number(lineFrame.width) || 0, 0.001);
		const lineCenter = clamp((Number(lineFrame.x) || 0) + frameWidth / 2, 0, 1);
		leftFrostWidth = fullStagePreview ? 50 : Math.max((lineCenter / frameWidth) * 100, 0);
		rightFrostWidth = fullStagePreview ? 50 : Math.max(((1 - lineCenter) / frameWidth) * 100, 0);
	}
</script>

<div
	id="sp-battle-line-overlay"
	class="battle-line-shell"
	class:battle-line-shell--full-preview={fullStagePreview}
	style={`--left-frost-width: ${leftFrostWidth.toFixed(2)}%; --right-frost-width: ${rightFrostWidth.toFixed(2)}%;`}
	data-sp-overlay="battle-ladder-line"
>
	<div
		id="sp-battle-line-frost-left"
		class="battle-frost battle-frost--left"
		class:battle-frost--ice={scoreEffect === 'freeze'}
		class:battle-frost--fire={scoreEffect === 'fire'}
		class:battle-frost--thunder={scoreEffect === 'thunder'}
		class:battle-frost--gold={scoreEffect === 'gold-crown'}
		class:battle-frost--gift-blast={scoreEffect === 'gift-blast'}
		class:frozen--active={scoreEffect !== 'none' && frozenSide === 'left'}
	>
	</div>

	{#if lineStyle !== 'none'}
		<div
			id="sp-battle-line-spine"
			class="battle-line-spine"
			class:battle-line-spine--fire={lineStyle === 'fire'}
		>
			{#if lineStyle === 'fire'}
				<svg class="battle-fire-bolt" viewBox="0 0 120 1000" preserveAspectRatio="none" aria-hidden="true">
					<defs>
						<filter id="battle-fire-warp" x="-180%" y="-8%" width="460%" height="116%" color-interpolation-filters="sRGB">
							<feTurbulence type="fractalNoise" baseFrequency="0.018 0.09" numOctaves="2" seed="7" result="noise">
								<animate attributeName="baseFrequency" values="0.018 0.09;0.028 0.14;0.014 0.075;0.018 0.09" dur="0.7s" repeatCount="indefinite" />
							</feTurbulence>
							<feDisplacementMap in="SourceGraphic" in2="noise" scale="34" xChannelSelector="R" yChannelSelector="G" />
						</filter>
						<filter id="battle-fire-glow" x="-240%" y="-8%" width="580%" height="116%">
							<feGaussianBlur stdDeviation="14 5" result="blur" />
							<feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
						</filter>
					</defs>
					<g filter="url(#battle-fire-warp)">
						<path class="battle-fire-bolt__aura" d="M60 -30V1030" />
						<path class="battle-fire-bolt__flame" d="M60 -30V1030" />
						<path class="battle-fire-bolt__core" d="M60 -30V1030" filter="url(#battle-fire-glow)" />
					</g>
				</svg>
			{/if}
		</div>
	{/if}

	<div
		id="sp-battle-line-frost-right"
		class="battle-frost battle-frost--right"
		class:battle-frost--ice={scoreEffect === 'freeze'}
		class:battle-frost--fire={scoreEffect === 'fire'}
		class:battle-frost--thunder={scoreEffect === 'thunder'}
		class:battle-frost--gold={scoreEffect === 'gold-crown'}
		class:battle-frost--gift-blast={scoreEffect === 'gift-blast'}
		class:frozen--active={scoreEffect !== 'none' && frozenSide === 'right'}
	>
	</div>
</div>

<style>
	.battle-line-shell {
		--unit: min(calc(100cqw / 16), calc(100cqh / 360));
		width: 100%;
		height: 100%;
		position: relative;
		overflow: visible;
		container-type: size;
	}

	.battle-line-spine {
		position: absolute;
		top: 0;
		bottom: 0;
		left: 50%;
		width: max(calc(6 * var(--unit)), 4px);
		transform: translateX(-50%);
		border-radius: 999px;
		background: linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(166, 230, 255, 0.76));
		box-shadow:
			0 0 calc(24 * var(--unit)) rgba(166, 232, 255, 0.62),
			0 0 calc(46 * var(--unit)) rgba(70, 183, 255, 0.34);
		z-index: 12;
	}

	.battle-line-spine::before {
		content: '';
		position: absolute;
		inset: calc(-10 * var(--unit)) calc(-14 * var(--unit));
		border-radius: inherit;
		background: radial-gradient(circle, rgba(210, 245, 255, 0.38), transparent 70%);
		filter: blur(calc(10 * var(--unit)));
	}

	.battle-line-spine--fire {
		width: max(calc(8 * var(--unit)), 5px);
		background: linear-gradient(180deg, #fff9cf, #ff8a1d 45%, #fff3a0 70%, #ff5a12);
		box-shadow:
			0 0 calc(20 * var(--unit)) rgba(255, 214, 76, 0.9),
			0 0 calc(46 * var(--unit)) rgba(255, 82, 24, 0.72),
			0 0 calc(76 * var(--unit)) rgba(190, 24, 24, 0.42);
		animation: battle-fire-line-pulse 720ms ease-in-out infinite alternate;
	}

	.battle-fire-bolt {
		position: absolute;
		top: calc(-12 * var(--unit));
		bottom: calc(-12 * var(--unit));
		left: 50%;
		width: max(calc(110 * var(--unit)), 56px);
		height: calc(100% + 24 * var(--unit));
		transform: translateX(-50%);
		overflow: visible;
		filter: saturate(1.35) brightness(1.12);
		animation: battle-fire-bolt-flicker 180ms steps(2, end) infinite;
	}

	.battle-fire-bolt path { fill: none; stroke-linecap: round; }
	.battle-fire-bolt__aura { stroke: rgba(255, 65, 8, 0.3); stroke-width: 50; filter: blur(12px); }
	.battle-fire-bolt__flame { stroke: #ff6418; stroke-width: 23; filter: blur(4px); }
	.battle-fire-bolt__core { stroke: #fffbd0; stroke-width: 7; }

	.battle-line-spine--fire::before {
		inset: calc(-18 * var(--unit)) calc(-30 * var(--unit));
		background:
			radial-gradient(ellipse at 50% 15%, rgba(255, 246, 153, 0.9), transparent 32%),
			radial-gradient(ellipse at 50% 48%, rgba(255, 112, 30, 0.68), transparent 52%),
			radial-gradient(ellipse at 50% 86%, rgba(220, 38, 38, 0.56), transparent 48%);
		filter: blur(calc(8 * var(--unit)));
		animation: battle-fire-line-flicker 430ms steps(2, end) infinite;
	}

	.battle-line-spine--fire::after {
		content: '';
		position: absolute;
		inset: calc(-24 * var(--unit)) calc(-34 * var(--unit));
		background:
			radial-gradient(ellipse at 50% 88%, rgba(255, 250, 190, 0.98) 0 8%, rgba(255, 194, 45, 0.96) 18%, rgba(255, 84, 20, 0.82) 40%, transparent 68%) center bottom / 100% calc(64 * var(--unit)) repeat-y,
			radial-gradient(ellipse at 32% 78%, rgba(255, 223, 92, 0.9) 0 7%, rgba(239, 68, 18, 0.78) 34%, transparent 65%) left bottom / 72% calc(48 * var(--unit)) repeat-y,
			radial-gradient(ellipse at 68% 80%, rgba(255, 238, 130, 0.88) 0 6%, rgba(220, 38, 18, 0.72) 36%, transparent 66%) right bottom / 76% calc(54 * var(--unit)) repeat-y;
		filter: blur(calc(2.5 * var(--unit))) saturate(1.45);
		mix-blend-mode: screen;
		animation: battle-fire-climb 620ms linear infinite;
	}

	.battle-frost--ice {
		position: absolute;
		opacity: 0;
	overflow: hidden;
  filter: saturate(0.75) contrast(1.15) brightness(1.05);
      height: 100%;
    box-shadow: inset 0 0 35px rgba(180, 235, 255, 0.9), inset 0 0 80px rgba(70, 170, 255, 0.45), 0 0 25px rgba(120, 210, 255, 0.6);
}

.battle-frost--ice::before {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 50;

  background:
    radial-gradient(circle at 20% 25%, rgba(255,255,255,0.55), transparent 18%),
    radial-gradient(circle at 80% 15%, rgba(180,230,255,0.45), transparent 22%),
    radial-gradient(circle at 50% 85%, rgba(255,255,255,0.35), transparent 25%),
    linear-gradient(
      135deg,
      rgba(150, 220, 255, 0.35),
      rgba(255, 255, 255, 0.2),
      rgba(60, 160, 255, 0.35)
    );

  backdrop-filter: blur(2px);
  animation: freezeIn 0.35s ease-out forwards;
}

.battle-frost--ice::after {
  content: "";
  position: absolute;
  inset: -20%;
  pointer-events: none;
  z-index: 51;

  background-image:
    linear-gradient(25deg, transparent 46%, rgba(255,255,255,0.65) 48%, transparent 51%),
    linear-gradient(115deg, transparent 44%, rgba(210,245,255,0.6) 47%, transparent 50%),
    linear-gradient(155deg, transparent 45%, rgba(255,255,255,0.45) 48%, transparent 52%);

  background-size: 90px 90px, 130px 130px, 170px 170px;
  opacity: 0;
  animation: iceCrack 0.45s ease-out 0.12s forwards;
}

@keyframes freezeIn {
  from {
    opacity: 0;
    transform: scale(1.08);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

@keyframes iceCrack {
  from {
    opacity: 0;
    transform: scale(1.15) rotate(2deg);
  }
  to {
    opacity: 1;
    transform: scale(1) rotate(0deg);
  }
}

	.battle-frost {
		position: absolute;
		top: 0;
		bottom: 0;
		opacity: 0;
		overflow: hidden;
		pointer-events: none;
		isolation: isolate;
		z-index: 5;
		filter: saturate(1.1);
		box-shadow:
			inset 0 0 calc(1 * var(--unit)) rgba(255, 255, 255, 0.9),
			inset 0 0 calc(16 * var(--unit)) rgba(235, 253, 255, 0.46),
			0 0 calc(20 * var(--unit)) rgba(70, 207, 255, 0.34);
		transition: opacity 140ms ease;
	}

	.battle-frost--fire {
		filter: saturate(1.35) contrast(1.08);
		box-shadow:
			inset 0 0 calc(24 * var(--unit)) rgba(255, 207, 72, 0.5),
			inset 0 0 calc(70 * var(--unit)) rgba(239, 68, 20, 0.38),
			0 0 calc(30 * var(--unit)) rgba(255, 91, 24, 0.46);
	}

	.battle-frost--fire::before {
		content: '';
		position: absolute;
		inset: 0;
		background:
			radial-gradient(ellipse at 12% 100%, rgba(255, 238, 112, 0.9) 0 5%, rgba(255, 111, 25, 0.62) 12%, transparent 28%),
			radial-gradient(ellipse at 38% 105%, rgba(255, 226, 95, 0.9) 0 7%, rgba(239, 68, 20, 0.58) 15%, transparent 32%),
			radial-gradient(ellipse at 68% 100%, rgba(255, 245, 170, 0.86) 0 5%, rgba(255, 102, 20, 0.62) 14%, transparent 30%),
			radial-gradient(ellipse at 91% 104%, rgba(255, 214, 74, 0.88) 0 6%, rgba(220, 38, 38, 0.55) 16%, transparent 31%),
			linear-gradient(0deg, rgba(190, 24, 24, 0.5), rgba(255, 113, 28, 0.18) 45%, transparent 78%);
		background-size: 36% 100%, 42% 100%, 38% 100%, 34% 100%, 100% 100%;
		mix-blend-mode: screen;
		animation: battle-fire-surge 760ms ease-in-out infinite alternate;
	}

	.battle-frost--fire::after {
		content: '';
		position: absolute;
		inset: 0;
		background-image:
			radial-gradient(circle, rgba(255, 235, 145, 0.95) 0 1px, transparent 2px),
			radial-gradient(circle, rgba(255, 112, 30, 0.85) 0 1px, transparent 2px);
		background-position: 10px 18px, 34px 42px;
		background-size: 44px 58px, 62px 76px;
		animation: battle-embers-rise 1.5s linear infinite;
	}

	.battle-frost--thunder {
		filter: saturate(1.45) contrast(1.14);
		box-shadow:
			inset 0 0 calc(28 * var(--unit)) rgba(186, 230, 255, 0.54),
			inset 0 0 calc(76 * var(--unit)) rgba(59, 130, 246, 0.42),
			0 0 calc(38 * var(--unit)) rgba(125, 211, 252, 0.64);
	}

	.battle-frost--thunder::before {
		content: '';
		position: absolute;
		inset: 0;
		background:
			linear-gradient(118deg, transparent 0 36%, rgba(224, 247, 255, 0.96) 37% 39%, transparent 40% 47%, rgba(59, 130, 246, 0.78) 48% 50%, transparent 51%),
			radial-gradient(circle at 50% 42%, rgba(125, 211, 252, 0.32), transparent 48%);
		filter: drop-shadow(0 0 calc(18 * var(--unit)) rgba(125, 211, 252, 0.92));
		animation: battle-thunder-flash 1.08s steps(2, end) infinite;
	}

	.battle-frost--gold {
		filter: saturate(1.25) brightness(1.08);
		box-shadow:
			inset 0 0 calc(24 * var(--unit)) rgba(255, 247, 180, 0.58),
			inset 0 0 calc(76 * var(--unit)) rgba(245, 158, 11, 0.4),
			0 0 calc(40 * var(--unit)) rgba(250, 204, 21, 0.62);
	}

	.battle-frost--gold::before {
		content: '';
		position: absolute;
		inset: calc(-20 * var(--unit));
		background:
			radial-gradient(circle at 50% 12%, rgba(255, 250, 190, 0.95) 0 calc(8 * var(--unit)), transparent calc(24 * var(--unit))),
			conic-gradient(from 0deg at 50% 50%, transparent, rgba(250, 204, 21, 0.46), transparent 24%, rgba(255, 247, 180, 0.52), transparent 48%);
		filter: drop-shadow(0 0 calc(24 * var(--unit)) rgba(250, 204, 21, 0.9));
		animation: battle-gold-sweep 2.1s linear infinite;
	}

	.battle-frost--gift-blast {
		filter: saturate(1.3) brightness(1.08);
		box-shadow:
			inset 0 0 calc(26 * var(--unit)) rgba(255, 255, 255, 0.52),
			inset 0 0 calc(82 * var(--unit)) rgba(236, 72, 153, 0.3),
			0 0 calc(34 * var(--unit)) rgba(103, 232, 249, 0.5);
	}

	.battle-frost--gift-blast::before {
		content: '';
		position: absolute;
		inset: 0;
		background-image:
			radial-gradient(circle, rgba(255, 255, 255, 0.96) 0 2px, transparent 3px),
			radial-gradient(circle, rgba(255, 99, 180, 0.88) 0 2px, transparent 3px),
			radial-gradient(circle, rgba(93, 224, 255, 0.86) 0 2px, transparent 3px),
			radial-gradient(circle, rgba(255, 215, 88, 0.9) 0 2px, transparent 3px);
		background-size: 44px 58px, 62px 76px, 76px 92px, 92px 108px;
		background-position: 10px 18px, 34px 42px, 62px 16px, 88px 54px;
		animation: battle-gift-blast 1.32s ease-out infinite;
	}

	.battle-frost--left {
		right: 50%;
		width: var(--left-frost-width);
		border-radius: calc(18 * var(--unit)) 0 0 calc(18 * var(--unit));
		transform-origin: right center;
		--frost-edge-start: auto;
		--frost-edge-end: 0;
		--frost-travel: calc(-28 * var(--unit));
		--frost-mask: linear-gradient(90deg, rgba(0, 0, 0, 0.88), rgba(0, 0, 0, 0.72) 58%, rgba(0, 0, 0, 1));
	}

	.battle-frost--right {
		left: 50%;
		width: var(--right-frost-width);
		border-radius: 0 calc(18 * var(--unit)) calc(18 * var(--unit)) 0;
		transform-origin: left center;
		--frost-edge-start: 0;
		--frost-edge-end: auto;
		--frost-travel: calc(28 * var(--unit));
		--frost-mask: linear-gradient(90deg, rgba(0, 0, 0, 1), rgba(0, 0, 0, 0.72) 42%, rgba(0, 0, 0, 0.88));
	}

	.battle-line-shell--full-preview .battle-frost--left { right: 50%; width: 50%; }
	.battle-line-shell--full-preview .battle-frost--right { left: 50%; width: 50%; }

	.frozen--active {
		opacity: 1;
		animation:
			battle-frost-impact 380ms cubic-bezier(0.16, 1, 0.28, 1),
			battle-frost-breathe 3.2s ease-in-out 420ms infinite;
	}

	@keyframes battle-frost-impact {
		from { opacity: 0; transform: translateX(var(--frost-travel)) scaleX(0.78); }
		to { opacity: 1; transform: translateX(0) scaleX(1); }
	}

	@keyframes battle-frost-breathe {
		0%, 100% { filter: brightness(0.96) saturate(0.92); }
		50% { filter: brightness(1.14) saturate(1.12); }
	}

	@keyframes battle-fire-line-pulse {
		from { transform: translateX(-50%) scaleX(0.86); filter: brightness(0.96); }
		to { transform: translateX(-50%) scaleX(1.18); filter: brightness(1.22); }
	}

	@keyframes battle-fire-bolt-flicker {
		0% { opacity: 0.9; filter: saturate(1.3) brightness(1.04); }
		50% { opacity: 1; filter: saturate(1.55) brightness(1.28); }
		100% { opacity: 0.94; filter: saturate(1.4) brightness(1.14); }
	}

	@keyframes battle-fire-line-flicker {
		0% { transform: translate(-8%, 2%) scaleX(0.9); opacity: 0.78; }
		50% { transform: translate(6%, -2%) scaleX(1.18); opacity: 1; }
		100% { transform: translate(-2%, 1%) scaleX(1); opacity: 0.88; }
	}

	@keyframes battle-fire-climb {
		from { background-position: center calc(58 * var(--unit)), left calc(44 * var(--unit)), right calc(51 * var(--unit)); transform: scaleX(0.9); }
		50% { transform: scaleX(1.16); }
		to { background-position: center calc(-6 * var(--unit)), left calc(-4 * var(--unit)), right calc(-3 * var(--unit)); transform: scaleX(0.96); }
	}

	@keyframes battle-fire-surge {
		from { transform: translateY(5%) scaleY(0.94); filter: brightness(0.92); }
		to { transform: translateY(-2%) scaleY(1.08); filter: brightness(1.15); }
	}

	@keyframes battle-embers-rise {
		from { background-position: 10px 34px, 34px 58px; opacity: 0.58; }
		to { background-position: 18px -70px, 26px -92px; opacity: 0.9; }
	}

	@keyframes battle-thunder-flash {
		0%, 70%, 100% { opacity: 0.18; transform: translateX(-3%); }
		74%, 82% { opacity: 1; transform: translateX(3%); }
	}

	@keyframes battle-gold-sweep {
		from { transform: rotate(0deg) scale(1.12); }
		to { transform: rotate(360deg) scale(1.12); }
	}

	@keyframes battle-gift-blast {
		0% { opacity: 0; transform: scale(0.72) rotate(0deg); }
		28% { opacity: 1; }
		100% { opacity: 0; transform: scale(1.24) rotate(16deg); }
	}
</style>
