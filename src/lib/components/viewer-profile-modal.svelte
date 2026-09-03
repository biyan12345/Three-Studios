<script lang="ts">
	import type { LiveUser, UserBadgeRow } from '$lib/app-types';

	export let viewer: LiveUser | undefined = undefined;
	export let fallbackName = 'Viewer';
	export let fallbackHandle = '';
	export let fallbackAvatar = '';
	export let fallbackAvatarClass = 'bg-slate-700';
	export let fallbackAvatarUrl: string | undefined = undefined;
	export let badges: UserBadgeRow[] = [];
	export let onClose: () => void;

	$: displayName =
		viewer?.displayName?.trim() || viewer?.nickname?.trim() || fallbackName.trim() || 'Viewer';
	$: username = viewer?.uniqueId?.trim() || fallbackHandle.trim().replace(/^@/, '');
	$: avatarUrl = viewer?.profilePictureUrl?.trim() || fallbackAvatarUrl;
	$: bio = viewer?.bio?.trim() || viewer?.bioDescription?.trim() || '';
	$: followerCount = viewer?.followerCount ?? viewer?.followInfo?.followerCount;
	$: followingCount = viewer?.followingCount ?? viewer?.followInfo?.followingCount;
	$: gifterLevel = viewer?.levels?.gifterLevel;
	$: memberLevel = viewer?.levels?.memberLevel;
	$: tiktokProfileUrl = username
		? `https://www.tiktok.com/@${encodeURIComponent(username)}`
		: '';

	function formattedCount(value: number | undefined) {
		return typeof value === 'number' && Number.isFinite(value) ? value.toLocaleString() : '—';
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') onClose();
	}
</script>

<svelte:window on:keydown={handleKeydown} />

<div
	class="fixed inset-0 z-[120] grid place-items-center bg-black/65 px-4 py-6 backdrop-blur-sm"
	role="presentation"
	on:click={onClose}
>
	<dialog
		open
		class="relative m-0 w-full max-w-[430px] overflow-hidden rounded-[20px] border border-white/10 bg-[#0d171e] p-0 text-white shadow-[0_30px_80px_rgba(0,0,0,0.6)]"
		aria-label={`${displayName} viewer profile`}
		data-profile-badge-count={badges.length}
		on:click|stopPropagation
	>

	<button type="button" class="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full border border-white/10 bg-black/25 text-slate-300 transition hover:bg-black/45 hover:text-white" on:click={onClose} aria-label="Close viewer profile">
				<svg viewBox="0 0 16 16" class="h-4 w-4 fill-none stroke-current stroke-[1.6]"><path d="m4 4 8 8" /><path d="M12 4 4 12" /></svg>
			</button>

		<div class="p-5">
			<div class="flex items-end justify-between gap-3">
				{#if avatarUrl}
					<img src={avatarUrl} alt={displayName} class="h-[88px] w-[88px] rounded-full border-4 border-[#0d171e] bg-slate-800 object-cover" />
				{:else}
					<div class={`grid h-[88px] w-[88px] place-items-center rounded-full border-4 border-[#0d171e] text-[20px] font-semibold text-white ${fallbackAvatarClass}`}>{fallbackAvatar || displayName.slice(0, 2).toUpperCase()}</div>
				{/if}
				<!-- {#if tiktokProfileUrl}
					<a href={tiktokProfileUrl} target="_blank" rel="noreferrer" class="mb-1 rounded-[10px] border border-cyan-300/20 bg-cyan-300/10 px-3 py-2 text-[11px] font-medium text-cyan-100 transition hover:bg-cyan-300/15">Open on TikTok</a>
				{/if} -->
			</div>

			<div class="mt-3 flex flex-wrap items-center gap-2">
				<h2 class="text-[20px] font-semibold text-slate-100">{displayName}</h2>
				<!-- {#if viewer?.verified}<span class="rounded-full bg-cyan-300/15 px-2 py-1 text-[10px] font-medium text-cyan-100">Verified</span>{/if} -->
			</div>
			{#if username}<div class="mt-0.5 text-[13px] text-slate-400">@{username}</div>{/if}
			<!-- {#if bio}<p class="mt-3 whitespace-pre-wrap text-[12px] leading-5 text-slate-300">{bio}</p>{/if} -->

			<div class="mt-4 grid grid-cols-2 gap-2">
				<div class="rounded-[12px] border border-white/8 bg-white/[0.03] p-3"><div class="text-[10px] uppercase tracking-[0.14em] text-slate-500">Gifter Level</div><div class="mt-1 text-[17px] font-semibold text-slate-100">{gifterLevel ?? '—'}</div></div>
				<div class="rounded-[12px] border border-white/8 bg-white/[0.03] p-3"><div class="text-[10px] uppercase tracking-[0.14em] text-slate-500">Member Level</div><div class="mt-1 text-[17px] font-semibold text-slate-100">{memberLevel ?? '—'}</div></div>
				<!-- <div class="rounded-[12px] border border-white/8 bg-white/[0.03] p-3"><div class="text-[10px] uppercase tracking-[0.14em] text-slate-500">Followers</div><div class="mt-1 text-[15px] font-semibold text-slate-100">{formattedCount(followerCount)}</div></div> -->
				<!-- <div class="rounded-[12px] border border-white/8 bg-white/[0.03] p-3"><div class="text-[10px] uppercase tracking-[0.14em] text-slate-500">Following</div><div class="mt-1 text-[15px] font-semibold text-slate-100">{formattedCount(followingCount)}</div></div> -->
			</div>

			<!-- {#if viewer?.isModerator || viewer?.isSubscriber || viewer?.isNewGifter || viewer?.isFollower || viewer?.isFollowing || badges.length > 0}
				<div class="mt-3 flex flex-wrap gap-1.5">
					{#if viewer?.isModerator}<span class="rounded-[8px] bg-rose-300/12 px-2 py-1 text-[10px] text-rose-100">Moderator</span>{/if}
					{#if viewer?.isSubscriber}<span class="rounded-[8px] bg-fuchsia-300/12 px-2 py-1 text-[10px] text-fuchsia-100">Subscriber</span>{/if}
					{#if viewer?.isNewGifter}<span class="rounded-[8px] bg-orange-300/12 px-2 py-1 text-[10px] text-orange-100">New Gifter</span>{/if}
					{#if viewer?.isFollower}<span class="rounded-[8px] bg-emerald-300/12 px-2 py-1 text-[10px] text-emerald-100">Follower</span>{/if}
					{#if viewer?.isFollowing}<span class="rounded-[8px] bg-blue-300/12 px-2 py-1 text-[10px] text-blue-100">Following</span>{/if}
					{#each badges as badge}<span class={`rounded-[8px] px-2 py-1 text-[10px] ${badge.class}`}>{badge.label}</span>{/each}
				</div>
			{/if} -->

			<!-- {#if viewer?.userId}
				<div class="mt-4 border-t border-white/8 pt-3"><div class="text-[10px] uppercase tracking-[0.14em] text-slate-500">TikTok User ID</div><div class="mt-1 break-all font-mono text-[11px] text-slate-400">{viewer.userId}</div></div>
			{/if} -->
		</div>
	</dialog>
</div>
