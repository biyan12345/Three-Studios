<script lang="ts">
	import { fly } from 'svelte/transition';
	import GifterRankings from '$lib/components/gifter-rankings.svelte';
	import type { AllMessageRow, SceneRankingScore } from '$lib/app-types';
	import type { GifterRankingGroup, GifterRankingRow } from '$lib/studio/gifter-rankings';
	import type { FinalLiveScoreRow } from '$lib/studio/session-summary';

	type GiftStats = {
		totalGiftCount: number;
		totalCapturedCoins: number;
		unallocatedCoins: number;
	};

	type AuditGroup = {
		id: string;
		label: string;
		summary?: {
			totalCoins: number;
			unallocatedCoins: number;
			rows: FinalLiveScoreRow[];
		};
		gifts: AllMessageRow[];
	};

	export let stats: GiftStats;
	export let sceneScores: SceneRankingScore[];
	export let rankingGroups: GifterRankingGroup[];
	export let overallRankings: GifterRankingRow[];
	export let auditGroups: AuditGroup[];
	export let formatTime: (value?: string) => string;
	export let giftAmount: (row: AllMessageRow) => number;
	export let giftUnallocatedAmount: (row: AllMessageRow) => number;
	export let manualAllocation: (row: AllMessageRow, index: number) => { castName: string } | undefined;
	export let onClose: () => void;
	export let onSelectProfile: (row: AllMessageRow) => void;
	export let onAllocate: (row: AllMessageRow, index: number) => void;

	$: rankedSceneScores = [...sceneScores].sort(
		(left, right) => right.score - left.score || left.name.localeCompare(right.name)
	);
</script>

<div class="absolute inset-0 z-[56] grid place-items-center bg-black/60 px-6 py-8">
	<div transition:fly={{ y: 18, duration: 180 }} class="glass flex h-full max-h-[820px] w-full max-w-[880px] flex-col rounded-[18px] border border-white/10 p-5">
		<div class="flex items-start justify-between gap-3">
			<div>
				<h2 class="text-[20px] font-semibold text-slate-100">LIVE Audit</h2>
				<!-- <p class="mt-1 text-[12px] leading-5 text-slate-400">Game scores, gift allocation, and timestamps for this LIVE session.</p> -->
			</div>
			<button type="button" class="text-slate-400 transition hover:text-white" on:click={onClose} aria-label="Close gift log">
				<svg viewBox="0 0 16 16" class="h-5 w-5 fill-none stroke-current stroke-[1.6]"><path d="m4 4 8 8" /><path d="M12 4 4 12" /></svg>
			</button>
		</div>

		<div class="mt-4 grid gap-2 text-[12px] text-slate-300 sm:grid-cols-3">
			{#each [['Total Gifts', stats.totalGiftCount], ['Total Coins', stats.totalCapturedCoins], ['Unallocated', stats.unallocatedCoins]] as statistic}
				<div class="rounded-[12px] border border-white/8 bg-white/[0.03] px-4 py-3">
					<div class="text-[10px] uppercase tracking-[0.14em] text-slate-500">{statistic[0]}</div>
					<div class="mt-1 text-[22px] font-semibold text-slate-100">{Number(statistic[1]).toLocaleString()}</div>
				</div>
			{/each}
		</div>

		<div class="mt-3 min-h-0 flex-1 overflow-y-auto pr-1">
			{#if rankedSceneScores.length > 0}
				<div class="mt-3 rounded-[12px] border border-white/8 bg-white/[0.025] p-3">
					<div class="flex items-center justify-between gap-3">
						<div class="text-[10px] uppercase tracking-[0.14em] text-slate-500">Overall Cast Scores</div>
						<div class="text-[10px] text-slate-500">LIVE session</div>
					</div>
					<div class="mt-2 grid max-h-28 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-2">
						{#each rankedSceneScores as row}
							<div class="flex items-center justify-between rounded-[8px] bg-black/20 px-2.5 py-2 text-[11px]">
								<span class="truncate text-slate-300">{row.name}</span>
								<span class="ml-3 shrink-0 font-semibold text-cyan-100">{row.score.toLocaleString()}</span>
							</div>
						{/each}
					</div>
				</div>
			{/if}

			<GifterRankings groups={rankingGroups} overall={overallRankings} />
			<div class="mt-4">
				{#if auditGroups.length === 0}
					<div class="rounded-[12px] border border-dashed border-white/10 bg-white/[0.02] px-4 py-6 text-center text-[13px] text-slate-400">No games or gifts have been captured yet.</div>
				{:else}
					<div class="space-y-3">
						{#each auditGroups as group}
							<div class={group.summary ? 'rounded-[12px] border border-cyan-300/15 bg-cyan-300/[0.04] p-3' : 'contents'}>
								{#if group.summary}
									<div class="flex items-start justify-between gap-3">
										<div><div class="text-[10px] uppercase tracking-[0.14em] text-cyan-200/70">Game round</div><div class="mt-1 text-[14px] font-medium text-slate-100">{group.label}</div></div>
										<div class="flex gap-4 text-right"><div><div class="text-[16px] font-semibold text-slate-100">{group.summary.totalCoins.toLocaleString()}</div><div class="text-[10px] text-slate-500">total coins</div></div><div><div class="text-[16px] font-semibold text-amber-200">{group.summary.unallocatedCoins.toLocaleString()}</div><div class="text-[10px] text-slate-500">unallocated</div></div></div>
									</div>
									<div class="mt-3 grid gap-1.5 sm:grid-cols-2">{#each group.summary.rows as row}<div class="flex justify-between rounded-[8px] bg-black/20 px-2.5 py-2 text-[11px]"><span class="text-slate-300">{row.name}</span><span class="font-medium text-slate-100">{row.score.toLocaleString()}</span></div>{/each}</div>
								{/if}

								{#if group.gifts.length === 0}
									<div class="mt-3 rounded-[9px] border border-dashed border-white/8 px-3 py-2 text-[11px] text-slate-500">No gifts were captured during this round.</div>
								{:else}
									<div class={group.summary ? 'mt-3 space-y-2' : 'space-y-2'}>
										{#each group.gifts as message, index (`gift-log-${group.id}-${message.id}-${index}`)}
											{@const allocatedManually = manualAllocation(message, index)}
											<div class="flex items-center justify-between gap-3 rounded-[12px] border border-white/8 bg-black/20 px-3 py-2.5">
												<div class="flex min-w-0 items-center gap-3">
													<button type="button" class="shrink-0 rounded-full transition hover:ring-2 hover:ring-cyan-300/50 focus:outline-none focus:ring-2 focus:ring-cyan-300/60" on:click={() => onSelectProfile(message)} aria-label={`View ${message.user}'s profile`} title={`View ${message.user}'s profile`}>
														{#if message.avatarUrl}<img src={message.avatarUrl} alt={message.user} class="h-9 w-9 rounded-full object-cover" />{:else}<span class={`grid h-9 w-9 place-items-center rounded-full text-[10px] font-semibold text-white ${message.avatarClass}`}>{message.avatar}</span>{/if}
													</button>
													<div class="min-w-0"><div class="truncate text-[13px] font-medium text-slate-100">{message.user}</div><div class={`mt-0.5 truncate text-[11px] ${message.accent ?? 'text-slate-300'}`}>{message.text} · {formatTime(message.capturedAt)}</div></div>
												</div>
												<div class="flex shrink-0 items-center gap-2">
													<div class="grid h-9 w-9 place-items-center rounded-[10px] bg-white/[0.04]">{#if message.imageUrl}<img src={message.imageUrl} alt={message.text} class="h-7 w-7 object-contain" />{:else if message.icon}<span class="text-base">{message.icon}</span>{/if}</div>
													<div class="min-w-[54px] text-right"><div class="text-[12px] font-medium text-slate-100">{message.count}</div><div class="text-[10px] text-slate-500">{giftAmount(message).toLocaleString()} coins</div></div>
													{#if allocatedManually}
														<button type="button" class="rounded-[9px] bg-emerald-300/10 px-2.5 py-1.5 text-[10px] font-medium text-emerald-100 transition hover:bg-emerald-300/20" on:click={() => onAllocate(message, index)} title="Move allocation">{allocatedManually.castName}</button>
													{:else if message.allocationStatus === 'allocated'}
														<button type="button" class="rounded-[9px] bg-emerald-300/10 px-2.5 py-1.5 text-[10px] font-medium text-emerald-100 transition hover:bg-emerald-300/20" on:click={() => onAllocate(message, index)} title="Move allocation">{message.allocatedCastName ?? 'Allocated'}</button>
													{/if}
													{#if !allocatedManually && giftUnallocatedAmount(message) > 0 && stats.unallocatedCoins > 0}
														<button type="button" class="rounded-[9px] border border-amber-300/20 bg-amber-300/10 px-2.5 py-1.5 text-[10px] font-medium text-amber-100 transition hover:bg-amber-300/15" on:click={() => onAllocate(message, index)}>Allocate</button>
													{/if}
												</div>
											</div>
										{/each}
									</div>
								{/if}
							</div>
						{/each}
					</div>
				{/if}
			</div>
		</div>
	</div>
</div>
