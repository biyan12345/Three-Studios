<script lang="ts">
	import { fly } from 'svelte/transition';
	import {
		finalLiveAllocatedCoins,
		finalLiveTotalCoins,
		finalLiveUnallocatedCoins,
		hasFinalLiveModeScores,
		type FinalLiveCastScores
	} from '$lib/studio/session-summary';

	export let summary: FinalLiveCastScores;
	export let onClose: () => void;
</script>

<div class="absolute inset-0 z-[55] grid place-items-center bg-black/60 px-6 py-8">
	<div
		transition:fly={{ y: 18, duration: 180 }}
		class="glass w-full max-w-[620px] rounded-[18px] border border-white/10 p-5"
	>
		<div class="flex items-start justify-between gap-3">
			<div>
				<h2 class="text-[20px] font-semibold text-slate-100">Live Ended</h2>
				<p class="mt-1 text-[12px] leading-5 text-slate-400">Session totals are ready to record.</p>
			</div>
			<button type="button" class="text-slate-400 transition hover:text-white" on:click={onClose} aria-label="Close live stats dialog">
				<svg viewBox="0 0 16 16" class="h-5 w-5 fill-none stroke-current stroke-[1.6]">
					<path d="m4 4 8 8" />
					<path d="M12 4 4 12" />
				</svg>
			</button>
		</div>

		<div class="mt-4 grid gap-2 text-[12px] text-slate-300 sm:grid-cols-3">
			<div class="rounded-[12px] border border-white/8 bg-white/[0.03] px-4 py-3">
				<div class="text-[10px] uppercase tracking-[0.14em] text-slate-500">Total Coins</div>
				<div class="mt-1 text-[22px] font-semibold text-slate-100">{finalLiveTotalCoins(summary).toLocaleString()}</div>
			</div>
			<div class="rounded-[12px] border border-white/8 bg-white/[0.03] px-4 py-3">
				<div class="text-[10px] uppercase tracking-[0.14em] text-slate-500">Allocated Coins</div>
				<div class="mt-1 text-[22px] font-semibold text-slate-100">{finalLiveAllocatedCoins(summary).toLocaleString()}</div>
			</div>
			<div class="rounded-[12px] border border-white/8 bg-white/[0.03] px-4 py-3">
				<div class="text-[10px] uppercase tracking-[0.14em] text-slate-500">Unallocated Coins</div>
				<div class="mt-1 text-[22px] font-semibold text-slate-100">{finalLiveUnallocatedCoins(summary).toLocaleString()}</div>
			</div>
		</div>

		{#if hasFinalLiveModeScores(summary)}
			<div class="mt-4 rounded-[14px] border border-white/8 bg-white/[0.03] p-4">
				<div class="flex items-center justify-between gap-3">
					<div class="text-[10px] uppercase tracking-[0.14em] text-slate-500">Final Cast Scores</div>
					<div class="rounded-full border border-white/8 px-2.5 py-1 text-[10px] text-slate-300">{summary.rows.length} cast</div>
				</div>
				<div class="mt-3 space-y-2">
					{#each summary.rows as row, index}
						<div class="flex items-center justify-between gap-3 rounded-[12px] border border-white/8 bg-black/20 px-3 py-2.5">
							<div class="flex min-w-0 items-center gap-2">
								<span class="w-4 text-[11px] text-slate-500">{index + 1}</span>
								<span class="truncate text-[13px] font-medium text-slate-100">{row.name}</span>
							</div>
							<div class="text-right text-[18px] font-semibold text-slate-100">{row.score.toLocaleString()}</div>
						</div>
					{/each}
				</div>
			</div>
		{/if}

		<div class="mt-5 flex justify-end">
			<button class="rounded-[12px] bg-white/[0.08] px-4 py-2 text-[13px] font-medium text-slate-100 transition hover:bg-white/[0.12]" on:click={onClose}>Done</button>
		</div>
	</div>
</div>
