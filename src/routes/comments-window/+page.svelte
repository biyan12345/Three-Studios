	<script lang="ts">
	import { browser } from '$app/environment';
	import { onMount } from 'svelte';
	import ExtendedChatFeed from '$lib/components/extended-chat-feed.svelte';
	import {
		createEmptyLiveSidebarSnapshot,
		type LiveSidebarSnapshot
	} from '$lib/app-types';

	const APP_DISPLAY_NAME = 'Streamplay Studio';
	const COMMENTS_WINDOW_OPACITY_KEY = 'streamplay-studio-comments-window-opacity';
	const LEGACY_COMMENTS_WINDOW_OPACITY_KEY = 'streamplay-comments-window-opacity';
	const COMMENTS_WINDOW_TEXT_SCALE_KEY = 'streamplay-studio-comments-window-text-scale';
	const LEGACY_COMMENTS_WINDOW_TEXT_SCALE_KEY = 'streamplay-comments-window-text-scale';
	const COMMENTS_SNAPSHOT_MESSAGE_TYPE = 'streamplay-studio-browser-comments-snapshot';
	const LEGACY_COMMENTS_SNAPSHOT_MESSAGE_TYPE = 'streamplay-browser-comments-snapshot';
	const COMMENTS_REQUEST_SNAPSHOT_MESSAGE_TYPE =
		'streamplay-studio-browser-comments-request-snapshot';

	let snapshot: LiveSidebarSnapshot = createEmptyLiveSidebarSnapshot();
	let isDesktop = false;
	let desktopPlatform = '';
	let showDesktopHeader = false;
	let opacityPercent = 100;
	let textScalePercent = 100;
	let desktopAppearanceOpen = false;

	function clampOpacityPercent(value: number) {
		return Math.min(100, Math.max(10, Math.round(value)));
	}

	function nativeWindowOpacity(percent: number) {
		const ratio = clampOpacityPercent(percent) / 100;
		return 0.58 + ratio * 0.42;
	}

	function clampTextScalePercent(value: number) {
		return Math.min(200, Math.max(80, Math.round(value)));
	}

	$: clampedOpacityPercent = clampOpacityPercent(opacityPercent);
	$: clampedTextScalePercent = clampTextScalePercent(textScalePercent);
	$: shellOpacityRatio = clampedOpacityPercent / 100;
	$: shellStartAlpha = (0.08 + shellOpacityRatio * 0.84).toFixed(3);
	$: shellEndAlpha = (0.05 + shellOpacityRatio * 0.76).toFixed(3);
	$: dragStripBgAlpha = (0.08 + shellOpacityRatio * 0.78).toFixed(3);
	$: dragStripBorderAlpha = (0.04 + shellOpacityRatio * 0.08).toFixed(3);
	$: headerPopoverBgAlpha = (0.18 + shellOpacityRatio * 0.72).toFixed(3);
	$: windowShellStyle = `background:
		radial-gradient(circle at top left, rgba(255, 255, 255, ${(0.03 + shellOpacityRatio * 0.08).toFixed(3)}), transparent 32%),
		radial-gradient(circle at 82% 14%, rgba(129, 189, 255, ${(0.02 + shellOpacityRatio * 0.06).toFixed(3)}), transparent 26%),
		linear-gradient(180deg, rgba(7, 16, 21, ${shellStartAlpha}), rgba(7, 16, 21, ${shellEndAlpha}));`;

	onMount(() => {
		document.title = `${APP_DISPLAY_NAME} | Comments Window`;
		if (!browser) {
			return () => {};
		}

		isDesktop = Boolean(window.threeStudioDesktop?.isDesktop);
		desktopPlatform = window.threeStudioDesktop?.platform ?? '';
		showDesktopHeader = isDesktop;

		try {
			const storedOpacity =
				window.localStorage.getItem(COMMENTS_WINDOW_OPACITY_KEY) ||
				window.localStorage.getItem(LEGACY_COMMENTS_WINDOW_OPACITY_KEY);
			if (storedOpacity) {
				const parsed = Number(storedOpacity);
				if (Number.isFinite(parsed)) {
					opacityPercent = clampOpacityPercent(parsed);
				}
			}

			const storedTextScale =
				window.localStorage.getItem(COMMENTS_WINDOW_TEXT_SCALE_KEY) ||
				window.localStorage.getItem(LEGACY_COMMENTS_WINDOW_TEXT_SCALE_KEY);
			if (storedTextScale) {
				const parsed = Number(storedTextScale);
				if (Number.isFinite(parsed)) {
					textScalePercent = clampTextScalePercent(parsed);
				}
			}
		} catch {}

		document.documentElement.style.background = 'transparent';
		document.body.style.background = 'transparent';

		const unsubscribe =
			window.threeStudioDesktop?.onCommentsSnapshot((nextSnapshot) => {
				snapshot = nextSnapshot as LiveSidebarSnapshot;
			}) ?? (() => {});

		void window.threeStudioDesktop?.getCommentsSnapshot().then((nextSnapshot) => {
			if (nextSnapshot) {
				snapshot = nextSnapshot as LiveSidebarSnapshot;
			}
		});

		const handleBrowserMessage = (event: MessageEvent) => {
			if (event.origin !== window.location.origin) {
				return;
			}

			if (
				(event.data?.type !== COMMENTS_SNAPSHOT_MESSAGE_TYPE &&
					event.data?.type !== LEGACY_COMMENTS_SNAPSHOT_MESSAGE_TYPE) ||
				!event.data?.snapshot
			) {
				return;
			}

			snapshot = event.data.snapshot as LiveSidebarSnapshot;
		};

		window.addEventListener('message', handleBrowserMessage);

		if (!window.threeStudioDesktop?.isDesktop) {
			try {
				window.opener?.postMessage(
					{ type: COMMENTS_REQUEST_SNAPSHOT_MESSAGE_TYPE },
					window.location.origin
				);
			} catch {}
		}

		return () => {
			window.removeEventListener('message', handleBrowserMessage);
			unsubscribe();
		};
	});

	$: if (browser) {
		try {
			window.localStorage.setItem(COMMENTS_WINDOW_OPACITY_KEY, String(clampedOpacityPercent));
			window.localStorage.setItem(
				COMMENTS_WINDOW_TEXT_SCALE_KEY,
				String(clampedTextScalePercent)
			);
		} catch {}
	}

	$: if (browser && isDesktop && desktopPlatform === 'win32') {
		void window.threeStudioDesktop?.setCommentsWindowOpacity(
			nativeWindowOpacity(clampedOpacityPercent)
		);
	}
</script>

<svelte:head>
	<title>{APP_DISPLAY_NAME} | Comments Window</title>
	<meta
		name="description"
		content="Detached live comments and engagement sidebar for performers."
	/>
</svelte:head>

<div class="h-screen overflow-hidden bg-transparent text-white">
	<div class="flex h-full flex-col overflow-hidden backdrop-blur-[34px] backdrop-saturate-[1.6]" style={windowShellStyle}>
		{#if showDesktopHeader}
			<div
				class={`relative shrink-0 border-b px-4 py-3 ${
					desktopPlatform === 'darwin'
						? 'pl-[92px] pr-4'
						: desktopPlatform === 'win32'
							? 'pl-4 pr-[152px]'
							: ''
				}`}
				style={`background: rgba(7, 16, 21, ${dragStripBgAlpha}); border-color: rgba(255, 255, 255, ${dragStripBorderAlpha}); -webkit-app-region: drag;`}
			>
				<div class="flex items-center justify-between gap-3">
					<div class="text-[11px] uppercase tracking-[0.2em] text-white/55">
						{APP_DISPLAY_NAME} Comments
					</div>
					<button
						class="grid h-8 w-8 place-items-center rounded-[10px] border text-slate-300 transition hover:bg-white/[0.06] hover:text-white"
						style={`background: rgba(255, 255, 255, 0.045); border-color: rgba(255, 255, 255, ${dragStripBorderAlpha}); -webkit-app-region: no-drag;`}
						on:click={() => {
							desktopAppearanceOpen = !desktopAppearanceOpen;
						}}
						aria-label="Window appearance"
						title="Window appearance"
					>
						<svg viewBox="0 0 16 16" class="h-4 w-4 fill-none stroke-current stroke-[1.4]">
							<path d="M8 2.4 9 1.8l1.3.8 1.2-.2.6 1.2 1 .7-.1 1.4.7 1-.7 1 .1 1.4-1 .7-.6 1.2-1.2-.2-1.3.8-1-.6-1 .6-1.3-.8-1.2.2-.6-1.2-1-.7.1-1.4-.7-1 .7-1-.1-1.4 1-.7.6-1.2 1.2.2 1.3-.8 1 .6Z" />
							<circle cx="8" cy="8" r="2.1" />
						</svg>
					</button>
				</div>

				{#if desktopAppearanceOpen}
					<div
						class={`absolute top-[calc(100%-2px)] z-20 mt-3 w-64 rounded-[14px] border p-3 shadow-[0_20px_40px_rgba(0,0,0,0.32)] backdrop-blur-2xl ${
							desktopPlatform === 'win32' ? 'right-[152px]' : 'right-4'
						}`}
						style={`background: rgba(12, 18, 24, ${headerPopoverBgAlpha}); border-color: rgba(255, 255, 255, ${dragStripBorderAlpha}); -webkit-app-region: no-drag;`}
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
						<div
							class="mt-3 rounded-[10px] border px-3 py-2 text-[11px] leading-5 text-slate-400"
							style={`background: rgba(255, 255, 255, 0.035); border-color: rgba(255, 255, 255, ${dragStripBorderAlpha});`}
						>
							Frosted look stays on. Text size scales from 80% to 200%.
						</div>
					</div>
				{/if}
			</div>
		{/if}
		<div class="min-h-0 flex-1 overflow-hidden">
			<ExtendedChatFeed
				performance={snapshot.performance}
				messages={snapshot.allMessages}
				currentEvent={snapshot.currentEvent}
				activeLiveUniqueId={snapshot.activeLiveUniqueId}
				floatingWindow={true}
				bind:opacityPercent={opacityPercent}
				bind:textScalePercent={textScalePercent}
				showAppearanceControl={!isDesktop}
			/>
		</div>
	</div>
</div>
