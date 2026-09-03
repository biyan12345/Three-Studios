<script lang="ts">
	import { fly } from 'svelte/transition';
	import GifterRankings from '$lib/components/gifter-rankings.svelte';
	import type {
		LiveSessionGameHistory,
		LiveSessionGiftHistory,
		LiveSessionHistoryEntry,
		ScoreHistoryResponse
	} from '$lib/app-types';
	import { normalizeTikTokUsername, sanitizeCastNameList } from '$lib/helpers';
	import { avatarClassFromName, initials } from '$lib/studio/live-user';
	import {
		rankGifters,
		rankGiftersByCast,
		type GifterRankingCandidate
	} from '$lib/studio/gifter-rankings';

	type HistoryAuditItem =
		| { id: string; sortAt: string; game: LiveSessionGameHistory }
		| { id: string; sortAt: string; gift: LiveSessionGiftHistory };

	export let history: ScoreHistoryResponse;
	export let loading = false;
	export let error = '';
	export let selectedSessionId = '';
	export let onClose: () => void;

	const timeFormatter = new Intl.DateTimeFormat(undefined, {
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit'
	});
	const dayFormatter = new Intl.DateTimeFormat(undefined, {
		weekday: 'short',
		year: 'numeric',
		month: 'short',
		day: 'numeric'
	});

	function formatTime(value: string | null | undefined) {
		if (!value) return 'N/A';
		const timestamp = Date.parse(value);
		return Number.isFinite(timestamp) ? timeFormatter.format(new Date(timestamp)) : 'N/A';
	}

	function formatDay(dayKey: string) {
		const date = new Date(`${dayKey}T12:00:00`);
		return Number.isFinite(date.getTime()) ? dayFormatter.format(date) : dayKey;
	}

	function formatDuration(durationSeconds: number) {
		const seconds = Math.max(0, Math.floor(durationSeconds));
		return [Math.floor(seconds / 3600), Math.floor((seconds % 3600) / 60), seconds % 60]
			.map((value) => String(value).padStart(2, '0'))
			.join(':');
	}

	function sessionCastScores(session: LiveSessionHistoryEntry) {
		const totals = new Map<string, number>();
		for (const game of session.gameSessions) {
			for (const row of game.rows) totals.set(row.name, (totals.get(row.name) ?? 0) + row.score);
		}
		for (const row of session.outsideGameScores) {
			totals.set(row.name, (totals.get(row.name) ?? 0) + row.score);
		}
		return Array.from(totals, ([name, score]) => ({ name, score })).sort(
			(left, right) => right.score - left.score || left.name.localeCompare(right.name)
		);
	}

	function gifterCandidates(session: LiveSessionHistoryEntry): GifterRankingCandidate[] {
		return session.gifts.flatMap((gift) => {
			const handle = normalizeTikTokUsername(gift.viewerUsername);
			const id = handle || gift.viewerName.trim().toLowerCase();
			if (!id) return [];
			return [{
				id,
				name: gift.viewerName,
				handle: handle ? `@${handle}` : undefined,
				avatar: initials(gift.viewerName),
				avatarClass: avatarClassFromName(id),
				avatarUrl: gift.viewerAvatarUrl,
				totalScore: gift.coins,
				allocatedScore: gift.allocatedCoins,
				castName: gift.allocatedTo
			}];
		});
	}

	function buildAuditItems(session: LiveSessionHistoryEntry): HistoryAuditItem[] {
		const items: HistoryAuditItem[] = session.gameSessions.map((game) => ({
			id: `game-${game.id}`,
			sortAt: game.endedAt,
			game: {
				...game,
				rows: [...game.rows].sort((left, right) => right.score - left.score),
				gifts: [...game.gifts].sort((left, right) => right.capturedAt.localeCompare(left.capturedAt))
			}
		}));
		for (const gift of session.gifts.filter((entry) => !entry.gameSessionId)) {
			items.push({ id: `gift-${gift.id}`, sortAt: gift.capturedAt, gift });
		}
		return items.sort((left, right) => right.sortAt.localeCompare(left.sortAt));
	}

	$: selectedSession = history.liveSessions.find((session) => session.id === selectedSessionId) ?? null;
	$: castScores = selectedSession ? sessionCastScores(selectedSession) : [];
	$: candidates = selectedSession ? gifterCandidates(selectedSession) : [];
	$: castGifters = selectedSession
		? rankGiftersByCast(candidates, sanitizeCastNameList([
			...castScores.map((row) => row.name),
			...candidates.map((candidate) => candidate.castName)
		]))
		: [];
	$: overallGifters = rankGifters(candidates, { limit: 10 });
	$: auditItems = selectedSession ? buildAuditItems(selectedSession) : [];
</script>

<div class="absolute inset-0 z-[70] grid place-items-center bg-black/60 px-4 py-6">
	<div transition:fly={{ y: 18, duration: 180 }} class="glass flex h-full max-h-[820px] w-full max-w-[1180px] flex-col rounded-[18px] border border-white/10 p-5">
		<div class="flex items-center justify-between gap-3">
			<div><h2 class="text-[20px] font-semibold text-slate-100">History</h2>
				<!-- <p class="mt-1 text-[12px] text-slate-500">LIVE sessions, gifts, and game calculations are stored for review · {history.timeZone}</p> -->
			</div>
			<button type="button" class="text-slate-400 transition hover:text-white" on:click={onClose} aria-label="Close score history"><svg viewBox="0 0 16 16" class="h-5 w-5 fill-none stroke-current stroke-[1.6]"><path d="m4 4 8 8" /><path d="M12 4 4 12" /></svg></button>
		</div>

		{#if loading}
			<div class="grid min-h-0 flex-1 place-items-center text-[13px] text-slate-400">Loading score history...</div>
		{:else if error}
			<div class="mt-5 rounded-[12px] border border-rose-300/20 bg-rose-300/10 px-4 py-3 text-[13px] text-rose-100">{error}</div>
		{:else if history.liveSessions.length === 0}
			<div class="grid min-h-0 flex-1 place-items-center text-center"><div><div class="text-[15px] font-medium text-slate-200">No LIVE history yet</div><div class="mt-1 text-[12px] text-slate-500">Every completed LIVE session will appear here, even when no gifts or games occur.</div></div></div>
		{:else}
			<div class="mt-5 flex min-h-0 flex-1 overflow-hidden rounded-[14px] border border-white/8 bg-black/10">
				<aside class="w-[230px] shrink-0 overflow-y-auto border-r border-white/8 bg-black/20 p-2">
					<div class="px-2 pb-2 pt-1 text-[9px] uppercase tracking-[0.16em] text-slate-500">LIVE Sessions</div>
					<div class="space-y-1.5">
						{#each history.liveSessions as session}
							<button type="button" on:click={() => (selectedSessionId = session.id)} class={`w-full rounded-[10px] border px-3 py-2.5 text-left transition ${selectedSession?.id === session.id ? 'border-cyan-300/25 bg-cyan-300/10' : 'border-transparent hover:bg-white/[0.04]'}`}>
								<div class="truncate text-[11px] font-medium text-slate-200">{formatDay(session.dayKey)}</div>
								<div class="mt-1 text-[10px] text-slate-500">{formatTime(session.startedAt)} – {formatTime(session.endedAt)}</div>
								<div class="mt-1 flex justify-between text-[9px] text-slate-500"><span>{formatDuration(session.durationSeconds)}</span><span>{session.totalCapturedCoins.toLocaleString()} coins</span></div>
							</button>
						{/each}
					</div>
				</aside>

				{#if selectedSession}
					<section class="min-w-0 flex-1 overflow-y-auto p-4">
						<div class="flex items-start justify-between gap-4">
							<div><div class="text-[15px] font-semibold text-slate-100">LIVE Session · @{selectedSession.uniqueId || 'profile'}</div><div class="mt-1 text-[10px] text-slate-500">{formatDay(selectedSession.dayKey)} · {formatTime(selectedSession.startedAt)} – {formatTime(selectedSession.endedAt)} · {formatDuration(selectedSession.durationSeconds)}{selectedSession.roomId ? ` · Room ${selectedSession.roomId}` : ''}</div></div>
							<div class="text-right"><div class="text-[20px] font-semibold text-slate-100">{selectedSession.totalCapturedCoins.toLocaleString()}</div><div class="text-[10px] text-slate-500">coins · {selectedSession.totalGiftCount.toLocaleString()} gifts</div></div>
						</div>
						<div class="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
							{#each [['Total Gifts', selectedSession.totalGiftCount], ['Total Coins', selectedSession.totalCapturedCoins], ['Allocated', selectedSession.allocatedCoins], ['Unallocated', selectedSession.unallocatedCoins], ['Peak Viewers', selectedSession.peakViewers], ['Views', selectedSession.totalViews], ['Likes', selectedSession.totalLikes], ['Follows', selectedSession.totalFollows]] as statistic}
								<div class="rounded-[10px] border border-white/8 bg-white/[0.025] px-3 py-2.5"><div class="text-[9px] uppercase tracking-[0.12em] text-slate-500">{statistic[0]}</div><div class="mt-1 text-[15px] font-semibold text-slate-100">{Number(statistic[1]).toLocaleString()}</div></div>
							{/each}
						</div>
						{#if castScores.length > 0}<div class="mt-3 rounded-[10px] border border-white/8 bg-white/[0.02] p-3"><div class="text-[9px] uppercase tracking-[0.14em] text-slate-500">Overall Cast Scores</div><div class="mt-2 grid gap-1.5 sm:grid-cols-2">{#each castScores as row}<div class="flex justify-between rounded-[8px] bg-black/20 px-2.5 py-2 text-[10px]"><span class="text-slate-300">{row.name}</span><span class="font-semibold text-cyan-100">{row.score.toLocaleString()}</span></div>{/each}</div></div>{/if}
						<GifterRankings groups={castGifters} overall={overallGifters} compact />

						<div class="mt-3 space-y-3">
							{#each auditItems as item (item.id)}
								{#if 'game' in item}
									<div class="rounded-[12px] border border-cyan-300/15 bg-cyan-300/[0.04] p-3">
										<div class="flex justify-between gap-3"><div><div class="text-[9px] uppercase tracking-[0.14em] text-cyan-200/70">Game round</div><div class="mt-1 text-[12px] font-medium text-slate-200">{item.game.modeLabel} · Round {selectedSession.gameSessions.findIndex((entry) => entry.id === item.game.id) + 1}</div><div class="mt-1 text-[9px] text-slate-500">{formatTime(item.game.startedAt)} – {formatTime(item.game.endedAt)}</div></div><div class="flex gap-4 text-right"><div><div class="text-[14px] font-semibold text-slate-100">{item.game.totalCoins.toLocaleString()}</div><div class="text-[9px] text-slate-500">total coins</div></div><div><div class="text-[14px] font-semibold text-amber-200">{item.game.unallocatedCoins.toLocaleString()}</div><div class="text-[9px] text-slate-500">unallocated</div></div></div></div>
										<div class="mt-3 grid gap-1.5 sm:grid-cols-2">{#each item.game.rows as row}<div class="flex justify-between rounded-[8px] bg-black/20 px-2.5 py-2 text-[10px]"><span class="text-slate-300">{row.name}</span><span class="font-medium text-slate-100">{row.score.toLocaleString()}</span></div>{/each}</div>
										{#if item.game.gifts.length === 0}<div class="mt-3 rounded-[8px] border border-dashed border-white/8 px-3 py-2 text-[10px] text-slate-500">No gifts were captured during this round.</div>{:else}<div class="mt-3 space-y-1.5">{#each item.game.gifts as gift}<div class="flex items-center justify-between gap-3 rounded-[9px] bg-black/20 px-3 py-2 text-[10px]"><div class="min-w-0"><div class="truncate text-slate-200">{gift.viewerName} · {gift.giftName} × {gift.count}</div><div class="mt-0.5 text-[9px] text-slate-500">{formatTime(gift.capturedAt)}</div></div><div class="shrink-0 text-right"><div class="text-slate-100">{gift.coins.toLocaleString()} coins</div><div class={gift.allocatedTo ? 'text-emerald-200' : 'text-amber-200'}>{gift.allocatedTo ?? 'Unallocated'}</div></div></div>{/each}</div>{/if}
									</div>
								{:else}
									<div class="flex items-center justify-between gap-3 rounded-[12px] border border-white/8 bg-black/20 px-3 py-2.5"><div class="min-w-0"><div class="truncate text-[11px] font-medium text-slate-200">{item.gift.viewerName} · {item.gift.giftName} × {item.gift.count}</div><div class="mt-0.5 text-[9px] text-slate-500">{formatTime(item.gift.capturedAt)}</div></div><div class="shrink-0 text-right text-[10px]"><div class="text-slate-100">{item.gift.coins.toLocaleString()} coins</div><div class={item.gift.allocatedTo ? 'text-emerald-200' : 'text-amber-200'}>{item.gift.allocatedTo ?? 'Unallocated'}</div></div></div>
								{/if}
							{/each}
							{#if auditItems.length === 0}<div class="rounded-[12px] border border-dashed border-white/8 px-4 py-8 text-center text-[11px] text-slate-500">No games or gifts were captured in this session.</div>{/if}
						</div>
					</section>
				{/if}
			</div>
		{/if}
	</div>
</div>
