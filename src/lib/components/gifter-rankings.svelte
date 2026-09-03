<script lang="ts">
	import type { GifterRankingGroup, GifterRankingRow } from '$lib/studio/gifter-rankings';

	export let groups: GifterRankingGroup[] = [];
	export let overall: GifterRankingRow[] = [];
	export let compact = false;
</script>

{#if groups.length > 0}
	<div class={`${compact ? 'mt-3 rounded-[10px]' : 'mt-3 rounded-[12px]'} border border-white/8 bg-white/[0.025] p-3`}>
		<div class="flex items-center justify-between gap-3">
			<div class={`${compact ? 'text-[9px]' : 'text-[10px]'} uppercase tracking-[0.14em] text-slate-500`}>Top Gifters by Idol</div>
			<div class={`${compact ? 'text-[9px]' : 'text-[10px]'} text-slate-500`}>Allocated gift score</div>
		</div>
		<div class="mt-2 grid gap-2 sm:grid-cols-2">
			{#each groups as group}
				<div class={`${compact ? 'rounded-[9px]' : 'rounded-[10px] border border-white/8'} bg-black/20 p-2.5`}>
					<div class={`${compact ? 'text-[10px]' : 'text-[11px]'} font-semibold text-cyan-100`}>{group.castName}</div>
					{#if group.gifters.length > 0}
						<div class="mt-2 space-y-1.5">
							{#each group.gifters as gifter, index}
								<div class="flex items-center justify-between gap-2 rounded-[8px] bg-white/[0.025] px-2 py-1.5">
									<div class="flex min-w-0 items-center gap-2">
										<span class={`${compact ? 'w-3 text-[8px]' : 'w-3 text-[9px]'} text-slate-500`}>{index + 1}</span>
										{#if gifter.avatarUrl}
											<img src={gifter.avatarUrl} alt={gifter.name} class={`${compact ? 'h-5 w-5' : 'h-6 w-6'} rounded-full object-cover`} />
										{:else}
											<span class={`grid ${compact ? 'h-5 w-5 text-[7px]' : 'h-6 w-6 text-[8px]'} place-items-center rounded-full font-semibold text-white ${gifter.avatarClass}`}>{gifter.avatar}</span>
										{/if}
										<div class="min-w-0">
											<div class={`truncate ${compact ? 'text-[9px]' : 'text-[10px]'} text-slate-200`}>{gifter.name}</div>
											{#if gifter.handle}<div class={`truncate ${compact ? 'text-[8px]' : 'text-[9px]'} text-slate-500`}>{gifter.handle}</div>{/if}
										</div>
									</div>
									<div class={`shrink-0 ${compact ? 'text-[10px]' : 'text-[11px]'} font-semibold tabular-nums text-slate-100`}>{gifter.score.toLocaleString()}</div>
								</div>
							{/each}
						</div>
					{:else}
						<div class="mt-2 rounded-[8px] border border-dashed border-white/8 px-2 py-2 text-[9px] text-slate-500">No allocated gifters yet.</div>
					{/if}
				</div>
			{/each}
		</div>
	</div>
{/if}

{#if overall.length > 0}
	<div class={`${compact ? 'mt-3 rounded-[10px]' : 'mt-3 rounded-[12px]'} border border-amber-300/12 bg-amber-300/[0.025] p-3`}>
		<div class="flex items-center justify-between gap-3">
			<div class={`${compact ? 'text-[9px]' : 'text-[10px]'} uppercase tracking-[0.14em] text-slate-500`}>Overall Top 10 Gifters</div>
			<div class={`${compact ? 'text-[9px]' : 'text-[10px]'} text-slate-500`}>All captured gifts</div>
		</div>
		<div class="mt-2 grid gap-1.5 sm:grid-cols-2">
			{#each overall as gifter, index}
				<div class="flex items-center justify-between gap-2 rounded-[8px] bg-black/20 px-2.5 py-2">
					<div class="flex min-w-0 items-center gap-2">
						<span class={`${compact ? 'w-3 text-[8px]' : 'w-4 text-[9px]'} text-amber-200/70`}>{index + 1}</span>
						{#if gifter.avatarUrl}
							<img src={gifter.avatarUrl} alt={gifter.name} class={`${compact ? 'h-5 w-5' : 'h-6 w-6'} rounded-full object-cover`} />
						{:else}
							<span class={`grid ${compact ? 'h-5 w-5 text-[7px]' : 'h-6 w-6 text-[8px]'} place-items-center rounded-full font-semibold text-white ${gifter.avatarClass}`}>{gifter.avatar}</span>
						{/if}
						<div class="min-w-0">
							<div class={`truncate ${compact ? 'text-[9px]' : 'text-[10px]'} text-slate-200`}>{gifter.name}</div>
							{#if gifter.handle}<div class={`truncate ${compact ? 'text-[8px]' : 'text-[9px]'} text-slate-500`}>{gifter.handle}</div>{/if}
						</div>
					</div>
					<div class={`shrink-0 ${compact ? 'text-[10px]' : 'text-[11px]'} font-semibold tabular-nums text-amber-100`}>{gifter.score.toLocaleString()}</div>
				</div>
			{/each}
		</div>
	</div>
{/if}
