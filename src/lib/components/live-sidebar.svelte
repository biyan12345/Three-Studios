<script lang="ts">
	import { tick } from 'svelte';
	import type {
		ChatRow,
		EventRow,
		GiftRow,
		LiveMetricRow
	} from '$lib/app-types';
	import { messageSegments } from '$lib/studio/chat-message-segments';
	import LiveMetricStrip from '$lib/components/live-metric-strip.svelte';
	import ViewerProfileModal from '$lib/components/viewer-profile-modal.svelte';

	export let gifts: GiftRow[] = [];
	export let chat: ChatRow[] = [];
	export let currentEvent: EventRow | null = null;
	export let performance: LiveMetricRow[] = [];
	export let floatingWindow = false;
	export let title = '';
	export let onOpenCommentsWindow: (() => void) | undefined = undefined;

	let chatContainer: HTMLDivElement | null = null;
	let chatEndMarker: HTMLDivElement | null = null;
	let lastChatSignature = '';
	let selectedViewerMessage: ChatRow | GiftRow | null = null;

	function profileBadges(message: ChatRow | GiftRow) {
		if (!('badge' in message)) return [];
		return [
			...(message.badge && message.badgeClass
				? [{ label: message.badge, class: message.badgeClass }]
				: []),
			...(message.extraBadges ?? [])
		];
	}

	$: {
		const first = chat[0];
		const last = chat[chat.length - 1];
		const nextChatSignature = first || last
			? `${chat.length}:${first?.user ?? ''}:${first?.text ?? ''}:${last?.user ?? ''}:${last?.text ?? ''}`
			: '';

		if (chatContainer && nextChatSignature !== lastChatSignature) {
			lastChatSignature = nextChatSignature;
			void tick().then(() => {
				if (chatContainer) {
					chatContainer.scrollTop = chatContainer.scrollHeight;
					chatEndMarker?.scrollIntoView({ block: 'end' });
				}
			});
		}
	}

</script>

<aside class="grid h-full min-h-0 grid-rows-[minmax(0,1fr)] overflow-hidden pl-1">
	<section
		class={`flex min-h-0 flex-col overflow-hidden ${
			floatingWindow
				? 'bg-[linear-gradient(180deg,rgba(7,16,21,0.02),rgba(7,16,21,0.004))] backdrop-blur-md px-3 py-3'
				: 'glass-soft rounded-[14px] p-4'
		}`}
	>
		{#if title || onOpenCommentsWindow}
			<div class="mb-3 flex items-center justify-between gap-3">
				<div class="text-[11px] uppercase tracking-[0.16em] text-slate-500">{title}</div>
				{#if onOpenCommentsWindow}
					<button
						class="grid h-8 w-8 place-items-center rounded-[10px] border border-white/8 bg-white/[0.03] text-slate-300 transition hover:bg-white/[0.06] hover:text-white"
						on:click={onOpenCommentsWindow}
						aria-label="Open comments window"
						title="Open comments window"
					>
						<svg viewBox="0 0 16 16" class="h-4 w-4 fill-none stroke-current stroke-[1.4]">
							<rect x="2.5" y="3" width="8.2" height="8.2" rx="1.4" />
							<path d="M8.8 2.5h4.7v4.7" />
							<path d="M13.5 2.5 8.6 7.4" />
						</svg>
					</button>
				{/if}
			</div>
		{/if}
		{#if performance.length > 0}
			<LiveMetricStrip metrics={performance} />
		{/if}
		<div class={`grid min-h-0 flex-1 overflow-hidden ${currentEvent ? 'grid-rows-[auto_minmax(0,1fr)_auto] gap-3' : 'grid-rows-[auto_minmax(0,1fr)] gap-3'}`}>
			<div class="space-y-2">
				{#if gifts.length > 0}
					{#each gifts as message}
						<div class={`rounded-[10px] border px-2 py-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] ${
							floatingWindow
								? 'border-white/6 bg-white/[0.012]'
								: 'border-white/8 bg-[#232930]'
						} ${message.rowClass}`}>
							<div class="flex items-center gap-1.5">
								<button type="button" class="shrink-0 rounded-full transition hover:ring-2 hover:ring-cyan-300/50 focus:outline-none focus:ring-2 focus:ring-cyan-300/60" on:click={() => (selectedViewerMessage = message)} aria-label={`View ${message.user}'s profile`} title={`View ${message.user}'s profile`}>
									{#if message.avatarUrl}<img src={message.avatarUrl} alt={message.user} class="h-6 w-6 rounded-full object-cover" />{:else}<span class={`grid h-6 w-6 place-items-center rounded-full text-[8px] font-semibold text-white ${message.avatarClass}`}>{message.avatar}</span>{/if}
								</button>
								<div class="min-w-0 flex-1">
									<p class={`flex min-w-0 items-center gap-1 text-[11px] leading-4 ${message.accent}`}>
										<span class="max-w-[74px] truncate font-semibold text-white">{message.user}</span>
										<span class="min-w-0 flex-1 truncate text-slate-400">{message.text}</span>
										{#if message.imageUrl}
											<img
												src={message.imageUrl}
												alt={message.text}
												class="h-4 w-4 shrink-0 rounded-[3px] object-contain"
											/>
										{:else}
											<span class="shrink-0 text-[12px]">{message.icon}</span>
										{/if}
										<span class="shrink-0 font-semibold text-white">{message.count}</span>
									</p>
								</div>
							</div>
						</div>
					{/each}
				{/if}
			</div>

			<div class={`min-h-0 overflow-hidden pt-2 ${floatingWindow ? 'border-t border-white/5' : 'border-t border-white/8'}`}>
				<div
					bind:this={chatContainer}
					class="flex h-full min-h-0 flex-col gap-2 overflow-y-scroll pr-1"
					style="scrollbar-gutter: stable; overscroll-behavior: contain;"
				>
					{#each chat as message}
						<div class="rounded-[12px] bg-transparent px-0.5 py-0.5">
							<div class="flex items-start gap-2">
								<button type="button" class="shrink-0 rounded-full transition hover:ring-2 hover:ring-cyan-300/50 focus:outline-none focus:ring-2 focus:ring-cyan-300/60" on:click={() => (selectedViewerMessage = message)} aria-label={`View ${message.user}'s profile`} title={`View ${message.user}'s profile`}>
									{#if message.avatarUrl}
										<img src={message.avatarUrl} alt={message.user} class="h-6 w-6 rounded-full object-cover" />
									{:else}
										<span class={`grid h-6 w-6 place-items-center rounded-full text-[8px] font-semibold text-white ${message.avatarClass}`}>{message.avatar}</span>
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
											<span class="font-medium text-slate-300">{message.user}</span>
										</div>
									<p class="text-xs leading-4 text-slate-100">
										{#each messageSegments(message.text, message.emotes) as segment, index (`${message.user}-${index}-${segment.type === 'text' ? segment.value : segment.token}`)}
											{#if segment.type === 'text'}
												<span class="whitespace-pre-wrap break-words">{segment.value}</span>
											{:else if segment.imageUrl}
												<img
													src={segment.imageUrl}
													alt={segment.token}
													title={segment.token}
													class="mx-[1px] inline-block h-4 w-4 align-[-0.2em] object-contain"
												/>
											{:else if segment.fallback}
												<span
													class="mx-[1px] inline-block align-[-0.1em] text-[14px]"
													title={segment.token}
												>
													{segment.fallback}
												</span>
											{/if}
										{/each}
									</p>
								</div>
							</div>
						</div>
					{/each}
					<div bind:this={chatEndMarker} class="h-px w-full shrink-0"></div>
				</div>
			</div>

			{#if currentEvent}
				<div class={`min-h-[38px] pt-2 ${floatingWindow ? 'border-t border-white/5' : 'border-t border-white/8'}`}>
					{#if currentEvent}
						<div class={`flex min-h-[28px] items-center gap-2 overflow-hidden rounded-[10px] px-2 py-1 text-xs text-slate-300 ${
							floatingWindow ? 'bg-white/[0.01]' : 'bg-white/[0.03]'
						}`}>
							<span class={`shrink-0 rounded-full px-1.5 py-0.5 ${currentEvent.badgeClass}`}>{currentEvent.badge}</span>
							<span class="truncate">{currentEvent.text}</span>
						</div>
					{/if}
				</div>
			{/if}
		</div>
	</section>
</aside>

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
