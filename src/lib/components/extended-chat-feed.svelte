<script lang="ts">
	import { tick } from 'svelte';
	import { messageSegments } from '$lib/studio/chat-message-segments';
	import ViewerProfileModal from '$lib/components/viewer-profile-modal.svelte';
	import type { AllMessageRow, EventRow, LiveMetricRow } from '$lib/app-types';

	export let performance: LiveMetricRow[] = [];
	export let messages: AllMessageRow[] = [];
	export let currentEvent: EventRow | null = null;
	export let activeLiveUniqueId = '';
	export let floatingWindow = false;
	export let opacityPercent = 100;
	export let textScalePercent = 100;
	export let showAppearanceControl = true;

	let feedContainer: HTMLDivElement | null = null;
	let feedEndMarker: HTMLDivElement | null = null;
	let lastMessageSignature = '';
	let settingsOpen = false;
	let selectedViewerMessage: AllMessageRow | null = null;

	function profileBadges(message: AllMessageRow) {
		return [
			...(message.badge && message.badgeClass
				? [{ label: message.badge, class: message.badgeClass }]
				: []),
			...(message.extraBadges ?? [])
		];
	}

	function clampOpacityPercent(value: number) {
		return Math.min(100, Math.max(10, Math.round(value)));
	}

	function clampTextScalePercent(value: number) {
		return Math.min(200, Math.max(80, Math.round(value)));
	}

	$: clampedOpacityPercent = clampOpacityPercent(opacityPercent);
	$: clampedTextScalePercent = clampTextScalePercent(textScalePercent);
	$: opacityRatio = clampedOpacityPercent / 100;
	$: textScaleRatio = clampedTextScalePercent / 100;
	$: panelStartAlpha = (0.08 + opacityRatio * 0.84).toFixed(3);
	$: panelEndAlpha = (0.05 + opacityRatio * 0.75).toFixed(3);
	$: cardBgAlpha = (0.02 + opacityRatio * 0.12).toFixed(3);
	$: borderAlpha = (0.04 + opacityRatio * 0.07).toFixed(3);
	$: popoverBgAlpha = (0.2 + opacityRatio * 0.72).toFixed(3);

	$: {
		const last = messages[messages.length - 1];
		const nextSignature = last
			? `${messages.length}:${last.id}:${last.text}:${last.count ?? ''}:${last.countValue ?? ''}`
			: '';

		if (feedContainer && nextSignature !== lastMessageSignature) {
			lastMessageSignature = nextSignature;
			void tick().then(() => {
				if (feedContainer) {
					feedContainer.scrollTop = feedContainer.scrollHeight;
					feedEndMarker?.scrollIntoView({ block: 'end' });
				}
			});
		}
	}
</script>

<section
	class={`flex h-full min-h-0 flex-col overflow-hidden ${
		floatingWindow
			? 'backdrop-blur-[30px] backdrop-saturate-[1.6]'
			: 'glass-soft rounded-[14px]'
	}`}
	style={floatingWindow
		? `background:
			radial-gradient(circle at top left, rgba(255, 255, 255, ${(0.03 + opacityRatio * 0.08).toFixed(3)}), transparent 32%),
			radial-gradient(circle at 82% 14%, rgba(129, 189, 255, ${(0.018 + opacityRatio * 0.06).toFixed(3)}), transparent 26%),
			linear-gradient(180deg, rgba(7, 16, 21, ${panelStartAlpha}), rgba(7, 16, 21, ${panelEndAlpha}));
			--chat-text-scale: ${textScaleRatio};`
		: undefined}
>
	<div
		class="relative border-b px-4 py-3"
		style={`border-color: rgba(255, 255, 255, ${borderAlpha});`}
	>
		<div class="flex items-end justify-between gap-3">
			<div>
				<div class="text-[10px] uppercase tracking-[0.18em] text-slate-500" style="font-size: calc(10px * var(--chat-text-scale, 1));">Extended Chat</div>
				<div class="mt-1 text-[15px] font-semibold text-slate-100" style="font-size: calc(15px * var(--chat-text-scale, 1));">All Messages</div>
			</div>
			<div class="flex items-center gap-2">
				{#if activeLiveUniqueId}
					<div class="max-w-[180px] truncate text-[11px] text-slate-500" style="font-size: calc(11px * var(--chat-text-scale, 1));">@{activeLiveUniqueId}</div>
				{/if}
				{#if showAppearanceControl}
					<button
						class="grid h-8 w-8 place-items-center rounded-[10px] border text-slate-300 transition hover:bg-white/[0.06] hover:text-white"
						style={`background: rgba(255, 255, 255, ${cardBgAlpha}); border-color: rgba(255, 255, 255, ${borderAlpha});`}
						on:click={() => {
							settingsOpen = !settingsOpen;
						}}
						aria-label="Window appearance"
						title="Window appearance"
					>
						<svg viewBox="0 0 16 16" class="h-4 w-4 fill-none stroke-current stroke-[1.4]">
							<path d="M8 2.4 9 1.8l1.3.8 1.2-.2.6 1.2 1 .7-.1 1.4.7 1-.7 1 .1 1.4-1 .7-.6 1.2-1.2-.2-1.3.8-1-.6-1 .6-1.3-.8-1.2.2-.6-1.2-1-.7.1-1.4-.7-1 .7-1-.1-1.4 1-.7.6-1.2 1.2.2 1.3-.8 1 .6Z" />
							<circle cx="8" cy="8" r="2.1" />
						</svg>
					</button>
				{/if}
			</div>
		</div>

		{#if showAppearanceControl && settingsOpen}
			<div
				class="absolute right-4 top-[calc(100%-2px)] z-20 mt-3 w-64 rounded-[14px] border p-3 shadow-[0_20px_40px_rgba(0,0,0,0.32)] backdrop-blur-xl"
				style={`background: rgba(12, 18, 24, ${popoverBgAlpha}); border-color: rgba(255, 255, 255, ${borderAlpha});`}
			>
				<div class="flex items-center justify-between gap-3">
					<div class="text-[11px] uppercase tracking-[0.16em] text-slate-500">Window Look</div>
					<div class="text-[12px] font-medium text-slate-200">{clampedOpacityPercent}%</div>
				</div>
				<div class="mt-3">
					<input
						class="w-full accent-white"
						type="range"
						min="10"
						max="100"
						step="1"
						bind:value={opacityPercent}
					/>
				</div>
				<div class="mt-2 flex items-center justify-between text-[11px] text-slate-500">
					<span>More transparent</span>
					<span>More solid</span>
				</div>
				<div class="mt-4 flex items-center justify-between gap-3">
					<div class="text-[11px] uppercase tracking-[0.16em] text-slate-500">Text Size</div>
					<div class="text-[12px] font-medium text-slate-200">{clampedTextScalePercent}%</div>
				</div>
				<div class="mt-3">
					<input
						class="w-full accent-white"
						type="range"
						min="80"
						max="200"
						step="1"
						bind:value={textScalePercent}
					/>
				</div>
				<div class="mt-2 flex items-center justify-between text-[11px] text-slate-500">
					<span>Smaller</span>
					<span>Larger</span>
				</div>
				<div class="mt-3 rounded-[10px] border px-3 py-2 text-[11px] leading-5 text-slate-400" style={`background: rgba(255, 255, 255, ${cardBgAlpha}); border-color: rgba(255, 255, 255, ${borderAlpha});`}>
					Frosted look stays on. Text size scales from 80% to 200%.
				</div>
			</div>
		{/if}

		{#if performance.length > 0}
			<div class="mt-3 grid grid-cols-5 gap-2">
				{#each performance as item}
					<div
						class="inline-flex items-center justify-center gap-1.5 rounded-[10px] border px-2 py-2 text-[11px] text-slate-200"
						style={`background: rgba(255, 255, 255, ${cardBgAlpha}); border-color: rgba(255, 255, 255, ${borderAlpha}); font-size: calc(11px * var(--chat-text-scale, 1));`}
						title={item.label}
						aria-label={`${item.label}: ${item.value}`}
					>
						<span class="text-slate-400">
							{#if item.key === 'diamonds'}
								<svg viewBox="0 0 16 16" class="h-3.5 w-3.5 fill-current" aria-hidden="true">
									<path d="M4.2 2.5h7.6l3 3.4L8 13.5.9 5.9l3.3-3.4Zm.9 1.2L2.7 6.1h10.7l-2.2-2.4H5.1Zm1.1 0L8 10.1l1.8-6.4H6.2Z" />
								</svg>
							{:else if item.key === 'currentViewers'}
								<svg viewBox="0 0 16 16" class="h-3.5 w-3.5 fill-none stroke-current stroke-[1.4]" aria-hidden="true">
									<circle cx="5" cy="5.1" r="2.1" />
									<circle cx="11.2" cy="6" r="1.8" />
									<path d="M1.9 12.8c.5-2 1.9-3.1 3.9-3.1 2 0 3.4 1.1 4 3.1" />
									<path d="M9.1 12.5c.4-1.5 1.5-2.4 3-2.4 1 0 1.8.3 2.4.9" />
								</svg>
							{:else if item.key === 'totalViews'}
								<svg viewBox="0 0 16 16" class="h-3.5 w-3.5 fill-none stroke-current stroke-[1.4]" aria-hidden="true">
									<path d="M1.5 8s2.3-4 6.5-4 6.5 4 6.5 4-2.3 4-6.5 4-6.5-4-6.5-4Z" />
									<circle cx="8" cy="8" r="2.1" />
								</svg>
							{:else if item.key === 'follows'}
								<svg viewBox="0 0 16 16" class="h-3.5 w-3.5 fill-none stroke-current stroke-[1.4]" aria-hidden="true">
									<circle cx="5.1" cy="5.3" r="2.1" />
									<path d="M2.2 12.8c.4-2 1.7-3.1 3.7-3.1s3.3 1.1 3.8 3.1" />
									<path d="M11.3 3.4v5.3" />
									<path d="M8.7 6h5.2" />
								</svg>
							{:else}
								<svg viewBox="0 0 16 16" class="h-3.5 w-3.5 fill-none stroke-current stroke-[1.4]" aria-hidden="true">
									<path d="M8 13.3 2.6 8.2a3.1 3.1 0 0 1 4.4-4.4L8 4.8l1-.9a3.1 3.1 0 1 1 4.4 4.4L8 13.3Z" />
								</svg>
							{/if}
						</span>
						<span class="font-medium">{item.value}</span>
					</div>
				{/each}
			</div>
		{/if}
	</div>

	<div
		bind:this={feedContainer}
		class="min-h-0 flex-1 space-y-2 overflow-y-scroll px-4 py-3"
		style="scrollbar-gutter: stable; overscroll-behavior: contain;"
	>
		{#each messages as message}
			<div class="rounded-[12px] bg-transparent px-0.5 py-0.5">
				<div class="flex items-start gap-2.5">
					<button type="button" class="shrink-0 rounded-full transition hover:ring-2 hover:ring-cyan-300/50 focus:outline-none focus:ring-2 focus:ring-cyan-300/60" on:click={() => (selectedViewerMessage = message)} aria-label={`View ${message.user}'s profile`} title={`View ${message.user}'s profile`}>
						{#if message.avatarUrl}
							<img src={message.avatarUrl} alt={message.user} class="h-7 w-7 rounded-full object-cover" />
						{:else}
							<span class={`grid h-7 w-7 place-items-center rounded-full text-[9px] font-semibold text-white ${message.avatarClass}`}>{message.avatar}</span>
						{/if}
					</button>
					<div class="min-w-0 flex-1">
							<div class="mb-0.5 flex flex-wrap items-center gap-1 text-[11px] text-slate-400">
								{#if message.badge && message.badgeClass}
									<span class={`inline-flex items-center rounded-[8px] px-2 py-[3px] font-semibold leading-none ${message.badgeClass}`}>{message.badge}</span>
								{/if}
								{#if message.extraBadges}
									{#each message.extraBadges as extra}
										<span class={`inline-flex items-center rounded-[8px] px-2 py-[3px] font-semibold leading-none ${extra.class}`}>{extra.label}</span>
									{/each}
								{/if}
								<span class="font-medium text-slate-100" style="font-size: calc(11px * var(--chat-text-scale, 1));">{message.user}</span>
								{#if message.kind === 'gift'}
								<span class={`min-w-0 truncate ${message.accent ?? 'text-slate-300'}`}>
									{message.text}
								</span>
								{#if message.imageUrl}
									<img
										src={message.imageUrl}
										alt={message.text}
										class="h-4 w-4 shrink-0 rounded-[3px] object-contain"
									/>
								{:else if message.icon}
									<span class="shrink-0 text-[12px]">{message.icon}</span>
								{/if}
								{#if message.count}
									<span class="shrink-0 font-semibold text-white">{message.count}</span>
								{/if}
							{/if}
						</div>

						{#if message.kind !== 'gift'}
							<p class="text-[15px] leading-6 text-slate-100" style="font-size: calc(15px * var(--chat-text-scale, 1)); line-height: calc(24px * var(--chat-text-scale, 1));">
								{#each messageSegments(message.text, message.emotes) as segment, index (`${message.id}-${index}-${segment.type === 'text' ? segment.value : segment.token}`)}
									{#if segment.type === 'text'}
										<span class="whitespace-pre-wrap break-words">{segment.value}</span>
									{:else if segment.imageUrl}
										<img
											src={segment.imageUrl}
											alt={segment.token}
											title={segment.token}
											class="mx-[1px] inline-block align-[-0.2em] object-contain"
											style="height: calc(18px * var(--chat-text-scale, 1)); width: calc(18px * var(--chat-text-scale, 1));"
										/>
									{:else if segment.fallback}
										<span class="mx-[1px] inline-block align-[-0.1em] text-[16px]" style="font-size: calc(16px * var(--chat-text-scale, 1));" title={segment.token}>
											{segment.fallback}
										</span>
									{/if}
								{/each}
							</p>
						{/if}
					</div>
				</div>
			</div>
		{/each}
		<div bind:this={feedEndMarker} class="h-px w-full shrink-0"></div>
	</div>

	{#if currentEvent}
		<div
			class="border-t px-4 py-3"
			style={`border-color: rgba(255, 255, 255, ${borderAlpha});`}
		>
			<div
				class="flex min-h-[30px] items-center gap-2 overflow-hidden rounded-[10px] px-3 py-2 text-xs text-slate-300"
				style={`background: rgba(255, 255, 255, ${cardBgAlpha}); font-size: calc(12px * var(--chat-text-scale, 1));`}
			>
				<span class={`shrink-0 rounded-full px-1.5 py-0.5 ${currentEvent.badgeClass}`}>{currentEvent.badge}</span>
				<span class="truncate">{currentEvent.text}</span>
			</div>
		</div>
	{/if}
</section>

{#if selectedViewerMessage}
	<ViewerProfileModal
		viewer={selectedViewerMessage.viewer}
		fallbackName={selectedViewerMessage.user}
		fallbackHandle={selectedViewerMessage.handle ?? ''}
		fallbackAvatar={selectedViewerMessage.avatar}
		fallbackAvatarClass={selectedViewerMessage.avatarClass}
		fallbackAvatarUrl={selectedViewerMessage.avatarUrl}
		badges={profileBadges(selectedViewerMessage)}
		onClose={() => (selectedViewerMessage = null)}
	/>
{/if}
