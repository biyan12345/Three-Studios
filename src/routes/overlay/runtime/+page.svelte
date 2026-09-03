<script lang="ts">
	import { onMount } from "svelte";
	import BattlePkOverlaySurface from "$lib/components/battle-pk-overlay-surface.svelte";
	import BattlePkLineOverlaySurface from "$lib/components/battle-pk-line-overlay-surface.svelte";
	import PortraitCardOverlaySurface from "$lib/components/portrait-card-overlay-surface.svelte";
	import SceneRandomizerOverlaySurface from "$lib/components/scene-randomizer-overlay-surface.svelte";
	import SceneRankingOverlaySurface from "$lib/components/scene-ranking-overlay-surface.svelte";
	import SoloStageOverlaySurface from "$lib/components/solo-stage-overlay-surface.svelte";
	import { sceneRankingRowsForScene } from "$lib/scene-rankings";
	import type { SceneRankingRow } from "$lib/scene-rankings";
	import type { BattleState } from "$lib/app-types";
	import type { GroupPkState } from "$lib/app-types";
	import type {
		RuntimeOverlayState,
		SceneRandomizerRun,
		SceneRandomizerSettings,
	} from "$lib/app-types";
	import type { SoloStageState } from "$lib/app-types";
	import type { StickerDanceState } from "$lib/app-types";

	type RuntimeOverlayFeedPayload = {
		overlayState: RuntimeOverlayState;
		battleState: BattleState;
		stickerDanceState: StickerDanceState;
		groupPkState: GroupPkState;
		soloStageState: SoloStageState;
	};

	const DEFAULT_BATTLE_OVERLAY_FRAME = {
		x: 0.04,
		y: 0.08,
		width: 0.92,
		height: 0.22,
	};

	const DEFAULT_BATTLE_LINE_FRAME = {
		x: 0.496,
		y: 0.08,
		width: 0.008,
		height: 0.22,
	};

	const initialOverlayState: RuntimeOverlayState = {
		activeModeId: null,
		visible: false,
		frame: {
			x: 0.18,
			y: 0.14,
			width: 0.34,
			height: 0.56,
		},
		rankings: {
			enabled: false,
			frame: {
				x: 0.04,
				y: 0.5,
				width: 0.38,
				height: 0.24,
			},
			castNames: [],
			scores: [],
		},
		gifterBinding: {
			enabled: false,
		},
		sceneRandomizers: {
			items: {
				"lucky-wheel": {
					frame: { x: 0.24, y: 0.22, width: 0.52, height: 0.2925 },
					options: [""],
					resultHoldMs: 5000,
				},
			},
			activeRun: null,
		},
		customCode: {
			css: "",
		},
		version: 0,
		lastUpdatedAt: new Date().toISOString(),
	};

	let overlayState = initialOverlayState;
	let battleState: BattleState = {
		settings: {
			title: "1v1 PK",
			durationSeconds: 120,
			castNames: [],
			leftGifts: [],
			rightGifts: [],
			giftsByCast: {},
			overlayFrame: DEFAULT_BATTLE_OVERLAY_FRAME,
			lineFrame: DEFAULT_BATTLE_LINE_FRAME,
			lineStyle: "white",
			scoreEffect: "freeze",
			showBattlePkLineOverlaySurface: true,
		},
		phase: "idle",
		contestants: [],
		lineupOrder: [],
		totalVotes: 0,
		unallocatedVotes: 0,
		unallocatedGifts: [],
		collecting: false,
		startedAt: null,
		endsAt: null,
		lastUpdatedAt: new Date().toISOString(),
		eventText: "Add at least two cast members to start 1v1 PK.",
	};
	let soloStageState: SoloStageState = {
		settings: {
			title: "Solo Stage",
			durationSeconds: 120,
			castNames: [],
			roundCastNames: [],
			scoreMode: "target",
			targetA: 5000,
			targetB: 10000,
			visualEffect: "gold-crown",
		},
		phase: "idle",
		activeContestantIndex: 0,
		contestants: [],
		totalAmount: 0,
		totalGiftSenders: 0,
		collecting: false,
		startedAt: null,
		endsAt: null,
		lastUpdatedAt: new Date().toISOString(),
		eventText: "",
	};
	let stickerDanceState: StickerDanceState = {
		settings: {
			title: "Sticker Dance",
			castNames: [],
			roundCastNames: [],
			stickerByCast: {},
			visualEffect: "gift-blast",
		},
		phase: "idle",
		contestants: [],
		totalVotes: 0,
		unallocatedVotes: 0,
		unallocatedGifts: [],
		collecting: false,
		startedAt: null,
		lastUpdatedAt: new Date().toISOString(),
		eventText: "Configure the cast and gift grid, then start collecting.",
	};
	let groupPkState: GroupPkState = {
		settings: {
			title: "Group PK",
			durationSeconds: 120,
			castNames: [],
			roundCastNames: [],
			giftsByCast: {},
			visualEffect: "thunder",
		},
		phase: "idle",
		contestants: [],
		totalVotes: 0,
		unallocatedVotes: 0,
		unallocatedGifts: [],
		giftEvents: [],
		collecting: false,
		startedAt: null,
		endsAt: null,
		lastUpdatedAt: new Date().toISOString(),
		eventText: "Set the gift mappings, then start the round.",
	};
	let soloTimerNow = Date.now();
	let frameStyle = "";
	let runtimeFeedSource: EventSource | null = null;
	let runtimeFeedReconnectTimer: ReturnType<typeof setTimeout> | null = null;
	let runtimeSnapshotInFlight = false;
	let runtimeSnapshotRequestedAt = 0;
	let runtimeSnapshotAbort: AbortController | null = null;
	let runtimeReconnectAttempt = 0;
	let lastRuntimeFeedAt = 0;
	let activeSoloContestantState:
		| SoloStageState["contestants"][number]
		| null = null;
	let activeSoloContestantName = soloStageState.settings.title;
	let activeSoloContestantScore = 0;
	let activeSoloContestantScoreLabel = "0";
	let activeSoloScoreMode: "target" | "freedom" = "target";
	let activeSoloTargetScore: number | null = null;
	let activeSoloTargetScoreLabel: string | null = null;
	let soloProgressWidthPercent = 0;
	let soloColorTierName: "blue" | "purple" | "gold" = "blue";
	let battleOverlayStyle = "";
	let battleLineStyle = "";
	let sceneRankingRows: SceneRankingRow[] = [];
	let sceneRankingsStyle = "";
	let activeSceneRandomizerRun: SceneRandomizerRun | null = null;
	let activeSceneRandomizerSettings: SceneRandomizerSettings | null = null;
	let activeSceneRandomizerHoldMs = 0;
	let sceneRandomizerVisible = false;
	let sceneRandomizerStyle = "";
	let customStyleElement: HTMLStyleElement | null = null;

	$: frameStyle = [
		`left: ${(overlayState.frame.x * 100).toFixed(2)}%`,
		`top: ${(overlayState.frame.y * 100).toFixed(2)}%`,
		`width: ${(overlayState.frame.width * 100).toFixed(2)}%`,
		`height: ${(overlayState.frame.height * 100).toFixed(2)}%`,
	].join(";");
	$: activeSoloContestantState =
		soloStageState.contestants[soloStageState.activeContestantIndex] ??
		null;
	$: activeSoloContestantName =
		activeSoloContestantState?.name ?? soloStageState.settings.title;
	$: activeSoloContestantScore = activeSoloContestantState?.score ?? 0;
	$: activeSoloContestantScoreLabel =
		activeSoloContestantScore.toLocaleString();
	$: activeSoloScoreMode =
		soloStageState.settings.scoreMode === "freedom" ? "freedom" : "target";
	$: activeSoloTargetScore = nextSoloTargetScore(
		activeSoloContestantScore,
		soloStageState.settings.targetA,
		soloStageState.settings.targetB,
	);
	$: activeSoloTargetScoreLabel =
		activeSoloScoreMode === "target"
			? (activeSoloTargetScore?.toLocaleString() ?? null)
			: null;
	$: soloProgressWidthPercent = (() => {
		if (activeSoloScoreMode === "freedom") {
			return 0;
		}
		const target =
			activeSoloTargetScore ??
			Math.max(soloStageState.settings.targetB, 1);
		return Math.min((activeSoloContestantScore / target) * 100, 100);
	})();
	$: soloColorTierName =
		activeSoloContestantScore >= soloStageState.settings.targetB
			? "gold"
			: activeSoloContestantScore >= soloStageState.settings.targetA
				? "purple"
				: "blue";
	$: battleOverlayStyle = [
		`left: ${(battleState.settings.overlayFrame.x * 100).toFixed(2)}%`,
		`top: ${(battleState.settings.overlayFrame.y * 100).toFixed(2)}%`,
		`width: ${(battleState.settings.overlayFrame.width * 100).toFixed(2)}%`,
		`height: ${(battleState.settings.overlayFrame.height * 100).toFixed(2)}%`,
	].join(";");
	$: battleLineStyle = [
		`left: ${(battleState.settings.lineFrame.x * 100).toFixed(2)}%`,
		`top: ${(battleState.settings.lineFrame.y * 100).toFixed(2)}%`,
		`width: ${(battleState.settings.lineFrame.width * 100).toFixed(2)}%`,
		`height: ${(battleState.settings.lineFrame.height * 100).toFixed(2)}%`,
	].join(";");
	$: sceneRankingRows = sceneRankingRowsForScene({
		battleState,
		stickerDanceState,
		groupPkState,
		soloStageState,
		castNames: overlayState.rankings.castNames,
		scores: overlayState.rankings.scores,
	});
	$: sceneRankingsStyle = [
		`left: ${(overlayState.rankings.frame.x * 100).toFixed(2)}%`,
		`top: ${(overlayState.rankings.frame.y * 100).toFixed(2)}%`,
		`width: ${(overlayState.rankings.frame.width * 100).toFixed(2)}%`,
		`height: ${(overlayState.rankings.frame.height * 100).toFixed(2)}%`,
	].join(";");
	$: activeSceneRandomizerRun = overlayState.sceneRandomizers.activeRun;
	$: activeSceneRandomizerSettings = activeSceneRandomizerRun
		? (overlayState.sceneRandomizers.items[
				activeSceneRandomizerRun.randomizerId
			] ?? null)
		: null;
	$: activeSceneRandomizerHoldMs = Math.max(
		0,
		Number(
			activeSceneRandomizerRun?.resultHoldMs ??
				activeSceneRandomizerSettings?.resultHoldMs ??
				5000,
		) || 0,
	);
	$: sceneRandomizerVisible = Boolean(
		activeSceneRandomizerRun &&
			activeSceneRandomizerSettings &&
			soloTimerNow - Date.parse(activeSceneRandomizerRun.startedAt) <
				activeSceneRandomizerRun.durationMs +
					activeSceneRandomizerHoldMs,
	);
	$: sceneRandomizerStyle = activeSceneRandomizerSettings
		? [
				`left: ${(activeSceneRandomizerSettings.frame.x * 100).toFixed(2)}%`,
				`top: ${(activeSceneRandomizerSettings.frame.y * 100).toFixed(2)}%`,
				`width: ${(activeSceneRandomizerSettings.frame.width * 100).toFixed(2)}%`,
				`height: ${(activeSceneRandomizerSettings.frame.height * 100).toFixed(2)}%`,
			].join(";")
		: "";

	function setCustomOverlayCss(css = "") {
		if (typeof document === "undefined") {
			return;
		}

		if (!customStyleElement) {
			customStyleElement =
				(document.getElementById(
					"sp-overlay-custom-css",
				) as HTMLStyleElement | null) ??
				document.createElement("style");
			customStyleElement.id = "sp-overlay-custom-css";
			document.head.appendChild(customStyleElement);
		}

		customStyleElement.textContent = css;
	}

	$: setCustomOverlayCss(overlayState.customCode?.css ?? "");
	function nextSoloTargetScore(
		score: number,
		targetA: number,
		targetB: number,
	) {
		const firstTarget = Math.max(Math.floor(Number(targetA) || 0), 1);
		const secondTarget = Math.max(
			Math.floor(Number(targetB) || 0),
			firstTarget + 1,
		);

		if (score < firstTarget) {
			return firstTarget;
		}

		if (score < secondTarget) {
			return secondTarget;
		}

		return null;
	}

	function formatShortDuration(durationMs: number) {
		const totalSeconds = Math.floor(durationMs / 1000);
		const minutes = Math.floor(totalSeconds / 60);
		const seconds = totalSeconds % 60;
		return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
	}

	function soloRemainingMs(nowMs: number) {
		if (!soloStageState.endsAt) {
			return soloStageState.settings.durationSeconds * 1000;
		}

		const endMs = Date.parse(soloStageState.endsAt);
		return Number.isFinite(endMs) ? Math.max(endMs - nowMs, 0) : 0;
	}

	function groupPkRemainingMs(nowMs: number) {
		if (!groupPkState.endsAt) {
			return groupPkState.settings.durationSeconds * 1000;
		}

		const endMs = Date.parse(groupPkState.endsAt);
		return Number.isFinite(endMs) ? Math.max(endMs - nowMs, 0) : 0;
	}

	function battleRemainingMs(nowMs: number) {
		if (!battleState.endsAt) {
			return battleState.settings.durationSeconds * 1000;
		}

		const endMs = Date.parse(battleState.endsAt);
		return Number.isFinite(endMs) ? Math.max(endMs - nowMs, 0) : 0;
	}

	function normalizeRuntimeOverlayState(
		state: Partial<RuntimeOverlayState> | null | undefined,
	): RuntimeOverlayState {
		const fallbackRandomizer =
			initialOverlayState.sceneRandomizers.items["lucky-wheel"];
		const incomingRandomizer =
			state?.sceneRandomizers?.items?.["lucky-wheel"];
		const incomingOptions = Array.isArray(incomingRandomizer?.options)
			? incomingRandomizer.options.filter(
					(option) => typeof option === "string" && option.trim(),
				)
			: fallbackRandomizer.options;

		return {
			...initialOverlayState,
			...state,
			frame: {
				...initialOverlayState.frame,
				...(state?.frame ?? {}),
			},
			rankings: {
				...initialOverlayState.rankings,
				...(state?.rankings ?? {}),
				frame: {
					...initialOverlayState.rankings.frame,
					...(state?.rankings?.frame ?? {}),
				},
				castNames: Array.isArray(state?.rankings?.castNames)
					? state.rankings.castNames
					: [],
				scores: Array.isArray(state?.rankings?.scores)
					? state.rankings.scores
					: [],
			},
			gifterBinding: {
				...initialOverlayState.gifterBinding,
				...(state?.gifterBinding ?? {}),
			},
			sceneRandomizers: {
				items: {
					"lucky-wheel": {
						...fallbackRandomizer,
						...(incomingRandomizer ?? {}),
						frame: {
							...fallbackRandomizer.frame,
							...(incomingRandomizer?.frame ?? {}),
						},
						options: incomingOptions,
						resultHoldMs:
							typeof incomingRandomizer?.resultHoldMs === "number"
								? incomingRandomizer.resultHoldMs
								: fallbackRandomizer.resultHoldMs,
					},
				},
				activeRun: state?.sceneRandomizers?.activeRun ?? null,
			},
			customCode: {
				css:
					typeof state?.customCode?.css === "string"
						? state.customCode.css
						: "",
			},
			version:
				typeof state?.version === "number"
					? state.version
					: initialOverlayState.version,
			lastUpdatedAt:
				typeof state?.lastUpdatedAt === "string"
					? state.lastUpdatedAt
					: initialOverlayState.lastUpdatedAt,
		};
	}

	function applyRuntimeOverlayPayload(payload: RuntimeOverlayFeedPayload) {
		lastRuntimeFeedAt = Date.now();

		const nextOverlayState = normalizeRuntimeOverlayState(
			payload.overlayState,
		);

		if (
			nextOverlayState.version !== overlayState.version ||
			nextOverlayState.lastUpdatedAt !== overlayState.lastUpdatedAt
		) {
			overlayState = nextOverlayState;
		}

		if (payload.battleState) {
			battleState = payload.battleState;
		}

		if (payload.stickerDanceState) {
			stickerDanceState = payload.stickerDanceState;
		}

		if (payload.groupPkState) {
			groupPkState = payload.groupPkState;
		}

		if (payload.soloStageState) {
			soloStageState = payload.soloStageState;
		}
	}

	function overlayApiUrl(pathname: string) {
		return new URL(pathname, window.location.origin).toString();
	}

	async function syncRuntimeOverlaySnapshot() {
		if (
			runtimeSnapshotInFlight &&
			Date.now() - runtimeSnapshotRequestedAt > 1500
		) {
			runtimeSnapshotAbort?.abort();
			runtimeSnapshotAbort = null;
			runtimeSnapshotInFlight = false;
		}

		if (runtimeSnapshotInFlight) {
			return;
		}

		const abortController = new AbortController();
		const timeout = window.setTimeout(() => {
			abortController.abort();
		}, 900);

		runtimeSnapshotInFlight = true;
		runtimeSnapshotRequestedAt = Date.now();
		runtimeSnapshotAbort = abortController;

		try {
			const requestUrl = new URL(
				overlayApiUrl("/api/runtime-overlay/state"),
			);
			requestUrl.searchParams.set("t", String(Date.now()));
			const response = await fetch(requestUrl.toString(), {
				cache: "no-store",
				signal: abortController.signal,
				headers: {
					accept: "application/json",
				},
			});

			if (!response.ok) {
				return;
			}

			applyRuntimeOverlayPayload(
				(await response.json()) as RuntimeOverlayFeedPayload,
			);
		} catch {
			// Ignore transient overlay snapshot failures. Reconnect logic will retry.
		} finally {
			window.clearTimeout(timeout);
			runtimeSnapshotAbort = null;
			runtimeSnapshotInFlight = false;
		}
	}

	function clearRuntimeFeedReconnectTimer() {
		if (!runtimeFeedReconnectTimer) {
			return;
		}

		clearTimeout(runtimeFeedReconnectTimer);
		runtimeFeedReconnectTimer = null;
	}

	function closeRuntimeOverlayFeed() {
		runtimeFeedSource?.close();
		runtimeFeedSource = null;
	}

	function scheduleRuntimeOverlayReconnect() {
		if (runtimeFeedReconnectTimer) {
			return;
		}

		const attempt = runtimeReconnectAttempt + 1;
		const delayMs = Math.min(
			4000,
			500 * 2 ** Math.min(runtimeReconnectAttempt, 3),
		);
		runtimeReconnectAttempt = attempt;

		runtimeFeedReconnectTimer = setTimeout(() => {
			runtimeFeedReconnectTimer = null;
			void syncRuntimeOverlaySnapshot();
			openRuntimeOverlayFeed();
		}, delayMs);
	}

	function openRuntimeOverlayFeed() {
		closeRuntimeOverlayFeed();

		const feedSource = new EventSource(
			overlayApiUrl("/api/runtime-overlay/feed"),
		);
		runtimeFeedSource = feedSource;

		feedSource.onopen = () => {
			runtimeReconnectAttempt = 0;
			lastRuntimeFeedAt = Date.now();
			void syncRuntimeOverlaySnapshot();
		};

		feedSource.onmessage = (event) => {
			applyRuntimeOverlayPayload(
				JSON.parse(event.data) as RuntimeOverlayFeedPayload,
			);
		};

		feedSource.onerror = () => {
			closeRuntimeOverlayFeed();
			void syncRuntimeOverlaySnapshot();
			scheduleRuntimeOverlayReconnect();
		};
	}

	onMount(() => {
		lastRuntimeFeedAt = Date.now();
		void syncRuntimeOverlaySnapshot();
		openRuntimeOverlayFeed();
		const timer = setInterval(() => {
			soloTimerNow = Date.now();
			void syncRuntimeOverlaySnapshot();

			if (Date.now() - lastRuntimeFeedAt > 1500) {
				void syncRuntimeOverlaySnapshot();
				closeRuntimeOverlayFeed();
				openRuntimeOverlayFeed();
			}
		}, 250);

		return () => {
			clearRuntimeFeedReconnectTimer();
			closeRuntimeOverlayFeed();
			runtimeSnapshotAbort?.abort();
			runtimeSnapshotAbort = null;
			customStyleElement?.remove();
			customStyleElement = null;
			clearInterval(timer);
		};
	});
</script>

<svelte:head>
	<title>Runtime Overlay</title>
</svelte:head>

{#if (overlayState.visible && overlayState.activeModeId) || (overlayState.rankings.enabled && sceneRankingRows.length > 0) || sceneRandomizerVisible}
	<div id="sp-overlay-root" class="overlay-root" data-sp-overlay-root>
		<div id="sp-live-stage" class="live-stage" data-sp-overlay-stage>
			{#if overlayState.visible && overlayState.activeModeId === "battle-ladder"}
				<div
					id="sp-battle-frame"
					class="overlay-frame"
					style={battleOverlayStyle}
					data-sp-overlay-frame="battle-ladder"
				>
					<BattlePkOverlaySurface
						contestants={battleState.contestants}
						countdownLabel={formatShortDuration(
							battleRemainingMs(soloTimerNow),
						)}
						showCenterLine={false}
					/>
				</div>

				{#if (battleState.settings.lineStyle !== "none" || battleState.settings.scoreEffect !== "none") && battleState.settings.showBattlePkLineOverlaySurface}
					<div
						id="sp-battle-line-frame"
						class="overlay-frame"
						style={battleLineStyle}
						data-sp-overlay-frame="battle-ladder-line"
					>
						<BattlePkLineOverlaySurface
							contestants={battleState.contestants}
							phase={battleState.phase}
							lineFrame={battleState.settings.lineFrame}
							lineStyle={battleState.settings.lineStyle}
							scoreEffect={battleState.settings.scoreEffect}
						/>
					</div>
				{/if}
			{:else if overlayState.visible && overlayState.activeModeId}
				<div
					id={`sp-${overlayState.activeModeId}-frame`}
					class="overlay-frame"
					style={frameStyle}
					data-sp-overlay-frame={overlayState.activeModeId}
				>
					{#if overlayState.activeModeId === "group-sticker"}
						<PortraitCardOverlaySurface
							mode="group-sticker"
							stickerContestants={stickerDanceState.contestants}
							visualEffect={stickerDanceState.settings.visualEffect}
						/>
					{:else if overlayState.activeModeId === "group-pk"}
						<PortraitCardOverlaySurface
							mode="group-pk"
							groupPkContestants={groupPkState.contestants}
							countdownLabel={formatShortDuration(
								groupPkRemainingMs(soloTimerNow),
							)}
							visualEffect={groupPkState.settings.visualEffect}
						/>
					{:else if overlayState.activeModeId === "solo-target"}
						{#key soloStageState.lastUpdatedAt}
							<SoloStageOverlaySurface
								scoreMode={activeSoloScoreMode}
								contestantName={activeSoloContestantName}
								countdownLabel={formatShortDuration(
									soloRemainingMs(soloTimerNow),
								)}
								scoreLabel={activeSoloContestantScoreLabel}
								targetScoreLabel={activeSoloTargetScoreLabel}
								colorTier={soloColorTierName}
								progressPercent={soloProgressWidthPercent}
								visualEffect={soloStageState.settings.visualEffect}
							/>
						{/key}
					{:else}
						<div class="placeholder-shell">
							<div class="placeholder-tag">
								{overlayState.activeModeId}
							</div>
							<div class="placeholder-title">
								Runtime Overlay Active
							</div>
							<div class="placeholder-text">
								This mode is using the shared fullscreen OBS
								browser source. Placement is controlled from
								Studio.
							</div>
						</div>
					{/if}
				</div>
			{/if}

			{#if overlayState.rankings.enabled && sceneRankingRows.length > 0}
				<div
					id="sp-scene-ranking-frame"
					class="overlay-frame"
					style={sceneRankingsStyle}
					data-sp-overlay-frame="scene-ranking"
				>
					<SceneRankingOverlaySurface rows={sceneRankingRows} />
				</div>
			{/if}

			{#if sceneRandomizerVisible && activeSceneRandomizerRun && activeSceneRandomizerSettings}
				<div
					id={`sp-${activeSceneRandomizerRun.randomizerId}-frame`}
					class="overlay-frame"
					style={sceneRandomizerStyle}
					data-sp-overlay-frame={activeSceneRandomizerRun.randomizerId}
				>
					<SceneRandomizerOverlaySurface
						randomizerId={activeSceneRandomizerRun.randomizerId}
						options={activeSceneRandomizerSettings.options}
						run={activeSceneRandomizerRun}
					/>
				</div>
			{/if}
		</div>
	</div>
{/if}

<style>
	:global(html, body) {
		margin: 0;
		width: 100%;
		height: 100%;
		overflow: hidden;
		background: transparent !important;
		background-color: transparent !important;
		background-image: none !important;
	}

	.overlay-root {
		position: relative;
		width: 100vw;
		height: 100vh;
		background: transparent;
		font-family: "IBM Plex Sans", sans-serif;
		pointer-events: none;
		overflow: hidden;
	}

	.live-stage {
		position: relative;
		width: 100%;
		height: 100%;
	}

	.overlay-frame {
		position: absolute;
		box-sizing: border-box;
	}

	.placeholder-shell {
		width: 100%;
		height: 100%;
		display: grid;
		place-items: center;
	}

	.placeholder-tag {
		border: 1px solid rgba(255, 255, 255, 0.16);
		background: rgba(8, 13, 18, 0.88);
		padding: 0.55rem 1rem;
		border-radius: 999px;
		color: #f3f6fb;
		font-size: clamp(0.95rem, 1.2vw, 1.25rem);
		font-weight: 700;
		letter-spacing: 0.02em;
		backdrop-filter: blur(12px);
	}

	.placeholder-title {
		font-size: clamp(1.1rem, 1.5vw, 1.5rem);
		font-weight: 700;
		color: white;
		text-align: center;
	}

	.placeholder-text {
		max-width: 28rem;
		text-align: center;
		font-size: clamp(0.85rem, 1vw, 1rem);
		line-height: 1.5;
		color: rgba(203, 213, 225, 0.92);
	}
</style>
