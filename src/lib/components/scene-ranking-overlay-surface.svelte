<script lang="ts">
	import type { SceneRankingRow } from '$lib/scene-rankings';

	export let rows: SceneRankingRow[] = [];

	function scoreLabel(score: number) {
		return Math.max(Math.floor(Number(score) || 0), 0).toLocaleString();
	}
</script>

<div id="sp-scene-ranking-overlay" class="ranking-frame" data-sp-overlay="scene-ranking">
	<div id="sp-scene-ranking-shell" class="ranking-shell">
		<div id="sp-scene-ranking-list" class="ranking-list">
			{#each rows as row}
				<div
					id={`sp-scene-ranking-row-${row.rank}`}
					class="ranking-row"
					class:ranking-row--top={row.rank <= 3}
					data-sp-ranking-row={row.rank}
				>
					<div
						id={`sp-scene-ranking-rank-${row.rank}`}
						class={`ranking-rank ranking-rank--${row.rank <= 3 ? row.rank : 'default'}`}
					>
						{row.rank}
					</div>
					<div id={`sp-scene-ranking-name-${row.rank}`} class="ranking-name">{row.name}</div>
					<div id={`sp-scene-ranking-score-${row.rank}`} class="ranking-score">
						{scoreLabel(row.score)}
					</div>
				</div>
			{/each}
		</div>
	</div>
</div>

<style>
	.ranking-frame {
		width: 100%;
		height: 100%;
		display: grid;
		align-items: end;
		container-type: size;
		overflow: visible;
	}

	.ranking-shell {
		--design-unit: min(calc(100cqw / 240), calc(100cqh / 180));
		width: 100%;
		height: fit-content;
		max-height: 100%;
		box-sizing: border-box;
		padding: calc(6 * var(--design-unit));
		border-radius: calc(6 * var(--design-unit));
		background: linear-gradient(90deg, rgba(255, 255, 255, 0.2), transparent 26%);
		backdrop-filter: blur(calc(12 * var(--design-unit)));
		-webkit-backdrop-filter: blur(calc(12 * var(--design-unit)));
		box-shadow:
			0 calc(14 * var(--design-unit)) calc(30 * var(--design-unit)) rgba(0, 0, 0, 0.28),
			inset 0 0 0 calc(1 * var(--design-unit)) rgba(255, 255, 255, 0.08);
		overflow: hidden;
	}

	.ranking-list {
		display: grid;
		grid-auto-rows: min-content;
		align-content: start;
		align-items: center;
		gap: calc(8 * var(--design-unit));
	}

	.ranking-row {
		min-width: 0;
		min-height: calc(26 * var(--design-unit));
		display: grid;
		grid-template-columns: calc(24 * var(--design-unit)) minmax(0, 1fr) minmax(calc(56 * var(--design-unit)), auto);
		align-items: center;
		gap: calc(6 * var(--design-unit));
		color: rgba(255, 255, 255, 0.94);
		text-shadow: 0 calc(2 * var(--design-unit)) calc(4 * var(--design-unit)) rgba(0, 0, 0, 0.55);
	}

	.ranking-rank {
		width: calc(16 * var(--design-unit));
		height: calc(16 * var(--design-unit));
		display: grid;
		place-items: center;
		border-radius: calc(6 * var(--design-unit));
		color: rgba(255, 255, 255, 0.94);
		font-size: calc(10 * var(--design-unit));
		font-weight: 950;
		line-height: 1;
		font-variant-numeric: tabular-nums;
		background: rgba(255, 255, 255, 0.12);
	}

	.ranking-rank--1 {
		color: #fff8d8;
		background: linear-gradient(135deg, #fff0a6, #f8bd22 54%, #d48909);
		box-shadow: 0 0 calc(14 * var(--design-unit)) rgba(255, 207, 64, 0.38);
	}

	.ranking-rank--2 {
		color: #f8fbff;
		background: linear-gradient(135deg, #f8fbff, #a7bedc 54%, #6f84a6);
		box-shadow: 0 0 calc(13 * var(--design-unit)) rgba(183, 210, 255, 0.3);
	}

	.ranking-rank--3 {
		color: #fff2ea;
		background: linear-gradient(135deg, #ffd4bc, #e9824c 54%, #b34b32);
		box-shadow: 0 0 calc(13 * var(--design-unit)) rgba(255, 145, 95, 0.28);
	}

	.ranking-name {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: calc(14 * var(--design-unit));
		font-weight: 760;
		line-height: 1.05;
	}

	.ranking-score {
		text-align: right;
		font-size: calc(14 * var(--design-unit));
		font-weight: 950;
		line-height: 1;
		font-variant-numeric: tabular-nums;
		color: white;
	}
</style>
