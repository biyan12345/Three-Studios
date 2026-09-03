<script lang="ts">
	import { browser } from "$app/environment";
	import { onMount, tick } from "svelte";
	import { fly } from "svelte/transition";
	import { GIFT_ARRIVAL_BUFFER_MS } from "$lib/game-timing";
	import { normalizeTikTokUsername } from "$lib/helpers";
	import {
		ApiError,
		getStudioBootstrapRequest,
		getScoreHistoryRequest,
		initializeAuthSession,
		logoutFromAuthSession,
		refreshAuthSession,
		requestProtectedResponse,
		saveLiveSessionHistoryRequest,
	} from "$lib/client/studio-api";
	import {
		readLocalProfileGameSettings,
		upsertLocalProfileGameSetting,
		writeLocalProfileGameSettings,
		writeLocalStudioCasts,
	} from "$lib/client/studio-local-data";
	import BattlePkLineOverlaySurface from "$lib/components/battle-pk-line-overlay-surface.svelte";
	import BattlePkOverlaySurface from "$lib/components/battle-pk-overlay-surface.svelte";
	import LiveSidebar from "$lib/components/live-sidebar.svelte";
	import StudioEndLiveDialog from "$lib/components/studio-end-live-dialog.svelte";
	import StudioCastSelection from "$lib/components/studio-cast-selection.svelte";
	import StudioGiftAllocationDialog from "$lib/components/studio-gift-allocation-dialog.svelte";
	import StudioLiveSummaryDialog from "$lib/components/studio-live-summary-dialog.svelte";
	import StudioPanelResizer from "$lib/components/studio-panel-resizer.svelte";
	import StudioScoreCorrectionDialog from "$lib/components/studio-score-correction-dialog.svelte";
	import StudioToastStack from "$lib/components/studio-toast-stack.svelte";
	import ViewerProfileModal from "$lib/components/viewer-profile-modal.svelte";
	import PortraitCardOverlaySurface from "$lib/components/portrait-card-overlay-surface.svelte";
	import SceneRandomizerOverlaySurface from "$lib/components/scene-randomizer-overlay-surface.svelte";
	import SceneRankingOverlaySurface from "$lib/components/scene-ranking-overlay-surface.svelte";
	import SoloStageOverlaySurface from "$lib/components/solo-stage-overlay-surface.svelte";
	import { sceneRankingRowsForScene } from "$lib/scene-rankings";
	import type { SceneRankingRow } from "$lib/scene-rankings";
	import {
		giftCatalogDefaultId,
		giftCatalogDisplayName,
		giftCatalogEntries,
		giftCatalogImageUrl,
		giftCatalogMatchKey,
		giftCatalogStoredId,
		loadGiftCatalog,
		resolveGiftCatalogEntry as resolveGiftCatalogLookup,
		useGiftCatalog,
	} from "$lib/gift-catalog";
	import type { GiftCatalogEntry } from "$lib/gift-catalog";
	import { sanitizeCastNameList } from "$lib/helpers";
	import {
		rankGifters,
		rankGiftersByCast,
		type GifterRankingCandidate,
		type GifterRankingGroup,
		type GifterRankingRow,
	} from "$lib/studio/gifter-rankings";
	import {
		giftBackendEventId,
		giftEventKey,
		initials,
		liveGiftGifterKey,
		mapChat,
		mapChatFeedMessage,
		mapGift,
		mapGiftEvent,
		mapGiftFeedMessage,
		mapLike,
		mapLikeFeedMessage,
		mapSocial,
		mapSocialFeedMessage,
		mapStatusEvent,
		mapStatusFeedMessage,
		normalizeGiftCount,
		normalizeUniqueId,
		resolveGiftCoins,
		type LiveGiftAllocation,
	} from "$lib/studio/live-feed";
	import {
		hasFinalLiveModeScores,
		hasFinalLiveScoreSummary,
		type FinalLiveCastScores,
		type FinalLiveScoreRow,
	} from "$lib/studio/session-summary";
	import {
		loadStudioCasts,
		setStudioCasts,
		studioCastNames,
		studioCastsState,
		studioCasts,
	} from "$lib/stores/studio-casts";
	import type {
		PersistedAuthSession,
		ProfileGameSettingsResponse,
		LiveSessionGameHistory,
		LiveSessionGiftHistory,
		NewLiveSessionHistoryEntry,
		ScoreHistoryResponse,
	} from "$lib/app-types";
	import type {
		BattleCommand,
		BattleContestant,
		BattleLineStyle,
		BattleScoreEffect,
		BattleSettings,
		BattleSide,
		BattleState,
		PkVisualEffect,
	} from "$lib/app-types";
	import type {
		AllMessageRow,
		ChatRow,
		EventRow,
		GiftRow,
		LiveMetricRow,
	} from "$lib/app-types";
	import type { LiveErrorKind, LiveFeedEvent } from "$lib/app-types";
	import type {
		GroupPkCommand,
		GroupPkContestant,
		GroupPkGiftMap,
		GroupPkState,
	} from "$lib/app-types";
	import type {
		RuntimeOverlayCommand,
		RuntimeOverlayCustomCodeSettings,
		RuntimeOverlayFrame,
		RuntimeOverlayState,
		SceneRandomizerId,
		SceneRandomizerRun,
		SceneRandomizerSettings,
		SceneRandomizersState,
		SceneRankingScore,
		SceneRankingsSettings,
	} from "$lib/app-types";
	import type {
		SoloStageCommand,
		SoloStageScoreMode,
		SoloStageSettings,
		SoloStageState,
	} from "$lib/app-types";
	import type {
		StickerDanceCommand,
		StickerDanceContestant,
		StickerDanceState,
		StickerDanceStickerMap,
	} from "$lib/app-types";
	import type {
		StudioBootstrap,
		StudioCast,
		StudioProfile,
	} from "$lib/app-types";
	import ProfileBorderSettings from "$lib/components/profile-border-settings.svelte";

	type ModeId =
		| "solo-target"
		| "group-sticker"
		| "group-pk"
		| "battle-ladder";
	type ModeDefinition = {
		id: ModeId;
		label: string;
	};

	type StudioStateFeedPayload = {
		runtimeOverlayState: RuntimeOverlayState;
		battleState: BattleState;
		stickerDanceState: StickerDanceState;
		groupPkState: GroupPkState;
		soloStageState: SoloStageState;
	};

	const APP_DISPLAY_NAME = "Streamplay Studio";
	const APP_VERSION = "2.5.1";
	const BATTLE_GAME_KEY = "battle-ladder";
	const STICKER_DANCE_GAME_KEY = "sticker-dance";
	const GROUP_PK_GAME_KEY = "group-pk";
	const SOLO_STAGE_GAME_KEY = "solo-stage";
	const SCENE_RANKINGS_KEY = "scene-rankings";
	const GIFTER_BINDING_KEY = "gifter-binding";
	const SCENE_RANDOMIZERS_KEY = "scene-randomizers";
	const OVERLAY_CUSTOM_CODE_KEY = "overlay-custom-code";
	const PACKAGED_DESKTOP_OVERLAY_RUNTIME_URL =
		"http://127.0.0.1:38888/overlay/runtime";
	const sceneRandomizerIds: SceneRandomizerId[] = ["lucky-wheel"];
	const sceneRandomizerDefinitions: Array<{
		id: SceneRandomizerId;
		label: string;
		description: string;
	}> = [
		{
			id: "lucky-wheel",
			label: "Lucky Wheel",
			description: "Spin one option",
		},
	];
	const COMMENTS_WINDOW_NAME = "streamplay-studio-comments-window";
	const COMMENTS_SNAPSHOT_MESSAGE_TYPE =
		"streamplay-studio-browser-comments-snapshot";
	const COMMENTS_REQUEST_SNAPSHOT_MESSAGE_TYPE =
		"streamplay-studio-browser-comments-request-snapshot";
	const LEGACY_COMMENTS_REQUEST_SNAPSHOT_MESSAGE_TYPE =
		"streamplay-browser-comments-request-snapshot";
	const modes: ModeDefinition[] = [
		{ id: "group-sticker", label: "Group Sticker" },
		{ id: "group-pk", label: "Group PK" },
		{ id: "battle-ladder", label: "1v1 PK" },
		{ id: "solo-target", label: "Solo Stage" },
	];

	const pkVisualEffectOptions: { value: PkVisualEffect; label: string }[] = [
		{ value: "freeze", label: "Freeze" },
		{ value: "fire", label: "Fire" },
		{ value: "thunder", label: "Thunder" },
		{ value: "gold-crown", label: "Gold Crown" },
		{ value: "gift-blast", label: "Gift Blast" },
	];
	const enabledModeIds: ModeId[] = [
		"group-sticker",
		"group-pk",
		"battle-ladder",
		"solo-target",
	];
	const scenes = ["Camera"];

	const MIN_LEFT_PANEL = 260;
	const MIN_CENTER_PANEL = 640;
	const MIN_RIGHT_PANEL = 320;
	const MIN_OVERLAY_FRAME_SIZE = 0.16;
	const MIN_BATTLE_OVERLAY_FRAME_WIDTH = 0.32;
	const MIN_BATTLE_OVERLAY_FRAME_HEIGHT = 0.1;
	const MIN_BATTLE_LINE_FRAME_WIDTH = 0.004;
	const MAX_BATTLE_LINE_FRAME_WIDTH = 0.12;
	const MIN_BATTLE_LINE_FRAME_HEIGHT = 0.12;
	const MAX_SEEN_GIFT_EVENT_IDS = 5000;
	const OBS_CONNECT_MAX_ATTEMPTS = 5;
	const LIVE_RECONNECT_MAX_ATTEMPTS = 6;
	const LIVE_FEED_STALE_MS = 20000;
	const LIVE_FEED_HEARTBEAT_EVENT = "heartbeat";
	const DEFAULT_DESKTOP_UPDATE_STATE: DesktopUpdateState = {
		status: "idle",
		message: "Ready to check for updates.",
		currentVersion: APP_VERSION,
		availableVersion: null,
		downloadPercent: null,
		canCheck: false,
		canInstall: false,
	};

	type ToastMessage = {
		id: string;
		message: string;
		tone: "error" | "info";
	};

	type GiftEventSeen = {
		lastSeenAt: number;
	};

	type LiveGiftSessionStats = {
		totalGiftCount: number;
		totalCapturedCoins: number;
		allocatedCoins: number;
		unallocatedCoins: number;
		endedAt: string | null;
	};

	//profile border settings
	let profileBorderSettingsOpen = false;

	function openProfileBorderSettings() {
		profileBorderSettingsOpen = true;

		modesSettingsOpen = false;
		cameraSettingsOpen = false;
		studioSettingsOpen = false;
		profileMenuOpen = false;

		closeSceneRankingsSettings();
		closeSceneRandomizerSettings();
	}

	function closeProfileBorderSettings() {
		profileBorderSettingsOpen = false;
	}

	//gift stickers

	let giftsCatalog: GiftCatalogEntry[] = giftCatalogEntries();
	const DEFAULT_BATTLE_GIFTS_PER_SIDE = 3;
	const MAX_BATTLE_STICKERS = 9;

	const MAX_GROUP_PK_GIFTS_PER_CAST = 3;

	function defaultStickerDanceGiftName(index: number) {
		return (
			giftCatalogDefaultId(index) ||
			giftsCatalog[index % giftsCatalog.length]?.giftId ||
			giftsCatalog[0]?.giftId ||
			""
		);
	}

	function defaultGroupPkGiftNames(index: number) {
		return Array.from(
			{ length: MAX_GROUP_PK_GIFTS_PER_CAST },
			(_, slotIndex) =>
				defaultStickerDanceGiftName(
					index * MAX_GROUP_PK_GIFTS_PER_CAST + slotIndex,
				),
		);
	}

	function defaultBattleGiftNames(sideIndex: number) {
		return Array.from(
			{ length: DEFAULT_BATTLE_GIFTS_PER_SIDE },
			(_, slotIndex) =>
				defaultStickerDanceGiftName(
					sideIndex * DEFAULT_BATTLE_GIFTS_PER_SIDE + slotIndex,
				),
		);
	}

	function buildInitialStickerDanceGiftMap(castNames: string[]) {
		return Object.fromEntries(
			castNames.map((name, index) => [
				name,
				defaultStickerDanceGiftName(index),
			]),
		) as StickerDanceStickerMap;
	}

	function buildInitialGroupPkGiftMap(castNames: string[]) {
		return Object.fromEntries(
			castNames.map((name, index) => [
				name,
				defaultGroupPkGiftNames(index),
			]),
		) as GroupPkGiftMap;
	}

	function buildInitialBattleGiftMap(castNames: string[]) {
		return Object.fromEntries(
			castNames.map((name, index) => [
				name,
				defaultBattleGiftNames(index),
			]),
		) as Record<string, string[]>;
	}

	function filterBattleCastSelection(
		requestedNames: string[],
		availableNames: string[] = [],
	) {
		const normalizedAvailableNames = sanitizeCastNameList(availableNames);
		const normalizedRequestedNames = sanitizeCastNameList(requestedNames);

		if (normalizedAvailableNames.length === 0) {
			return normalizedRequestedNames;
		}

		return normalizedRequestedNames.filter((name) =>
			normalizedAvailableNames.includes(name),
		);
	}

	function normalizeBattleCastOrder(
		requestedNames: string[],
		availableNames: string[] = [],
	) {
		const normalizedAvailableNames = sanitizeCastNameList(availableNames);
		const selectedNames = filterBattleCastSelection(
			requestedNames,
			normalizedAvailableNames,
		);

		if (normalizedAvailableNames.length === 0) {
			return selectedNames;
		}

		return [
			...selectedNames,
			...normalizedAvailableNames.filter(
				(name) => !selectedNames.includes(name),
			),
		];
	}

	function battleMatchupName(
		castNames: string[],
		index: number,
		fallback: string,
	) {
		return castNames[index] ?? fallback;
	}

	function battleGiftSlotsForCast(
		settings: BattleSettings,
		castName: string,
		lineupIndex: number,
	) {
		const castIndex = settings.castNames.findIndex(
			(name) => name === castName,
		);
		const giftIndex = castIndex >= 0 ? castIndex : lineupIndex;
		const castSlots = normalizeBattleGiftSlots(
			settings.giftsByCast?.[castName],
			giftIndex,
		);
		if (castSlots.some(Boolean)) {
			return normalizeBattleGiftSlots(castSlots, giftIndex, true);
		}

		if (lineupIndex === 0) {
			return normalizeBattleGiftSlots(settings.leftGifts, 0, true);
		}

		if (lineupIndex === 1) {
			return normalizeBattleGiftSlots(settings.rightGifts, 1, true);
		}

		return defaultBattleGiftNames(giftIndex);
	}

	function buildInitialBattleGifts(
		settings: BattleSettings,
		castName: string,
		lineupIndex: number,
	) {
		return battleGiftSlotsForCast(settings, castName, lineupIndex)
			.filter(Boolean)
			.map((giftValue) => {
				const giftId = giftCatalogStoredId(giftValue);
				const giftName = giftCatalogDisplayName(giftId);
				return {
					giftId,
					giftName,
					giftImageUrl: giftCatalogImageUrl({ giftId, giftName }),
				};
			});
	}

	function buildInitialBattleContestants(
		settings: BattleSettings,
		lineupOrder: string[] = settings.castNames,
	): BattleContestant[] {
		const battleLineupOrder = normalizeBattleCastOrder(
			lineupOrder,
			settings.castNames,
		);
		const leftName = battleMatchupName(battleLineupOrder, 0, "Left Cast");
		const rightName = battleMatchupName(battleLineupOrder, 1, "Right Cast");

		return [
			{
				id: `left-${leftName.toLowerCase().replace(/\s+/g, "-") || "cast"}`,
				side: "left",
				name: leftName,
				avatar: initials(leftName),
				gifts: buildInitialBattleGifts(settings, leftName, 0),
				score: 0,
				voters: 0,
			},
			{
				id: `right-${rightName.toLowerCase().replace(/\s+/g, "-") || "cast"}`,
				side: "right",
				name: rightName,
				avatar: initials(rightName),
				gifts: buildInitialBattleGifts(settings, rightName, 1),
				score: 0,
				voters: 0,
			},
		];
	}

	function buildInitialStickerDanceContestants(
		castNames: string[],
		stickerByCast: StickerDanceStickerMap,
	) {
		return castNames.map((name, index) => {
			const giftId = giftCatalogStoredId(
				stickerByCast[name] ?? defaultStickerDanceGiftName(index),
			);
			const giftName = giftCatalogDisplayName(giftId);
			return {
				id: `${index}-${name.toLowerCase().replace(/\s+/g, "-")}`,
				name,
				avatar: initials(name),
				giftId,
				giftName,
				giftImageUrl: giftCatalogImageUrl({ giftId, giftName }),
				score: 0,
				voters: 0,
			};
		});
	}

	function buildInitialGroupPkContestants(
		castNames: string[],
		giftsByCast: GroupPkGiftMap,
	) {
		return castNames.map((name, index) => {
			const gifts = normalizeGroupPkGiftSlots(
				giftsByCast[name],
				index,
				true,
			)
				.filter(Boolean)
				.map((giftValue) => {
					const giftId = giftCatalogStoredId(giftValue);
					const giftName = giftCatalogDisplayName(giftId);
					return {
						giftId,
						giftName,
						giftImageUrl: giftCatalogImageUrl({ giftId, giftName }),
					};
				});

			return {
				id: `${index}-${name.toLowerCase().replace(/\s+/g, "-")}`,
				name,
				avatar: initials(name),
				gifts,
				score: 0,
				voters: 0,
			};
		});
	}

	let performance: LiveMetricRow[] = [
		{ key: "diamonds", label: "Diamonds", value: "0" },
		{ key: "currentViewers", label: "Current Viewers", value: "0" },
		{ key: "totalViews", label: "Total Views", value: "0" },
		{ key: "follows", label: "Follows", value: "0" },
		{ key: "likes", label: "Likes", value: "0" },
	];

	type BattleFormState = {
		title: string;
		durationSeconds: number;
		castNames: string[];
		leftGifts: string[];
		rightGifts: string[];
		giftsByCast: Record<string, string[]>;
		lineStyle: BattleLineStyle;
		scoreEffect: BattleScoreEffect;
	};

	type SoloStageFormState = {
		scoreMode: SoloStageScoreMode;
		castNames: string[];
		durationSeconds: number;
		castText: string;
		roundCastNames: string[];
		targetA: number;
		targetB: number;
		visualEffect: PkVisualEffect;
	};

	type StickerDanceFormState = {
		title: string;
		castNames: string[];
		castText: string;
		stickerByCast: StickerDanceStickerMap;
		visualEffect: PkVisualEffect;
	};

	type GroupPkFormState = {
		title: string;
		durationSeconds: number;
		castNames: string[];
		castText: string;
		giftsByCast: GroupPkGiftMap;
		visualEffect: PkVisualEffect;
	};

	type LiveChecks = {
		obs: {
			ok: boolean;
			message: string;
		};
		live: {
			ok: boolean;
			status:
				| "idle"
				| "connecting"
				| "connected"
				| "disconnected"
				| "error";
			uniqueId: string;
			roomId?: string;
			startedAt?: string;
			viewerCount: number;
			message: string;
			errorKind?: LiveErrorKind;
		};
	};

	type ObsConnectionStatus = {
		connected: boolean;
		sceneName: string | null;
		sourceName: string;
		message: string;
	};

	type VideoInputOption = {
		deviceId: string;
		label: string;
		isObsVirtualCamera: boolean;
	};

	type ModeOverlaySettings = Record<ModeId, RuntimeOverlayFrame>;
	type OverlayInteractionMode = "move" | "resize";
	type BattleLineInteractionMode = "move" | "resize-top" | "resize-bottom";
	type OverlayInteraction = {
		mode: OverlayInteractionMode;
		startClientX: number;
		startClientY: number;
		initialFrame: RuntimeOverlayFrame;
	};
	type BattleLineInteraction = {
		mode: BattleLineInteractionMode;
		startClientX: number;
		startClientY: number;
		initialFrame: RuntimeOverlayFrame;
	};
	type BattleLineupDragContext = "settings" | "runtime";
	type BattleQueueRow = {
		castName: string;
		score: number;
		roundScore: number;
		canReorder: boolean;
	};
	type BattleScoreTransferSource = BattleSide | "unallocated";
	type ContestantScoreTransferSource = "unallocated" | string;
	type LiveSessionGameSummary = {
		key: string;
		roundKey: string;
		modeId: ModeId;
		reason: string;
		capturedAt: string;
		totalCoins: number;
		allocatedCoins: number;
		unallocatedCoins: number;
		rows: FinalLiveScoreRow[];
	};
	type LiveAuditGiftGroup = {
		id: string;
		label: string;
		sortAt: string;
		summary?: LiveSessionGameSummary;
		gifts: AllMessageRow[];
	};
	type PersistedModePlacementConfig = {
		overlayFrame?: Partial<RuntimeOverlayFrame>;
		lineFrame?: Partial<RuntimeOverlayFrame>;
	};

	let viewerCount = 0;
	let peakViewerCount = 0;
	let liveSessionStartedAt: string | null = null;
	let liveSessionHistoryId: string | null = null;
	let liveSessionRoomId: string | undefined = undefined;
	let totalViews = 0;
	let totalLikes = 0;
	let totalFollows = 0;
	let totalDiamonds = 0;
	let currentLiveGiftStats: LiveGiftSessionStats = {
		totalGiftCount: 0,
		totalCapturedCoins: 0,
		allocatedCoins: 0,
		unallocatedCoins: 0,
		endedAt: null,
	};
	let lastLiveGiftStats: LiveGiftSessionStats | null = null;
	let lastLiveModeScores: FinalLiveCastScores | null = null;
	let currentLiveGameSummaries: LiveSessionGameSummary[] = [];
	let currentLiveGameSummaryKeys = new Set<string>();
	let outsideGameCastScores: FinalLiveScoreRow[] = [];
	let currentEventIndex = 0;
	let modeTimerNow = Date.now();
	let eventRotateTimer: ReturnType<typeof setInterval> | null = null;
	const DEFAULT_PREVIEW_ASPECT_RATIO = 9 / 16;
	const SOLO_STAGE_OVERLAY_ASPECT_RATIO = 3;
	const MIN_SOLO_STAGE_OVERLAY_WIDTH = 0.32;
	const LUCKY_WHEEL_OVERLAY_ASPECT_RATIO = 1;
	const MIN_LUCKY_WHEEL_OVERLAY_WIDTH = 0.22;
	const DEFAULT_SCENE_RANDOMIZER_RESULT_HOLD_MS = 5000;
	const MIN_SCENE_RANDOMIZER_RESULT_HOLD_MS = 1000;
	const MAX_SCENE_RANDOMIZER_RESULT_HOLD_MS = 15000;

	let liveTimerTick: ReturnType<typeof setInterval> | null = null;
	let liveHistorySaveChain: Promise<void> = Promise.resolve();
	let lastLiveHistoryCheckpointAt = 0;
	let previewElement: HTMLVideoElement | null = null;
	let settingsPreviewSurface: HTMLDivElement | null = null;
	let sceneRankingsPreviewSurface: HTMLDivElement | null = null;
	let sceneRandomizerPreviewSurface: HTMLDivElement | null = null;
	let previewStream: MediaStream | null = null;
	let previewAspectRatio = DEFAULT_PREVIEW_ASPECT_RATIO;
	let previewError = "";
	let leftPanelWidth = 300;
	let rightPanelWidth = 360;
	let centerPanelHidden = false;

	async function attachPreviewStream() {
		await tick();
		if (!previewElement || !previewStream) return;
		if (previewElement.srcObject !== previewStream)
			previewElement.srcObject = previewStream;
		try {
			await previewElement.play();
			updatePreviewAspectRatio();
		} catch (error) {
			previewError = formatCameraAccessError(error);
		}
	}

	async function toggleCenterPanel() {
		centerPanelHidden = !centerPanelHidden;
		if (!centerPanelHidden) await attachPreviewStream();
	}
	let activeModeId: ModeId = "group-sticker";
	let modePanel: "list" | "detail" = "list";
	let modesSettingsOpen = false;
	let runningModeId: ModeId | null = null;
	let settingsModeId: ModeId | null = null;
	let runtimeOverlayStartupResetDone = false;
	let overlayPresets: ModeOverlaySettings = {
		"solo-target": defaultOverlayFrame("solo-target"),
		"group-sticker": defaultOverlayFrame("group-sticker"),
		"group-pk": defaultOverlayFrame("group-pk"),
		"battle-ladder": defaultOverlayFrame("battle-ladder"),
	};
	let settingsOverlayFrame = defaultOverlayFrame("group-sticker");
	let settingsBattleLineFrame = defaultBattleLineFrame();
	let settingsOverlayStyle = "";
	let settingsBattleLineStyle = "";
	let sceneRankingsSettings = defaultSceneRankingsSettings();
	let sceneRankingsDraftSettings = defaultSceneRankingsSettings();
	let sceneRankingsEditorSettings = defaultSceneRankingsSettings();
	let sceneRankingsSettingsOpen = false;
	let sceneRankingsSaving = false;
	let sceneRankingsStyle = "";
	let sceneRandomizerSettingsOpen: SceneRandomizerId | null = null;
	let sceneRandomizerDraftSettings: SceneRandomizerSettings =
		defaultSceneRandomizerSettings("lucky-wheel");
	let sceneRandomizerDraftOptionsText = "";
	let sceneRandomizerSaving = false;
	let sceneRandomizerStyle = "";
	let sceneRandomizerPreviewRun: SceneRandomizerRun | null = null;
	let sceneRankingScores: SceneRankingScore[] = [];
	let sceneRankingRows: SceneRankingRow[] = [];
	let sceneRankingPreviewRows: SceneRankingRow[] = [];
	let sceneRankingsRuntimeSyncKey = "";
	let sceneRankingsRuntimeSyncTimer: ReturnType<typeof setTimeout> | null =
		null;
	let sceneRankingsRuntimeSyncInFlight = false;
	let pendingSceneRankingsRuntimeConfig: SceneRankingsSettings | null = null;
	let lastSceneRankingsRuntimeSyncErrorAt = 0;
	let runtimeOverlayState: RuntimeOverlayState = {
		activeModeId: null,
		visible: false,
		frame: {
			x: 0.18,
			y: 0.14,
			width: 0.34,
			height: 0.56,
		},
		rankings: defaultSceneRankingsSettings(),
		gifterBinding: {
			enabled: false,
		},
		sceneRandomizers: defaultSceneRandomizersState(),
		customCode: {
			css: "",
		},
		version: 0,
		lastUpdatedAt: new Date().toISOString(),
	};
	let settingsOverlayInteraction: OverlayInteraction | null = null;
	let settingsBattleLineInteraction: BattleLineInteraction | null = null;
	let sceneRankingsInteraction: OverlayInteraction | null = null;
	let sceneRandomizerInteraction: OverlayInteraction | null = null;
	const DEFAULT_BATTLE_SETTINGS: BattleSettings = {
		title: "1v1 PK",
		durationSeconds: 120,
		castNames: [],
		leftGifts: defaultBattleGiftNames(0),
		rightGifts: defaultBattleGiftNames(1),
		giftsByCast: buildInitialBattleGiftMap([]),
		overlayFrame: defaultOverlayFrame("battle-ladder"),
		lineFrame: defaultBattleLineFrame(),
		lineStyle: "white",
		scoreEffect: "freeze",
		showBattlePkLineOverlaySurface: true,
	};
	const DEFAULT_SOLO_STAGE_SETTINGS: SoloStageState["settings"] = {
		title: "Solo Stage",
		scoreMode: "target",
		durationSeconds: 120,
		castNames: [],
		roundCastNames: [],
		targetA: 10000,
		targetB: 50000,
		visualEffect: "gold-crown",
	};
	const DEFAULT_STICKER_DANCE_SETTINGS: StickerDanceState["settings"] = {
		title: "Group Sticker",
		castNames: [],
		roundCastNames: [],
		stickerByCast: buildInitialStickerDanceGiftMap([]),
		visualEffect: "gift-blast",
	};
	const DEFAULT_GROUP_PK_SETTINGS: GroupPkState["settings"] = {
		title: "Group PK",
		durationSeconds: 120,
		castNames: [],
		roundCastNames: [],
		giftsByCast: buildInitialGroupPkGiftMap([]),
		visualEffect: "thunder",
	};
	let battleState: BattleState = {
		settings: { ...DEFAULT_BATTLE_SETTINGS },
		phase: "idle",
		contestants: buildInitialBattleContestants(DEFAULT_BATTLE_SETTINGS),
		lineupOrder: [...DEFAULT_BATTLE_SETTINGS.castNames],
		totalVotes: 0,
		unallocatedVotes: 0,
		unallocatedGifts: [],
		collecting: false,
		startedAt: null,
		endsAt: null,
		lastUpdatedAt: new Date().toISOString(),
		eventText: "Add at least two cast members to start 1v1 PK.",
	};
	let battleForm: BattleFormState = {
		title: DEFAULT_BATTLE_SETTINGS.title,
		durationSeconds: DEFAULT_BATTLE_SETTINGS.durationSeconds,
		castNames: [...DEFAULT_BATTLE_SETTINGS.castNames],
		leftGifts: [...DEFAULT_BATTLE_SETTINGS.leftGifts],
		rightGifts: [...DEFAULT_BATTLE_SETTINGS.rightGifts],
		giftsByCast: structuredClone(DEFAULT_BATTLE_SETTINGS.giftsByCast),
		lineStyle: DEFAULT_BATTLE_SETTINGS.lineStyle,
		scoreEffect: DEFAULT_BATTLE_SETTINGS.scoreEffect,
	};
	let soloStageState: SoloStageState = {
		settings: { ...DEFAULT_SOLO_STAGE_SETTINGS },
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
	let soloStageForm: SoloStageFormState = {
		scoreMode: DEFAULT_SOLO_STAGE_SETTINGS.scoreMode,
		castNames: [...DEFAULT_SOLO_STAGE_SETTINGS.castNames],
		durationSeconds: DEFAULT_SOLO_STAGE_SETTINGS.durationSeconds,
		castText: "",
		roundCastNames: [...DEFAULT_SOLO_STAGE_SETTINGS.roundCastNames],
		targetA: DEFAULT_SOLO_STAGE_SETTINGS.targetA,
		targetB: DEFAULT_SOLO_STAGE_SETTINGS.targetB,
		visualEffect: DEFAULT_SOLO_STAGE_SETTINGS.visualEffect,
	};

	let stickerDanceState: StickerDanceState = {
		settings: {
			...DEFAULT_STICKER_DANCE_SETTINGS,
			stickerByCast: { ...DEFAULT_STICKER_DANCE_SETTINGS.stickerByCast },
		},
		phase: "idle",
		contestants: buildInitialStickerDanceContestants(
			DEFAULT_STICKER_DANCE_SETTINGS.roundCastNames,
			DEFAULT_STICKER_DANCE_SETTINGS.stickerByCast,
		),
		totalVotes: 0,
		unallocatedVotes: 0,
		unallocatedGifts: [],
		collecting: false,
		startedAt: null,
		lastUpdatedAt: new Date().toISOString(),
		eventText: "Configure the cast and gift grid, then start collecting.",
	};
	let stickerDanceForm: StickerDanceFormState = {
		title: DEFAULT_STICKER_DANCE_SETTINGS.title,
		castNames: [...DEFAULT_STICKER_DANCE_SETTINGS.castNames],
		castText: "",
		stickerByCast: { ...DEFAULT_STICKER_DANCE_SETTINGS.stickerByCast },
		visualEffect: DEFAULT_STICKER_DANCE_SETTINGS.visualEffect,
	};

	let groupPkState: GroupPkState = {
		settings: {
			...DEFAULT_GROUP_PK_SETTINGS,
			giftsByCast: structuredClone(DEFAULT_GROUP_PK_SETTINGS.giftsByCast),
		},
		phase: "idle",
		contestants: buildInitialGroupPkContestants(
			DEFAULT_GROUP_PK_SETTINGS.roundCastNames,
			DEFAULT_GROUP_PK_SETTINGS.giftsByCast,
		),
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
	let groupPkForm: GroupPkFormState = {
		title: DEFAULT_GROUP_PK_SETTINGS.title,
		durationSeconds: DEFAULT_GROUP_PK_SETTINGS.durationSeconds,
		castNames: [...DEFAULT_GROUP_PK_SETTINGS.castNames],
		castText: "",
		giftsByCast: structuredClone(DEFAULT_GROUP_PK_SETTINGS.giftsByCast),
		visualEffect: DEFAULT_GROUP_PK_SETTINGS.visualEffect,
	};

	let gifts: GiftRow[] = [];

	let chat: ChatRow[] = [];
	let allMessages: AllMessageRow[] = [];
	let sessionGiftLog: AllMessageRow[] = [];
	let giftLogEntries: AllMessageRow[] = [];

	let events: EventRow[] = [];
	let currentEvent: EventRow | null = null;
	let activeMode: ModeDefinition = modes[0];
	let runningMode: ModeDefinition | null = null;
	let liveMode: ModeDefinition | null = null;
	let workspaceModeIsLive = false;
	let battleCorrectionSource: BattleScoreTransferSource = "unallocated";
	let battleCorrectionTarget: BattleSide = "left";
	let battleCorrectionAmount = 100;
	let stickerDanceCorrectionSource: ContestantScoreTransferSource =
		"unallocated";
	let stickerDanceCorrectionTarget = "";
	let stickerDanceCorrectionAmount = 100;
	let groupPkCorrectionSource: ContestantScoreTransferSource = "unallocated";
	let groupPkCorrectionTarget = "";
	let groupPkCorrectionAmount = 100;
	let soloStageCorrectionSource = "";
	let soloStageCorrectionTarget = "";
	let soloStageCorrectionAmount = 100;
	let liveStartedAt: string | null = null;
	let liveElapsedMs = 0;
	let giftLogModalOpen = false;
	let giftLogAllocationCastName = "";
	let giftLogAllocationSource = "unallocated";
	let giftLogAllocationMoving = false;
	let manualGiftAllocations = new Map<
		string,
		{
			castName: string;
			sourceCastName?: string;
			amount: number;
			modeId?: ModeId;
			allocatedAt: string;
			gameSessionId?: string;
		}
	>();
	let pendingGiftAllocation: {
		row: AllMessageRow;
		index: number;
		modeId?: ModeId;
		gameSessionId?: string;
		scope: "round" | "archived-round" | "session";
	} | null = null;
	let liveAuditGroups: LiveAuditGiftGroup[] = [];
	let auditTopGiftersByCast: GifterRankingGroup[] = [];
	let auditOverallTopGifters: GifterRankingRow[] = [];
	let selectedGiftProfile: AllMessageRow | null = null;
	let scoreCorrectionModeId: ModeId | null = null;
	let activeStudioProfile: StudioProfile | null = null;
	let profileMenuOpen = false;
	let castSettingsOpen = false;
	let scoreHistoryOpen = false;
	let scoreHistoryLoading = false;
	let scoreHistoryError = "";
	let scoreHistory: ScoreHistoryResponse = {
		timeZone: "Asia/Dubai",
		days: [],
		entries: [],
		liveSessions: [],
	};
	let selectedScoreHistorySessionId = "";
	let StudioGiftAuditDialog:
		| typeof import("$lib/components/studio-gift-audit-dialog.svelte").default
		| null = null;
	let StudioGiftSelectorDialog:
		| typeof import("$lib/components/studio-gift-selector-dialog.svelte").default
		| null = null;
	let StudioScoreHistoryDialog:
		| typeof import("$lib/components/studio-score-history-dialog.svelte").default
		| null = null;
	let studioSettingsOpen = false;
	let cameraSettingsOpen = false;
	let customOverlayCssDraft = "";
	let customOverlayCssSaving = false;
	let isDesktopApp = false;
	let desktopAppIsPackaged = false;
	let desktopAppVersion = APP_VERSION;
	let desktopUpdateState: DesktopUpdateState = {
		...DEFAULT_DESKTOP_UPDATE_STATE,
	};
	let desktopUpdatePollTimer: ReturnType<typeof setInterval> | null = null;
	let desktopSystemStatus: DesktopSystemStatus | null = null;
	let desktopSystemStatusLoading = false;
	let desktopSystemStatusError = "";
	let desktopNetworkTest: DesktopNetworkTestResult | null = null;
	let desktopNetworkTestRunning = false;
	let desktopNetworkTestError = "";
	let authSession: PersistedAuthSession | null = null;
	let sessionRefreshTimer: ReturnType<typeof setTimeout> | null = null;
	let selectedProfileId: string | null = null;
	let newCastUsername = "";
	let newCastNickname = "";
	let stickerGiftSelectorOpen = false;
	let stickerGiftSelectorMode:
		| "group-sticker"
		| "group-pk"
		| "battle-ladder" = "group-sticker";
	let stickerGiftSelectorCastName = "";
	let stickerGiftSelectorSlotIndex = 0;
	let sharedCastNamesSnapshot: string[] = [];
	let sharedCastRosterLoaded = false;
	let battleCastSelectionOptions: string[] = [];
	let battleCastNames: string[] = [];
	let battleDetailLineupNames: string[] = [];
	let battleDetailLineupRows: BattleQueueRow[] = [];
	let battleRunScores: SceneRankingScore[] = [];
	let battleRunSummaryStartIndex = 0;
	let battleDetailLineupContextValue: BattleLineupDragContext = "settings";
	let stickerDanceCastSelectionOptions: string[] = [];
	let groupPkCastSelectionOptions: string[] = [];
	let soloStageCastSelectionOptions: string[] = [];
	let battleFormDirty = false;
	let battleDraggedCastName = "";
	let battleDraggedContext: BattleLineupDragContext | null = null;
	let soloDraggedCastName = "";
	let stickerDanceCastNames: string[] = [];
	let groupPkCastNames: string[] = [];
	let soloStageCastNames: string[] = [];
	let battleGiftRows: Array<{
		castName: string;
		active: boolean;
		slots: Array<{
			giftName: string;
			giftDisplayName: string;
			giftImageUrl?: string;
		}>;
	}> = [];
	let stickerDanceGiftRows: Array<{
		castName: string;
		active: boolean;
		giftName: string;
		giftDisplayName: string;
		giftImageUrl?: string;
	}> = [];
	let groupPkGiftRows: Array<{
		castName: string;
		active: boolean;
		slots: Array<{
			giftName: string;
			giftDisplayName: string;
			giftImageUrl?: string;
		}>;
	}> = [];
	let battlePlacementPreviewContestants: BattleContestant[] = [];
	let stickerDancePlacementPreviewContestants: StickerDanceContestant[] = [];
	let groupPkPlacementPreviewContestants: GroupPkContestant[] = [];
	let launchingStudio = false;
	let endLiveConfirmOpen = false;
	let liveStatsModalOpen = false;
	let toasts: ToastMessage[] = [];
	let liveChecks: LiveChecks = {
		obs: {
			ok: false,
			message: "OBS camera preview is not connected.",
		},
		live: {
			ok: false,
			status: "idle",
			uniqueId: "",
			roomId: undefined as string | undefined,
			startedAt: undefined as string | undefined,
			viewerCount: 0,
			message: "LIVE checks have not started yet.",
			errorKind: undefined as LiveErrorKind,
		},
	};
	let activeLiveUniqueId = "";
	let liveEventSource: EventSource | null = null;
	let liveReconnectTimer: ReturnType<typeof setTimeout> | null = null;
	let liveReconnectAttempt = 0;
	let liveManualDisconnect = false;
	let lastLiveFeedActivityAt = 0;
	let commentsWindowRef: Window | null = null;
	let obsConnection: ObsConnectionStatus = {
		connected: false,
		sceneName: null,
		sourceName: "OBS Virtual Camera",
		message: "Choose a camera source.",
	};
	let obsConnecting = false;
	let videoInputDevices: VideoInputOption[] = [];
	let selectedVideoInputId = "";
	let refreshingVideoInputs = false;
	let lastAutoConnectedVideoInputId = "";
	let desktopCameraPermissionAttempted = false;
	let desktopCameraAccessStatus = "";
	let commentsSnapshotPushQueued = false;
	let commentsSnapshotPushFrame: number | null = null;
	let recentGiftEvents = new Map<string, GiftEventSeen>();
	let liveGifterBindings = new Map<string, string>();
	function stickerDanceGiftEntry(value?: string) {
		return resolveGiftCatalogLookup({ giftId: value });
	}

	function stickerDanceGiftDisplayName(value?: string, fallback = "Gift") {
		return giftCatalogDisplayName(value, fallback);
	}

	function normalizeGroupPkGiftSlots(
		gifts: string[] | undefined,
		castIndex: number,
		fillDefaults = false,
	) {
		const trimmed = Array.from(
			{ length: MAX_GROUP_PK_GIFTS_PER_CAST },
			(_, slotIndex) => giftCatalogStoredId(gifts?.[slotIndex]) || "",
		);

		if (fillDefaults && trimmed.every((giftName) => !giftName)) {
			return defaultGroupPkGiftNames(castIndex);
		}

		return trimmed;
	}

	function normalizeBattleGiftSlots(
		gifts: string[] | undefined,
		sideIndex: number,
		fillDefaults = false,
	) {
		// No saved/form value yet -> initialize exactly 3 gifts.
		if (!Array.isArray(gifts)) {
			return fillDefaults
				? defaultBattleGiftNames(sideIndex)
				: Array.from(
						{ length: DEFAULT_BATTLE_GIFTS_PER_SIDE },
						() => "",
					);
		}

		// IMPORTANT:
		// Once a form array exists, it is authoritative.
		// Never refill deleted slots with defaults or saved values.
		const slotCount = Math.min(
			Math.max(gifts.length, DEFAULT_BATTLE_GIFTS_PER_SIDE),
			MAX_BATTLE_STICKERS,
		);

		return Array.from(
			{ length: slotCount },
			(_, slotIndex) => giftCatalogStoredId(gifts[slotIndex]) || "",
		);
	}

	function battleGiftIdsExcept(castName: string, exceptSlotIndex = -1) {
		const usedGiftIds = new Set<string>();
		for (const knownCastName of battleGiftMapNames(
			battleCastSelectionOptions,
		)) {
			const castIndex = Math.max(
				battleGiftMapNames(battleCastSelectionOptions).indexOf(
					knownCastName,
				),
				0,
			);
			const slots = normalizeBattleGiftSlots(
				battleForm.giftsByCast[knownCastName],
				castIndex,
			);

			slots.forEach((giftId, slotIndex) => {
				if (
					giftId &&
					!(
						knownCastName === castName &&
						slotIndex === exceptSlotIndex
					)
				) {
					usedGiftIds.add(giftId);
				}
			});
		}
		return usedGiftIds;
	}

	function compactGroupPkGiftSlots(
		gifts: string[] | undefined,
		castIndex: number,
	) {
		const defaults = defaultGroupPkGiftNames(castIndex);
		const slots = normalizeGroupPkGiftSlots(gifts, castIndex, true);
		return Array.from(
			{ length: MAX_GROUP_PK_GIFTS_PER_CAST },
			(_, slotIndex) =>
				slots[slotIndex] || defaults[slotIndex] || defaults[0],
		);
	}

	function compactBattleGiftSlots(
		gifts: string[] | undefined,
		sideIndex: number,
	) {
		const defaults = defaultBattleGiftNames(sideIndex);
		const slots = normalizeBattleGiftSlots(gifts, sideIndex, true);
		const selected = slots.filter(Boolean).slice(0, MAX_BATTLE_STICKERS);
		return selected.length > 0 ? selected : defaults;
	}

	function battleGiftMapNames(activeCastNames: string[] = []) {
		const normalizedActiveCastNames = sanitizeCastNameList(activeCastNames);
		if (normalizedActiveCastNames.length > 0) {
			return normalizedActiveCastNames;
		}

		return sanitizeCastNameList([
			...battleState.settings.castNames,
			...battleState.lineupOrder,
			...battleForm.castNames,
			...Object.keys(battleState.settings.giftsByCast),
			...Object.keys(battleForm.giftsByCast),
		]);
	}

	function battleGiftSelections(castName: string, castIndex: number) {
		const formValue = battleForm.giftsByCast[castName];

		// Once the cast exists in the form, its array is the source of truth.
		// This prevents deleted stickers from coming back from saved settings.
		if (Array.isArray(formValue)) {
			return normalizeBattleGiftSlots(formValue, castIndex, false);
		}

		return savedBattleGiftSelections(castName, castIndex);
	}

	function savedBattleGiftSelections(castName: string, castIndex: number) {
		const savedSlots = normalizeBattleGiftSlots(
			battleState.settings.giftsByCast[castName],
			castIndex,
		);
		if (savedSlots.some(Boolean)) {
			return savedSlots;
		}

		if (castIndex === 0) {
			return normalizeBattleGiftSlots(
				battleState.settings.leftGifts,
				0,
				true,
			);
		}

		if (castIndex === 1) {
			return normalizeBattleGiftSlots(
				battleState.settings.rightGifts,
				1,
				true,
			);
		}

		return defaultBattleGiftNames(castIndex);
	}

	function mergedBattleGiftMap(activeCastNames: string[] = battleCastNames) {
		const knownNames = battleGiftMapNames(activeCastNames);

		return Object.fromEntries(
			knownNames.map((name, index) => [
				name,
				normalizeBattleGiftSlots(
					battleGiftSelections(name, index),
					index,
					true,
				),
			]),
		) as Record<string, string[]>;
	}

	async function openStickerGiftSelector(
		castName: string,
		options: {
			mode?: "group-sticker" | "group-pk" | "battle-ladder";
			slotIndex?: number;
		} = {},
	) {
		stickerGiftSelectorMode = options.mode ?? "group-sticker";
		stickerGiftSelectorCastName = castName;
		stickerGiftSelectorSlotIndex = options.slotIndex ?? 0;
		StudioGiftSelectorDialog ??= (
			await import("$lib/components/studio-gift-selector-dialog.svelte")
		).default;
		stickerGiftSelectorOpen = true;
	}

	function closeStickerGiftSelector() {
		stickerGiftSelectorOpen = false;
		stickerGiftSelectorMode = "group-sticker";
		stickerGiftSelectorCastName = "";
		stickerGiftSelectorSlotIndex = 0;
	}

	function assignStickerDanceGift(castName: string, giftId: string) {
		stickerDanceForm = {
			...stickerDanceForm,
			stickerByCast: {
				...stickerDanceForm.stickerByCast,
				[castName]: giftId,
			},
		};
		closeStickerGiftSelector();
	}

	function assignGroupPkGift(
		castName: string,
		slotIndex: number,
		giftId: string,
	) {
		const castIndex = groupPkCastNames.findIndex(
			(name) => name === castName,
		);
		const nextSlots = normalizeGroupPkGiftSlots(
			groupPkForm.giftsByCast[castName],
			Math.max(castIndex, 0),
		);
		nextSlots[slotIndex] = giftId;

		groupPkForm = {
			...groupPkForm,
			giftsByCast: {
				...groupPkForm.giftsByCast,
				[castName]: nextSlots,
			},
		};
		closeStickerGiftSelector();
	}

	function assignBattleGift(
		castName: string,
		slotIndex: number,
		giftId: string,
	) {
		const castIndex = Math.max(
			battleGiftMapNames(battleCastSelectionOptions).findIndex(
				(name) => name === castName,
			),
			0,
		);

		const currentSlots = normalizeBattleGiftSlots(
			battleForm.giftsByCast[castName],
			castIndex,
			false,
		);

		const normalizedGiftId = giftCatalogStoredId(giftId);

		if (!normalizedGiftId) {
			return;
		}

		// The same gift cannot exist anywhere else in battle.
		for (const [otherCastName, otherSlots] of Object.entries(
			battleForm.giftsByCast,
		)) {
			for (
				let otherIndex = 0;
				otherIndex < (otherSlots?.length ?? 0);
				otherIndex++
			) {
				if (otherCastName === castName && otherIndex === slotIndex) {
					continue;
				}

				const otherGiftId = giftCatalogStoredId(
					otherSlots?.[otherIndex],
				);

				if (otherGiftId === normalizedGiftId) {
					return;
				}
			}
		}

		const nextSlots = [...currentSlots];

		while (nextSlots.length <= slotIndex) {
			nextSlots.push("");
		}

		nextSlots[slotIndex] = normalizedGiftId;

		battleForm = {
			...battleForm,
			giftsByCast: {
				...battleForm.giftsByCast,
				[castName]: nextSlots.slice(0, MAX_BATTLE_STICKERS),
			},
		};

		closeStickerGiftSelector();
	}

	function addBattleGiftSlot(castName: string) {
		const castNames = battleGiftMapNames(battleCastSelectionOptions);
		const castIndex = Math.max(castNames.indexOf(castName), 0);
		const slots = normalizeBattleGiftSlots(
			battleForm.giftsByCast[castName],
			castIndex,
		);
		if (slots.length >= MAX_BATTLE_STICKERS) return;

		battleForm = {
			...battleForm,
			giftsByCast: {
				...battleForm.giftsByCast,
				[castName]: [...slots, ""],
			},
		};
	}

	function removeBattleGiftSlot(castName: string, slotIndex: number) {
		const castIndex = Math.max(
			battleGiftMapNames(battleCastSelectionOptions).findIndex(
				(name) => name === castName,
			),
			0,
		);

		const currentSlots = normalizeBattleGiftSlots(
			battleForm.giftsByCast[castName],
			castIndex,
			false,
		);

		// Never go below the existing 3-slot configuration.
		if (currentSlots.length <= DEFAULT_BATTLE_GIFTS_PER_SIDE) {
			return;
		}

		if (slotIndex < 0 || slotIndex >= currentSlots.length) {
			return;
		}

		const nextSlots = currentSlots.filter(
			(_, index) => index !== slotIndex,
		);

		battleForm = {
			...battleForm,
			giftsByCast: {
				...battleForm.giftsByCast,
				[castName]: nextSlots.slice(0, MAX_BATTLE_STICKERS),
			},
		};
	}

	function battleUnavailableGiftIds(castName: string, slotIndex: number) {
		const unavailable = new Set<string>();

		for (const [otherCastName, slots] of Object.entries(
			battleForm.giftsByCast,
		)) {
			for (
				let otherIndex = 0;
				otherIndex < (slots?.length ?? 0);
				otherIndex++
			) {
				if (otherCastName === castName && otherIndex === slotIndex) {
					continue;
				}

				const giftId = giftCatalogStoredId(slots?.[otherIndex]);

				if (giftId) {
					unavailable.add(giftId);
				}
			}
		}

		return [...unavailable];
	}

	function assignSelectedGift(castName: string, giftId: string) {
		if (stickerGiftSelectorMode === "group-pk") {
			assignGroupPkGift(castName, stickerGiftSelectorSlotIndex, giftId);
			return;
		}

		if (stickerGiftSelectorMode === "battle-ladder") {
			assignBattleGift(
				stickerGiftSelectorCastName,
				stickerGiftSelectorSlotIndex,
				giftId,
			);
			return;
		}

		assignStickerDanceGift(castName, giftId);
	}

	async function preloadGiftCatalog() {
		try {
			const response = await fetch("/api/gift-catalog");
			if (!response.ok) {
				throw new Error(
					`Gift catalog preload failed with HTTP ${response.status}`,
				);
			}

			const payload = (await response.json()) as {
				gifts?: GiftCatalogEntry[];
			};
			giftsCatalog = useGiftCatalog(payload.gifts ?? []);
			return;
		} catch {}

		try {
			giftsCatalog = await loadGiftCatalog();
		} catch {
			giftsCatalog = giftCatalogEntries();
		}
	}

	function parseNameBlock(value: string) {
		return sanitizeCastNameList(value.split("\n"));
	}

	function scoreCorrectionVisible(modeId: ModeId | null) {
		switch (modeId) {
			case "battle-ladder":
				return (
					runningModeId === modeId ||
					(activeModeId === modeId && battleState.phase === "ended")
				);
			case "group-sticker":
			case "group-pk":
				return runningModeId === modeId;
			case "solo-target":
				return (
					runningModeId === modeId &&
					soloStageState.contestants.length > 1
				);
			default:
				return false;
		}
	}

	function scoreCorrectionModeLabel(modeId: ModeId | null) {
		switch (modeId) {
			case "battle-ladder":
				return "1v1 PK";
			case "group-sticker":
				return "Group Sticker";
			case "group-pk":
				return "Group PK";
			case "solo-target":
				return "Solo Stage";
			default:
				return "Live Mode";
		}
	}

	async function openGiftLogModal() {
		StudioGiftAuditDialog ??= (
			await import("$lib/components/studio-gift-audit-dialog.svelte")
		).default;
		giftLogModalOpen = true;
	}

	function closeGiftLogModal() {
		giftLogModalOpen = false;
		pendingGiftAllocation = null;
		selectedGiftProfile = null;
	}

	function openGiftAllocation(row: AllMessageRow, index: number) {
		const modeId = row.allocationModeId ?? runningModeId;
		const activeGameSessionId =
			modeId && modeHasStartedScoreRound(modeId)
				? liveGameSummaryForMode(modeId, "allocation").roundKey
				: undefined;
		const recordedSummary = row.gameSessionId
			? latestLiveGameSummary(row.gameSessionId)
			: null;
		const archivedSummary = row.gameSessionId
			? (recordedSummary ??
				(row.gameSessionId === activeGameSessionId && modeId
					? liveGameSummaryForMode(modeId, "allocation")
					: null))
			: null;
		if (row.gameSessionId && !archivedSummary) {
			showToast("The recorded round for this gift is unavailable.");
			return;
		}
		if (row.gameSessionId && archivedSummary && !recordedSummary) {
			currentLiveGameSummaryKeys.add(archivedSummary.key);
			currentLiveGameSummaries = [
				...currentLiveGameSummaries,
				archivedSummary,
			];
		}
		const isActiveRound = Boolean(
			row.gameSessionId &&
				modeId &&
				modeHasActiveScoreRound(modeId) &&
				row.gameSessionId === activeGameSessionId,
		);
		const castNames = archivedSummary
			? archivedSummary.rows.map((entry) => entry.name)
			: giftLogAllocationCastNames(modeId);
		if (castNames.length === 0) {
			showToast("Add a cast member before allocating gifts.");
			return;
		}
		giftLogAllocationSource =
			manualGiftAllocationFor(row, index)?.castName ??
			(row.allocationStatus === "allocated"
				? row.allocatedCastName
				: undefined) ??
			"unallocated";
		giftLogAllocationCastName =
			castNames.find(
				(castName) => castName !== giftLogAllocationSource,
			) ?? castNames[0];
		pendingGiftAllocation = {
			row,
			index,
			modeId: modeId ?? undefined,
			gameSessionId: row.gameSessionId,
			scope: row.gameSessionId
				? isActiveRound
					? "round"
					: "archived-round"
				: "session",
		};
	}

	async function confirmGiftAllocation() {
		if (!pendingGiftAllocation) return;
		const { row, index, modeId } = pendingGiftAllocation;
		const target = giftLogAllocationCastName.trim();
		const available = giftLogAllocationAvailableAmount();
		const amount = giftLogAllocationTransferAmount();
		if (amount <= 0 || !target || target === giftLogAllocationSource) {
			showToast("Choose another cast for this gift.");
			return;
		}
		if (available < amount) {
			showToast(
				`The source only has ${available.toLocaleString()} of the gift's ${amount.toLocaleString()} coins available.`,
			);
			return;
		}

		giftLogAllocationMoving = true;
		try {
			if (pendingGiftAllocation.scope === "session") {
				const totals = new Map(
					outsideGameCastScores.map((entry) => [
						entry.name,
						entry.score,
					]),
				);
				if (giftLogAllocationSource !== "unallocated") {
					totals.set(
						giftLogAllocationSource,
						Math.max(
							(totals.get(giftLogAllocationSource) ?? 0) - amount,
							0,
						),
					);
				}
				totals.set(target, (totals.get(target) ?? 0) + amount);
				outsideGameCastScores = Array.from(totals, ([name, score]) => ({
					name,
					score,
				})).filter((entry) => entry.score > 0);
			} else if (pendingGiftAllocation.scope === "archived-round") {
				const base = pendingGiftAllocation.gameSessionId
					? (latestLiveGameSummary(
							pendingGiftAllocation.gameSessionId,
						) ??
						(modeId && modeHasStartedScoreRound(modeId)
							? liveGameSummaryForMode(
									modeId,
									"archived-allocation",
								)
							: null))
					: null;
				if (
					!base ||
					!pendingGiftAllocation.gameSessionId ||
					base.roundKey !== pendingGiftAllocation.gameSessionId
				) {
					throw new Error(
						"The recorded round for this gift is unavailable.",
					);
				}
				const rows = base.rows.map((entry) => ({ ...entry }));
				if (giftLogAllocationSource !== "unallocated") {
					const source = rows.find(
						(entry) => entry.name === giftLogAllocationSource,
					);
					if (!source || source.score < amount)
						throw new Error(
							"The source cast no longer holds this gift value.",
						);
					source.score -= amount;
				}
				const targetRow = rows.find((entry) => entry.name === target);
				if (targetRow) targetRow.score += amount;
				else rows.push({ name: target, score: amount });
				const capturedAt = new Date().toISOString();
				const correctedSummary: LiveSessionGameSummary = {
					...base,
					key: `${base.roundKey}::archived-gift-allocation::${capturedAt}`,
					reason: `archived-gift-reallocation:${giftLogAllocationSource}->${target}:${amount}`,
					capturedAt,
					allocatedCoins: rows.reduce(
						(total, entry) => total + entry.score,
						0,
					),
					unallocatedCoins:
						giftLogAllocationSource === "unallocated"
							? Math.max(base.unallocatedCoins - amount, 0)
							: base.unallocatedCoins,
					rows,
				};
				currentLiveGameSummaryKeys.add(correctedSummary.key);
				currentLiveGameSummaries = [
					...currentLiveGameSummaries,
					correctedSummary,
				];
			} else if (
				!modeId ||
				modeId !== runningModeId ||
				modeId === "battle-ladder"
			) {
				if (!modeId || modeId !== runningModeId)
					throw new Error("This round is no longer active.");
				const sourceSide =
					battleState.contestants.find(
						(contestant) =>
							contestant.name === giftLogAllocationSource,
					)?.side ?? null;
				const targetSide = battleState.contestants.find(
					(contestant) => contestant.name === target,
				)?.side;
				if (!targetSide)
					throw new Error("Target cast is not in this game.");
				battleState = await sendBattleCommand({
					action: "transferScore",
					fromSide: sourceSide,
					toSide: targetSide,
					amount,
				});
			} else if (modeId === "group-sticker") {
				stickerDanceState = await sendStickerDanceCommand({
					action: "transferScore",
					fromCastName:
						giftLogAllocationSource === "unallocated"
							? null
							: giftLogAllocationSource,
					toCastName: target,
					amount,
				});
			} else if (modeId === "group-pk") {
				groupPkState = await sendGroupPkCommand({
					action: "transferScore",
					fromCastName:
						giftLogAllocationSource === "unallocated"
							? null
							: giftLogAllocationSource,
					toCastName: target,
					amount,
				});
			} else {
				if (giftLogAllocationSource === "unallocated")
					throw new Error("Solo Stage has no unallocated pool.");
				soloStageState = await sendSoloStageCommand({
					action: "transferScore",
					fromCastName: giftLogAllocationSource,
					toCastName: target,
					amount,
				});
			}

			if (row) {
				const rowKey = giftLogEntryKey(row, index);
				manualGiftAllocations = new Map(manualGiftAllocations).set(
					rowKey,
					{
						castName: target,
						sourceCastName: giftLogAllocationSource,
						amount,
						modeId,
						allocatedAt: new Date().toISOString(),
						gameSessionId: pendingGiftAllocation.gameSessionId,
					},
				);
			}
			if (giftLogAllocationSource === "unallocated") {
				currentLiveGiftStats = {
					...currentLiveGiftStats,
					allocatedCoins:
						currentLiveGiftStats.allocatedCoins + amount,
					unallocatedCoins: Math.max(
						currentLiveGiftStats.unallocatedCoins - amount,
						0,
					),
				};
			}
			if (pendingGiftAllocation.scope === "round" && modeId) {
				captureLiveGameSummary(
					modeId,
					`gift-reallocation:${giftLogAllocationSource}->${target}:${amount}`,
				);
			}
			pendingGiftAllocation = null;
			showToast(
				`Moved ${amount.toLocaleString()} coins to ${target}.`,
				"info",
			);
		} catch (error) {
			showToast(
				error instanceof Error
					? error.message
					: "Gift allocation could not be moved.",
			);
		} finally {
			giftLogAllocationMoving = false;
		}
	}

	function giftLogAllocationCastNames(modeId: ModeId | null = runningModeId) {
		if (
			pendingGiftAllocation?.scope === "archived-round" &&
			pendingGiftAllocation.gameSessionId
		) {
			const summary = latestLiveGameSummary(
				pendingGiftAllocation.gameSessionId,
			);
			if (summary) return summary.rows.map((entry) => entry.name);
		}
		if (modeId === "battle-ladder")
			return battleState.contestants.map((contestant) => contestant.name);
		if (modeId === "group-sticker")
			return stickerDanceState.contestants.map(
				(contestant) => contestant.name,
			);
		if (modeId === "group-pk")
			return groupPkState.contestants.map(
				(contestant) => contestant.name,
			);
		if (modeId === "solo-target")
			return soloStageState.contestants.map(
				(contestant) => contestant.name,
			);
		return sanitizeCastNameList([
			...sharedCastNamesSnapshot,
			...battleState.settings.castNames,
			...stickerDanceState.settings.castNames,
			...groupPkState.settings.castNames,
			...soloStageState.settings.castNames,
		]);
	}

	function giftLogAllocationAvailableAmount() {
		if (!pendingGiftAllocation) return 0;
		if (
			pendingGiftAllocation.scope === "archived-round" &&
			pendingGiftAllocation.gameSessionId
		) {
			const summary = latestLiveGameSummary(
				pendingGiftAllocation.gameSessionId,
			);
			if (!summary) return 0;
			return giftLogAllocationSource === "unallocated"
				? summary.unallocatedCoins
				: (summary.rows.find(
						(row) => row.name === giftLogAllocationSource,
					)?.score ?? 0);
		}
		if (pendingGiftAllocation.scope === "session") {
			return giftLogAllocationSource === "unallocated"
				? currentLiveGiftStats.unallocatedCoins
				: (outsideGameCastScores.find(
						(row) => row.name === giftLogAllocationSource,
					)?.score ?? 0);
		}
		return giftLogAllocationAvailableAmountFor(
			pendingGiftAllocation.modeId,
			giftLogAllocationSource,
		);
	}

	function giftLogAllocationTransferAmount() {
		if (!pendingGiftAllocation) return 0;
		const { row, index } = pendingGiftAllocation;
		if (giftLogAllocationSource === "unallocated") {
			return giftLogEntryUnallocatedAmount(row);
		}
		const manualAllocation = manualGiftAllocationFor(row, index);
		return Math.max(
			0,
			Math.floor(
				Number(
					manualAllocation?.amount ?? row.allocatedCoins ?? row.coins,
				) || 0,
			),
		);
	}

	function giftLogAllocationAvailableAmountFor(
		modeId: ModeId | null | undefined,
		source: string,
	) {
		if (modeId === "battle-ladder")
			return source === "unallocated"
				? battleState.unallocatedVotes
				: contestantScoreByName(battleState.contestants, source);
		if (modeId === "group-sticker")
			return source === "unallocated"
				? stickerDanceState.unallocatedVotes
				: contestantScoreByName(stickerDanceState.contestants, source);
		if (modeId === "group-pk")
			return source === "unallocated"
				? groupPkState.unallocatedVotes
				: contestantScoreByName(groupPkState.contestants, source);
		if (modeId === "solo-target")
			return contestantScoreByName(soloStageState.contestants, source);
		return 0;
	}

	function giftLogEntryKey(row: AllMessageRow, index = 0) {
		return (
			row.id ||
			row.giftKey ||
			`${row.user}-${row.text}-${row.capturedAt ?? ""}-${row.countValue ?? row.coins ?? ""}`
		);
	}

	function giftLogEntryAmount(row: AllMessageRow) {
		return Math.max(
			0,
			Math.floor(Number(row.coins ?? row.countValue ?? 0) || 0),
		);
	}

	function giftLogEntryUnallocatedAmount(row: AllMessageRow) {
		if (row.kind !== "gift") {
			return 0;
		}

		const explicitAmount = Number(row.unallocatedCoins);
		if (Number.isFinite(explicitAmount)) {
			return Math.max(0, Math.floor(explicitAmount));
		}

		return giftLogEntryAmount(row);
	}

	function manualGiftAllocationFor(row: AllMessageRow, index = 0) {
		return manualGiftAllocations.get(giftLogEntryKey(row, index));
	}

	function auditGifterId(row: AllMessageRow) {
		return (
			row.viewer?.userId?.trim() ||
			normalizeTikTokUsername(row.viewer?.uniqueId) ||
			normalizeTikTokUsername(row.handle) ||
			row.user.trim().toLowerCase()
		);
	}

	function auditGifterCandidates(
		rows: AllMessageRow[],
		allocations: typeof manualGiftAllocations,
	): GifterRankingCandidate[] {
		const candidates: GifterRankingCandidate[] = [];
		for (const [index, row] of rows.entries()) {
			if (row.kind !== "gift") continue;
			const manualAllocation = allocations.get(
				giftLogEntryKey(row, index),
			);
			const id = auditGifterId(row);
			if (!id) continue;
			candidates.push({
				id,
				name: row.user,
				handle: row.handle,
				avatar: row.avatar,
				avatarClass: row.avatarClass,
				avatarUrl: row.avatarUrl,
				totalScore: giftLogEntryAmount(row),
				allocatedScore:
					manualAllocation?.amount ?? row.allocatedCoins ?? 0,
				castName: manualAllocation?.castName ?? row.allocatedCastName,
			});
		}
		return candidates;
	}

	function buildAuditTopGiftersByCast(
		candidates: GifterRankingCandidate[],
		castScores: SceneRankingScore[],
	) {
		const castNames = sanitizeCastNameList([
			...castScores.map((row) => row.name),
			...candidates.map((candidate) => candidate.castName),
		]);
		return rankGiftersByCast(candidates, castNames);
	}

	function closeScoreCorrectionModal() {
		scoreCorrectionModeId = null;
	}

	function stickerDanceGiftMapNames(activeCastNames: string[] = []) {
		const normalizedActiveCastNames = sanitizeCastNameList(activeCastNames);
		if (normalizedActiveCastNames.length > 0) {
			return normalizedActiveCastNames;
		}

		return sanitizeCastNameList([
			...stickerDanceState.settings.castNames,
			...stickerDanceForm.castNames,
			...Object.keys(stickerDanceState.settings.stickerByCast),
			...Object.keys(stickerDanceForm.stickerByCast),
		]);
	}

	function mergedStickerDanceGiftMap(
		activeCastNames: string[] = stickerDanceCastNames,
	) {
		const knownNames = stickerDanceGiftMapNames(activeCastNames);

		return Object.fromEntries(
			knownNames.map((name, index) => [
				name,
				stickerDanceForm.stickerByCast[name] ??
					stickerDanceState.settings.stickerByCast[name] ??
					defaultStickerDanceGiftName(index),
			]),
		) as StickerDanceStickerMap;
	}

	function groupPkGiftMapNames(activeCastNames: string[] = []) {
		const normalizedActiveCastNames = sanitizeCastNameList(activeCastNames);
		if (normalizedActiveCastNames.length > 0) {
			return normalizedActiveCastNames;
		}

		return sanitizeCastNameList([
			...groupPkState.settings.castNames,
			...groupPkForm.castNames,
			...Object.keys(groupPkState.settings.giftsByCast),
			...Object.keys(groupPkForm.giftsByCast),
		]);
	}

	function mergedGroupPkGiftMap(
		activeCastNames: string[] = groupPkCastNames,
	) {
		const knownNames = groupPkGiftMapNames(activeCastNames);

		return Object.fromEntries(
			knownNames.map((name, index) => [
				name,
				normalizeGroupPkGiftSlots(
					groupPkForm.giftsByCast[name] ??
						groupPkState.settings.giftsByCast[name],
					index,
					true,
				),
			]),
		) as GroupPkGiftMap;
	}

	function sortFinalLiveScoreRows(rows: FinalLiveScoreRow[]) {
		return [...rows].sort(
			(left, right) =>
				right.score - left.score || left.name.localeCompare(right.name),
		);
	}

	function normalizedFinalScore(value: number) {
		return Math.max(0, Math.floor(Number(value) || 0));
	}

	function addLiveScoreRowsToTotals(
		totals: Map<string, number>,
		rows: FinalLiveScoreRow[],
		castNames: string[] = [],
	) {
		const allowedNames = new Set(sanitizeCastNameList(castNames));
		const restrictToRoster = allowedNames.size > 0;

		for (const row of rows) {
			const name = row.name.trim();
			if (!name || (restrictToRoster && !allowedNames.has(name))) {
				continue;
			}

			totals.set(
				name,
				(totals.get(name) ?? 0) + normalizedFinalScore(row.score),
			);
		}
	}

	function liveSummaryRoundKey(summary: LiveSessionGameSummary) {
		return (
			summary.roundKey || summary.key.split("::").slice(0, 3).join("::")
		);
	}

	function latestLiveGameSummary(
		roundKey: string,
	): LiveSessionGameSummary | null {
		for (
			let index = currentLiveGameSummaries.length - 1;
			index >= 0;
			index -= 1
		) {
			const summary = currentLiveGameSummaries[index];
			if (summary && liveSummaryRoundKey(summary) === roundKey)
				return summary;
		}
		return null;
	}

	function buildLiveCastScoreCounter(
		summaries: LiveSessionGameSummary[],
		options: {
			castNames?: string[];
			currentSummary?: LiveSessionGameSummary | null;
		} = {},
	): FinalLiveCastScores {
		const totals = new Map<string, number>();
		const castNames = options.castNames ?? [];
		const currentSummary = options.currentSummary ?? null;
		const currentRoundKey = currentSummary
			? liveSummaryRoundKey(currentSummary)
			: "";
		let totalCoins = 0;
		let allocatedCoins = 0;
		let unallocatedCoins = 0;

		const addSummary = (summary: LiveSessionGameSummary) => {
			totalCoins += summary.totalCoins;
			allocatedCoins += summary.allocatedCoins;
			unallocatedCoins += summary.unallocatedCoins;
			addLiveScoreRowsToTotals(totals, summary.rows, castNames);
		};

		const latestSummaryByRound = new Map<string, LiveSessionGameSummary>();
		for (const summary of summaries) {
			const roundKey = liveSummaryRoundKey(summary);
			latestSummaryByRound.delete(roundKey);
			latestSummaryByRound.set(roundKey, summary);
		}

		for (const summary of latestSummaryByRound.values()) {
			if (
				currentRoundKey &&
				liveSummaryRoundKey(summary) === currentRoundKey
			) {
				continue;
			}

			addSummary(summary);
		}

		if (currentSummary) {
			addSummary(currentSummary);
		}

		return {
			rows: sortFinalLiveScoreRows(
				Array.from(totals.entries()).map(([name, score]) => ({
					name,
					score,
				})),
			),
			totalCoins,
			allocatedCoins,
			unallocatedCoins,
		};
	}

	function buildLiveGameSummary(
		modeId: ModeId,
		reason: string,
		state: {
			contestants: Array<{ name: string; score: number }>;
			activeContestantIndex?: number;
			totalVotes?: number;
			totalAmount?: number;
			unallocatedVotes?: number;
			startedAt?: string | null;
			endsAt?: string | null;
			lastUpdatedAt?: string | null;
		},
	) {
		const contestantRows = state.contestants
			.map((contestant) => ({
				name: contestant.name.trim(),
				score: normalizedFinalScore(contestant.score),
			}))
			.filter((row) => row.name);
		const rows =
			modeId === "solo-target"
				? contestantRows.map((row, index) => ({
						...row,
						score:
							index === (state.activeContestantIndex ?? 0)
								? normalizedFinalScore(state.totalAmount ?? 0)
								: 0,
					}))
				: contestantRows;
		const allocatedCoins = rows.reduce(
			(total, row) => total + row.score,
			0,
		);
		const unallocatedCoins = normalizedFinalScore(
			state.unallocatedVotes ?? 0,
		);
		const totalCoins = Math.max(
			normalizedFinalScore(state.totalVotes ?? 0),
			normalizedFinalScore(state.totalAmount ?? 0),
			allocatedCoins + unallocatedCoins,
		);
		// A round's identity must stay stable when its timer ends. `endsAt` can change
		// from the scheduled finish to the actual finish timestamp.
		const roundKey = [modeId, state.startedAt ?? ""].join("::");
		const key = [
			modeId,
			state.startedAt ?? "",
			state.endsAt ?? "",
			state.lastUpdatedAt ?? "",
			totalCoins,
			allocatedCoins,
			unallocatedCoins,
			rows.map((row) => `${row.name}:${row.score}`).join("|"),
		].join("::");

		return {
			key,
			roundKey,
			modeId,
			reason,
			capturedAt: new Date().toISOString(),
			totalCoins,
			allocatedCoins,
			unallocatedCoins,
			rows,
		} satisfies LiveSessionGameSummary;
	}

	function liveGameSummaryForMode(modeId: ModeId, reason: string) {
		switch (modeId) {
			case "battle-ladder":
				return buildLiveGameSummary(modeId, reason, battleState);
			case "group-sticker":
				return buildLiveGameSummary(modeId, reason, stickerDanceState);
			case "group-pk":
				return buildLiveGameSummary(modeId, reason, groupPkState);
			case "solo-target":
				return buildLiveGameSummary(modeId, reason, soloStageState);
		}
	}

	function modeHasStartedScoreRound(modeId: ModeId) {
		switch (modeId) {
			case "battle-ladder":
				return (
					battleState.phase !== "idle" &&
					Boolean(battleState.startedAt)
				);
			case "group-sticker":
				return (
					stickerDanceState.phase !== "idle" &&
					Boolean(stickerDanceState.startedAt)
				);
			case "group-pk":
				return (
					groupPkState.phase !== "idle" &&
					Boolean(groupPkState.startedAt)
				);
			case "solo-target":
				return (
					soloStageState.phase !== "idle" &&
					Boolean(soloStageState.startedAt)
				);
		}
	}

	function modeHasActiveScoreRound(modeId: ModeId) {
		const timerIsRunning = (endsAt: string | null | undefined) => {
			if (!endsAt) return true;
			const endMs = Date.parse(endsAt);
			return (
				Number.isFinite(endMs) &&
				endMs + GIFT_ARRIVAL_BUFFER_MS > Date.now()
			);
		};
		switch (modeId) {
			case "battle-ladder":
				return (
					battleState.phase === "live" &&
					battleState.collecting &&
					timerIsRunning(battleState.endsAt)
				);
			case "group-sticker":
				return (
					stickerDanceState.phase === "live" &&
					stickerDanceState.collecting
				);
			case "group-pk":
				return (
					groupPkState.phase === "live" &&
					groupPkState.collecting &&
					timerIsRunning(groupPkState.endsAt)
				);
			case "solo-target":
				return (
					soloStageState.phase === "live" &&
					soloStageState.collecting &&
					timerIsRunning(soloStageState.endsAt)
				);
		}
	}

	function captureLiveGameSummary(modeId: ModeId, reason: string) {
		if (!hasEstablishedLiveSession() || !modeHasStartedScoreRound(modeId)) {
			return;
		}

		const summary = liveGameSummaryForMode(modeId, reason);
		if (currentLiveGameSummaryKeys.has(summary.key)) {
			return;
		}

		currentLiveGameSummaryKeys.add(summary.key);
		currentLiveGameSummaries = [...currentLiveGameSummaries, summary];
	}

	function buildLiveSessionGameHistories(
		gifts: LiveSessionGiftHistory[],
	): LiveSessionGameHistory[] {
		const summariesByGame = new Map<string, LiveSessionGameSummary[]>();
		for (const summary of currentLiveGameSummaries) {
			const current = summariesByGame.get(summary.roundKey) ?? [];
			current.push(summary);
			summariesByGame.set(summary.roundKey, current);
		}

		return Array.from(summariesByGame, ([gameSessionId, summaries]) => {
			const ordered = [...summaries].sort((left, right) =>
				left.capturedAt.localeCompare(right.capturedAt),
			);
			const first = ordered[0];
			const final = ordered[ordered.length - 1];
			return {
				id: gameSessionId,
				modeId: final.modeId,
				modeLabel: scoreCorrectionModeLabel(final.modeId),
				startedAt: first.capturedAt,
				endedAt: final.capturedAt,
				totalCoins: final.totalCoins,
				allocatedCoins: final.allocatedCoins,
				unallocatedCoins: final.unallocatedCoins,
				rows: final.rows.map(({ name, score }) => ({ name, score })),
				snapshots: ordered.map((summary) => ({
					id: summary.key,
					modeId: summary.modeId,
					modeLabel: scoreCorrectionModeLabel(summary.modeId),
					reason: summary.reason,
					capturedAt: summary.capturedAt,
					totalCoins: summary.totalCoins,
					allocatedCoins: summary.allocatedCoins,
					unallocatedCoins: summary.unallocatedCoins,
					rows: summary.rows.map(({ name, score }) => ({
						name,
						score,
					})),
				})),
				gifts: gifts.filter(
					(gift) => gift.gameSessionId === gameSessionId,
				),
			} satisfies LiveSessionGameHistory;
		}).sort((left, right) => left.startedAt.localeCompare(right.startedAt));
	}

	function buildLiveAuditGiftGroups(
		gifts: AllMessageRow[],
		summaries: LiveSessionGameSummary[],
		activeSummary: LiveSessionGameSummary | null,
	): LiveAuditGiftGroup[] {
		const latestByGame = new Map<string, LiveSessionGameSummary>();
		for (const summary of summaries) {
			latestByGame.set(summary.roundKey, summary);
		}
		if (activeSummary)
			latestByGame.set(activeSummary.roundKey, activeSummary);

		const roundCounts = new Map<ModeId, number>();
		const groups: LiveAuditGiftGroup[] = Array.from(
			latestByGame,
			([id, summary]) => ({ id, summary }),
		)
			.sort((left, right) =>
				left.summary.capturedAt.localeCompare(right.summary.capturedAt),
			)
			.map(({ id, summary }) => {
				const roundNumber = (roundCounts.get(summary.modeId) ?? 0) + 1;
				roundCounts.set(summary.modeId, roundNumber);
				return {
					id,
					label: `${scoreCorrectionModeLabel(summary.modeId)} · Round ${roundNumber}`,
					sortAt: summary.capturedAt,
					summary,
					gifts: gifts.filter((gift) => gift.gameSessionId === id),
				} satisfies LiveAuditGiftGroup;
			});
		const gameIds = new Set(latestByGame.keys());
		const outsideGifts = gifts.filter(
			(gift) => !gift.gameSessionId || !gameIds.has(gift.gameSessionId),
		);
		for (const gift of outsideGifts) {
			groups.push({
				id: `session-gift-${gift.id}`,
				label: "",
				sortAt: gift.capturedAt ?? "",
				gifts: [gift],
			});
		}
		return groups.sort((left, right) =>
			right.sortAt.localeCompare(left.sortAt),
		);
	}

	function snapshotFinalLiveModeScores() {
		const counter = buildLiveCastScoreCounter(currentLiveGameSummaries);
		const totals = new Map(
			counter.rows.map((row) => [row.name, row.score]),
		);
		for (const row of outsideGameCastScores) {
			totals.set(row.name, (totals.get(row.name) ?? 0) + row.score);
		}
		const outsideAllocated = outsideGameCastScores.reduce(
			(total, row) => total + row.score,
			0,
		);
		return {
			...counter,
			allocatedCoins: (counter.allocatedCoins ?? 0) + outsideAllocated,
			rows: Array.from(totals, ([name, score]) => ({ name, score })),
		};
	}

	function profileBadgeLabel() {
		return (
			activeStudioProfile?.displayName ||
			activeStudioProfile?.username ||
			"Profile"
		);
	}

	function profileTitleLabel(
		profile: StudioProfile | null = activeStudioProfile,
	) {
		if (!profile) {
			return "Profile";
		}

		const displayName = profile.displayName.trim();
		const username = profile.username.trim();
		return displayName &&
			displayName.toLowerCase() !== username.toLowerCase()
			? displayName
			: username;
	}

	function profileHandleLabel(
		profile: StudioProfile | null = activeStudioProfile,
	) {
		if (!profile) {
			return "";
		}

		const displayName = profile.displayName.trim();
		const username = profile.username.trim();
		return displayName &&
			displayName.toLowerCase() !== username.toLowerCase()
			? `@${username}`
			: "";
	}

	function syncSelectedProfile(profileId: string | null | undefined = null) {
		const requestedProfileId = profileId?.trim() || null;
		const nextProfileId =
			requestedProfileId || authSession?.tiktokProfileId || null;

		selectedProfileId = nextProfileId;
		return nextProfileId;
	}

	function clearSelectedProfile() {
		selectedProfileId = null;
	}

	async function loadProfileGameSettings(profileId: string) {
		const normalizedProfileId = profileId?.trim() ?? "";
		return readLocalProfileGameSettings(normalizedProfileId);
	}

	async function loadProfileStudioCasts(profileId: string) {
		return loadStudioCasts(profileId, {
			fallbackCasts: $studioCasts,
		});
	}

	function persistSavedProfileGameSettings(
		profileId: string,
		gameKey: string,
		config: Record<string, unknown>,
	) {
		return upsertLocalProfileGameSetting(profileId, gameKey, config);
	}

	function castNamesFromStudioCasts(casts: StudioCast[]) {
		return sanitizeCastNameList(casts.map((cast) => cast.nickname));
	}

	function pruneCastNamesToRoster(value: unknown, rosterNames: string[]) {
		const requestedNames = Array.isArray(value)
			? value.map((name) =>
					typeof name === "string" ? name : String(name ?? ""),
				)
			: [];
		return sanitizeCastNameList(requestedNames).filter((name) =>
			rosterNames.includes(name),
		);
	}

	function pruneRoundCastNamesToRoster(
		value: unknown,
		castNames: string[],
		rosterNames: string[],
	) {
		const requestedNames = pruneCastNamesToRoster(
			value,
			rosterNames,
		).filter((name) => castNames.includes(name));
		return [
			...requestedNames,
			...castNames.filter((name) => !requestedNames.includes(name)),
		];
	}

	function pruneStickerMapToRoster(value: unknown, castNames: string[]) {
		const source = isRecord(value) ? value : {};
		return Object.fromEntries(
			castNames.map((castName, index) => [
				castName,
				typeof source[castName] === "string"
					? source[castName]
					: defaultStickerDanceGiftName(index),
			]),
		) as StickerDanceStickerMap;
	}

	function pruneGroupPkGiftMapToRoster(value: unknown, castNames: string[]) {
		const source = isRecord(value) ? value : {};
		return Object.fromEntries(
			castNames.map((castName, index) => [
				castName,
				Array.isArray(source[castName])
					? (source[castName] as string[])
					: defaultGroupPkGiftNames(index),
			]),
		) as GroupPkGiftMap;
	}

	function pruneBattleGiftMapToRoster(value: unknown, castNames: string[]) {
		const source = isRecord(value) ? value : {};
		return Object.fromEntries(
			castNames.map((castName, index) => [
				castName,
				Array.isArray(source[castName])
					? (source[castName] as string[])
					: defaultBattleGiftNames(index),
			]),
		) as Record<string, string[]>;
	}

	function pruneBattleConfigToRoster(
		config: Record<string, unknown>,
		rosterNames: string[],
	) {
		const castNames = pruneCastNamesToRoster(config.castNames, rosterNames);
		return {
			...config,
			castNames,
			giftsByCast: pruneBattleGiftMapToRoster(
				config.giftsByCast,
				castNames,
			),
		};
	}

	function pruneStickerDanceConfigToRoster(
		config: Record<string, unknown>,
		rosterNames: string[],
	) {
		const castNames = pruneCastNamesToRoster(config.castNames, rosterNames);
		return {
			...config,
			castNames,
			roundCastNames: pruneRoundCastNamesToRoster(
				config.roundCastNames,
				castNames,
				rosterNames,
			),
			stickerByCast: pruneStickerMapToRoster(
				config.stickerByCast,
				castNames,
			),
		};
	}

	function pruneGroupPkConfigToRoster(
		config: Record<string, unknown>,
		rosterNames: string[],
	) {
		const castNames = pruneCastNamesToRoster(config.castNames, rosterNames);
		return {
			...config,
			castNames,
			roundCastNames: pruneRoundCastNamesToRoster(
				config.roundCastNames,
				castNames,
				rosterNames,
			),
			giftsByCast: pruneGroupPkGiftMapToRoster(
				config.giftsByCast,
				castNames,
			),
		};
	}

	function pruneSoloStageConfigToRoster(
		config: Record<string, unknown>,
		rosterNames: string[],
	) {
		const castNames = pruneCastNamesToRoster(config.castNames, rosterNames);
		return {
			...config,
			castNames,
			roundCastNames: pruneRoundCastNamesToRoster(
				config.roundCastNames,
				castNames,
				rosterNames,
			),
		};
	}

	function pruneGameConfigToRoster(
		gameKey: string,
		config: Record<string, unknown>,
		rosterNames: string[],
	) {
		switch (gameKey) {
			case BATTLE_GAME_KEY:
				return pruneBattleConfigToRoster(config, rosterNames);
			case STICKER_DANCE_GAME_KEY:
				return pruneStickerDanceConfigToRoster(config, rosterNames);
			case GROUP_PK_GAME_KEY:
				return pruneGroupPkConfigToRoster(config, rosterNames);
			case SOLO_STAGE_GAME_KEY:
				return pruneSoloStageConfigToRoster(config, rosterNames);
			default:
				return config;
		}
	}

	function pruneProfileGameSettingsResponseToRoster(
		response: ProfileGameSettingsResponse,
		rosterNames: string[],
	): ProfileGameSettingsResponse {
		return {
			ok: true,
			gameSettings: response.gameSettings.map((entry) => ({
				...entry,
				config: isRecord(entry.config)
					? pruneGameConfigToRoster(
							entry.gameKey,
							entry.config,
							rosterNames,
						)
					: entry.config,
			})),
		};
	}

	function pruneSavedProfileGameSettingsForRoster(
		profileId: string,
		casts: StudioCast[],
	) {
		const rosterNames = castNamesFromStudioCasts(casts);
		const current = readLocalProfileGameSettings(profileId);
		const pruned = pruneProfileGameSettingsResponseToRoster(
			current,
			rosterNames,
		);
		writeLocalProfileGameSettings(profileId, pruned.gameSettings);
		return pruned;
	}

	function hydrateSelectedProfileFromLocalData(
		profileId: string | null | undefined = selectedProfileId,
	) {
		const normalizedProfileId = profileId?.trim() ?? "";
		if (!normalizedProfileId) {
			return;
		}

		const response = readLocalProfileGameSettings(normalizedProfileId);
		if (response.gameSettings.length > 0) {
			applyBackendGameSettingsResponse(response);
		}
	}

	function profileMenuAvatarLabel() {
		return activeStudioProfile ? profileBadgeLabel() : currentAuthTitle();
	}

	function profileMenuButtonSubtitle() {
		return activeStudioProfile ? profileHandleLabel() : currentAuthTitle();
	}

	function dismissToast(id: string) {
		toasts = toasts.filter((toast) => toast.id !== id);
	}

	function showToast(message: string, tone: ToastMessage["tone"] = "error") {
		const id = crypto.randomUUID();
		toasts = [...toasts, { id, message, tone }];
		window.setTimeout(() => {
			dismissToast(id);
		}, 4200);
	}

	function sleep(ms: number) {
		return new Promise((resolve) => window.setTimeout(resolve, ms));
	}

	function liveStatusLabel() {
		if (liveChecks.live.status === "connected") return "Live Ready";
		if (liveChecks.live.errorKind === "offline") return "Live Offline";
		if (liveChecks.live.errorKind === "not_found") return "Live Not Found";
		if (liveChecks.live.errorKind === "rate_limited")
			return "Live Rate Limited";
		if (liveChecks.live.errorKind === "disabled") return "Live Disabled";
		if (liveChecks.live.status === "connecting") return "Live Connecting";
		if (liveChecks.live.status === "disconnected")
			return "Live Disconnected";
		if (liveChecks.live.status === "error") return "Live Error";
		return "Live";
	}

	function showLiveStatusBadge() {
		return liveChecks.live.status !== "idle" && !liveChecks.live.ok;
	}

	function liveStatusTone() {
		if (liveChecks.live.ok) {
			return "border-emerald-400/20 bg-emerald-500/10 text-emerald-200";
		}

		switch (liveChecks.live.errorKind) {
			case "offline":
				return "border-amber-400/20 bg-amber-500/10 text-amber-200";
			case "not_found":
				return "border-rose-400/20 bg-rose-500/10 text-rose-200";
			case "rate_limited":
				return "border-orange-400/20 bg-orange-500/10 text-orange-200";
			case "disabled":
				return "border-slate-400/20 bg-white/[0.03] text-slate-400";
			default:
				return "border-white/8 bg-white/[0.03] text-slate-400";
		}
	}

	function closeEndLiveConfirm() {
		endLiveConfirmOpen = false;
	}

	function closeLiveStatsModal() {
		liveStatsModalOpen = false;
	}

	function openEndLiveConfirm() {
		if (!liveChecks.live.ok || liveChecks.live.status !== "connected") {
			return;
		}

		endLiveConfirmOpen = true;
	}

	function obsSourceReady() {
		return obsConnection.connected || obsPreviewReady();
	}

	function setObsLiveCheck(ok: boolean, message: string) {
		liveChecks = {
			...liveChecks,
			obs: {
				ok,
				message,
			},
		};
	}

	function cameraPermissionHint() {
		if (
			!browser ||
			typeof navigator.mediaDevices?.getUserMedia === "function"
		) {
			return "";
		}

		return window.location.protocol === "https:" ||
			window.location.hostname === "localhost"
			? "Camera capture is not available in this browser."
			: "Camera capture needs HTTPS, localhost, or the desktop app.";
	}

	function formatCameraAccessError(error: unknown) {
		if (!(error instanceof Error)) {
			return "Unable to connect OBS Virtual Camera.";
		}

		const desktopPlatform = window.threeStudioDesktop?.platform ?? "";
		const isMac =
			desktopPlatform === "darwin" ||
			/Mac/i.test(navigator.userAgent) ||
			/Mac/i.test(navigator.platform);
		const isWindows = desktopPlatform === "win32";

		switch (error.name) {
			case "NotAllowedError":
			case "PermissionDeniedError":
				return isMac
					? `Camera access was blocked. On macOS, allow ${APP_DISPLAY_NAME} in System Settings > Privacy & Security > Camera, then reopen the app and start OBS Virtual Camera again.`
					: isWindows
						? `Camera access is blocked by Windows privacy settings. Turn on Camera access, Let apps access your camera, and Let desktop apps access your camera. ${APP_DISPLAY_NAME} will not appear as a separate app in that Windows list.`
						: "Camera access was blocked. Allow camera access, then try connecting OBS again.";
			case "NotFoundError":
			case "DevicesNotFoundError":
				return "No camera input was found. Start OBS Virtual Camera, then try again.";
			case "NotReadableError":
			case "TrackStartError":
				return "OBS Virtual Camera could not start. This is not always another app using it. Restart OBS Virtual Camera and try again.";
			case "AbortError":
				return "Camera access was interrupted. Retry after OBS Virtual Camera is running.";
			default:
				return error.message || "Unable to connect OBS Virtual Camera.";
		}
	}

	function isObsVirtualCameraLabel(label: string) {
		return /obs(\s+virtual)?\s+camera/i.test(label);
	}

	function isWindowsDesktopApp() {
		return (
			browser &&
			window.threeStudioDesktop?.isDesktop &&
			window.threeStudioDesktop.platform === "win32"
		);
	}

	function shouldUseGenericCameraPermissionPreflight() {
		return !isWindowsDesktopApp();
	}

	function selectedVideoInputOption() {
		return preferredVideoInputOption(videoInputDevices);
	}

	function updatePreviewAspectRatio() {
		const trackSettings = previewStream
			?.getVideoTracks()[0]
			?.getSettings?.();
		const explicitAspectRatio =
			typeof trackSettings?.aspectRatio === "number" &&
			Number.isFinite(trackSettings.aspectRatio)
				? trackSettings.aspectRatio
				: 0;
		const width = previewElement?.videoWidth || trackSettings?.width || 0;
		const height =
			previewElement?.videoHeight || trackSettings?.height || 0;
		const resolvedRatio =
			width > 0 && height > 0 ? width / height : explicitAspectRatio;
		const selectedInput = selectedVideoInputOption();
		if (selectedInput?.isObsVirtualCamera) {
			previewAspectRatio =
				resolvedRatio > 0 && resolvedRatio < 0.7
					? clamp(resolvedRatio, 0.45, 0.7)
					: DEFAULT_PREVIEW_ASPECT_RATIO;
			return;
		}

		previewAspectRatio =
			resolvedRatio > 0
				? clamp(resolvedRatio, 0.45, 1.8)
				: DEFAULT_PREVIEW_ASPECT_RATIO;
	}

	function previewFrameStyle() {
		const aspectRatio =
			previewAspectRatio > 0
				? previewAspectRatio
				: DEFAULT_PREVIEW_ASPECT_RATIO;
		return [
			`aspect-ratio: ${aspectRatio.toFixed(4)}`,
			"height: 100%",
			"max-width: 100%",
		].join(";");
	}

	function previewVideoClass() {
		return "block h-full w-full object-contain object-center";
	}

	function preferredVideoInputOption(devices: VideoInputOption[]) {
		return (
			devices.find(
				(device) => device.deviceId === selectedVideoInputId,
			) ??
			devices.find((device) => device.isObsVirtualCamera) ??
			devices[0] ??
			null
		);
	}

	function mapVideoInputDevices(devices: MediaDeviceInfo[]) {
		return devices
			.filter((device) => device.kind === "videoinput")
			.map((device, index) => ({
				deviceId: device.deviceId,
				label: device.label.trim() || `Camera ${index + 1}`,
				isObsVirtualCamera: isObsVirtualCameraLabel(device.label),
			}));
	}

	async function enumerateVideoInputDevices() {
		const devices = await navigator.mediaDevices.enumerateDevices();
		return mapVideoInputDevices(devices);
	}

	async function refreshDesktopCameraAccessStatus() {
		if (!window.threeStudioDesktop?.isDesktop) {
			desktopCameraAccessStatus = "";
			return "";
		}

		try {
			desktopCameraAccessStatus =
				await window.threeStudioDesktop.getCameraAccessStatus();
		} catch {
			desktopCameraAccessStatus = "";
		}

		return desktopCameraAccessStatus;
	}

	async function openDesktopCameraSettings() {
		try {
			return await window.threeStudioDesktop?.openCameraSettings?.();
		} catch {
			return false;
		}
	}

	async function ensureDesktopCameraAccess() {
		if (!window.threeStudioDesktop?.isDesktop) {
			return;
		}

		await refreshDesktopCameraAccessStatus();
		try {
			const granted =
				await window.threeStudioDesktop.requestCameraAccess();
			await refreshDesktopCameraAccessStatus();
			if (
				!granted &&
				(desktopCameraAccessStatus === "denied" ||
					desktopCameraAccessStatus === "restricted")
			) {
				throw new DOMException(
					"Camera access was denied.",
					"NotAllowedError",
				);
			}
		} catch (error) {
			await refreshDesktopCameraAccessStatus();
			if (error instanceof DOMException) {
				throw error;
			}
		}
	}

	async function ensureVideoInputPermission() {
		if (!navigator.mediaDevices?.getUserMedia) {
			throw new Error(
				cameraPermissionHint() ||
					"Camera capture is not available in this browser.",
			);
		}

		await ensureDesktopCameraAccess();

		const permissionStream = await navigator.mediaDevices.getUserMedia({
			video: true,
			audio: false,
		});
		permissionStream.getTracks().forEach((track) => track.stop());
		if (window.threeStudioDesktop?.isDesktop) {
			await refreshDesktopCameraAccessStatus();
		}
	}

	async function primeVideoInputEnumerationOnWindows() {
		if (!isWindowsDesktopApp() || !navigator.mediaDevices?.getUserMedia) {
			return;
		}

		await ensureDesktopCameraAccess();
		const permissionStream = await navigator.mediaDevices.getUserMedia({
			video: true,
			audio: false,
		});
		permissionStream.getTracks().forEach((track) => track.stop());
		await refreshDesktopCameraAccessStatus();
	}

	async function refreshVideoInputDevices(
		options: { ensurePermission?: boolean } = {},
	) {
		if (!browser || !navigator.mediaDevices?.enumerateDevices) {
			videoInputDevices = [];
			selectedVideoInputId = "";
			return [];
		}

		refreshingVideoInputs = true;

		try {
			let nextInputs = await enumerateVideoInputDevices();
			let permissionError: unknown = null;

			if (
				options.ensurePermission &&
				shouldUseGenericCameraPermissionPreflight()
			) {
				try {
					await ensureVideoInputPermission();
					const permittedInputs = await enumerateVideoInputDevices();
					if (permittedInputs.length > 0 || nextInputs.length === 0) {
						nextInputs = permittedInputs;
					}
				} catch (error) {
					permissionError = error;
					const fallbackInputs =
						await enumerateVideoInputDevices().catch(() => []);
					if (fallbackInputs.length > 0) {
						nextInputs = fallbackInputs;
					}
				}
			}

			if (
				options.ensurePermission &&
				isWindowsDesktopApp() &&
				nextInputs.length === 0
			) {
				try {
					await primeVideoInputEnumerationOnWindows();
					const permittedInputs = await enumerateVideoInputDevices();
					if (permittedInputs.length > 0) {
						nextInputs = permittedInputs;
					}
				} catch (error) {
					permissionError = permissionError ?? error;
				}
			}

			videoInputDevices = nextInputs;
			selectedVideoInputId =
				preferredVideoInputOption(nextInputs)?.deviceId ?? "";
			if (permissionError && nextInputs.length === 0) {
				throw permissionError;
			}
			return nextInputs;
		} finally {
			refreshingVideoInputs = false;
		}
	}

	async function initializeVideoInputs() {
		try {
			let devices: VideoInputOption[] = [];

			if (
				window.threeStudioDesktop?.isDesktop &&
				!desktopCameraPermissionAttempted
			) {
				desktopCameraPermissionAttempted = true;
				devices = await refreshVideoInputDevices({
					ensurePermission: true,
				});
			} else {
				devices = await refreshVideoInputDevices();
			}

			if (selectedVideoInputOption()) {
				await connectObs({ useSelectedInput: true, maxAttempts: 1 });
				return;
			}

			if (devices.length === 0) {
				stopPreviewTracks();
				previewError = "";
			}

			await loadObsConnectionStatus();
		} catch (error) {
			stopPreviewTracks();
			const message = formatCameraAccessError(error);
			obsConnection = {
				connected: false,
				sceneName: null,
				sourceName:
					selectedVideoInputOption()?.label ?? "OBS Virtual Camera",
				message,
			};
			previewError = message;
		}
	}

	function normalizeModeCastSelection(
		requestedNames: string[],
		availableNames: string[],
		options: {
			fallbackToAll?: boolean;
			restrictToAvailable?: boolean;
		} = {},
	) {
		const normalizedAvailableNames = sanitizeCastNameList(availableNames);
		const normalizedRequestedNames = sanitizeCastNameList(
			requestedNames,
		).filter((name) => normalizedAvailableNames.includes(name));

		if (normalizedRequestedNames.length > 0) {
			return normalizedRequestedNames;
		}

		if (normalizedAvailableNames.length === 0) {
			return options.restrictToAvailable
				? []
				: sanitizeCastNameList(requestedNames);
		}

		return options.fallbackToAll === false ? [] : normalizedAvailableNames;
	}

	function castSelectionIncludes(selectedNames: string[], castName: string) {
		return selectedNames.includes(castName);
	}

	function toggleCastSelection(
		selectedNames: string[],
		availableNames: string[],
		castName: string,
		checked: boolean,
	) {
		const normalizedCastName = castName.trim();
		if (!normalizedCastName) {
			return selectedNames;
		}

		if (checked) {
			return normalizeModeCastSelection(
				[...selectedNames, normalizedCastName],
				availableNames,
				{
					fallbackToAll: false,
				},
			);
		}

		return normalizeModeCastSelection(
			selectedNames.filter((name) => name !== normalizedCastName),
			availableNames,
			{ fallbackToAll: false },
		);
	}

	function applyStudioBootstrap(bootstrap: StudioBootstrap) {
		activeStudioProfile = bootstrap.activeProfile;
		selectedProfileId = syncSelectedProfile(bootstrap.activeProfile?.id);
	}

	function currentBattleOverlayFrame() {
		return settingsModeId === "battle-ladder"
			? { ...settingsOverlayFrame }
			: { ...battleState.settings.overlayFrame };
	}

	function currentBattleLineFrame() {
		return settingsModeId === "battle-ladder"
			? { ...settingsBattleLineFrame }
			: { ...battleState.settings.lineFrame };
	}

	function lastUpdatedAtValue(
		state: { lastUpdatedAt: string } | null | undefined,
	) {
		const value = Date.parse(state?.lastUpdatedAt ?? "");
		return Number.isFinite(value) ? value : 0;
	}

	function isIncomingStateCurrentOrNewer<T extends { lastUpdatedAt: string }>(
		currentState: T,
		nextState: T,
	) {
		return (
			lastUpdatedAtValue(nextState) >= lastUpdatedAtValue(currentState)
		);
	}

	function isIncomingStateNewer<T extends { lastUpdatedAt: string }>(
		currentState: T,
		nextState: T,
	) {
		return lastUpdatedAtValue(nextState) > lastUpdatedAtValue(currentState);
	}

	function sameOrderedValues(left: string[], right: string[]) {
		return (
			left.length === right.length &&
			left.every((value, index) => value === right[index])
		);
	}

	function battleStateLineupOrder(state: BattleState) {
		return sanitizeCastNameList(
			state.lineupOrder.length > 0
				? state.lineupOrder
				: state.settings.castNames,
		);
	}

	function battleLiveLineupOrder(state: BattleState) {
		const lineupOrder = battleStateLineupOrder(state);
		if (state.phase === "idle") {
			return lineupOrder;
		}

		const activeNames = sanitizeCastNameList(
			state.contestants.map((contestant) => contestant.name),
		);
		return [
			...activeNames,
			...lineupOrder.filter(
				(castName) => !activeNames.includes(castName),
			),
		];
	}

	function battleFormMatchesState(form: BattleFormState, state: BattleState) {
		const knownGiftNames = sanitizeCastNameList([
			...state.settings.castNames,
			...state.lineupOrder,
			...form.castNames,
			...Object.keys(state.settings.giftsByCast),
			...Object.keys(form.giftsByCast),
		]);

		return (
			form.title === state.settings.title &&
			form.durationSeconds === state.settings.durationSeconds &&
			form.lineStyle === state.settings.lineStyle &&
			form.scoreEffect === state.settings.scoreEffect &&
			sameOrderedValues(
				sanitizeCastNameList(form.castNames),
				battleStateLineupOrder(state),
			) &&
			knownGiftNames.every((castName, index) =>
				sameOrderedValues(
					normalizeBattleGiftSlots(
						form.giftsByCast[castName],
						index,
						true,
					),
					normalizeBattleGiftSlots(
						state.settings.giftsByCast[castName] ??
							(index === 0
								? state.settings.leftGifts
								: index === 1
									? state.settings.rightGifts
									: undefined),
						index,
						true,
					),
				),
			)
		);
	}

	function battleCoreSettingsConfig(settings: {
		title: string;
		durationSeconds: number;
		castNames: string[];
		leftGifts: string[];
		rightGifts: string[];
		giftsByCast: Record<string, string[]>;
		lineStyle: BattleLineStyle;
		scoreEffect: BattleScoreEffect;
	}) {
		return {
			title: settings.title,
			durationSeconds: settings.durationSeconds,
			castNames: [...settings.castNames],
			leftGifts: [...settings.leftGifts],
			rightGifts: [...settings.rightGifts],
			giftsByCast: Object.fromEntries(
				Object.entries(settings.giftsByCast).map(
					([castName, slots]) => [castName, [...slots]],
				),
			),
			lineStyle: settings.lineStyle,
			scoreEffect: settings.scoreEffect,
			showBattlePkLineOverlaySurface:
				settings.lineStyle !== "none" ||
				settings.scoreEffect !== "none",
		};
	}

	function battleSettingsPayload() {
		const castNames = sanitizeCastNameList(battleCastNames);
		const knownNames = battleGiftMapNames(battleCastSelectionOptions);
		const mergedGiftsByCast = mergedBattleGiftMap(knownNames);
		const giftsByCast = Object.fromEntries(
			knownNames.map((castName, index) => [
				castName,
				compactBattleGiftSlots(mergedGiftsByCast[castName], index),
			]),
		) as Record<string, string[]>;

		return {
			title: battleForm.title,
			durationSeconds: battleForm.durationSeconds,
			castNames,
			leftGifts: compactBattleGiftSlots(
				giftsByCast[castNames[0]] ?? battleForm.leftGifts,
				0,
			),
			rightGifts: compactBattleGiftSlots(
				giftsByCast[castNames[1]] ?? battleForm.rightGifts,
				1,
			),
			giftsByCast,
			overlayFrame: currentBattleOverlayFrame(),
			lineFrame: currentBattleLineFrame(),
			lineStyle: battleForm.lineStyle,
			scoreEffect: battleForm.scoreEffect,
			showBattlePkLineOverlaySurface:
				battleForm.lineStyle !== "none" ||
				battleForm.scoreEffect !== "none",
		};
	}

	function battleGameSettingsConfig() {
		const settings = battleSettingsPayload();
		return withModePlacementConfig(
			"battle-ladder",
			battleCoreSettingsConfig(settings),
			{
				overlayFrame: settings.overlayFrame,
				lineFrame: settings.lineFrame,
			},
		);
	}

	function stickerDanceSettingsPayload() {
		const castNames = parseStickerDanceCast();
		const knownNames = stickerDanceGiftMapNames(
			stickerDanceCastSelectionOptions,
		);
		return {
			title: stickerDanceForm.title,
			castNames,
			roundCastNames: castNames,
			stickerByCast: mergedStickerDanceGiftMap(knownNames),
			visualEffect: stickerDanceForm.visualEffect,
		};
	}

	function stickerDanceGameSettingsConfig() {
		return withModePlacementConfig(
			"group-sticker",
			stickerDanceSettingsPayload(),
		);
	}

	function groupPkSettingsPayload() {
		const castNames = parseGroupPkCast();
		const knownNames = groupPkGiftMapNames(groupPkCastSelectionOptions);
		const giftsByCast = mergedGroupPkGiftMap(knownNames);
		return {
			title: groupPkForm.title,
			durationSeconds: groupPkForm.durationSeconds,
			castNames,
			roundCastNames: castNames,
			giftsByCast: Object.fromEntries(
				knownNames.map((castName, index) => [
					castName,
					compactGroupPkGiftSlots(giftsByCast[castName], index),
				]),
			),
			visualEffect: groupPkForm.visualEffect,
		};
	}

	function groupPkGameSettingsConfig() {
		return withModePlacementConfig("group-pk", groupPkSettingsPayload());
	}

	function soloStageSettingsPayload(): SoloStageSettings {
		const durationSeconds = Math.max(
			10,
			Math.floor(Number(soloStageForm.durationSeconds) || 120),
		);
		const targetA = Math.max(
			1,
			Math.floor(Number(soloStageForm.targetA) || 10000),
		);
		const targetB = Math.max(
			targetA + 1,
			Math.floor(Number(soloStageForm.targetB) || targetA * 5),
		);
		const scoreMode: SoloStageScoreMode =
			soloStageForm.scoreMode === "freedom" ? "freedom" : "target";
		return {
			title: soloStageState.settings.title,
			scoreMode,
			durationSeconds,
			castNames: parseSoloStageCast(),
			roundCastNames: filteredSoloStageRoundCast(),
			targetA,
			targetB,
			visualEffect: soloStageForm.visualEffect,
		};
	}

	function soloStageGameSettingsConfig() {
		return withModePlacementConfig(
			"solo-target",
			soloStageSettingsPayload(),
		);
	}

	function applyLocalBattleSettings(nextBattleSettings: BattleSettings) {
		const nextLineupOrder = sanitizeCastNameList(
			nextBattleSettings.castNames,
		);
		battleState = {
			...battleState,
			settings: {
				...nextBattleSettings,
				castNames: nextLineupOrder,
			},
			phase: "idle",
			contestants: buildInitialBattleContestants(
				nextBattleSettings,
				nextLineupOrder,
			),
			lineupOrder: nextLineupOrder,
			totalVotes: 0,
			unallocatedVotes: 0,
			unallocatedGifts: [],
			collecting: false,
			startedAt: null,
			endsAt: null,
			lastUpdatedAt: new Date().toISOString(),
			eventText:
				nextLineupOrder.length < 2
					? "Add at least two cast members to start 1v1 PK."
					: "Set the lineup and start the round.",
		};
		syncBattleForm(battleState);
	}

	function applyLocalStickerDanceSettings(
		nextStickerDanceSettings: StickerDanceState["settings"],
	) {
		stickerDanceState = {
			...stickerDanceState,
			settings: nextStickerDanceSettings,
			phase: "idle",
			contestants: buildInitialStickerDanceContestants(
				nextStickerDanceSettings.roundCastNames,
				nextStickerDanceSettings.stickerByCast,
			),
			totalVotes: 0,
			unallocatedVotes: 0,
			unallocatedGifts: [],
			collecting: false,
			startedAt: null,
			lastUpdatedAt: new Date().toISOString(),
			eventText:
				"Configure the cast and gift grid, then start collecting.",
		};
		syncStickerDanceForm(stickerDanceState);
	}

	function applyLocalGroupPkSettings(
		nextGroupPkSettings: GroupPkState["settings"],
	) {
		groupPkState = {
			...groupPkState,
			settings: nextGroupPkSettings,
			phase: "idle",
			contestants: buildInitialGroupPkContestants(
				nextGroupPkSettings.roundCastNames,
				nextGroupPkSettings.giftsByCast,
			),
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
		syncGroupPkForm(groupPkState);
	}

	function buildIdleSoloStageContestants(roundCastNames: string[]) {
		return roundCastNames.map((name, index) => ({
			id: `${index}-${name.toLowerCase().replace(/\s+/g, "-")}`,
			name,
			avatar: initials(name),
			giftIcon: [
				"🪩",
				"🕶️",
				"🌹",
				"🦄",
				"🎵",
				"🌶️",
				"🎁",
				"🎯",
				"🔥",
				"🎤",
			][index % 10],
			score: 0,
			giftSenders: 0,
		}));
	}

	function applyLocalSoloStageSettings(
		nextSoloStageSettings: SoloStageState["settings"],
	) {
		soloStageState = {
			...soloStageState,
			settings: nextSoloStageSettings,
			phase: "idle",
			activeContestantIndex:
				nextSoloStageSettings.roundCastNames.length > 0 ? 0 : -1,
			contestants: buildIdleSoloStageContestants(
				nextSoloStageSettings.roundCastNames,
			),
			totalAmount: 0,
			totalGiftSenders: 0,
			collecting: false,
			startedAt: null,
			endsAt: null,
			lastUpdatedAt: new Date().toISOString(),
			eventText: "",
		};
		syncSoloStageForm(soloStageState);
	}

	function applyBackendGameSettingsResponse(
		response: ProfileGameSettingsResponse | null,
	) {
		if (!response) {
			return;
		}

		const battleGameSetting = response.gameSettings.find(
			(entry) => entry.gameKey === BATTLE_GAME_KEY,
		);
		const battleConfig = isRecord(battleGameSetting?.config)
			? battleGameSetting.config
			: null;
		const stickerDanceGameSetting = response.gameSettings.find(
			(entry) => entry.gameKey === STICKER_DANCE_GAME_KEY,
		);
		const stickerDanceConfig = isRecord(stickerDanceGameSetting?.config)
			? stickerDanceGameSetting.config
			: null;
		const groupPkGameSetting = response.gameSettings.find(
			(entry) => entry.gameKey === GROUP_PK_GAME_KEY,
		);
		const groupPkConfig = isRecord(groupPkGameSetting?.config)
			? groupPkGameSetting.config
			: null;
		const soloStageGameSetting = response.gameSettings.find(
			(entry) => entry.gameKey === SOLO_STAGE_GAME_KEY,
		);
		const soloStageConfig = isRecord(soloStageGameSetting?.config)
			? soloStageGameSetting.config
			: null;
		const sceneRankingsGameSetting = response.gameSettings.find(
			(entry) => entry.gameKey === SCENE_RANKINGS_KEY,
		);
		const gifterBindingGameSetting = response.gameSettings.find(
			(entry) => entry.gameKey === GIFTER_BINDING_KEY,
		);
		const sceneRandomizersGameSetting = response.gameSettings.find(
			(entry) => entry.gameKey === SCENE_RANDOMIZERS_KEY,
		);
		const overlayCustomCodeGameSetting = response.gameSettings.find(
			(entry) => entry.gameKey === OVERLAY_CUSTOM_CODE_KEY,
		);
		sceneRankingsSettings = normalizeSceneRankingsSettings(
			isRecord(sceneRankingsGameSetting?.config)
				? sceneRankingsGameSetting.config
				: null,
		);
		const nextGifterBinding = normalizeGifterBindingSettings(
			gifterBindingGameSetting?.config,
		);
		const nextSceneRandomizers = normalizeSceneRandomizersState(
			sceneRandomizersGameSetting?.config,
		);
		const nextCustomCode = normalizeCustomCodeSettings(
			overlayCustomCodeGameSetting?.config,
		);
		customOverlayCssDraft = nextCustomCode.css;
		setLocalRuntimeOverlayState({
			gifterBinding: nextGifterBinding,
			sceneRandomizers: nextSceneRandomizers,
			customCode: nextCustomCode,
		});
		void sendRuntimeOverlayCommand({
			action: "setGifterBinding",
			gifterBinding: nextGifterBinding,
		}).catch(() => {});
		void sendRuntimeOverlayCommand({
			action: "setCustomCode",
			customCode: nextCustomCode,
		}).catch(() => {});
		for (const randomizerId of sceneRandomizerIds) {
			void sendRuntimeOverlayCommand({
				action: "setSceneRandomizer",
				randomizerId,
				settings: nextSceneRandomizers.items[randomizerId],
			}).catch(() => {});
		}
		const battleOverlayFrame = battleConfig
			? overlayFrameFromPersistedConfig("battle-ladder", battleConfig)
			: { ...battleState.settings.overlayFrame };
		const battleLineFrame = battleConfig
			? battleLineFrameFromPersistedConfig(battleConfig)
			: { ...battleState.settings.lineFrame };

		overlayPresets = {
			"battle-ladder": battleOverlayFrame,
			"group-sticker": overlayFrameFromPersistedConfig(
				"group-sticker",
				stickerDanceConfig,
			),
			"group-pk": overlayFrameFromPersistedConfig(
				"group-pk",
				groupPkConfig,
			),
			"solo-target": overlayFrameFromPersistedConfig(
				"solo-target",
				soloStageConfig,
			),
		};

		const nextBattleSettings = battleConfig
			? {
					...DEFAULT_BATTLE_SETTINGS,
					overlayFrame: battleOverlayFrame,
					lineFrame: battleLineFrame,
					...(stripPlacementConfig(
						battleConfig,
					) as Partial<BattleSettings>),
				}
			: {
					...DEFAULT_BATTLE_SETTINGS,
					overlayFrame: battleOverlayFrame,
					lineFrame: battleLineFrame,
				};
		const nextBattleLineupOrder = normalizeBattleCastOrder(
			nextBattleSettings.castNames,
			nextBattleSettings.castNames,
		);
		applyLocalBattleSettings({
			...nextBattleSettings,
			castNames: nextBattleLineupOrder,
		});

		const nextStickerDanceSettings = stickerDanceConfig
			? {
					...DEFAULT_STICKER_DANCE_SETTINGS,
					stickerByCast: {
						...DEFAULT_STICKER_DANCE_SETTINGS.stickerByCast,
					},
					...(stripPlacementConfig(stickerDanceConfig) as Partial<
						StickerDanceState["settings"]
					>),
				}
			: {
					...DEFAULT_STICKER_DANCE_SETTINGS,
					stickerByCast: {
						...DEFAULT_STICKER_DANCE_SETTINGS.stickerByCast,
					},
				};
		applyLocalStickerDanceSettings(nextStickerDanceSettings);

		const nextGroupPkSettings = groupPkConfig
			? {
					...DEFAULT_GROUP_PK_SETTINGS,
					giftsByCast: structuredClone(
						DEFAULT_GROUP_PK_SETTINGS.giftsByCast,
					),
					...(stripPlacementConfig(groupPkConfig) as Partial<
						GroupPkState["settings"]
					>),
				}
			: {
					...DEFAULT_GROUP_PK_SETTINGS,
					giftsByCast: structuredClone(
						DEFAULT_GROUP_PK_SETTINGS.giftsByCast,
					),
				};
		applyLocalGroupPkSettings(nextGroupPkSettings);

		const nextSoloStageSettings = soloStageConfig
			? {
					...DEFAULT_SOLO_STAGE_SETTINGS,
					...(stripPlacementConfig(soloStageConfig) as Partial<
						SoloStageState["settings"]
					>),
				}
			: { ...DEFAULT_SOLO_STAGE_SETTINGS };
		applyLocalSoloStageSettings(nextSoloStageSettings);
	}

	function applySavedStudioCasts(profileId: string, casts: StudioCast[]) {
		const previousRosterNames = castNamesFromStudioCasts($studioCasts);
		const nextRosterNames = castNamesFromStudioCasts(casts);
		const rosterChanged = !sameOrderedValues(
			previousRosterNames,
			nextRosterNames,
		);

		writeLocalStudioCasts(profileId, casts);
		setStudioCasts(profileId, casts);
		if (!rosterChanged) {
			return;
		}

		const prunedSettings = pruneSavedProfileGameSettingsForRoster(
			profileId,
			casts,
		);
		applyBackendGameSettingsResponse(prunedSettings);
	}

	function obsPreviewReady() {
		return Boolean(
			previewHasRenderableFrame(previewElement) ||
				(previewStream &&
					previewStream.getVideoTracks().length > 0 &&
					!previewError),
		);
	}

	function liveGiftAllocation(
		message: Extract<LiveFeedEvent, { type: "gift" }>,
	): LiveGiftAllocation {
		const modeId = runningModeId;
		if (!modeId) return { allocated: false };
		if (!modeHasActiveScoreRound(modeId)) {
			return {
				allocated: false,
				modeId,
				modeLabel: scoreCorrectionModeLabel(modeId),
			};
		}
		const gameSessionId = liveGameSummaryForMode(
			modeId,
			"gift-routing",
		).roundKey;
		const giftReference = {
			giftId: message.giftId,
			giftName: message.giftName,
		};
		let castName = "";

		switch (modeId) {
			case "group-sticker":
				if (
					stickerDanceState.collecting &&
					stickerDanceState.phase === "live"
				) {
					castName =
						stickerDanceState.contestants.find(
							(contestant) =>
								giftCatalogMatchKey(contestant) ===
								giftCatalogMatchKey(giftReference),
						)?.name ?? "";
				}
				break;
			case "group-pk":
				if (groupPkState.collecting && groupPkState.phase === "live") {
					castName =
						groupPkState.contestants.find((contestant) =>
							contestant.gifts.some(
								(gift) =>
									giftCatalogMatchKey(gift) ===
									giftCatalogMatchKey(giftReference),
							),
						)?.name ?? "";
				}
				break;
			case "battle-ladder":
				if (battleState.collecting && battleState.phase === "live") {
					castName =
						battleState.contestants.find((contestant) =>
							contestant.gifts.some(
								(gift) =>
									giftCatalogMatchKey(gift) ===
									giftCatalogMatchKey(giftReference),
							),
						)?.name ?? "";
				}
				break;
			case "solo-target":
				if (
					soloStageState.collecting &&
					soloStageState.phase === "live"
				) {
					castName =
						soloStageState.contestants[
							soloStageState.activeContestantIndex
						]?.name ?? "";
				}
				break;
		}

		const gifterKey = liveGiftGifterKey(message);
		const bindingKey = gifterKey ? `${modeId}::${gifterKey}` : "";
		let reason = castName
			? modeId === "solo-target"
				? "active-contestant"
				: "gift-match"
			: "";
		if (runtimeOverlayState.gifterBinding.enabled && bindingKey) {
			if (castName) liveGifterBindings.set(bindingKey, castName);
			else {
				castName = liveGifterBindings.get(bindingKey) ?? "";
				if (castName) reason = "gifter-binding";
			}
		}

		return castName
			? {
					allocated: true,
					castName,
					modeId,
					modeLabel: scoreCorrectionModeLabel(modeId),
					allocatedAt: new Date().toISOString(),
					reason,
					gameSessionId,
				}
			: {
					allocated: false,
					modeId,
					modeLabel: scoreCorrectionModeLabel(modeId),
					gameSessionId,
				};
	}

	function snapshotLiveGiftStats() {
		return {
			totalGiftCount: currentLiveGiftStats.totalGiftCount,
			totalCapturedCoins: currentLiveGiftStats.totalCapturedCoins,
			allocatedCoins: currentLiveGiftStats.allocatedCoins,
			unallocatedCoins: currentLiveGiftStats.unallocatedCoins,
			endedAt: new Date().toISOString(),
		} satisfies LiveGiftSessionStats;
	}

	function hasLiveGiftStats(stats: LiveGiftSessionStats | null | undefined) {
		return (
			(stats?.totalGiftCount ?? 0) > 0 ||
			(stats?.totalCapturedCoins ?? 0) > 0 ||
			(stats?.allocatedCoins ?? 0) > 0 ||
			(stats?.unallocatedCoins ?? 0) > 0
		);
	}

	function finalizeLiveGiftStats() {
		if (!hasLiveGiftStats(currentLiveGiftStats)) {
			return;
		}

		lastLiveGiftStats = snapshotLiveGiftStats();
	}

	function recordLiveGiftStats(
		giftCount: number,
		giftCoins: number,
		allocated: boolean,
	) {
		const normalizedGiftCount = Math.max(0, Math.floor(giftCount));
		const normalizedGiftCoins = Math.max(0, Math.floor(giftCoins));
		if (normalizedGiftCount <= 0 && normalizedGiftCoins <= 0) {
			return;
		}

		currentLiveGiftStats = {
			totalGiftCount:
				currentLiveGiftStats.totalGiftCount + normalizedGiftCount,
			totalCapturedCoins:
				currentLiveGiftStats.totalCapturedCoins + normalizedGiftCoins,
			allocatedCoins:
				currentLiveGiftStats.allocatedCoins +
				(allocated ? normalizedGiftCoins : 0),
			unallocatedCoins:
				currentLiveGiftStats.unallocatedCoins +
				(allocated ? 0 : normalizedGiftCoins),
			endedAt: null,
		};
	}

	function markGiftEventSeen(
		message: Extract<LiveFeedEvent, { type: "gift" }>,
	) {
		const eventId = giftBackendEventId(message);
		if (!eventId) {
			return false;
		}

		const previous = recentGiftEvents.get(eventId);
		if (previous) {
			return true;
		}

		recentGiftEvents.delete(eventId);
		recentGiftEvents.set(eventId, {
			lastSeenAt: Date.now(),
		});
		if (recentGiftEvents.size > MAX_SEEN_GIFT_EVENT_IDS) {
			const oldestEventId = recentGiftEvents.keys().next().value;
			if (oldestEventId) {
				recentGiftEvents.delete(oldestEventId);
			}
		}
		return false;
	}

	function pushEvent(row: EventRow) {
		events = [row, ...events].slice(0, 40);
		currentEventIndex = 0;
	}

	function pushAllMessage(row: AllMessageRow | null) {
		if (!row) {
			return;
		}

		allMessages = [...allMessages, row].slice(-200);
	}

	function pushGiftPreviewRow(row: GiftRow) {
		gifts = [
			row,
			...gifts.filter((item) => item.giftKey !== row.giftKey),
		].slice(0, 3);
	}

	function pushGiftFeedRow(row: AllMessageRow) {
		pushAllMessage(row);
	}

	function pushSessionGiftLogRow(row: AllMessageRow) {
		sessionGiftLog = [...sessionGiftLog, row];
	}

	function formatCompact(value: number) {
		if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
		if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
		return value.toLocaleString();
	}

	function parseStartedAt(value?: string) {
		if (!value) return null;

		const timestamp = Date.parse(value);
		if (Number.isFinite(timestamp)) {
			return timestamp;
		}

		const numeric = Number(value);
		if (!Number.isFinite(numeric) || numeric <= 0) {
			return null;
		}

		return numeric < 1_000_000_000_000 ? numeric * 1000 : numeric;
	}

	function updateLiveElapsed() {
		const startedAt = parseStartedAt(liveStartedAt ?? undefined);
		if (!startedAt) {
			liveElapsedMs = 0;
			return;
		}

		liveElapsedMs = Math.max(Date.now() - startedAt, 0);
	}

	function formatDuration(durationMs: number) {
		const totalSeconds = Math.floor(durationMs / 1000);
		const hours = Math.floor(totalSeconds / 3600);
		const minutes = Math.floor((totalSeconds % 3600) / 60);
		const seconds = totalSeconds % 60;

		return [hours, minutes, seconds]
			.map((value) => String(value).padStart(2, "0"))
			.join(":");
	}

	function updatePerformance() {
		performance = [
			{
				key: "diamonds",
				label: "Diamonds",
				value: formatCompact(totalDiamonds),
			},
			{
				key: "currentViewers",
				label: "Current Viewers",
				value: formatCompact(viewerCount),
			},
			{
				key: "totalViews",
				label: "Total Views",
				value: formatCompact(totalViews || viewerCount),
			},
			{
				key: "follows",
				label: "Follows",
				value: formatCompact(totalFollows),
			},
			{ key: "likes", label: "Likes", value: formatCompact(totalLikes) },
		];
	}

	function clamp(value: number, min: number, max: number) {
		return Math.min(Math.max(value, min), max);
	}

	function normalizeOverlayFrame(
		frame: RuntimeOverlayFrame,
	): RuntimeOverlayFrame {
		const width = clamp(frame.width, MIN_OVERLAY_FRAME_SIZE, 1);
		const height = clamp(frame.height, MIN_OVERLAY_FRAME_SIZE, 1);
		const x = clamp(frame.x, 0, 1 - width);
		const y = clamp(frame.y, 0, 1 - height);

		return { x, y, width, height };
	}

	function normalizeBattleOverlayFrame(
		frame: RuntimeOverlayFrame,
	): RuntimeOverlayFrame {
		const width = clamp(frame.width, MIN_BATTLE_OVERLAY_FRAME_WIDTH, 1);
		const height = clamp(frame.height, MIN_BATTLE_OVERLAY_FRAME_HEIGHT, 1);
		const x = clamp(frame.x, 0, 1 - width);
		const y = clamp(frame.y, 0, 1 - height);

		return { x, y, width, height };
	}

	function soloStageOverlayHeightForWidth(
		width: number,
		surfaceAspectRatio = DEFAULT_PREVIEW_ASPECT_RATIO,
	) {
		const safeSurfaceAspectRatio =
			surfaceAspectRatio > 0
				? surfaceAspectRatio
				: DEFAULT_PREVIEW_ASPECT_RATIO;
		return (
			width * (safeSurfaceAspectRatio / SOLO_STAGE_OVERLAY_ASPECT_RATIO)
		);
	}

	function normalizeSoloStageOverlayFrame(
		frame: RuntimeOverlayFrame,
		surfaceAspectRatio = DEFAULT_PREVIEW_ASPECT_RATIO,
	): RuntimeOverlayFrame {
		const width = clamp(frame.width, MIN_SOLO_STAGE_OVERLAY_WIDTH, 1);
		const height = clamp(
			soloStageOverlayHeightForWidth(width, surfaceAspectRatio),
			0.08,
			1,
		);
		const x = clamp(frame.x, 0, 1 - width);
		const y = clamp(frame.y, 0, 1 - height);

		return { x, y, width, height };
	}

	function normalizeBattleLineFrame(
		frame: RuntimeOverlayFrame,
	): RuntimeOverlayFrame {
		const fallback = defaultBattleLineFrame();
		const widthValue = Number(frame.width);
		const heightValue = Number(frame.height);
		const width = clamp(
			Number.isFinite(widthValue) ? widthValue : fallback.width,
			MIN_BATTLE_LINE_FRAME_WIDTH,
			MAX_BATTLE_LINE_FRAME_WIDTH,
		);
		const height = clamp(
			Number.isFinite(heightValue) ? heightValue : fallback.height,
			MIN_BATTLE_LINE_FRAME_HEIGHT,
			1,
		);
		const xValue = Number(frame.x);
		const yValue = Number(frame.y);
		const x = clamp(
			Number.isFinite(xValue) ? xValue : fallback.x,
			0,
			1 - width,
		);
		const y = clamp(
			Number.isFinite(yValue) ? yValue : fallback.y,
			0,
			1 - height,
		);

		return { x, y, width, height };
	}

	function normalizeSceneRankingsFrame(
		frame: RuntimeOverlayFrame,
	): RuntimeOverlayFrame {
		const fallback = defaultSceneRankingsSettings().frame;
		const widthValue = Number(frame.width);
		const heightValue = Number(frame.height);
		const width = clamp(
			Number.isFinite(widthValue) ? widthValue : fallback.width,
			0.22,
			1,
		);
		const height = clamp(
			Number.isFinite(heightValue) ? heightValue : fallback.height,
			0.1,
			1,
		);
		const xValue = Number(frame.x);
		const yValue = Number(frame.y);
		const x = clamp(
			Number.isFinite(xValue) ? xValue : fallback.x,
			0,
			1 - width,
		);
		const y = clamp(
			Number.isFinite(yValue) ? yValue : fallback.y,
			0,
			1 - height,
		);

		return { x, y, width, height };
	}

	function normalizeSceneRankingScores(
		value: unknown,
		castNames: string[] = sharedCastNamesSnapshot,
	): SceneRankingScore[] {
		const allowedNames = new Set(sanitizeCastNameList(castNames));
		const restrictToRoster = allowedNames.size > 0;
		const totals = new Map<string, number>();

		if (!Array.isArray(value)) {
			return [];
		}

		for (const entry of value) {
			const source = isRecord(entry) ? entry : {};
			const name =
				typeof source.name === "string" ? source.name.trim() : "";
			if (!name || (restrictToRoster && !allowedNames.has(name))) {
				continue;
			}

			const score = Math.max(Math.floor(Number(source.score) || 0), 0);
			totals.set(name, (totals.get(name) ?? 0) + score);
		}

		return Array.from(totals.entries()).map(([name, score]) => ({
			name,
			score,
		}));
	}

	function normalizeSceneRankingsSettings(
		value:
			| Partial<SceneRankingsSettings>
			| Record<string, unknown>
			| null
			| undefined,
	): SceneRankingsSettings {
		const fallback = defaultSceneRankingsSettings();
		const source = isRecord(value) ? value : {};
		const castNames = Array.isArray(source.castNames)
			? sanitizeCastNameList(
					source.castNames.filter(
						(name): name is string => typeof name === "string",
					),
				)
			: fallback.castNames;
		return {
			enabled: Boolean(source.enabled ?? fallback.enabled),
			frame: normalizeSceneRankingsFrame({
				...fallback.frame,
				...(isRecord(source.frame) ? source.frame : {}),
			}),
			castNames,
			scores: normalizeSceneRankingScores(source.scores, castNames),
		};
	}

	function cloneSceneRankingsSettings(
		settings: SceneRankingsSettings,
	): SceneRankingsSettings {
		return {
			enabled: settings.enabled,
			frame: { ...settings.frame },
			castNames: [...settings.castNames],
			scores: normalizeSceneRankingScores(
				settings.scores,
				settings.castNames,
			),
		};
	}

	function defaultOverlayFrame(modeId: ModeId): RuntimeOverlayFrame {
		switch (modeId) {
			case "battle-ladder":
				return { x: 0.04, y: 0.08, width: 0.92, height: 0.22 };
			case "group-sticker":
				return { x: 0.04, y: 0.04, width: 0.92, height: 0.16 };
			case "group-pk":
				return { x: 0.035, y: 0.035, width: 0.93, height: 0.26 };
			case "solo-target":
				return { x: 0.06, y: 0.03, width: 0.88, height: 0.22 };
		}
	}

	function defaultBattleLineFrame(): RuntimeOverlayFrame {
		return { x: 0.496, y: 0.31, width: 0.008, height: 0.28 };
	}

	function defaultSceneRankingsSettings(): SceneRankingsSettings {
		return {
			enabled: false,
			frame: { x: 0.04, y: 0.5, width: 0.38, height: 0.24 },
			castNames: [],
			scores: [],
		};
	}

	function defaultSceneRandomizerFrame(
		_randomizerId: SceneRandomizerId,
	): RuntimeOverlayFrame {
		return { x: 0.24, y: 0.22, width: 0.52, height: 0.2925 };
	}

	function defaultSceneRandomizerOptions(_randomizerId: SceneRandomizerId) {
		return [""];
	}

	function isSceneRandomizerIdValue(
		value: unknown,
	): value is SceneRandomizerId {
		return (
			typeof value === "string" &&
			sceneRandomizerIds.includes(value as SceneRandomizerId)
		);
	}

	function defaultSceneRandomizerSettings(
		randomizerId: SceneRandomizerId,
	): SceneRandomizerSettings {
		return {
			frame: defaultSceneRandomizerFrame(randomizerId),
			options: defaultSceneRandomizerOptions(randomizerId),
			resultHoldMs: DEFAULT_SCENE_RANDOMIZER_RESULT_HOLD_MS,
		};
	}

	function defaultSceneRandomizersState(): SceneRandomizersState {
		return {
			items: Object.fromEntries(
				sceneRandomizerIds.map((randomizerId) => [
					randomizerId,
					defaultSceneRandomizerSettings(randomizerId),
				]),
			) as Record<SceneRandomizerId, SceneRandomizerSettings>,
			activeRun: null,
		};
	}

	function normalizeSceneRandomizerFrame(
		frame: RuntimeOverlayFrame,
		options: { surfaceAspectRatio?: number } = {},
	): RuntimeOverlayFrame {
		const fallback = defaultSceneRandomizerFrame("lucky-wheel");
		const surfaceAspectRatioValue = Number(options.surfaceAspectRatio);
		const surfaceAspectRatio =
			Number.isFinite(surfaceAspectRatioValue) &&
			surfaceAspectRatioValue > 0
				? surfaceAspectRatioValue
				: DEFAULT_PREVIEW_ASPECT_RATIO;
		const widthValue = Number(frame.width);
		const rawWidth = clamp(
			Number.isFinite(widthValue) ? widthValue : fallback.width,
			MIN_LUCKY_WHEEL_OVERLAY_WIDTH,
			1,
		);
		const heightFromWidth =
			rawWidth * (surfaceAspectRatio / LUCKY_WHEEL_OVERLAY_ASPECT_RATIO);
		const height = clamp(
			heightFromWidth,
			MIN_LUCKY_WHEEL_OVERLAY_WIDTH *
				(surfaceAspectRatio / LUCKY_WHEEL_OVERLAY_ASPECT_RATIO),
			1,
		);
		const width = clamp(
			height * (LUCKY_WHEEL_OVERLAY_ASPECT_RATIO / surfaceAspectRatio),
			MIN_LUCKY_WHEEL_OVERLAY_WIDTH,
			1,
		);
		const xValue = Number(frame.x);
		const yValue = Number(frame.y);
		const x = clamp(
			Number.isFinite(xValue) ? xValue : fallback.x,
			0,
			1 - width,
		);
		const y = clamp(
			Number.isFinite(yValue) ? yValue : fallback.y,
			0,
			1 - height,
		);

		return { x, y, width, height };
	}

	function normalizeSceneRandomizerOptions(
		value: unknown,
		randomizerId: SceneRandomizerId,
	) {
		const fallback = defaultSceneRandomizerOptions(randomizerId);
		if (!Array.isArray(value)) {
			return fallback;
		}

		const seen = new Set<string>();
		const options = value
			.map((entry) =>
				String(entry ?? "")
					.trim()
					.slice(0, 40),
			)
			.filter((entry) => {
				const key = entry.toLowerCase();
				if (!entry || seen.has(key)) {
					return false;
				}
				seen.add(key);
				return true;
			})
			.slice(0, 100);

		return options.length > 0 ? options : fallback;
	}

	function normalizeSceneRandomizerResultHoldMs(
		value: unknown,
		fallback = DEFAULT_SCENE_RANDOMIZER_RESULT_HOLD_MS,
	) {
		const holdMs = Math.round(Number(value));
		const fallbackValue = Math.round(Number(fallback));
		return clamp(
			Number.isFinite(holdMs)
				? holdMs
				: Number.isFinite(fallbackValue)
					? fallbackValue
					: DEFAULT_SCENE_RANDOMIZER_RESULT_HOLD_MS,
			MIN_SCENE_RANDOMIZER_RESULT_HOLD_MS,
			MAX_SCENE_RANDOMIZER_RESULT_HOLD_MS,
		);
	}

	function updateSceneRandomizerResultHoldSeconds(value: string) {
		sceneRandomizerDraftSettings = {
			...sceneRandomizerDraftSettings,
			resultHoldMs: normalizeSceneRandomizerResultHoldMs(
				Number(value) * 1000,
			),
		};
	}

	function normalizeSceneRandomizerSettings(
		randomizerId: SceneRandomizerId,
		value: unknown,
		fallback = defaultSceneRandomizerSettings(randomizerId),
	): SceneRandomizerSettings {
		const source = isRecord(value) ? value : {};
		const frameSource = isRecord(source.frame)
			? source.frame
			: fallback.frame;
		return {
			frame: normalizeSceneRandomizerFrame({
				...fallback.frame,
				...frameSource,
			}),
			options: normalizeSceneRandomizerOptions(
				Array.isArray(source.options)
					? source.options
					: fallback.options,
				randomizerId,
			),
			resultHoldMs: normalizeSceneRandomizerResultHoldMs(
				source.resultHoldMs,
				fallback.resultHoldMs,
			),
		};
	}

	function normalizeSceneRandomizersState(
		value: unknown,
		fallback = defaultSceneRandomizersState(),
	) {
		const source = isRecord(value) ? value : {};
		const itemsSource = isRecord(source.items) ? source.items : source;
		const sourceActiveRun = isRecord(source.activeRun)
			? (source.activeRun as SceneRandomizerRun)
			: null;
		const fallbackActiveRun = fallback.activeRun;
		return {
			items: Object.fromEntries(
				sceneRandomizerIds.map((randomizerId) => [
					randomizerId,
					normalizeSceneRandomizerSettings(
						randomizerId,
						itemsSource[randomizerId],
						fallback.items[randomizerId],
					),
				]),
			) as Record<SceneRandomizerId, SceneRandomizerSettings>,
			activeRun:
				sourceActiveRun &&
				isSceneRandomizerIdValue(sourceActiveRun.randomizerId)
					? sourceActiveRun
					: fallbackActiveRun &&
						  isSceneRandomizerIdValue(
								fallbackActiveRun.randomizerId,
						  )
						? fallbackActiveRun
						: null,
		};
	}

	function cloneSceneRandomizersState(
		state: SceneRandomizersState,
	): SceneRandomizersState {
		return {
			items: Object.fromEntries(
				sceneRandomizerIds.map((randomizerId) => {
					const settings =
						state.items[randomizerId] ??
						defaultSceneRandomizerSettings(randomizerId);
					return [
						randomizerId,
						{
							frame: { ...settings.frame },
							options: [...settings.options],
							resultHoldMs: settings.resultHoldMs,
						},
					];
				}),
			) as Record<SceneRandomizerId, SceneRandomizerSettings>,
			activeRun: state.activeRun
				? { ...state.activeRun, options: [...state.activeRun.options] }
				: null,
		};
	}

	function normalizeModeOverlayFrame(
		modeId: ModeId,
		frame: RuntimeOverlayFrame,
		options: { surfaceAspectRatio?: number } = {},
	): RuntimeOverlayFrame {
		const normalizedFrame =
			modeId === "battle-ladder"
				? normalizeBattleOverlayFrame(frame)
				: normalizeOverlayFrame(frame);

		switch (modeId) {
			case "solo-target":
				return normalizeSoloStageOverlayFrame(
					normalizedFrame,
					options.surfaceAspectRatio,
				);
			case "battle-ladder":
				return normalizedFrame;
			default:
				return normalizedFrame;
		}
	}

	function isRecord(value: unknown): value is Record<string, unknown> {
		return (
			typeof value === "object" && value !== null && !Array.isArray(value)
		);
	}

	function normalizeGifterBindingSettings(
		value: unknown,
		fallback: RuntimeOverlayState["gifterBinding"] = { enabled: false },
	) {
		const source = isRecord(value) ? value : {};
		return {
			enabled: Boolean(source.enabled ?? fallback.enabled),
		};
	}

	function normalizeCustomCodeSettings(
		value: unknown,
		fallback: RuntimeOverlayCustomCodeSettings = { css: "" },
	): RuntimeOverlayCustomCodeSettings {
		const source = isRecord(value) ? value : {};
		const css = typeof source.css === "string" ? source.css : fallback.css;
		return {
			css: css.slice(0, 30000),
		};
	}

	function stripPlacementConfig(
		config: Record<string, unknown> | null | undefined,
	) {
		if (!isRecord(config)) {
			return {};
		}

		const coreConfig = { ...config };
		delete coreConfig.overlayFrame;
		delete coreConfig.lineFrame;
		delete coreConfig.soloStageRankingsLayout;
		delete coreConfig.rankingsEnabled;
		return coreConfig;
	}

	function overlayFrameFromPersistedConfig(
		modeId: ModeId,
		config: Record<string, unknown> | null | undefined,
	) {
		if (!isRecord(config?.overlayFrame)) {
			return defaultOverlayFrame(modeId);
		}

		return sanitizePersistedOverlayPresets({
			[modeId]: config.overlayFrame as Partial<RuntimeOverlayFrame>,
		})[modeId];
	}

	function battleLineFrameFromPersistedConfig(
		config: Record<string, unknown> | null | undefined,
	) {
		if (!isRecord(config?.lineFrame)) {
			return defaultBattleLineFrame();
		}

		return normalizeBattleLineFrame({
			...defaultBattleLineFrame(),
			...(config.lineFrame as Partial<RuntimeOverlayFrame>),
		});
	}

	function withModePlacementConfig(
		modeId: ModeId,
		config: Record<string, unknown>,
		options: Partial<PersistedModePlacementConfig> = {},
	) {
		const placementConfig: PersistedModePlacementConfig = {
			overlayFrame: { ...overlayPresets[modeId] },
			...options,
		};

		return {
			...config,
			...placementConfig,
		};
	}

	function sanitizePersistedOverlayPresets(
		input?: Partial<Record<ModeId, Partial<RuntimeOverlayFrame>>>,
	): ModeOverlaySettings {
		return {
			"solo-target": normalizeModeOverlayFrame("solo-target", {
				...defaultOverlayFrame("solo-target"),
				...(input?.["solo-target"] ?? {}),
			}),
			"group-sticker": normalizeModeOverlayFrame("group-sticker", {
				...defaultOverlayFrame("group-sticker"),
				...(input?.["group-sticker"] ?? {}),
			}),
			"group-pk": normalizeModeOverlayFrame("group-pk", {
				...defaultOverlayFrame("group-pk"),
				...(input?.["group-pk"] ?? {}),
			}),
			"battle-ladder": normalizeModeOverlayFrame("battle-ladder", {
				...defaultOverlayFrame("battle-ladder"),
				...(input?.["battle-ladder"] ?? {}),
			}),
		};
	}

	function openModeSettings(modeId = activeModeId) {
		if (!isModeEnabled(modeId)) {
			return;
		}

		if (isModeLive(modeId)) {
			return;
		}

		if (modeId === "group-sticker") {
			syncStickerDanceForm(stickerDanceState);
		}

		if (modeId === "group-pk") {
			syncGroupPkForm(groupPkState);
		}

		if (modeId === "solo-target") {
			syncSoloStageForm(soloStageState);
		}

		if (modeId === "battle-ladder") {
			syncBattleForm(battleState);
		}

		settingsModeId = modeId;
		settingsOverlayFrame =
			modeId === "battle-ladder"
				? normalizeModeOverlayFrame("battle-ladder", {
						...battleState.settings.overlayFrame,
					})
				: normalizeModeOverlayFrame(
						modeId,
						{ ...overlayPresets[modeId] },
						{
							surfaceAspectRatio: DEFAULT_PREVIEW_ASPECT_RATIO,
						},
					);
		settingsBattleLineFrame =
			modeId === "battle-ladder"
				? { ...battleState.settings.lineFrame }
				: defaultBattleLineFrame();
	}

	function isModeEnabled(modeId: ModeId) {
		return enabledModeIds.includes(modeId);
	}

	function openMode(modeId: ModeId) {
		if (!isModeEnabled(modeId)) {
			return;
		}

		if (modeId === "battle-ladder" && runningModeId !== "battle-ladder") {
			battleRunSummaryStartIndex = currentLiveGameSummaries.length;
		}

		activeModeId = modeId;
		modePanel = "detail";
	}

	function hasEstablishedLiveSession() {
		return liveStartedAt !== null;
	}

	function isModeLive(modeId: ModeId) {
		return runningModeId === modeId;
	}

	function soloStageQueueLocked() {
		return soloStageState.phase === "live";
	}

	function soloStagePlacementLocked(modeId = settingsModeId) {
		return (
			modeId === "solo-target" &&
			(isModeLive("solo-target") || soloStageState.phase === "live")
		);
	}

	function closeModeSettings(options: { resetForm?: boolean } = {}) {
		if (options.resetForm !== false) {
			if (settingsModeId === "battle-ladder") {
				syncBattleForm(battleState);
			}

			if (settingsModeId === "group-sticker") {
				syncStickerDanceForm(stickerDanceState);
			}

			if (settingsModeId === "group-pk") {
				syncGroupPkForm(groupPkState);
			}

			if (settingsModeId === "solo-target") {
				syncSoloStageForm(soloStageState);
			}
		}

		stopSettingsOverlayInteraction();
		stopSettingsBattleLineInteraction();
		settingsModeId = null;
	}

	function openModesSettings() {
		modesSettingsOpen = true;
		cameraSettingsOpen = false;
		studioSettingsOpen = false;
		profileMenuOpen = false;
		closeSceneRankingsSettings();
		closeSceneRandomizerSettings();
		closeProfileBorderSettings();
	}

	function closeModesSettings() {
		modesSettingsOpen = false;
	}

	async function handleModeBack() {
		if (workspaceModeIsLive) {
			await endRunningMode({ returnToList: true, reason: "back" });
			return;
		}

		modePanel = "list";
	}

	async function sendRuntimeOverlayCommand(command: RuntimeOverlayCommand) {
		let response: Response;

		try {
			response = await requestProtectedResponse(
				"/api/runtime-overlay/command",
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
					},
					body: JSON.stringify(command),
				},
			);
		} catch (error) {
			handleProtectedRouteFailure(error);
			throw error;
		}

		if (!response.ok) {
			throw new Error("Runtime overlay update failed.");
		}

		return (await response.json()) as RuntimeOverlayState;
	}

	function setLocalRuntimeOverlayState(
		nextState: Partial<RuntimeOverlayState>,
	) {
		runtimeOverlayState = {
			...runtimeOverlayState,
			...nextState,
			frame: nextState.frame
				? { ...nextState.frame }
				: { ...runtimeOverlayState.frame },
			rankings: nextState.rankings
				? {
						...nextState.rankings,
						frame: { ...nextState.rankings.frame },
						castNames: [...nextState.rankings.castNames],
						scores:
							nextState.rankings.scores === undefined
								? [
										...(runtimeOverlayState.rankings
											.scores ?? []),
									]
								: normalizeSceneRankingScores(
										nextState.rankings.scores,
										nextState.rankings.castNames,
									),
					}
				: {
						...runtimeOverlayState.rankings,
						frame: { ...runtimeOverlayState.rankings.frame },
						castNames: [...runtimeOverlayState.rankings.castNames],
						scores: [
							...(runtimeOverlayState.rankings.scores ?? []),
						],
					},
			gifterBinding: nextState.gifterBinding
				? {
						...runtimeOverlayState.gifterBinding,
						...nextState.gifterBinding,
					}
				: { ...runtimeOverlayState.gifterBinding },
			sceneRandomizers: nextState.sceneRandomizers
				? cloneSceneRandomizersState(
						normalizeSceneRandomizersState(
							nextState.sceneRandomizers,
							runtimeOverlayState.sceneRandomizers,
						),
					)
				: cloneSceneRandomizersState(
						runtimeOverlayState.sceneRandomizers,
					),
			customCode: nextState.customCode
				? normalizeCustomCodeSettings(
						nextState.customCode,
						runtimeOverlayState.customCode,
					)
				: normalizeCustomCodeSettings(runtimeOverlayState.customCode),
			version: runtimeOverlayState.version + 1,
			lastUpdatedAt: new Date().toISOString(),
		};
	}

	function sceneRandomizerDefinition(randomizerId: SceneRandomizerId) {
		return (
			sceneRandomizerDefinitions.find(
				(definition) => definition.id === randomizerId,
			) ?? sceneRandomizerDefinitions[0]
		);
	}

	function sceneRandomizerConfig(
		state = runtimeOverlayState.sceneRandomizers,
	) {
		return {
			items: Object.fromEntries(
				sceneRandomizerIds.map((randomizerId) => [
					randomizerId,
					{
						frame: { ...state.items[randomizerId].frame },
						options: [...state.items[randomizerId].options],
						resultHoldMs: state.items[randomizerId].resultHoldMs,
					},
				]),
			),
		};
	}

	function sceneRandomizerOptionsFromText(
		value: string,
		randomizerId: SceneRandomizerId,
	) {
		return normalizeSceneRandomizerOptions(
			value.split(/\r?\n/),
			randomizerId,
		);
	}

	function openSceneRandomizerSettings(randomizerId: SceneRandomizerId) {
		const currentSettings =
			runtimeOverlayState.sceneRandomizers.items[randomizerId] ??
			defaultSceneRandomizerSettings(randomizerId);
		sceneRandomizerSettingsOpen = randomizerId;
		modesSettingsOpen = false;
		cameraSettingsOpen = false;
		studioSettingsOpen = false;
		profileMenuOpen = false;
		sceneRandomizerDraftSettings = {
			frame: { ...currentSettings.frame },
			options: [...currentSettings.options],
			resultHoldMs: currentSettings.resultHoldMs,
		};
		sceneRandomizerDraftOptionsText = currentSettings.options.join("\n");
	}

	function closeSceneRandomizerSettings() {
		stopSceneRandomizerInteraction();
		sceneRandomizerSettingsOpen = null;
		sceneRandomizerSaving = false;
	}

	function resetSceneRandomizerPlacement() {
		if (!sceneRandomizerSettingsOpen) {
			return;
		}

		sceneRandomizerDraftSettings = {
			...sceneRandomizerDraftSettings,
			frame: defaultSceneRandomizerFrame(sceneRandomizerSettingsOpen),
		};
	}

	async function saveSceneRandomizerSettingsFromPopup() {
		if (!sceneRandomizerSettingsOpen || sceneRandomizerSaving) {
			return;
		}

		const randomizerId = sceneRandomizerSettingsOpen;
		const nextSettings = normalizeSceneRandomizerSettings(randomizerId, {
			...sceneRandomizerDraftSettings,
			options: sceneRandomizerOptionsFromText(
				sceneRandomizerDraftOptionsText,
				randomizerId,
			),
		});

		sceneRandomizerSaving = true;
		try {
			const nextRuntimeState = await sendRuntimeOverlayCommand({
				action: "setSceneRandomizer",
				randomizerId,
				settings: nextSettings,
			});
			setLocalRuntimeOverlayState({
				sceneRandomizers: nextRuntimeState.sceneRandomizers,
			});
			if (selectedProfileId) {
				persistSavedProfileGameSettings(
					selectedProfileId,
					SCENE_RANDOMIZERS_KEY,
					sceneRandomizerConfig(nextRuntimeState.sceneRandomizers),
				);
			}
			closeSceneRandomizerSettings();
		} catch (error) {
			showToast(
				error instanceof Error
					? error.message
					: "Failed to save scene tool settings.",
			);
		} finally {
			sceneRandomizerSaving = false;
		}
	}

	async function playSceneRandomizer(randomizerId: SceneRandomizerId) {
		try {
			const nextRuntimeState = await sendRuntimeOverlayCommand({
				action: "playSceneRandomizer",
				randomizerId,
			});
			setLocalRuntimeOverlayState({
				sceneRandomizers: nextRuntimeState.sceneRandomizers,
			});
		} catch (error) {
			showToast(
				error instanceof Error
					? error.message
					: "Failed to play scene tool.",
			);
		}
	}

	function overlayRuntimeUrl() {
		if (!browser) {
			return PACKAGED_DESKTOP_OVERLAY_RUNTIME_URL;
		}

		if (isDesktopApp && desktopAppIsPackaged) {
			return PACKAGED_DESKTOP_OVERLAY_RUNTIME_URL;
		}

		return `${window.location.origin}/overlay/runtime`;
	}

	async function copyOverlayRuntimeUrl() {
		const value = overlayRuntimeUrl();
		try {
			await navigator.clipboard.writeText(value);
			showToast("Overlay runtime link copied.", "info");
		} catch {
			showToast(value, "info");
		}
	}

	function sceneRankingsConfig(
		castNames = sharedCastNamesSnapshot,
		settings = sceneRankingsSettings,
	) {
		return {
			enabled: settings.enabled,
			frame: { ...settings.frame },
			castNames: sanitizeCastNameList(castNames),
		};
	}

	function currentRankingSummary(
		modeId = runningModeId,
		battle = battleState,
		stickerDance = stickerDanceState,
		groupPk = groupPkState,
		soloStage = soloStageState,
	) {
		if (!modeId) {
			return null;
		}

		// Completed rounds are read from their audit snapshots. Feeding an ended
		// server state back in here would overwrite later audit-only corrections.
		if (!modeHasActiveScoreRound(modeId)) return null;

		switch (modeId) {
			case "battle-ladder":
				return buildLiveGameSummary(modeId, "ranking-live", battle);
			case "group-sticker":
				return buildLiveGameSummary(
					modeId,
					"ranking-live",
					stickerDance,
				);
			case "group-pk":
				return buildLiveGameSummary(modeId, "ranking-live", groupPk);
			case "solo-target":
				return buildLiveGameSummary(modeId, "ranking-live", soloStage);
		}
	}

	function sceneRankingScoresFromFinalCounter(
		castNames = sharedCastNamesSnapshot,
		summaries = currentLiveGameSummaries,
		outsideScores = outsideGameCastScores,
		modeId = runningModeId,
		battle = battleState,
		stickerDance = stickerDanceState,
		groupPk = groupPkState,
		soloStage = soloStageState,
	): SceneRankingScore[] {
		const rosterNames = sanitizeCastNameList(castNames);
		const counter = buildLiveCastScoreCounter(summaries, {
			castNames: rosterNames,
			currentSummary: currentRankingSummary(
				modeId,
				battle,
				stickerDance,
				groupPk,
				soloStage,
			),
		});

		const totals = new Map(
			counter.rows.map((row) => [row.name, row.score]),
		);
		for (const row of outsideScores) {
			totals.set(row.name, (totals.get(row.name) ?? 0) + row.score);
		}

		if (rosterNames.length > 0) {
			return rosterNames.map((name) => ({
				name,
				score: totals.get(name) ?? 0,
			}));
		}

		return Array.from(totals, ([name, score]) => ({ name, score }));
	}

	function sceneRankingsRuntimeConfig(
		castNames = sharedCastNamesSnapshot,
		settings = sceneRankingsSettings,
		scores = sceneRankingScores,
	) {
		const sanitizedCastNames = sanitizeCastNameList(castNames);
		return {
			...sceneRankingsConfig(sanitizedCastNames, settings),
			scores: normalizeSceneRankingScores(scores, sanitizedCastNames),
		};
	}

	function sceneRankingRuntimeSyncKey(
		castNames = sharedCastNamesSnapshot,
		settings = sceneRankingsSettings,
		scores = sceneRankingScores,
	) {
		const config = sceneRankingsRuntimeConfig(castNames, settings, scores);
		return [
			config.enabled ? "1" : "0",
			config.castNames.join("|"),
			config.scores.map((row) => `${row.name}:${row.score}`).join("|"),
		].join("::");
	}

	function showSceneRankingsRuntimeSyncError(error: unknown) {
		const now = Date.now();
		if (now - lastSceneRankingsRuntimeSyncErrorAt < 3000) {
			return;
		}

		lastSceneRankingsRuntimeSyncErrorAt = now;
		showToast(
			error instanceof Error
				? error.message
				: "Failed to sync scene ranking scores.",
		);
	}

	function scheduleSceneRankingsRuntimeFlush(delayMs = 80) {
		if (sceneRankingsRuntimeSyncTimer) {
			clearTimeout(sceneRankingsRuntimeSyncTimer);
		}

		sceneRankingsRuntimeSyncTimer = setTimeout(() => {
			sceneRankingsRuntimeSyncTimer = null;
			flushSceneRankingsRuntimeSync();
		}, delayMs);
	}

	function flushSceneRankingsRuntimeSync() {
		if (sceneRankingsRuntimeSyncInFlight) {
			return Promise.resolve();
		}

		const nextConfig = pendingSceneRankingsRuntimeConfig;
		if (!nextConfig) {
			return Promise.resolve();
		}

		pendingSceneRankingsRuntimeConfig = null;
		sceneRankingsRuntimeSyncInFlight = true;
		return sendRuntimeOverlayCommand({
			action: "setRankings",
			rankings: nextConfig,
		})
			.catch(showSceneRankingsRuntimeSyncError)
			.finally(() => {
				sceneRankingsRuntimeSyncInFlight = false;
				if (pendingSceneRankingsRuntimeConfig) {
					scheduleSceneRankingsRuntimeFlush(0);
				}
			});
	}

	function queueSceneRankingsRuntimeScoresSync(
		castNames = sharedCastNamesSnapshot,
		settings = sceneRankingsSettings,
		scores = sceneRankingScores,
	) {
		const nextConfig = sceneRankingsRuntimeConfig(
			castNames,
			settings,
			scores,
		);
		setLocalRuntimeOverlayState({
			rankings: nextConfig,
		});
		pendingSceneRankingsRuntimeConfig =
			cloneSceneRankingsSettings(nextConfig);
		scheduleSceneRankingsRuntimeFlush();
	}

	async function saveSceneRankingsSettings(
		castNames = sharedCastNamesSnapshot,
		settings = sceneRankingsSettings,
	) {
		sceneRankingsSettings = normalizeSceneRankingsSettings({
			...settings,
			castNames,
		});
		const persistedConfig = sceneRankingsConfig(
			castNames,
			sceneRankingsSettings,
		);
		const nextConfig = sceneRankingsRuntimeConfig(
			castNames,
			sceneRankingsSettings,
			sceneRankingScores,
		);

		if (selectedProfileId) {
			persistSavedProfileGameSettings(
				selectedProfileId,
				SCENE_RANKINGS_KEY,
				persistedConfig,
			);
		}

		setLocalRuntimeOverlayState({
			rankings: nextConfig,
		});
		if (sceneRankingsRuntimeSyncTimer) {
			clearTimeout(sceneRankingsRuntimeSyncTimer);
			sceneRankingsRuntimeSyncTimer = null;
		}
		pendingSceneRankingsRuntimeConfig =
			cloneSceneRankingsSettings(nextConfig);
		await flushSceneRankingsRuntimeSync();
	}

	function openSceneRankingsSettings() {
		sceneRankingsDraftSettings = cloneSceneRankingsSettings(
			sceneRankingsSettings,
		);
		sceneRankingsSettingsOpen = true;
		modesSettingsOpen = false;
		cameraSettingsOpen = false;
		studioSettingsOpen = false;
		profileMenuOpen = false;
	}

	function closeSceneRankingsSettings() {
		stopSceneRankingsInteraction();
		sceneRankingsDraftSettings = cloneSceneRankingsSettings(
			sceneRankingsSettings,
		);
		sceneRankingsSettingsOpen = false;
	}

	async function saveSceneRankingsSettingsFromPopup() {
		if (sceneRankingsSaving) {
			return;
		}

		sceneRankingsSaving = true;
		stopSceneRankingsInteraction();

		try {
			await saveSceneRankingsSettings(
				sharedCastNamesSnapshot,
				sceneRankingsDraftSettings,
			);
			sceneRankingsDraftSettings = cloneSceneRankingsSettings(
				sceneRankingsSettings,
			);
			sceneRankingsSettingsOpen = false;
		} catch (error) {
			if (handleProtectedRouteFailure(error)) {
				return;
			}

			showToast(
				error instanceof Error
					? error.message
					: "Failed to save scene rankings settings.",
			);
		} finally {
			sceneRankingsSaving = false;
		}
	}

	function syncSceneRankingsSettings(castNames = sharedCastNamesSnapshot) {
		void saveSceneRankingsSettings(castNames).catch((error) => {
			showToast(
				error instanceof Error
					? error.message
					: "Failed to sync scene rankings settings.",
			);
		});
	}

	function setSceneRankingsEnabled(enabled: boolean) {
		sceneRankingsDraftSettings = normalizeSceneRankingsSettings({
			...sceneRankingsDraftSettings,
			enabled,
		});
	}

	function resetSceneRankingsPlacement() {
		sceneRankingsDraftSettings = normalizeSceneRankingsSettings({
			...sceneRankingsDraftSettings,
			frame: defaultSceneRankingsSettings().frame,
		});
	}

	function startSettingsOverlayInteraction(
		event: MouseEvent,
		mode: OverlayInteractionMode,
	) {
		if (!settingsModeId || !settingsPreviewSurface) {
			return;
		}

		event.preventDefault();
		event.stopPropagation();

		if (soloStagePlacementLocked(settingsModeId)) {
			return;
		}

		settingsOverlayInteraction = {
			mode,
			startClientX: event.clientX,
			startClientY: event.clientY,
			initialFrame: { ...settingsOverlayFrame },
		};

		window.addEventListener("mousemove", handleSettingsOverlayInteraction);
		window.addEventListener("mouseup", stopSettingsOverlayInteraction);
	}

	function handleSettingsOverlayInteraction(event: MouseEvent) {
		if (
			!settingsOverlayInteraction ||
			!settingsPreviewSurface ||
			!settingsModeId
		) {
			return;
		}

		const rect = settingsPreviewSurface.getBoundingClientRect();
		const deltaX =
			(event.clientX - settingsOverlayInteraction.startClientX) /
			rect.width;
		const deltaY =
			(event.clientY - settingsOverlayInteraction.startClientY) /
			rect.height;
		const nextFrame = { ...settingsOverlayInteraction.initialFrame };
		const surfaceAspectRatio =
			rect.width > 0 && rect.height > 0
				? rect.width / rect.height
				: DEFAULT_PREVIEW_ASPECT_RATIO;

		if (settingsOverlayInteraction.mode === "move") {
			nextFrame.x += deltaX;
			nextFrame.y += deltaY;
		} else if (settingsModeId === "solo-target") {
			const widthFromHeightDelta =
				deltaY * (SOLO_STAGE_OVERLAY_ASPECT_RATIO / surfaceAspectRatio);
			nextFrame.width += (deltaX + widthFromHeightDelta) / 2;
		} else {
			nextFrame.width += deltaX;
			nextFrame.height += deltaY;
		}

		settingsOverlayFrame = normalizeModeOverlayFrame(
			settingsModeId,
			nextFrame,
			{
				surfaceAspectRatio,
			},
		);
	}

	function stopSettingsOverlayInteraction() {
		settingsOverlayInteraction = null;
		window.removeEventListener(
			"mousemove",
			handleSettingsOverlayInteraction,
		);
		window.removeEventListener("mouseup", stopSettingsOverlayInteraction);
	}

	function startSettingsBattleLineInteraction(
		event: MouseEvent,
		mode: BattleLineInteractionMode,
	) {
		if (settingsModeId !== "battle-ladder" || !settingsPreviewSurface) {
			return;
		}

		event.preventDefault();
		event.stopPropagation();

		settingsBattleLineInteraction = {
			mode,
			startClientX: event.clientX,
			startClientY: event.clientY,
			initialFrame: { ...settingsBattleLineFrame },
		};

		window.addEventListener(
			"mousemove",
			handleSettingsBattleLineInteraction,
		);
		window.addEventListener("mouseup", stopSettingsBattleLineInteraction);
	}

	function handleSettingsBattleLineInteraction(event: MouseEvent) {
		if (!settingsBattleLineInteraction || !settingsPreviewSurface) {
			return;
		}

		const rect = settingsPreviewSurface.getBoundingClientRect();
		const deltaX =
			(event.clientX - settingsBattleLineInteraction.startClientX) /
			rect.width;
		const deltaY =
			(event.clientY - settingsBattleLineInteraction.startClientY) /
			rect.height;
		const nextFrame = { ...settingsBattleLineInteraction.initialFrame };

		if (settingsBattleLineInteraction.mode === "move") {
			nextFrame.x += deltaX;
			nextFrame.y += deltaY;
		} else if (settingsBattleLineInteraction.mode === "resize-top") {
			const initialBottom =
				settingsBattleLineInteraction.initialFrame.y +
				settingsBattleLineInteraction.initialFrame.height;
			nextFrame.y = clamp(
				settingsBattleLineInteraction.initialFrame.y + deltaY,
				0,
				initialBottom - MIN_BATTLE_LINE_FRAME_HEIGHT,
			);
			nextFrame.height = initialBottom - nextFrame.y;
		} else {
			nextFrame.height += deltaY;
		}

		settingsBattleLineFrame = normalizeBattleLineFrame(nextFrame);
	}

	function stopSettingsBattleLineInteraction() {
		settingsBattleLineInteraction = null;
		window.removeEventListener(
			"mousemove",
			handleSettingsBattleLineInteraction,
		);
		window.removeEventListener(
			"mouseup",
			stopSettingsBattleLineInteraction,
		);
	}

	function startSceneRankingsInteraction(
		event: MouseEvent,
		mode: OverlayInteractionMode,
	) {
		if (!sceneRankingsPreviewSurface) {
			return;
		}

		event.preventDefault();
		event.stopPropagation();

		sceneRankingsInteraction = {
			mode,
			startClientX: event.clientX,
			startClientY: event.clientY,
			initialFrame: { ...sceneRankingsDraftSettings.frame },
		};

		window.addEventListener("mousemove", handleSceneRankingsInteraction);
		window.addEventListener("mouseup", stopSceneRankingsInteraction);
	}

	function handleSceneRankingsInteraction(event: MouseEvent) {
		if (!sceneRankingsInteraction || !sceneRankingsPreviewSurface) {
			return;
		}

		const rect = sceneRankingsPreviewSurface.getBoundingClientRect();
		const deltaX =
			(event.clientX - sceneRankingsInteraction.startClientX) /
			rect.width;
		const deltaY =
			(event.clientY - sceneRankingsInteraction.startClientY) /
			rect.height;
		const nextFrame = { ...sceneRankingsInteraction.initialFrame };

		if (sceneRankingsInteraction.mode === "move") {
			nextFrame.x += deltaX;
			nextFrame.y += deltaY;
		} else {
			nextFrame.width += deltaX;
			nextFrame.height += deltaY;
		}

		sceneRankingsDraftSettings = {
			...sceneRankingsDraftSettings,
			frame: normalizeSceneRankingsFrame(nextFrame),
		};
	}

	function stopSceneRankingsInteraction() {
		sceneRankingsInteraction = null;
		window.removeEventListener("mousemove", handleSceneRankingsInteraction);
		window.removeEventListener("mouseup", stopSceneRankingsInteraction);
	}

	function startSceneRandomizerInteraction(
		event: MouseEvent,
		mode: OverlayInteractionMode,
	) {
		if (!sceneRandomizerPreviewSurface) {
			return;
		}

		event.preventDefault();
		event.stopPropagation();

		sceneRandomizerInteraction = {
			mode,
			startClientX: event.clientX,
			startClientY: event.clientY,
			initialFrame: { ...sceneRandomizerDraftSettings.frame },
		};

		window.addEventListener("mousemove", handleSceneRandomizerInteraction);
		window.addEventListener("mouseup", stopSceneRandomizerInteraction);
	}

	function handleSceneRandomizerInteraction(event: MouseEvent) {
		if (!sceneRandomizerInteraction || !sceneRandomizerPreviewSurface) {
			return;
		}

		const rect = sceneRandomizerPreviewSurface.getBoundingClientRect();
		const deltaX =
			(event.clientX - sceneRandomizerInteraction.startClientX) /
			rect.width;
		const deltaY =
			(event.clientY - sceneRandomizerInteraction.startClientY) /
			rect.height;
		const nextFrame = { ...sceneRandomizerInteraction.initialFrame };
		const surfaceAspectRatio =
			rect.width > 0 && rect.height > 0
				? rect.width / rect.height
				: DEFAULT_PREVIEW_ASPECT_RATIO;

		if (sceneRandomizerInteraction.mode === "move") {
			nextFrame.x += deltaX;
			nextFrame.y += deltaY;
		} else {
			const widthFromHeightDelta =
				deltaY *
				(LUCKY_WHEEL_OVERLAY_ASPECT_RATIO / surfaceAspectRatio);
			nextFrame.width += (deltaX + widthFromHeightDelta) / 2;
		}

		sceneRandomizerDraftSettings = {
			...sceneRandomizerDraftSettings,
			frame: normalizeSceneRandomizerFrame(nextFrame, {
				surfaceAspectRatio,
			}),
		};
	}

	function stopSceneRandomizerInteraction() {
		sceneRandomizerInteraction = null;
		window.removeEventListener(
			"mousemove",
			handleSceneRandomizerInteraction,
		);
		window.removeEventListener("mouseup", stopSceneRandomizerInteraction);
	}

	function stopPreviewTracks() {
		previewStream?.getTracks().forEach((track) => track.stop());
		previewStream = null;
		if (previewElement) {
			previewElement.srcObject = null;
		}
		previewAspectRatio = DEFAULT_PREVIEW_ASPECT_RATIO;
	}

	function waitForVideoMetadata(videoElement: HTMLVideoElement) {
		if (videoElement.readyState >= 1) {
			return Promise.resolve();
		}

		return new Promise<void>((resolve) => {
			const handleLoadedMetadata = () => {
				videoElement.removeEventListener(
					"loadedmetadata",
					handleLoadedMetadata,
				);
				resolve();
			};
			videoElement.addEventListener(
				"loadedmetadata",
				handleLoadedMetadata,
				{ once: true },
			);
		});
	}

	function previewHasRenderableFrame(videoElement: HTMLVideoElement | null) {
		return Boolean(
			videoElement &&
				videoElement.videoWidth > 0 &&
				videoElement.videoHeight > 0,
		);
	}

	function waitForPreviewFrame(
		videoElement: HTMLVideoElement,
		timeoutMs = 2500,
	) {
		if (previewHasRenderableFrame(videoElement)) {
			return Promise.resolve();
		}

		return new Promise<void>((resolve, reject) => {
			const startedAt = Date.now();

			const finish = (error?: Error) => {
				if (animationFrameId !== null) {
					cancelAnimationFrame(animationFrameId);
				}
				window.clearTimeout(pollTimerId);
				window.clearTimeout(timeoutId);
				if (error) {
					reject(error);
					return;
				}
				resolve();
			};

			const pollForFrame = () => {
				if (previewHasRenderableFrame(videoElement)) {
					finish();
					return;
				}

				if (Date.now() - startedAt >= timeoutMs) {
					finish(
						new DOMException(
							"Selected camera did not return a visible frame.",
							"NotReadableError",
						),
					);
					return;
				}

				pollTimerId = window.setTimeout(pollForFrame, 120);
			};

			let animationFrameId: number | null = null;
			let pollTimerId = 0;
			const timeoutId = window.setTimeout(() => {
				finish(
					new DOMException(
						"Selected camera did not return a visible frame.",
						"NotReadableError",
					),
				);
			}, timeoutMs);

			if ("requestVideoFrameCallback" in HTMLVideoElement.prototype) {
				animationFrameId = (
					videoElement as HTMLVideoElement & {
						requestVideoFrameCallback(callback: () => void): number;
					}
				).requestVideoFrameCallback(() => {
					if (previewHasRenderableFrame(videoElement)) {
						finish();
						return;
					}

					pollForFrame();
				});
				return;
			}

			pollForFrame();
		});
	}

	async function requestPreviewStream(selectedInput: VideoInputOption) {
		const desktopPlatform = window.threeStudioDesktop?.platform ?? "";
		if (!selectedInput.isObsVirtualCamera) {
			return navigator.mediaDevices.getUserMedia({
				video: {
					deviceId: { exact: selectedInput.deviceId },
					width: { ideal: 1280 },
					height: { ideal: 720 },
					frameRate: { ideal: 30 },
				},
				audio: false,
			});
		}

		if (desktopPlatform === "win32") {
			return navigator.mediaDevices.getUserMedia({
				video: {
					deviceId: { exact: selectedInput.deviceId },
					frameRate: { ideal: 30 },
				},
				audio: false,
			});
		}

		try {
			return await navigator.mediaDevices.getUserMedia({
				video: {
					deviceId: { exact: selectedInput.deviceId },
					width: { ideal: 1080 },
					height: { ideal: 1920 },
					aspectRatio: { ideal: 9 / 16 },
					frameRate: { ideal: 30 },
				},
				audio: false,
			});
		} catch (error) {
			if (
				error instanceof DOMException &&
				(error.name === "OverconstrainedError" ||
					error.name === "NotReadableError" ||
					error.name === "TrackStartError")
			) {
				return navigator.mediaDevices.getUserMedia({
					video: {
						deviceId: { exact: selectedInput.deviceId },
					},
					audio: false,
				});
			}

			throw error;
		}
	}

	async function startPreviewForVideoInput(selectedInput: VideoInputOption) {
		stopPreviewTracks();
		previewStream = await requestPreviewStream(selectedInput);

		if (previewElement) {
			previewElement.srcObject = previewStream;
			await waitForVideoMetadata(previewElement);
			await previewElement.play();
			await waitForPreviewFrame(previewElement);
			updatePreviewAspectRatio();
		}

		liveChecks = {
			...liveChecks,
			obs: {
				ok: true,
				message: `${selectedInput.label} is connected.`,
			},
		};

		return selectedInput;
	}

	async function connectObsVirtualCamera() {
		previewError = "";
		const devices = await refreshVideoInputDevices({
			ensurePermission: true,
		});
		const selectedInput = preferredVideoInputOption(devices);

		if (!selectedInput) {
			throw new Error(
				"No camera input was found. Start OBS Virtual Camera, then try again.",
			);
		}

		return startPreviewForVideoInput(selectedInput);
	}

	async function connectSelectedVideoInput() {
		previewError = "";
		const selectedInput = selectedVideoInputOption();

		if (!selectedInput) {
			throw new Error(
				"No camera input was selected. Choose a camera source first.",
			);
		}

		await ensureDesktopCameraAccess();
		return startPreviewForVideoInput(selectedInput);
	}

	function shouldRetryObsConnect(error: unknown) {
		if (!(error instanceof Error)) {
			return true;
		}

		return !["NotAllowedError", "PermissionDeniedError"].includes(
			error.name,
		);
	}

	async function connectVideoInputWithRetry(
		connect: () => Promise<VideoInputOption>,
		maxAttempts = OBS_CONNECT_MAX_ATTEMPTS,
	) {
		let lastError: unknown = null;

		for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
			try {
				previewError =
					maxAttempts > 1
						? `Connecting to OBS camera... attempt ${attempt}/${maxAttempts}.`
						: "";
				return await connect();
			} catch (error) {
				lastError = error;
				if (attempt >= maxAttempts || !shouldRetryObsConnect(error)) {
					break;
				}

				previewError = `${formatCameraAccessError(error)} Retrying ${attempt + 1}/${maxAttempts}...`;
				await sleep(250 * attempt);
			}
		}

		throw lastError;
	}

	function syncBattleForm(state: BattleState) {
		const knownNames = sanitizeCastNameList([
			...state.settings.castNames,
			...state.lineupOrder,
			...Object.keys(state.settings.giftsByCast),
		]);

		battleForm = {
			title: state.settings.title,
			durationSeconds: state.settings.durationSeconds,
			castNames: battleStateLineupOrder(state),
			leftGifts: normalizeBattleGiftSlots(
				state.settings.leftGifts,
				0,
				true,
			),
			rightGifts: normalizeBattleGiftSlots(
				state.settings.rightGifts,
				1,
				true,
			),
			giftsByCast: Object.fromEntries(
				knownNames.map((castName, index) => [
					castName,
					normalizeBattleGiftSlots(
						state.settings.giftsByCast[castName] ??
							(index === 0
								? state.settings.leftGifts
								: index === 1
									? state.settings.rightGifts
									: undefined),
						index,
						true,
					),
				]),
			),
			lineStyle:
				state.settings.lineStyle ??
				(state.settings.showBattlePkLineOverlaySurface === false
					? "none"
					: "white"),
			scoreEffect: state.settings.scoreEffect ?? "freeze",
		};
	}

	function syncSoloStageForm(state: SoloStageState) {
		soloStageForm = {
			scoreMode:
				state.settings.scoreMode === "freedom" ? "freedom" : "target",
			castNames: [...state.settings.castNames],
			durationSeconds: state.settings.durationSeconds,
			castText: state.settings.castNames.join("\n"),
			roundCastNames: normalizeBattleCastOrder(
				state.settings.roundCastNames,
				state.settings.castNames,
			),
			targetA: state.settings.targetA,
			targetB: state.settings.targetB,
			visualEffect: state.settings.visualEffect ?? "gold-crown",
		};
	}

	function parseSoloStageCast() {
		if (settingsModeId === "solo-target") {
			return soloStageCastNames;
		}

		return normalizeModeCastSelection(
			soloStageState.settings.castNames,
			soloStageCastSelectionOptions,
			{
				fallbackToAll: false,
				restrictToAvailable: sharedCastRosterLoaded,
			},
		);
	}

	function syncStickerDanceForm(state: StickerDanceState) {
		stickerDanceForm = {
			title: state.settings.title,
			castNames: [...state.settings.castNames],
			castText: state.settings.castNames.join("\n"),
			stickerByCast: { ...state.settings.stickerByCast },
			visualEffect: state.settings.visualEffect ?? "gift-blast",
		};
	}

	function parseStickerDanceCast() {
		return stickerDanceCastNames;
	}

	function syncGroupPkForm(state: GroupPkState) {
		const knownNames = sanitizeCastNameList([
			...state.settings.castNames,
			...Object.keys(state.settings.giftsByCast),
		]);

		groupPkForm = {
			title: state.settings.title,
			durationSeconds: state.settings.durationSeconds,
			castNames: [...state.settings.castNames],
			castText: state.settings.castNames.join("\n"),
			giftsByCast: Object.fromEntries(
				knownNames.map((castName, index) => [
					castName,
					normalizeGroupPkGiftSlots(
						state.settings.giftsByCast[castName],
						index,
					),
				]),
			),
			visualEffect: state.settings.visualEffect ?? "thunder",
		};
	}

	function parseGroupPkCast() {
		return groupPkCastNames;
	}

	function toggleBattleCastSelection(castName: string, checked: boolean) {
		const availableNames = battleCastSelectionOptions;
		const nextCastNames = toggleCastSelection(
			battleCastNames,
			availableNames,
			castName,
			checked,
		);
		const nextGiftsByCast = { ...battleForm.giftsByCast };
		for (const [index, name] of nextCastNames.entries()) {
			if (!Array.isArray(nextGiftsByCast[name])) {
				nextGiftsByCast[name] = defaultBattleGiftNames(index);
			}
		}
		battleForm = {
			...battleForm,
			castNames: nextCastNames,
			giftsByCast: nextGiftsByCast,
		};
	}

	function toggleStickerDanceCastSelection(
		castName: string,
		checked: boolean,
	) {
		const availableNames = stickerDanceCastSelectionOptions;
		stickerDanceForm = {
			...stickerDanceForm,
			castNames: toggleCastSelection(
				stickerDanceCastNames,
				availableNames,
				castName,
				checked,
			),
		};
	}

	function toggleGroupPkCastSelection(castName: string, checked: boolean) {
		const availableNames = groupPkCastSelectionOptions;
		groupPkForm = {
			...groupPkForm,
			castNames: toggleCastSelection(
				groupPkCastNames,
				availableNames,
				castName,
				checked,
			),
		};
	}

	function toggleSoloStageCastSelection(castName: string, checked: boolean) {
		const availableNames = soloStageCastSelectionOptions;
		const nextCastNames = toggleCastSelection(
			soloStageForm.castNames,
			availableNames,
			castName,
			checked,
		);
		soloStageForm = {
			...soloStageForm,
			castNames: nextCastNames,
			roundCastNames: normalizeBattleCastOrder(
				soloStageForm.roundCastNames,
				nextCastNames,
			),
		};
	}

	$: {
		sharedCastRosterLoaded = Boolean(
			selectedProfileId &&
				$studioCastsState.profileId === selectedProfileId &&
				$studioCastsState.status === "ready",
		);
		sharedCastNamesSnapshot = sharedCastRosterLoaded
			? $studioCastNames
			: sanitizeCastNameList([
					...battleState.settings.castNames,
					...battleState.lineupOrder,
					...battleState.contestants.map(
						(contestant) => contestant.name,
					),
					...stickerDanceState.settings.castNames,
					...stickerDanceState.settings.roundCastNames,
					...Object.keys(stickerDanceState.settings.stickerByCast),
					...stickerDanceState.contestants.map(
						(contestant) => contestant.name,
					),
					...groupPkState.settings.castNames,
					...groupPkState.settings.roundCastNames,
					...Object.keys(groupPkState.settings.giftsByCast),
					...groupPkState.contestants.map(
						(contestant) => contestant.name,
					),
					...soloStageState.settings.castNames,
					...soloStageState.settings.roundCastNames,
					...soloStageState.contestants.map(
						(contestant) => contestant.name,
					),
				]);
	}

	$: battleFormDirty = !battleFormMatchesState(battleForm, battleState);

	$: {
		battleCastSelectionOptions = sharedCastRosterLoaded
			? sharedCastNamesSnapshot
			: sanitizeCastNameList([
					...sharedCastNamesSnapshot,
					...battleForm.castNames,
					...battleState.settings.castNames,
					...battleState.lineupOrder,
					...battleState.contestants.map(
						(contestant) => contestant.name,
					),
				]);
	}

	$: {
		battleCastNames = normalizeModeCastSelection(
			battleForm.castNames,
			battleCastSelectionOptions,
			{
				restrictToAvailable: sharedCastRosterLoaded,
			},
		);
	}

	$: battleDetailLineupNames =
		battleState.phase !== "idle" || settingsModeId === "battle-ladder"
			? battleLiveLineupOrder(battleState)
			: sanitizeCastNameList(battleCastNames);

	$: battleDetailLineupContextValue =
		battleState.phase === "live" ? "runtime" : "settings";

	$: battleDetailLineupRows = battleDetailLineupNames.map(
		(castName, index) => ({
			castName,
			score:
				battleRunScores.find((entry) => entry.name === castName)
					?.score ??
				battleQueueScoreForState(battleState, castName, index),
			roundScore: battleQueueScoreForState(battleState, castName, index),
			canReorder: battleCanReorderLineupIndex(
				battleDetailLineupContextValue,
				index,
			),
		}),
	);

	$: battleRunScores = buildLiveCastScoreCounter(
		currentLiveGameSummaries.slice(battleRunSummaryStartIndex),
		{
			castNames: battleDetailLineupNames,
			currentSummary:
				runningModeId === "battle-ladder" &&
				modeHasActiveScoreRound("battle-ladder")
					? buildLiveGameSummary(
							"battle-ladder",
							"run-score",
							battleState,
						)
					: null,
		},
	).rows;

	$: {
		stickerDanceCastSelectionOptions = sharedCastRosterLoaded
			? sharedCastNamesSnapshot
			: sanitizeCastNameList([
					...sharedCastNamesSnapshot,
					...stickerDanceState.settings.castNames,
					...stickerDanceForm.castNames,
					...Object.keys(stickerDanceState.settings.stickerByCast),
					...Object.keys(stickerDanceForm.stickerByCast),
				]);
	}

	$: {
		groupPkCastSelectionOptions = sharedCastRosterLoaded
			? sharedCastNamesSnapshot
			: sanitizeCastNameList([
					...sharedCastNamesSnapshot,
					...groupPkState.settings.castNames,
					...groupPkForm.castNames,
					...Object.keys(groupPkState.settings.giftsByCast),
					...Object.keys(groupPkForm.giftsByCast),
				]);
	}

	$: {
		soloStageCastSelectionOptions = sharedCastRosterLoaded
			? sharedCastNamesSnapshot
			: sanitizeCastNameList([
					...sharedCastNamesSnapshot,
					...soloStageState.settings.castNames,
					...soloStageState.settings.roundCastNames,
					...soloStageForm.castNames,
					...soloStageForm.roundCastNames,
				]);
	}

	$: {
		const availableNames = sharedCastRosterLoaded
			? stickerDanceCastSelectionOptions
			: sanitizeCastNameList([
					...stickerDanceCastSelectionOptions,
					...parseNameBlock(stickerDanceForm.castText),
				]);
		stickerDanceCastNames = normalizeModeCastSelection(
			stickerDanceForm.castNames,
			availableNames,
			{
				restrictToAvailable: sharedCastRosterLoaded,
			},
		);
	}

	$: {
		const availableNames = sharedCastRosterLoaded
			? groupPkCastSelectionOptions
			: sanitizeCastNameList([
					...groupPkCastSelectionOptions,
					...parseNameBlock(groupPkForm.castText),
				]);
		groupPkCastNames = normalizeModeCastSelection(
			groupPkForm.castNames,
			availableNames,
			{
				restrictToAvailable: sharedCastRosterLoaded,
			},
		);
	}

	$: {
		const availableNames = sharedCastRosterLoaded
			? soloStageCastSelectionOptions
			: sanitizeCastNameList([
					...soloStageCastSelectionOptions,
					...parseNameBlock(soloStageForm.castText),
				]);
		soloStageCastNames = normalizeModeCastSelection(
			soloStageForm.castNames,
			availableNames,
			{
				restrictToAvailable: sharedCastRosterLoaded,
			},
		);
	}

	$: {
		if (giftLogModalOpen) {
			const entries = [...sessionGiftLog].reverse();
			giftLogEntries = entries;
			liveAuditGroups = buildLiveAuditGiftGroups(
				entries,
				currentLiveGameSummaries,
				currentRankingSummary(
					runningModeId,
					battleState,
					stickerDanceState,
					groupPkState,
					soloStageState,
				),
			);
			const auditCandidates = auditGifterCandidates(
				entries,
				manualGiftAllocations,
			);
			auditTopGiftersByCast = buildAuditTopGiftersByCast(
				auditCandidates,
				sceneRankingScores,
			);
			auditOverallTopGifters = rankGifters(auditCandidates, {
				limit: 10,
			});
		} else {
			giftLogEntries = [];
			liveAuditGroups = [];
			auditTopGiftersByCast = [];
			auditOverallTopGifters = [];
		}
	}
	$: {
		const allocationCastNames = giftLogAllocationCastNames();
		if (!allocationCastNames.includes(giftLogAllocationCastName)) {
			const nextAllocationCastName = allocationCastNames[0] ?? "";
			if (giftLogAllocationCastName !== nextAllocationCastName) {
				giftLogAllocationCastName = nextAllocationCastName;
			}
		}
	}
	$: if (
		scoreCorrectionModeId &&
		!scoreCorrectionVisible(scoreCorrectionModeId)
	) {
		scoreCorrectionModeId = null;
	}

	function battleGiftSelectorUnavailableIds(
		castName: string,
		slotIndex: number,
	) {
		return Array.from(battleGiftIdsExcept(castName, slotIndex));
	}

	$: battleGiftRows =
		settingsModeId === "battle-ladder"
			? battleGiftMapNames(battleCastSelectionOptions).map(
					(castName, index) => {
						const hasFormSlots = Array.isArray(
							battleForm.giftsByCast[castName],
						);

						const formSlots = hasFormSlots
							? normalizeBattleGiftSlots(
									battleForm.giftsByCast[castName],
									index,
									false,
								)
							: [];

						const savedSlots = hasFormSlots
							? []
							: savedBattleGiftSelections(castName, index);

						const sourceSlots = hasFormSlots
							? formSlots
							: savedSlots;

						const slotCount = Math.min(
							Math.max(
								sourceSlots.length,
								DEFAULT_BATTLE_GIFTS_PER_SIDE,
							),
							MAX_BATTLE_STICKERS,
						);

						return {
							castName,
							active: castSelectionIncludes(
								battleCastNames,
								castName,
							),
							slots: Array.from(
								{ length: slotCount },
								(_, slotIndex) => {
									const giftName =
										sourceSlots[slotIndex] || "";

									const giftEntry =
										stickerDanceGiftEntry(giftName);

									return {
										giftName,
										giftDisplayName: giftName
											? stickerDanceGiftDisplayName(
													giftName,
												)
											: "Select gift",
										giftImageUrl: giftEntry?.giftImageUrl,
									};
								},
							),
						};
					},
				)
			: [];

	$: stickerDanceGiftRows =
		settingsModeId === "group-sticker"
			? stickerDanceGiftMapNames(stickerDanceCastSelectionOptions).map(
					(castName, index) => {
						const giftName =
							stickerDanceForm.stickerByCast[castName] ??
							stickerDanceState.settings.stickerByCast[
								castName
							] ??
							defaultStickerDanceGiftName(index);
						const giftEntry = stickerDanceGiftEntry(giftName);

						return {
							castName,
							active: castSelectionIncludes(
								stickerDanceCastNames,
								castName,
							),
							giftName,
							giftDisplayName:
								stickerDanceGiftDisplayName(giftName),
							giftImageUrl: giftEntry?.giftImageUrl,
						};
					},
				)
			: [];

	$: groupPkGiftRows =
		settingsModeId === "group-pk"
			? groupPkGiftMapNames(groupPkCastSelectionOptions).map(
					(castName, index) => {
						const formSlots = normalizeGroupPkGiftSlots(
							groupPkForm.giftsByCast[castName],
							index,
						);
						const savedSlots = normalizeGroupPkGiftSlots(
							groupPkState.settings.giftsByCast[castName],
							index,
						);

						return {
							castName,
							active: castSelectionIncludes(
								groupPkCastNames,
								castName,
							),
							slots: Array.from(
								{ length: MAX_GROUP_PK_GIFTS_PER_CAST },
								(_, slotIndex) => {
									const giftName =
										formSlots[slotIndex] ||
										savedSlots[slotIndex] ||
										"";
									const giftEntry =
										stickerDanceGiftEntry(giftName);

									return {
										giftName,
										giftDisplayName: giftName
											? stickerDanceGiftDisplayName(
													giftName,
												)
											: "Select gift",
										giftImageUrl: giftEntry?.giftImageUrl,
									};
								},
							),
						};
					},
				)
			: [];

	$: stickerDancePlacementPreviewContestants =
		settingsModeId === "group-sticker"
			? buildInitialStickerDanceContestants(
					stickerDanceCastNames,
					Object.fromEntries(
						stickerDanceGiftRows.map((row) => [
							row.castName,
							row.giftName,
						]),
					) as StickerDanceStickerMap,
				)
			: [];

	$: groupPkPlacementPreviewContestants =
		settingsModeId === "group-pk"
			? buildInitialGroupPkContestants(
					groupPkCastNames,
					Object.fromEntries(
						groupPkGiftRows.map((row, index) => [
							row.castName,
							compactGroupPkGiftSlots(
								row.slots.map((slot) => slot.giftName),
								index,
							),
						]),
					) as GroupPkGiftMap,
				)
			: [];

	$: battlePlacementPreviewContestants =
		settingsModeId === "battle-ladder"
			? buildInitialBattleContestants(
					{
						title: battleForm.title,
						durationSeconds: battleForm.durationSeconds,
						castNames: battleCastNames,
						leftGifts: compactBattleGiftSlots(
							battleGiftRows
								.find(
									(row) =>
										row.castName === battleCastNames[0],
								)
								?.slots.map((slot) => slot.giftName),
							0,
						),
						rightGifts: compactBattleGiftSlots(
							battleGiftRows
								.find(
									(row) =>
										row.castName === battleCastNames[1],
								)
								?.slots.map((slot) => slot.giftName),
							1,
						),
						giftsByCast: Object.fromEntries(
							battleGiftRows.map((row, index) => [
								row.castName,
								compactBattleGiftSlots(
									row.slots.map((slot) => slot.giftName),
									index,
								),
							]),
						),
						overlayFrame: currentBattleOverlayFrame(),
						lineFrame: currentBattleLineFrame(),
						lineStyle: battleForm.lineStyle,
						scoreEffect: battleForm.scoreEffect,
						showBattlePkLineOverlaySurface:
							battleForm.lineStyle !== "none" ||
							battleForm.scoreEffect !== "none",
					},
					battleCastNames,
				)
			: [];

	async function sendBattleCommand(payload: BattleCommand) {
		let response: Response;

		try {
			response = await requestProtectedResponse(
				"/api/game/battle-ladder",
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
					},
					body: JSON.stringify(payload),
				},
			);
		} catch (error) {
			handleProtectedRouteFailure(error);
			throw error;
		}

		if (!response.ok) {
			throw new Error("1v1 PK command failed.");
		}

		return (await response.json()) as BattleState;
	}

	async function sendStickerDanceCommand(payload: StickerDanceCommand) {
		let response: Response;

		try {
			response = await requestProtectedResponse(
				"/api/game/sticker-dance",
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
					},
					body: JSON.stringify(payload),
				},
			);
		} catch (error) {
			handleProtectedRouteFailure(error);
			throw error;
		}

		if (!response.ok) {
			throw new Error("Sticker Dance command failed.");
		}

		return (await response.json()) as StickerDanceState;
	}

	async function sendGroupPkCommand(payload: GroupPkCommand) {
		let response: Response;

		try {
			response = await requestProtectedResponse("/api/game/group-pk", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify(payload),
			});
		} catch (error) {
			handleProtectedRouteFailure(error);
			throw error;
		}

		if (!response.ok) {
			throw new Error("Group PK command failed.");
		}

		return (await response.json()) as GroupPkState;
	}

	async function saveBattleConfig() {
		try {
			if (!selectedProfileId) {
				throw new Error("Log in with a profile first.");
			}

			const config = battleGameSettingsConfig();
			const settings = battleSettingsPayload();

			if (battleState.phase !== "live") {
				applyLocalBattleSettings(settings);
			}

			persistSavedProfileGameSettings(
				selectedProfileId,
				BATTLE_GAME_KEY,
				config,
			);

			battleState = await sendBattleCommand({
				action: "replaceSettings",
				settings,
			});

			syncBattleForm(battleState);
		} catch (error) {
			handleProtectedRouteFailure(error);
			throw error;
		}
	}

	async function startBattleRound() {
		try {
			if (battleState.phase === "ended")
				captureLiveGameSummary("battle-ladder", "before-new-game");
			battleState = await sendBattleCommand({
				action: "start",
			});
			syncBattleForm(battleState);
		} catch (error) {
			showToast(
				error instanceof Error
					? error.message
					: "Failed to start 1v1 PK round.",
			);
		}
	}

	async function endBattleRound() {
		try {
			battleState = await sendBattleCommand({ action: "endRound" });
			syncBattleForm(battleState);
			captureLiveGameSummary("battle-ladder", "end-round");
		} catch (error) {
			showToast(
				error instanceof Error
					? error.message
					: "Failed to end 1v1 PK round.",
			);
		}
	}

	function normalizedCorrectionAmount(amount: number) {
		return Math.max(0, Math.floor(Number(amount) || 0));
	}

	function contestantScoreByName(
		contestants: Array<{ name: string; score: number }>,
		contestantName: string,
	) {
		return (
			contestants.find((contestant) => contestant.name === contestantName)
				?.score ?? 0
		);
	}

	function battleSideLabel(side: BattleSide) {
		const contestant = battleState.contestants.find(
			(entry) => entry.side === side,
		);
		return `${side === "left" ? "Left" : "Right"}${contestant ? ` • ${contestant.name}` : ""}`;
	}

	function battleCorrectionAvailableAmount() {
		return battleCorrectionSource === "unallocated"
			? battleState.unallocatedVotes
			: (battleState.contestants.find(
					(contestant) => contestant.side === battleCorrectionSource,
				)?.score ?? 0);
	}

	async function transferBattleScore() {
		const amount = Math.min(
			normalizedCorrectionAmount(battleCorrectionAmount),
			battleCorrectionAvailableAmount(),
		);
		if (amount <= 0) {
			showToast("No coins available to move for 1v1 PK.");
			return;
		}

		if (battleCorrectionSource === battleCorrectionTarget) {
			showToast("Choose a different source and target for 1v1 PK.");
			return;
		}

		try {
			battleState = await sendBattleCommand({
				action: "transferScore",
				fromSide:
					battleCorrectionSource === "unallocated"
						? null
						: battleCorrectionSource,
				toSide: battleCorrectionTarget,
				amount,
			});
			captureLiveGameSummary(
				"battle-ladder",
				`score-correction:${battleCorrectionSource}->${battleCorrectionTarget}:${amount}`,
			);
		} catch (error) {
			showToast(
				error instanceof Error
					? error.message
					: "Failed to move 1v1 PK score.",
			);
		}
	}

	async function saveStickerDanceConfig() {
		try {
			if (!selectedProfileId) {
				throw new Error("Log in with a profile first.");
			}

			const config = stickerDanceGameSettingsConfig();
			const settings = stickerDanceSettingsPayload();
			if (stickerDanceState.phase !== "live") {
				applyLocalStickerDanceSettings(settings);
			}
			persistSavedProfileGameSettings(
				selectedProfileId,
				STICKER_DANCE_GAME_KEY,
				config,
			);
			stickerDanceState = await sendStickerDanceCommand({
				action: "replaceSettings",
				settings,
			});
			syncStickerDanceForm(stickerDanceState);
		} catch (error) {
			handleProtectedRouteFailure(error);
			throw error;
		}
	}

	async function saveGroupPkConfig() {
		try {
			if (!selectedProfileId) {
				throw new Error("Log in with a profile first.");
			}

			const config = groupPkGameSettingsConfig();
			const settings = groupPkSettingsPayload();
			if (groupPkState.phase !== "live") {
				applyLocalGroupPkSettings(settings);
			}
			persistSavedProfileGameSettings(
				selectedProfileId,
				GROUP_PK_GAME_KEY,
				config,
			);
			groupPkState = await sendGroupPkCommand({
				action: "replaceSettings",
				settings,
			});
			syncGroupPkForm(groupPkState);
		} catch (error) {
			handleProtectedRouteFailure(error);
			throw error;
		}
	}

	async function startGroupPkRound() {
		try {
			if (groupPkState.phase === "ended")
				captureLiveGameSummary("group-pk", "before-new-game");
			await resetModeScoreStore("group-pk");
			groupPkState = await sendGroupPkCommand({
				action: "start",
				settings: groupPkSettingsPayload(),
			});
		} catch (error) {
			showToast(
				error instanceof Error
					? error.message
					: "Failed to start Group PK round.",
			);
		}
	}

	async function endGroupPkRound() {
		try {
			groupPkState = await sendGroupPkCommand({ action: "endRound" });
			captureLiveGameSummary("group-pk", "end-round");
		} catch (error) {
			showToast(
				error instanceof Error
					? error.message
					: "Failed to end Group PK round.",
			);
		}
	}

	function stickerDanceCorrectionAvailableAmount() {
		return stickerDanceCorrectionSource === "unallocated"
			? stickerDanceState.unallocatedVotes
			: contestantScoreByName(
					stickerDanceState.contestants,
					stickerDanceCorrectionSource,
				);
	}

	async function transferStickerDanceScore() {
		const amount = Math.min(
			normalizedCorrectionAmount(stickerDanceCorrectionAmount),
			stickerDanceCorrectionAvailableAmount(),
		);
		if (amount <= 0) {
			showToast("No coins available to move for Group Sticker.");
			return;
		}

		if (
			stickerDanceCorrectionSource !== "unallocated" &&
			stickerDanceCorrectionSource === stickerDanceCorrectionTarget
		) {
			showToast(
				"Choose a different source and target for Group Sticker.",
			);
			return;
		}

		try {
			stickerDanceState = await sendStickerDanceCommand({
				action: "transferScore",
				fromCastName:
					stickerDanceCorrectionSource === "unallocated"
						? null
						: stickerDanceCorrectionSource,
				toCastName: stickerDanceCorrectionTarget,
				amount,
			});
			captureLiveGameSummary(
				"group-sticker",
				`score-correction:${stickerDanceCorrectionSource}->${stickerDanceCorrectionTarget}:${amount}`,
			);
		} catch (error) {
			showToast(
				error instanceof Error
					? error.message
					: "Failed to move Group Sticker score.",
			);
		}
	}

	function groupPkCorrectionAvailableAmount() {
		return groupPkCorrectionSource === "unallocated"
			? groupPkState.unallocatedVotes
			: contestantScoreByName(
					groupPkState.contestants,
					groupPkCorrectionSource,
				);
	}

	async function transferGroupPkScore() {
		const amount = Math.min(
			normalizedCorrectionAmount(groupPkCorrectionAmount),
			groupPkCorrectionAvailableAmount(),
		);
		if (amount <= 0) {
			showToast("No coins available to move for Group PK.");
			return;
		}

		if (
			groupPkCorrectionSource !== "unallocated" &&
			groupPkCorrectionSource === groupPkCorrectionTarget
		) {
			showToast("Choose a different source and target for Group PK.");
			return;
		}

		try {
			groupPkState = await sendGroupPkCommand({
				action: "transferScore",
				fromCastName:
					groupPkCorrectionSource === "unallocated"
						? null
						: groupPkCorrectionSource,
				toCastName: groupPkCorrectionTarget,
				amount,
			});
			captureLiveGameSummary(
				"group-pk",
				`score-correction:${groupPkCorrectionSource}->${groupPkCorrectionTarget}:${amount}`,
			);
		} catch (error) {
			showToast(
				error instanceof Error
					? error.message
					: "Failed to move Group PK score.",
			);
		}
	}

	function soloStageCorrectionAvailableAmount() {
		return contestantScoreByName(
			soloStageState.contestants,
			soloStageCorrectionSource,
		);
	}

	async function transferSoloStageScore() {
		const amount = Math.min(
			normalizedCorrectionAmount(soloStageCorrectionAmount),
			soloStageCorrectionAvailableAmount(),
		);
		if (amount <= 0) {
			showToast("No points available to move for Solo Stage.");
			return;
		}

		if (
			!soloStageCorrectionSource ||
			!soloStageCorrectionTarget ||
			soloStageCorrectionSource === soloStageCorrectionTarget
		) {
			showToast("Choose a different source and target for Solo Stage.");
			return;
		}

		try {
			soloStageState = await sendSoloStageCommand({
				action: "transferScore",
				fromCastName: soloStageCorrectionSource,
				toCastName: soloStageCorrectionTarget,
				amount,
			});
			captureLiveGameSummary(
				"solo-target",
				`score-correction:${soloStageCorrectionSource}->${soloStageCorrectionTarget}:${amount}`,
			);
		} catch (error) {
			showToast(
				error instanceof Error
					? error.message
					: "Failed to move Solo Stage score.",
			);
		}
	}

	function filteredSoloStageRoundCast() {
		return settingsModeId === "solo-target"
			? normalizeBattleCastOrder(
					soloStageForm.roundCastNames,
					soloStageCastNames,
				)
			: normalizeBattleCastOrder(
					soloStageState.settings.roundCastNames,
					soloStageState.settings.castNames,
				);
	}

	function activeSoloContestant() {
		return (
			soloStageState.contestants[soloStageState.activeContestantIndex] ??
			null
		);
	}

	function soloStagePreviewContestantName() {
		const previewQueue = filteredSoloStageRoundCast();
		if (settingsModeId === "solo-target") {
			return previewQueue[0] ?? "Solo Stage";
		}

		return activeSoloContestant()?.name ?? previewQueue[0] ?? "Solo Stage";
	}

	function soloStagePreviewScore() {
		if (settingsModeId === "solo-target") {
			return 0;
		}

		return activeSoloContestant()?.score ?? 0;
	}

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

	function soloStagePreviewTargetScore() {
		return nextSoloTargetScore(
			soloStagePreviewScore(),
			soloStageForm.targetA,
			soloStageForm.targetB,
		);
	}

	function soloStagePreviewTargetScoreLabel() {
		if (soloStageForm.scoreMode === "freedom") {
			return null;
		}

		return soloStagePreviewTargetScore()?.toLocaleString() ?? null;
	}

	function soloStagePreviewColorTier() {
		const score = soloStagePreviewScore();
		if (score >= soloStageForm.targetB) {
			return "gold" as const;
		}

		if (score >= soloStageForm.targetA) {
			return "purple" as const;
		}

		return "blue" as const;
	}

	function soloStagePreviewProgressPercent() {
		if (soloStageForm.scoreMode === "freedom") {
			return 0;
		}

		const target =
			soloStagePreviewTargetScore() ??
			Math.max(Number(soloStageForm.targetB) || 1, 1);
		return Math.min((soloStagePreviewScore() / target) * 100, 100);
	}

	$: if (battleCorrectionSource === battleCorrectionTarget) {
		battleCorrectionTarget =
			battleCorrectionSource === "left" ? "right" : "left";
	}

	$: {
		const contestantNames = stickerDanceState.contestants.map(
			(contestant) => contestant.name,
		);
		if (!contestantNames.includes(stickerDanceCorrectionTarget)) {
			stickerDanceCorrectionTarget = contestantNames[0] ?? "";
		}

		if (
			stickerDanceCorrectionSource !== "unallocated" &&
			(!contestantNames.includes(stickerDanceCorrectionSource) ||
				stickerDanceCorrectionSource === stickerDanceCorrectionTarget)
		) {
			stickerDanceCorrectionSource =
				contestantNames.find(
					(name) => name !== stickerDanceCorrectionTarget,
				) ?? "unallocated";
		}
	}

	$: {
		const contestantNames = groupPkState.contestants.map(
			(contestant) => contestant.name,
		);
		if (!contestantNames.includes(groupPkCorrectionTarget)) {
			groupPkCorrectionTarget = contestantNames[0] ?? "";
		}

		if (
			groupPkCorrectionSource !== "unallocated" &&
			(!contestantNames.includes(groupPkCorrectionSource) ||
				groupPkCorrectionSource === groupPkCorrectionTarget)
		) {
			groupPkCorrectionSource =
				contestantNames.find(
					(name) => name !== groupPkCorrectionTarget,
				) ?? "unallocated";
		}
	}

	$: {
		const contestantNames = soloStageState.contestants.map(
			(contestant) => contestant.name,
		);
		const defaultTarget =
			activeSoloContestant()?.name ?? contestantNames[0] ?? "";
		if (!contestantNames.includes(soloStageCorrectionTarget)) {
			soloStageCorrectionTarget = defaultTarget;
		}

		if (
			!contestantNames.includes(soloStageCorrectionSource) ||
			soloStageCorrectionSource === soloStageCorrectionTarget
		) {
			soloStageCorrectionSource =
				contestantNames.find(
					(name) => name !== soloStageCorrectionTarget,
				) ?? "";
		}
	}

	function soloStageRemainingMs(nowMs: number) {
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

	function giftArrivalBufferRemainingMs(
		endsAt: string | null,
		nowMs: number,
	) {
		if (!endsAt) {
			return 0;
		}

		const endMs = Date.parse(endsAt);
		if (!Number.isFinite(endMs) || nowMs < endMs) {
			return 0;
		}

		return Math.max(endMs + GIFT_ARRIVAL_BUFFER_MS - nowMs, 0);
	}

	function formatShortDuration(durationMs: number) {
		const totalSeconds = Math.floor(durationMs / 1000);
		const minutes = Math.floor(totalSeconds / 60);
		const seconds = totalSeconds % 60;
		return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
	}

	function groupPkRoundActionLabel() {
		return "Start round";
	}

	function battleRoundActionLabel() {
		return "Start round";
	}

	function battleRuntimeLineupOrder() {
		return battleLiveLineupOrder(battleState);
	}

	function battleQueueContestantForRow(
		state: BattleState,
		castName: string,
		index: number,
	) {
		if (state.phase === "idle") {
			return null;
		}

		const activeSide = index === 0 ? "left" : index === 1 ? "right" : null;
		return (
			(activeSide
				? state.contestants.find(
						(contestant) => contestant.side === activeSide,
					)
				: null) ??
			state.contestants.find(
				(contestant) => contestant.name === castName,
			) ??
			null
		);
	}

	function battleQueueScoreForState(
		state: BattleState,
		castName: string,
		index: number,
	) {
		return battleQueueContestantForRow(state, castName, index)?.score ?? 0;
	}

	function battleLockedLineupCount(context: BattleLineupDragContext) {
		return context === "runtime" && battleState.phase === "live"
			? Math.min(2, battleRuntimeLineupOrder().length)
			: 0;
	}

	function battleLineupReorderLocked(_context: BattleLineupDragContext) {
		return false;
	}

	function battleCanReorderLineupIndex(
		context: BattleLineupDragContext,
		index: number,
	) {
		const lockedCount = battleLockedLineupCount(context);
		const movableCount = battleDetailLineupNames.length - lockedCount;
		return (
			!battleLineupReorderLocked(context) &&
			movableCount > 1 &&
			index >= lockedCount
		);
	}

	function moveBattleLineupName(
		order: string[],
		castName: string,
		targetIndex: number,
	) {
		const fromIndex = order.indexOf(castName);
		if (fromIndex < 0) {
			return order;
		}

		const nextOrder = [...order];
		const [movedCastName] = nextOrder.splice(fromIndex, 1);
		const requestedIndex = Math.max(0, Math.min(targetIndex, order.length));
		const insertIndex = Math.max(
			0,
			Math.min(
				fromIndex < requestedIndex
					? requestedIndex - 1
					: requestedIndex,
				nextOrder.length,
			),
		);
		nextOrder.splice(insertIndex, 0, movedCastName);
		return nextOrder;
	}

	function clearBattleLineupDrag() {
		battleDraggedCastName = "";
		battleDraggedContext = null;
	}

	function startBattleLineupDrag(
		context: BattleLineupDragContext,
		castName: string,
		index: number,
	) {
		if (
			battleLineupReorderLocked(context) ||
			!battleCanReorderLineupIndex(context, index)
		) {
			return;
		}

		battleDraggedCastName = castName;
		battleDraggedContext = context;
	}

	function allowBattleLineupDrop(event: DragEvent) {
		if (
			!battleDraggedContext ||
			battleLineupReorderLocked(battleDraggedContext)
		) {
			return;
		}

		event.preventDefault();
		if (event.dataTransfer) {
			event.dataTransfer.dropEffect = "move";
		}
	}

	function battleLineupDropIndex(event: DragEvent, index: number) {
		const row = event.currentTarget as HTMLElement;
		const bounds = row.getBoundingClientRect();
		return event.clientY > bounds.top + bounds.height / 2
			? index + 1
			: index;
	}

	async function commitBattleLineupOrder(
		context: BattleLineupDragContext,
		targetIndex: number,
	) {
		if (battleLineupReorderLocked(context)) {
			clearBattleLineupDrag();
			return;
		}

		if (!battleDraggedCastName || battleDraggedContext !== context) {
			return;
		}

		const currentOrder = battleDetailLineupNames;
		const draggedIndex = currentOrder.indexOf(battleDraggedCastName);
		const lockedCount = battleLockedLineupCount(context);

		if (draggedIndex < lockedCount || targetIndex < lockedCount) {
			clearBattleLineupDrag();
			return;
		}

		const nextOrder = moveBattleLineupName(
			currentOrder,
			battleDraggedCastName,
			targetIndex,
		);
		clearBattleLineupDrag();

		if (nextOrder.join("\n") === currentOrder.join("\n")) {
			return;
		}

		try {
			battleState = await sendBattleCommand({
				action: "reorderLineup",
				castNames: nextOrder,
			});
			syncBattleForm(battleState);
		} catch (error) {
			showToast(
				error instanceof Error
					? error.message
					: "Failed to reorder 1v1 PK lineup.",
			);
		}
	}

	function battleLineupSlotLabel(index: number) {
		if (index === 0) {
			return "Left";
		}

		if (index === 1) {
			return "Right";
		}

		return "Next";
	}

	function moveName(order: string[], castName: string, targetIndex: number) {
		const fromIndex = order.indexOf(castName);
		if (fromIndex < 0) {
			return order;
		}

		const nextOrder = [...order];
		const [movedName] = nextOrder.splice(fromIndex, 1);
		const requestedIndex = Math.max(0, Math.min(targetIndex, order.length));
		const insertIndex = Math.max(
			0,
			Math.min(
				fromIndex < requestedIndex
					? requestedIndex - 1
					: requestedIndex,
				nextOrder.length,
			),
		);
		nextOrder.splice(insertIndex, 0, movedName);
		return nextOrder;
	}

	function startSoloCastDrag(castName: string) {
		if (soloStageQueueLocked()) {
			return;
		}

		soloDraggedCastName = castName;
	}

	function clearSoloCastDrag() {
		soloDraggedCastName = "";
	}

	function allowSoloCastDrop(event: DragEvent) {
		if (soloStageQueueLocked()) {
			return;
		}

		event.preventDefault();
		if (event.dataTransfer) {
			event.dataTransfer.dropEffect = "move";
		}
	}

	function soloCastDropIndex(event: DragEvent, index: number) {
		const row = event.currentTarget as HTMLElement;
		const bounds = row.getBoundingClientRect();
		return event.clientY > bounds.top + bounds.height / 2
			? index + 1
			: index;
	}

	async function commitSoloCastOrder(targetIndex: number) {
		if (soloStageQueueLocked()) {
			clearSoloCastDrag();
			return;
		}

		if (!soloDraggedCastName) {
			return;
		}

		const currentOrder = soloStageState.contestants.map(
			(contestant) => contestant.name,
		);
		const nextOrder = moveName(
			currentOrder,
			soloDraggedCastName,
			targetIndex,
		);
		clearSoloCastDrag();

		if (nextOrder.join("\n") === currentOrder.join("\n")) {
			return;
		}

		try {
			soloStageState = await sendSoloStageCommand({
				action: "reorderCast",
				castNames: nextOrder,
			});
			syncSoloStageForm(soloStageState);
		} catch (error) {
			showToast(
				error instanceof Error
					? error.message
					: "Failed to reorder Solo Stage cast.",
			);
		}
	}

	async function sendSoloStageCommand(payload: SoloStageCommand) {
		let response: Response;

		try {
			response = await requestProtectedResponse("/api/game/solo-stage", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify(payload),
			});
		} catch (error) {
			handleProtectedRouteFailure(error);
			throw error;
		}

		if (!response.ok) {
			throw new Error("Solo Stage command failed.");
		}

		return (await response.json()) as SoloStageState;
	}

	async function resetModeScoreStore(modeId: ModeId) {
		switch (modeId) {
			case "battle-ladder":
				battleState = await sendBattleCommand({
					action: "resetScores",
				});
				syncBattleForm(battleState);
				return;
			case "group-sticker":
				stickerDanceState = await sendStickerDanceCommand({
					action: "resetScores",
				});
				syncStickerDanceForm(stickerDanceState);
				return;
			case "group-pk":
				groupPkState = await sendGroupPkCommand({
					action: "resetScores",
				});
				syncGroupPkForm(groupPkState);
				return;
			case "solo-target":
				soloStageState = await sendSoloStageCommand({
					action: "resetScores",
				});
				syncSoloStageForm(soloStageState);
				return;
		}
	}

	async function resetAllGameScoreStores() {
		await Promise.all([
			resetModeScoreStore("battle-ladder"),
			resetModeScoreStore("group-sticker"),
			resetModeScoreStore("group-pk"),
			resetModeScoreStore("solo-target"),
		]);
	}

	async function startSoloStageRound() {
		try {
			if (soloStageState.phase === "ended")
				captureLiveGameSummary("solo-target", "before-new-game");
			soloStageState = await sendSoloStageCommand({
				action: "start",
			});
			syncSoloStageForm(soloStageState);
		} catch (error) {
			showToast(
				error instanceof Error
					? error.message
					: "Failed to start Solo Stage round.",
			);
		}
	}

	async function saveSoloStageConfig() {
		try {
			if (!selectedProfileId) {
				throw new Error("Log in with a profile first.");
			}

			const config = soloStageGameSettingsConfig();
			const settings = soloStageSettingsPayload();
			if (soloStageState.phase !== "live") {
				applyLocalSoloStageSettings(settings);
			}
			persistSavedProfileGameSettings(
				selectedProfileId,
				SOLO_STAGE_GAME_KEY,
				config,
			);
			soloStageState = await sendSoloStageCommand({
				action: "replaceSettings",
				settings,
			});
			syncSoloStageForm(soloStageState);
		} catch (error) {
			handleProtectedRouteFailure(error);
			throw error;
		}
	}

	async function toggleGifterBinding() {
		const enabled = !runtimeOverlayState.gifterBinding.enabled;

		try {
			await sendRuntimeOverlayCommand({
				action: "setGifterBinding",
				gifterBinding: { enabled },
			});
			if (selectedProfileId) {
				persistSavedProfileGameSettings(
					selectedProfileId,
					GIFTER_BINDING_KEY,
					{ enabled },
				);
			}
			setLocalRuntimeOverlayState({
				gifterBinding: { enabled },
			});
		} catch (error) {
			showToast(
				error instanceof Error
					? error.message
					: "Failed to update gifter binding.",
			);
		}
	}

	function overlayCustomCodeConfig(
		settings = runtimeOverlayState.customCode,
	) {
		return normalizeCustomCodeSettings(settings) as unknown as Record<
			string,
			unknown
		>;
	}

	function resetCustomOverlayCssDraft() {
		customOverlayCssDraft = "";
	}

	async function saveCustomOverlayCss() {
		if (customOverlayCssSaving) {
			return;
		}

		const customCode = normalizeCustomCodeSettings({
			css: customOverlayCssDraft,
		});

		customOverlayCssSaving = true;
		try {
			const nextRuntimeState = await sendRuntimeOverlayCommand({
				action: "setCustomCode",
				customCode,
			});
			setLocalRuntimeOverlayState({
				customCode: nextRuntimeState.customCode,
			});
			customOverlayCssDraft = nextRuntimeState.customCode.css;

			if (selectedProfileId) {
				persistSavedProfileGameSettings(
					selectedProfileId,
					OVERLAY_CUSTOM_CODE_KEY,
					overlayCustomCodeConfig(nextRuntimeState.customCode),
				);
			}

			showToast("Overlay custom code saved.", "info");
		} catch (error) {
			showToast(
				error instanceof Error
					? error.message
					: "Failed to save overlay custom CSS.",
			);
		} finally {
			customOverlayCssSaving = false;
		}
	}

	function resetSettingsOverlayPlacement(
		modeId = settingsModeId ?? activeModeId,
	) {
		if (soloStagePlacementLocked(modeId)) {
			return;
		}

		settingsOverlayFrame = normalizeModeOverlayFrame(
			modeId,
			{ ...defaultOverlayFrame(modeId) },
			{
				surfaceAspectRatio: DEFAULT_PREVIEW_ASPECT_RATIO,
			},
		);
	}

	function resetBattlePlacement() {
		resetSettingsOverlayPlacement("battle-ladder");
		resetBattleLinePlacement();
	}

	function resetBattleLinePlacement() {
		settingsBattleLineFrame = { ...defaultBattleLineFrame() };
	}

	async function saveModeSettings() {
		if (!settingsModeId) {
			return;
		}

		overlayPresets = {
			...overlayPresets,
			[settingsModeId]: { ...settingsOverlayFrame },
		};

		if (settingsModeId === "battle-ladder") {
			settingsBattleLineFrame = normalizeBattleLineFrame(
				settingsBattleLineFrame,
			);
		}

		if (settingsModeId === "group-sticker") {
			await saveStickerDanceConfig();
		}

		if (settingsModeId === "battle-ladder") {
			await saveBattleConfig();
		}

		if (settingsModeId === "group-pk") {
			await saveGroupPkConfig();
		}

		if (settingsModeId === "solo-target") {
			await saveSoloStageConfig();
		}

		if (
			runtimeOverlayState.visible &&
			runtimeOverlayState.activeModeId === settingsModeId
		) {
			await sendRuntimeOverlayCommand({
				action: "setFrame",
				frame: settingsOverlayFrame,
			});
		}

		closeModeSettings({ resetForm: false });
	}

	async function startMode(modeId = activeModeId) {
		if (!isModeEnabled(modeId)) {
			return;
		}

		if (modeId === "battle-ladder" && runningModeId !== "battle-ladder") {
			battleRunSummaryStartIndex = currentLiveGameSummaries.length;
		}

		activeModeId = modeId;
		modePanel = "detail";

		if (runningModeId && runningModeId !== modeId) {
			await endRunningMode({ reason: "switch-mode" });
			activeModeId = modeId;
			modePanel = "detail";
		}

		closeModeSettings();
		castSettingsOpen = false;

		const presetFrame =
			modeId === "battle-ladder"
				? { ...battleState.settings.overlayFrame }
				: { ...overlayPresets[modeId] };
		const previousRunningModeId = runningModeId;
		const previousRuntimeOverlayState: RuntimeOverlayState = {
			...runtimeOverlayState,
			frame: { ...runtimeOverlayState.frame },
			rankings: {
				...runtimeOverlayState.rankings,
				frame: { ...runtimeOverlayState.rankings.frame },
				castNames: [...runtimeOverlayState.rankings.castNames],
				scores: [...(runtimeOverlayState.rankings.scores ?? [])],
			},
			gifterBinding: { ...runtimeOverlayState.gifterBinding },
			sceneRandomizers: cloneSceneRandomizersState(
				runtimeOverlayState.sceneRandomizers,
			),
			customCode: normalizeCustomCodeSettings(
				runtimeOverlayState.customCode,
			),
		};
		const overlayUpdatePromises = [
			sendRuntimeOverlayCommand({
				action: "setMode",
				modeId,
			}),
			sendRuntimeOverlayCommand({
				action: "setFrame",
				frame: presetFrame,
			}),
			sendRuntimeOverlayCommand({
				action: "setVisible",
				visible: true,
			}),
		];

		runningModeId = modeId;
		setLocalRuntimeOverlayState({
			activeModeId: modeId,
			visible: true,
			frame: presetFrame,
		});

		try {
			await Promise.all([
				...overlayUpdatePromises,
				(async () => {
					if (modeId === "battle-ladder") {
						await saveBattleConfig();
					}

					if (modeId === "group-sticker") {
						if (stickerDanceState.phase === "ended") {
							captureLiveGameSummary(
								"group-sticker",
								"before-new-game",
							);
						}
						await resetModeScoreStore("group-sticker");
						await saveStickerDanceConfig();
						stickerDanceState = await sendStickerDanceCommand({
							action: "start",
							settings: stickerDanceSettingsPayload(),
						});
					}

					if (modeId === "group-pk") {
						await saveGroupPkConfig();
					}

					if (modeId === "solo-target") {
						await saveSoloStageConfig();
					}
				})(),
			]);
		} catch (error) {
			runningModeId = previousRunningModeId;
			runtimeOverlayState = previousRuntimeOverlayState;
			void Promise.allSettled([
				sendRuntimeOverlayCommand({
					action: "setMode",
					modeId: previousRuntimeOverlayState.activeModeId,
				}),
				sendRuntimeOverlayCommand({
					action: "setFrame",
					frame: previousRuntimeOverlayState.frame,
				}),
				sendRuntimeOverlayCommand({
					action: "setVisible",
					visible: previousRuntimeOverlayState.visible,
				}),
			]);
			showToast(
				error instanceof Error
					? error.message
					: `Failed to start ${scoreCorrectionModeLabel(modeId)}.`,
			);
		}
	}

	async function endRunningMode(
		options: { returnToList?: boolean; reason?: string } = {},
	) {
		const lastModeId = runningModeId;

		if (lastModeId === "group-sticker") {
			try {
				stickerDanceState = await sendStickerDanceCommand({
					action: "endRound",
				});
			} catch (error) {
				showToast(
					error instanceof Error
						? error.message
						: "Failed to end Group Sticker round.",
				);
			}
		}

		if (lastModeId === "group-pk") {
			try {
				groupPkState = await sendGroupPkCommand({ action: "endRound" });
			} catch (error) {
				showToast(
					error instanceof Error
						? error.message
						: "Failed to end Group PK round.",
				);
			}
		}

		if (lastModeId === "solo-target" && soloStageState.phase === "live") {
			try {
				soloStageState = await sendSoloStageCommand({
					action: "endRound",
				});
				syncSoloStageForm(soloStageState);
			} catch (error) {
				showToast(
					error instanceof Error
						? error.message
						: "Failed to end Solo Stage round.",
				);
			}
		}

		if (lastModeId === "battle-ladder" && battleState.phase === "live") {
			try {
				battleState = await sendBattleCommand({ action: "endRound" });
				syncBattleForm(battleState);
			} catch (error) {
				showToast(
					error instanceof Error
						? error.message
						: "Failed to end 1v1 PK round.",
				);
			}
		}

		if (lastModeId) {
			captureLiveGameSummary(
				lastModeId,
				options.reason ?? (options.returnToList ? "back" : "stop"),
			);
		}

		if (lastModeId === "battle-ladder") {
			try {
				await resetModeScoreStore("battle-ladder");
			} catch (error) {
				showToast(
					error instanceof Error
						? error.message
						: "Failed to clear the 1v1 game board.",
				);
			}
			battleRunSummaryStartIndex = currentLiveGameSummaries.length;
		}

		await sendRuntimeOverlayCommand({
			action: "setVisible",
			visible: false,
		});
		await sendRuntimeOverlayCommand({
			action: "setMode",
			modeId: null,
		});
		scoreCorrectionModeId = null;
		runningModeId = null;
		if (lastModeId) {
			activeModeId = lastModeId;
			modePanel = options.returnToList ? "list" : "detail";
		}
	}

	async function stopGamesForInactiveLive() {
		if (runningModeId !== null) {
			await endRunningMode({ returnToList: true, reason: "end-live" });
			return;
		}

		modePanel = "list";
	}

	async function loadStudioBootstrap() {
		try {
			const bootstrap = await getStudioBootstrapRequest();
			applyStudioBootstrap(bootstrap);
			await loadSelectedProfileLocalData();
		} catch (error) {
			if (error instanceof ApiError && error.status === 401) {
				redirectToLogin("session-ended");
				return;
			}

			if (error instanceof ApiError && error.status === 503) {
				redirectToLogin("auth-unavailable");
				return;
			}

			throw error;
		}
	}

	async function loadSelectedProfileLocalData() {
		if (!selectedProfileId) {
			return;
		}

		hydrateSelectedProfileFromLocalData(selectedProfileId);

		const [gameSettingsResult, castsResult] = await Promise.allSettled([
			loadProfileGameSettings(selectedProfileId),
			loadProfileStudioCasts(selectedProfileId),
		]);

		if (gameSettingsResult.status === "fulfilled") {
			if (castsResult.status === "fulfilled") {
				const prunedSettings = pruneSavedProfileGameSettingsForRoster(
					selectedProfileId,
					castsResult.value.casts,
				);
				applyBackendGameSettingsResponse(prunedSettings);
			} else {
				applyBackendGameSettingsResponse(gameSettingsResult.value);
			}
			syncSceneRankingsSettings(
				castsResult.status === "fulfilled"
					? castNamesFromStudioCasts(castsResult.value.casts)
					: sharedCastNamesSnapshot,
			);
		} else {
			const error = gameSettingsResult.reason;
			if (handleProtectedRouteFailure(error)) {
				return;
			}
			showToast(
				error instanceof Error
					? error.message
					: "Failed to load profile game settings.",
			);
		}

		if (castsResult.status === "rejected") {
			const error = castsResult.reason;
			if (handleProtectedRouteFailure(error)) {
				return;
			}
			showToast(
				error instanceof Error
					? error.message
					: "Failed to load profile casts.",
			);
		}
	}

	function currentAuthTitle() {
		return authSession?.tiktokProfileId || "Authorized User";
	}

	function clearSessionRefreshTimer() {
		if (!sessionRefreshTimer) {
			return;
		}

		clearTimeout(sessionRefreshTimer);
		sessionRefreshTimer = null;
	}

	function redirectToLogin(reason = "session-ended") {
		if (!browser) {
			return;
		}

		const nextPath = `${window.location.pathname}${window.location.search}`;
		window.location.href = `/login?reason=${encodeURIComponent(reason)}&next=${encodeURIComponent(nextPath)}`;
	}

	function handleProtectedRouteFailure(error: unknown) {
		if (error instanceof ApiError && [401, 403].includes(error.status)) {
			redirectToLogin("session-ended");
			return true;
		}

		if (error instanceof ApiError && error.status === 503) {
			redirectToLogin("auth-unavailable");
			return true;
		}

		return false;
	}

	function scheduleSessionRefresh(
		session: PersistedAuthSession | null = authSession,
	) {
		clearSessionRefreshTimer();
		if (!session) {
			return;
		}

		const refreshDelayMs = Math.max(
			10_000,
			(session.accessTokenExpiresAt -
				Math.floor(Date.now() / 1000) -
				60) *
				1000,
		);
		sessionRefreshTimer = setTimeout(() => {
			void syncAuthSession(true);
		}, refreshDelayMs);
	}

	async function syncAuthSession(forceRefresh = false) {
		try {
			const nextSession = forceRefresh
				? await refreshAuthSession()
				: await initializeAuthSession();

			if (!nextSession) {
				redirectToLogin("session-ended");
				return;
			}

			authSession = nextSession;
			selectedProfileId = syncSelectedProfile();
			scheduleSessionRefresh(nextSession);
			hydrateSelectedProfileFromLocalData(selectedProfileId);

			if (
				!activeStudioProfile ||
				activeStudioProfile.id !== selectedProfileId
			) {
				await loadStudioBootstrap();
				return;
			}

			if (forceRefresh) {
				return;
			}

			await loadSelectedProfileLocalData();
		} catch (error) {
			if (
				error instanceof ApiError &&
				[401, 403].includes(error.status)
			) {
				redirectToLogin("session-ended");
				return;
			}

			if (error instanceof ApiError && error.status === 503) {
				redirectToLogin("auth-unavailable");
				return;
			}

			throw error;
		}
	}

	async function logoutFlow() {
		clearSelectedProfile();
		await logoutFromAuthSession();
		redirectToLogin("session-ended");
	}

	function stopDesktopUpdatePolling() {
		if (!desktopUpdatePollTimer) {
			return;
		}

		clearInterval(desktopUpdatePollTimer);
		desktopUpdatePollTimer = null;
	}

	function shouldPollDesktopUpdateState(
		state: DesktopUpdateState = desktopUpdateState,
	) {
		return (
			state.status === "checking" ||
			state.status === "available" ||
			state.status === "downloading"
		);
	}

	async function refreshDesktopUpdateState() {
		if (!window.threeStudioDesktop?.isDesktop) {
			return;
		}

		desktopUpdateState = await window.threeStudioDesktop.getUpdateState();
		desktopAppVersion =
			desktopUpdateState.currentVersion || desktopAppVersion;
		if (!shouldPollDesktopUpdateState()) {
			stopDesktopUpdatePolling();
		}
	}

	function ensureDesktopUpdatePolling() {
		if (!window.threeStudioDesktop?.isDesktop) {
			return;
		}

		if (!shouldPollDesktopUpdateState()) {
			stopDesktopUpdatePolling();
			return;
		}

		if (desktopUpdatePollTimer) {
			return;
		}

		desktopUpdatePollTimer = setInterval(() => {
			void refreshDesktopUpdateState().catch(() => {
				stopDesktopUpdatePolling();
			});
		}, 1000);
	}

	async function loadDesktopAppInfo() {
		if (!window.threeStudioDesktop?.isDesktop) {
			return;
		}

		const appInfo = await window.threeStudioDesktop.getAppInfo();
		desktopAppVersion = appInfo.version || desktopAppVersion;
		desktopAppIsPackaged = Boolean(appInfo.isPackaged);
		desktopUpdateState = appInfo.updateState;
		ensureDesktopUpdatePolling();
	}

	function formatByteSize(bytes: number | null | undefined) {
		const numericBytes = Number(bytes);
		if (!Number.isFinite(numericBytes) || numericBytes < 0) {
			return "N/A";
		}

		const units = ["B", "KB", "MB", "GB", "TB"];
		let value = numericBytes;
		let unitIndex = 0;
		while (value >= 1024 && unitIndex < units.length - 1) {
			value /= 1024;
			unitIndex += 1;
		}

		const fractionDigits =
			unitIndex === 0 || value >= 100 ? 0 : value >= 10 ? 1 : 2;
		return `${value.toFixed(fractionDigits)} ${units[unitIndex]}`;
	}

	function formatStatusPercent(value: number | null | undefined) {
		const numericValue = Number(value);
		if (!Number.isFinite(numericValue)) {
			return "N/A";
		}

		return `${numericValue.toFixed(numericValue % 1 === 0 ? 0 : 1)}%`;
	}

	function formatStabilityScore(value: number | null | undefined) {
		const numericValue = Number(value);
		if (!Number.isFinite(numericValue)) {
			return "N/A";
		}

		return `${numericValue.toFixed(numericValue % 1 === 0 ? 0 : 1)}/10`;
	}

	function stabilityScoreTone(value: number | null | undefined) {
		const numericValue = Number(value);
		if (!Number.isFinite(numericValue)) {
			return "border-slate-400/15 bg-slate-400/10 text-slate-100";
		}

		if (numericValue >= 8.5) {
			return "border-emerald-300/20 bg-emerald-400/10 text-emerald-100";
		}

		if (numericValue >= 7) {
			return "border-cyan-300/20 bg-cyan-400/10 text-cyan-100";
		}

		if (numericValue >= 5) {
			return "border-amber-300/20 bg-amber-400/10 text-amber-100";
		}

		return "border-rose-300/20 bg-rose-400/10 text-rose-100";
	}

	function formatSpeedMbps(value: number | null | undefined) {
		const numericValue = Number(value);
		if (!Number.isFinite(numericValue)) {
			return "N/A";
		}

		const fractionDigits =
			numericValue >= 100 ? 0 : numericValue >= 10 ? 1 : 2;
		return `${numericValue.toFixed(fractionDigits)} Mbps`;
	}

	function formatLatencyMs(value: number | null | undefined) {
		const numericValue = Number(value);
		if (!Number.isFinite(numericValue)) {
			return "N/A";
		}

		return `${Math.round(numericValue)} ms`;
	}

	function formatStatusTime(value: string | null | undefined) {
		if (!value) {
			return "N/A";
		}

		const timestamp = Date.parse(value);
		if (!Number.isFinite(timestamp)) {
			return "N/A";
		}

		return new Intl.DateTimeFormat(undefined, {
			hour: "2-digit",
			minute: "2-digit",
			second: "2-digit",
		}).format(new Date(timestamp));
	}

	async function openScoreHistory() {
		scoreHistoryOpen = true;
		scoreHistoryLoading = true;
		scoreHistoryError = "";
		profileMenuOpen = false;
		try {
			if (!selectedProfileId)
				throw new Error("Log in with a profile first.");
			const historyRequest = getScoreHistoryRequest(selectedProfileId);
			const dialogModule = await import(
				"$lib/components/studio-score-history-dialog.svelte"
			);
			StudioScoreHistoryDialog ??= dialogModule.default;
			scoreHistory = await historyRequest;
			if (
				!scoreHistory.liveSessions.some(
					(session) => session.id === selectedScoreHistorySessionId,
				)
			) {
				selectedScoreHistorySessionId =
					scoreHistory.liveSessions[0]?.id ?? "";
			}
		} catch (error) {
			scoreHistoryError =
				error instanceof Error
					? error.message
					: "Failed to load score history.";
		} finally {
			scoreHistoryLoading = false;
		}
	}

	async function refreshDesktopSystemStatus() {
		desktopSystemStatusError = "";

		if (!window.threeStudioDesktop?.isDesktop) {
			desktopSystemStatus = null;
			desktopSystemStatusError =
				"Desktop app required for CPU and RAM usage.";
			return;
		}

		desktopSystemStatusLoading = true;
		try {
			desktopSystemStatus =
				await window.threeStudioDesktop.getSystemStatus();
		} catch (error) {
			desktopSystemStatusError =
				error instanceof Error
					? error.message
					: "Failed to load system status.";
		} finally {
			desktopSystemStatusLoading = false;
		}
	}

	async function runDesktopNetworkTestFlow() {
		desktopNetworkTestError = "";

		if (!window.threeStudioDesktop?.isDesktop) {
			desktopNetworkTestError =
				"Desktop app required for the speed test.";
			return;
		}

		desktopNetworkTestRunning = true;
		try {
			desktopNetworkTest =
				await window.threeStudioDesktop.runNetworkTest();
			if (!desktopNetworkTest.ok && desktopNetworkTest.error) {
				desktopNetworkTestError = desktopNetworkTest.error;
			}
			void refreshDesktopSystemStatus();
		} catch (error) {
			desktopNetworkTestError =
				error instanceof Error
					? error.message
					: "Network speed test failed.";
		} finally {
			desktopNetworkTestRunning = false;
		}
	}

	async function openStudioSettings() {
		customOverlayCssDraft = normalizeCustomCodeSettings(
			runtimeOverlayState.customCode,
		).css;
		studioSettingsOpen = true;
		modesSettingsOpen = false;
		closeSceneRankingsSettings();
		profileMenuOpen = false;

		if (!window.threeStudioDesktop?.isDesktop) {
			return;
		}

		try {
			await loadDesktopAppInfo();
		} catch (error) {
			showToast(
				error instanceof Error
					? error.message
					: "Failed to load desktop app status.",
			);
		}
	}

	function closeStudioSettings() {
		studioSettingsOpen = false;
		stopDesktopUpdatePolling();
	}

	async function openCameraSettings() {
		cameraSettingsOpen = true;
		modesSettingsOpen = false;
		closeSceneRankingsSettings();
		closeProfileBorderSettings();
		profileMenuOpen = false;

		try {
			await refreshDesktopCameraAccessStatus();
			if (videoInputDevices.length === 0) {
				await refreshCameraInputsFlow();
				return;
			}

			await loadObsConnectionStatus();
		} catch (error) {
			showToast(
				error instanceof Error
					? error.message
					: "Failed to load camera settings.",
			);
		}
	}

	function closeCameraSettings() {
		cameraSettingsOpen = false;
	}

	async function checkForDesktopUpdatesFlow() {
		if (!window.threeStudioDesktop?.isDesktop) {
			return;
		}

		try {
			desktopUpdateState =
				await window.threeStudioDesktop.checkForUpdates();
			desktopAppVersion =
				desktopUpdateState.currentVersion || desktopAppVersion;
			ensureDesktopUpdatePolling();
		} catch (error) {
			showToast(
				error instanceof Error ? error.message : "Update check failed.",
			);
		}
	}

	async function installDesktopUpdateFlow() {
		if (!window.threeStudioDesktop?.isDesktop) {
			return;
		}

		try {
			const started = await window.threeStudioDesktop.installUpdate();
			if (!started) {
				showToast("No downloaded update is ready to install yet.");
			}
		} catch (error) {
			showToast(
				error instanceof Error
					? error.message
					: "Failed to install the update.",
			);
		}
	}

	function castSettingsLocked() {
		return (
			runningModeId !== null ||
			battleState.phase === "live" ||
			stickerDanceState.phase === "live" ||
			groupPkState.phase === "live" ||
			soloStageState.phase === "live"
		);
	}

	async function addStudioCastFlow() {
		try {
			if (castSettingsLocked()) {
				throw new Error(
					"Cast settings are locked while a mode is running.",
				);
			}

			if (!selectedProfileId) {
				throw new Error("Log in with a profile first.");
			}

			const normalizedNickname = newCastNickname.trim();
			if (!normalizedNickname) {
				throw new Error("Cast nickname is required.");
			}

			const normalizedUsername = normalizeUniqueId(newCastUsername);
			const existingIndex = $studioCasts.findIndex((cast) => {
				const sameNickname =
					cast.nickname.trim().toLowerCase() ===
					normalizedNickname.toLowerCase();
				const sameUsername =
					Boolean(normalizedUsername) &&
					Boolean(cast.username) &&
					normalizeUniqueId(cast.username) === normalizedUsername;
				return sameNickname || sameUsername;
			});
			const nextCasts =
				existingIndex >= 0
					? $studioCasts.map((cast, index) =>
							index === existingIndex
								? {
										...cast,
										username: normalizedUsername,
										nickname: normalizedNickname,
									}
								: cast,
						)
					: [
							...$studioCasts,
							{
								id: crypto.randomUUID(),
								username: normalizedUsername,
								nickname: normalizedNickname,
								createdAt: new Date().toISOString(),
							},
						];

			applySavedStudioCasts(selectedProfileId, nextCasts);
			syncSceneRankingsSettings(castNamesFromStudioCasts(nextCasts));
			newCastUsername = "";
			newCastNickname = "";
		} catch (error) {
			if (handleProtectedRouteFailure(error)) {
				return;
			}
			showToast(
				error instanceof Error ? error.message : "Cast save failed.",
			);
		}
	}

	async function removeStudioCastFlow(castId: string) {
		try {
			if (castSettingsLocked()) {
				throw new Error(
					"Cast settings are locked while a mode is running.",
				);
			}

			if (!selectedProfileId) {
				throw new Error("Log in with a profile first.");
			}

			const nextCasts = $studioCasts.filter((cast) => cast.id !== castId);
			if (nextCasts.length === $studioCasts.length) {
				throw new Error("Cast not found.");
			}

			applySavedStudioCasts(selectedProfileId, nextCasts);
			syncSceneRankingsSettings(castNamesFromStudioCasts(nextCasts));
		} catch (error) {
			if (handleProtectedRouteFailure(error)) {
				return;
			}
			showToast(
				error instanceof Error ? error.message : "Cast removal failed.",
			);
		}
	}

	function resetLiveUiState() {
		viewerCount = 0;
		peakViewerCount = 0;
		liveSessionStartedAt = null;
		liveSessionHistoryId = null;
		lastLiveHistoryCheckpointAt = 0;
		liveSessionRoomId = undefined;
		totalViews = 0;
		totalLikes = 0;
		totalFollows = 0;
		totalDiamonds = 0;
		currentLiveGiftStats = {
			totalGiftCount: 0,
			totalCapturedCoins: 0,
			allocatedCoins: 0,
			unallocatedCoins: 0,
			endedAt: null,
		};
		currentLiveGameSummaries = [];
		currentLiveGameSummaryKeys = new Set();
		battleRunSummaryStartIndex = 0;
		outsideGameCastScores = [];
		gifts = [];
		chat = [];
		allMessages = [];
		sessionGiftLog = [];
		manualGiftAllocations = new Map();
		pendingGiftAllocation = null;
		selectedGiftProfile = null;
		events = [];
		currentEventIndex = 0;
		recentGiftEvents = new Map();
		liveGifterBindings = new Map();
		liveStartedAt = null;
		giftLogModalOpen = false;
		scoreCorrectionModeId = null;
		lastLiveFeedActivityAt = 0;
		updateLiveElapsed();
		updatePerformance();
	}

	function clearLiveReconnectTimer() {
		if (!liveReconnectTimer) {
			return;
		}

		clearTimeout(liveReconnectTimer);
		liveReconnectTimer = null;
	}

	function shouldAutoReconnectLive(errorKind?: LiveErrorKind) {
		if (errorKind === "disabled") {
			return false;
		}

		if (!hasEstablishedLiveSession()) {
			return true;
		}

		return errorKind !== "not_found" && errorKind !== "offline";
	}

	async function finalizeDisconnectedLive(
		message: string,
		options: {
			status?: "disconnected";
		} = {},
	) {
		await disconnectLiveFeed({
			status: options.status ?? "disconnected",
			message,
		});
	}

	function scheduleLiveReconnect(uniqueId: string, message?: string) {
		if (!uniqueId || liveManualDisconnect || liveReconnectTimer) {
			return;
		}

		const nextAttempt = liveReconnectAttempt + 1;
		if (nextAttempt > LIVE_RECONNECT_MAX_ATTEMPTS) {
			clearLiveReconnectTimer();
			void finalizeDisconnectedLive(
				`Lost connection to ${uniqueId} LIVE after ${LIVE_RECONNECT_MAX_ATTEMPTS} reconnect attempts.`,
			);
			return;
		}

		const delayMs = Math.min(
			8000,
			1000 * 2 ** Math.min(liveReconnectAttempt, 3),
		);
		liveReconnectAttempt = nextAttempt;
		liveChecks = {
			...liveChecks,
			live: {
				...liveChecks.live,
				ok: false,
				status: "connecting",
				uniqueId,
				message: message ?? `Reconnecting to ${uniqueId} LIVE...`,
				errorKind: undefined,
			},
		};

		liveReconnectTimer = setTimeout(() => {
			liveReconnectTimer = null;
			openLiveEventSource({
				preserveUi: true,
				isReconnect: true,
				displayUniqueId: uniqueId,
			});
		}, delayMs);
	}

	function buildLiveSessionHistory(endedAt = new Date().toISOString()) {
		if (!liveSessionStartedAt || !liveSessionHistoryId) return null;

		const sessionGifts: LiveSessionGiftHistory[] = sessionGiftLog.map(
			(gift) => {
				const manualAllocation = manualGiftAllocationFor(gift);
				return {
					id: gift.id || gift.giftKey || crypto.randomUUID(),
					capturedAt: gift.capturedAt ?? endedAt,
					viewerName: gift.user,
					viewerUsername:
						gift.viewer?.uniqueId ||
						gift.handle?.replace(/^@/, "") ||
						undefined,
					viewerAvatarUrl: gift.avatarUrl,
					giftId: gift.giftId,
					giftName:
						gift.giftName ||
						gift.text.replace(/^sent\s+/i, "") ||
						"Gift",
					giftImageUrl: gift.imageUrl,
					count: Math.max(
						0,
						Math.floor(Number(gift.countValue) || 0),
					),
					coins: Math.max(0, Math.floor(Number(gift.coins) || 0)),
					allocatedCoins:
						Math.max(
							0,
							Math.floor(Number(gift.allocatedCoins) || 0),
						) +
						(manualAllocation?.sourceCastName === "unallocated" ||
						(!manualAllocation?.sourceCastName &&
							(gift.unallocatedCoins ?? 0) > 0)
							? (manualAllocation?.amount ?? 0)
							: 0),
					unallocatedCoins: Math.max(
						Math.max(
							0,
							Math.floor(Number(gift.unallocatedCoins) || 0),
						) -
							(manualAllocation?.sourceCastName ===
								"unallocated" ||
							(!manualAllocation?.sourceCastName &&
								(gift.unallocatedCoins ?? 0) > 0)
								? (manualAllocation?.amount ?? 0)
								: 0),
						0,
					),
					allocatedTo:
						manualAllocation?.castName ?? gift.allocatedCastName,
					allocationModeId:
						manualAllocation?.modeId ?? gift.allocationModeId,
					allocationModeLabel:
						manualAllocation?.modeId || gift.allocationModeId
							? scoreCorrectionModeLabel(
									manualAllocation?.modeId ??
										gift.allocationModeId ??
										null,
								)
							: undefined,
					allocatedAt:
						manualAllocation?.allocatedAt ?? gift.allocatedAt,
					allocationReason: manualAllocation
						? "manual-allocation"
						: gift.allocationReason,
					gameSessionId:
						manualAllocation?.gameSessionId ?? gift.gameSessionId,
				};
			},
		);

		return {
			id: liveSessionHistoryId,
			uniqueId: activeLiveUniqueId || liveChecks.live.uniqueId,
			roomId: liveSessionRoomId,
			startedAt: liveSessionStartedAt,
			endedAt,
			totalGiftCount: currentLiveGiftStats.totalGiftCount,
			totalCapturedCoins: currentLiveGiftStats.totalCapturedCoins,
			allocatedCoins: currentLiveGiftStats.allocatedCoins,
			unallocatedCoins: currentLiveGiftStats.unallocatedCoins,
			totalViews,
			totalLikes,
			totalFollows,
			peakViewers: peakViewerCount,
			outsideGameScores: outsideGameCastScores.map(({ name, score }) => ({
				name,
				score,
			})),
			gifts: sessionGifts,
			gameSnapshots: currentLiveGameSummaries.map((summary) => ({
				id: summary.key,
				modeId: summary.modeId,
				modeLabel: scoreCorrectionModeLabel(summary.modeId),
				reason: summary.reason,
				capturedAt: summary.capturedAt,
				totalCoins: summary.totalCoins,
				allocatedCoins: summary.allocatedCoins,
				unallocatedCoins: summary.unallocatedCoins,
				rows: summary.rows.map(({ name, score }) => ({ name, score })),
			})),
			gameSessions: buildLiveSessionGameHistories(sessionGifts),
		} satisfies NewLiveSessionHistoryEntry;
	}

	function saveLiveHistoryCheckpoint() {
		const profileId = selectedProfileId;
		const session = buildLiveSessionHistory();
		if (!profileId || !session) return Promise.resolve();

		const request = () =>
			saveLiveSessionHistoryRequest(profileId, session).then(
				() => undefined,
			);
		const result = liveHistorySaveChain.then(request, request);
		liveHistorySaveChain = result.catch(() => undefined);
		return result;
	}

	function beaconLiveHistoryCheckpoint() {
		const profileId = selectedProfileId;
		const session = buildLiveSessionHistory();
		if (!profileId || !session || !navigator.sendBeacon) return;
		const url = `/api/studio/score-history?profileId=${encodeURIComponent(profileId)}`;
		navigator.sendBeacon(
			url,
			new Blob([JSON.stringify(session)], { type: "application/json" }),
		);
	}

	async function disconnectLiveFeed(
		options: {
			status?: "idle" | "disconnected";
			message?: string;
		} = {},
	) {
		const status = options.status ?? "disconnected";
		const uniqueId = activeLiveUniqueId || liveChecks.live.uniqueId;
		const message =
			options.message ??
			(status === "idle"
				? "LIVE checks have not started yet."
				: uniqueId
					? `Disconnected from ${uniqueId} LIVE.`
					: "LIVE disconnected.");

		liveManualDisconnect = true;
		clearLiveReconnectTimer();
		closeLiveEventSource();
		await stopGamesForInactiveLive();
		lastLiveModeScores = snapshotFinalLiveModeScores();
		finalizeLiveGiftStats();
		if (liveSessionStartedAt) {
			try {
				await saveLiveHistoryCheckpoint();
			} catch (error) {
				showToast(
					error instanceof Error
						? `LIVE history was not saved: ${error.message}`
						: "LIVE history was not saved.",
				);
			}
		}
		resetLiveUiState();
		try {
			await resetAllGameScoreStores();
		} catch (error) {
			showToast(
				error instanceof Error
					? `Game scores were not reset: ${error.message}`
					: "Game scores were not reset.",
			);
		}
		liveReconnectAttempt = 0;
		activeLiveUniqueId = "";
		endLiveConfirmOpen = false;
		liveChecks = {
			...liveChecks,
			live: {
				ok: false,
				status,
				uniqueId: status === "idle" ? "" : uniqueId,
				roomId: undefined,
				startedAt: undefined,
				viewerCount: 0,
				message,
				errorKind: undefined,
			},
		};
		liveStatsModalOpen =
			status !== "idle" && hasFinalLiveScoreSummary(lastLiveModeScores);
	}

	async function confirmEndLive() {
		await disconnectLiveFeed();
		showToast("LIVE disconnected.", "info");
	}

	async function handleInactiveLiveState(
		message: Extract<LiveFeedEvent, { type: "status" }>,
	) {
		closeLiveEventSource();
		if (shouldAutoReconnectLive(message.errorKind)) {
			const uniqueId = message.uniqueId || activeLiveUniqueId;
			scheduleLiveReconnect(
				uniqueId,
				message.message ||
					`LIVE disconnected. Reconnecting to ${uniqueId}...`,
			);
			return;
		}

		clearLiveReconnectTimer();
		await finalizeDisconnectedLive(
			message.message ||
				(message.uniqueId
					? `${message.uniqueId} LIVE ended.`
					: "LIVE ended."),
		);
	}

	function handleStalledLiveFeed() {
		const uniqueId = activeLiveUniqueId || liveChecks.live.uniqueId;
		if (!uniqueId || liveManualDisconnect || liveReconnectTimer) {
			return;
		}

		closeLiveEventSource();
		scheduleLiveReconnect(
			uniqueId,
			`LIVE feed stalled. Reconnecting to ${uniqueId}...`,
		);
	}

	function handleLiveFeedMessage(message: LiveFeedEvent) {
		lastLiveFeedActivityAt = Date.now();

		if (message.type === "status") {
			if (message.status === "connected") {
				liveReconnectAttempt = 0;
				clearLiveReconnectTimer();
				liveSessionStartedAt ??= new Date().toISOString();
				liveSessionHistoryId ??= crypto.randomUUID();
			}
			if (message.roomId) liveSessionRoomId = message.roomId;
			peakViewerCount = Math.max(peakViewerCount, message.viewerCount);

			liveStartedAt =
				message.status === "connected"
					? (message.startedAt ??
						liveStartedAt ??
						new Date().toISOString())
					: (message.startedAt ?? liveStartedAt);
			liveChecks = {
				...liveChecks,
				live: {
					ok: message.status === "connected",
					status: message.status,
					uniqueId: message.uniqueId,
					roomId: message.roomId,
					startedAt: message.startedAt,
					viewerCount: message.viewerCount,
					message: message.message ?? liveChecks.live.message,
					errorKind: message.errorKind,
				},
			};
			const statusEvent = mapStatusEvent(message);
			if (statusEvent) {
				pushEvent(statusEvent);
			}
			if (
				message.status === "error" ||
				message.status === "disconnected"
			) {
				void handleInactiveLiveState(message);
			}
			updateLiveElapsed();
			return;
		}

		if (message.type === "roomUser") {
			viewerCount = message.viewerCount;
			peakViewerCount = Math.max(peakViewerCount, message.viewerCount);
			totalViews = Math.max(
				totalViews,
				message.totalUserCount ?? message.viewerCount,
			);
			updatePerformance();
			return;
		}

		if (message.type === "gift") {
			if (markGiftEventSeen(message)) {
				return;
			}

			const giftCount = normalizeGiftCount(message.count);
			if (giftCount <= 0) {
				return;
			}

			const giftKey = giftEventKey(message);
			const giftCoins = resolveGiftCoins(message, giftCount);
			const allocation = liveGiftAllocation(message);
			totalDiamonds += giftCoins;
			recordLiveGiftStats(giftCount, giftCoins, allocation.allocated);
			const giftRow = mapGift(message, {
				giftKey,
				countValue: giftCount,
			});
			const giftFeedRow = mapGiftFeedMessage(message, {
				giftKey,
				countValue: giftCount,
				giftCoins,
				allocation,
			});
			pushGiftPreviewRow(giftRow);
			pushGiftFeedRow(giftFeedRow);
			pushSessionGiftLogRow(giftFeedRow);
			updatePerformance();
			return;
		}

		if (message.type === "chat") {
			chat = [...chat, mapChat(message)].slice(-80);
			pushAllMessage(mapChatFeedMessage(message));
			return;
		}

		if (message.type === "like") {
			totalLikes = Math.max(
				totalLikes,
				message.totalLikeCount ?? message.count,
			);
			pushEvent(mapLike(message));
			updatePerformance();
			return;
		}

		if (message.type === "social") {
			if (message.action === "follow") {
				totalFollows = Math.max(
					totalFollows,
					message.followCount ?? totalFollows + 1,
				);
			}
			pushEvent(mapSocial(message));
			updatePerformance();
		}
	}

	function closeLiveEventSource() {
		liveEventSource?.close();
		liveEventSource = null;
	}

	function currentLiveSidebarSnapshot() {
		return {
			performance,
			gifts,
			chat,
			allMessages,
			currentEvent,
			activeLiveUniqueId,
		};
	}

	function pushCommentsSnapshotToDesktop() {
		if (!browser) {
			return;
		}

		window.threeStudioDesktop?.pushCommentsSnapshot(
			currentLiveSidebarSnapshot(),
		);
	}

	function pushCommentsSnapshotToBrowserWindow() {
		if (!browser || window.threeStudioDesktop?.isDesktop) {
			return;
		}

		if (!commentsWindowRef || commentsWindowRef.closed) {
			commentsWindowRef = null;
			return;
		}

		try {
			commentsWindowRef.postMessage(
				{
					type: COMMENTS_SNAPSHOT_MESSAGE_TYPE,
					snapshot: currentLiveSidebarSnapshot(),
				},
				window.location.origin,
			);
		} catch {}
	}

	function scheduleCommentsSnapshotPush() {
		if (!browser || commentsSnapshotPushQueued) {
			return;
		}

		commentsSnapshotPushQueued = true;

		if (window.threeStudioDesktop?.isDesktop) {
			queueMicrotask(() => {
				commentsSnapshotPushQueued = false;
				pushCommentsSnapshotToDesktop();
			});
			return;
		}

		commentsSnapshotPushFrame = window.requestAnimationFrame(() => {
			commentsSnapshotPushFrame = null;
			commentsSnapshotPushQueued = false;
			pushCommentsSnapshotToBrowserWindow();
		});
	}

	async function openCommentsWindow() {
		if (!browser) {
			return;
		}

		if (window.threeStudioDesktop?.isDesktop) {
			await window.threeStudioDesktop.openCommentsWindow();
			pushCommentsSnapshotToDesktop();
			return;
		}

		if (commentsWindowRef && !commentsWindowRef.closed) {
			commentsWindowRef.focus();
			pushCommentsSnapshotToBrowserWindow();
			return;
		}

		commentsWindowRef = window.open(
			"/comments-window",
			COMMENTS_WINDOW_NAME,
			"popup=yes,width=620,height=920,resizable=yes,scrollbars=no",
		);
		commentsWindowRef?.focus();
		window.setTimeout(() => {
			pushCommentsSnapshotToBrowserWindow();
		}, 150);
	}

	function openLiveEventSource(
		options: {
			preserveUi?: boolean;
			isReconnect?: boolean;
			displayUniqueId?: string;
		} = {},
	) {
		const displayUniqueId =
			normalizeUniqueId(options.displayUniqueId) ||
			normalizeUniqueId(liveChecks.live.uniqueId) ||
			normalizeUniqueId(activeStudioProfile?.username) ||
			normalizeUniqueId(authSession?.tiktokProfileId) ||
			activeLiveUniqueId;
		if (!displayUniqueId) {
			return;
		}

		closeLiveEventSource();
		clearLiveReconnectTimer();
		if (!options.preserveUi) {
			lastLiveGiftStats = null;
			lastLiveModeScores = null;
			liveStatsModalOpen = false;
			resetLiveUiState();
		}
		endLiveConfirmOpen = false;
		activeLiveUniqueId = displayUniqueId;
		liveManualDisconnect = false;
		lastLiveFeedActivityAt = 0;
		const eventSource = new EventSource("/api/tiktok-live");
		liveEventSource = eventSource;
		const isCurrentLiveSource = () => liveEventSource === eventSource;
		if (options.isReconnect) {
			liveChecks = {
				...liveChecks,
				live: {
					...liveChecks.live,
					ok: false,
					status: "connecting",
					uniqueId: displayUniqueId,
					message: `Reconnecting to ${displayUniqueId} LIVE...`,
					errorKind: undefined,
				},
			};
		}
		eventSource.onopen = () => {
			if (!isCurrentLiveSource()) {
				return;
			}

			lastLiveFeedActivityAt = Date.now();
		};
		eventSource.addEventListener(LIVE_FEED_HEARTBEAT_EVENT, () => {
			if (!isCurrentLiveSource()) {
				return;
			}

			lastLiveFeedActivityAt = Date.now();
		});
		eventSource.onmessage = (event) => {
			if (!isCurrentLiveSource()) {
				return;
			}

			handleLiveFeedMessage(JSON.parse(event.data) as LiveFeedEvent);
		};
		eventSource.onerror = () => {
			if (!isCurrentLiveSource()) {
				return;
			}

			closeLiveEventSource();
			if (liveManualDisconnect) {
				return;
			}

			scheduleLiveReconnect(
				displayUniqueId,
				liveChecks.live.status === "connected"
					? `LIVE dropped. Reconnecting to ${displayUniqueId}...`
					: liveChecks.live.message ||
							`Connecting to ${displayUniqueId} LIVE...`,
			);
		};
	}

	async function loadObsConnectionStatus() {
		const selectedInput = selectedVideoInputOption();
		const connected =
			Boolean(selectedInput) &&
			(obsConnection.connected || obsPreviewReady());
		const message = connected
			? `${selectedInput?.label ?? "Selected camera"} is connected.`
			: selectedInput
				? `${selectedInput.label} is selected.`
				: "Start OBS Virtual Camera, then refresh camera sources.";
		obsConnection = {
			connected,
			sceneName: null,
			sourceName: selectedInput?.label ?? "OBS Virtual Camera",
			message,
		};
		setObsLiveCheck(connected, message);
	}

	async function connectObs(
		options: { useSelectedInput?: boolean; maxAttempts?: number } = {},
	) {
		const {
			useSelectedInput = false,
			maxAttempts = OBS_CONNECT_MAX_ATTEMPTS,
		} = options;
		obsConnecting = true;
		try {
			const selectedInput = await connectVideoInputWithRetry(
				useSelectedInput
					? connectSelectedVideoInput
					: connectObsVirtualCamera,
				maxAttempts,
			);
			const message = `${selectedInput.label} is connected.`;
			obsConnection = {
				connected: true,
				sceneName: null,
				sourceName: selectedInput.label,
				message,
			};
			setObsLiveCheck(true, message);
			lastAutoConnectedVideoInputId = selectedInput.deviceId;
		} catch (error) {
			await refreshDesktopCameraAccessStatus();
			const selectedInput = selectedVideoInputOption();
			const message = formatCameraAccessError(error);
			obsConnection = {
				connected: false,
				sceneName: null,
				sourceName: selectedInput?.label ?? "OBS Virtual Camera",
				message,
			};
			setObsLiveCheck(false, message);
			previewError = obsConnection.message;
		} finally {
			obsConnecting = false;
		}
	}

	async function handleVideoInputSelectionChange() {
		stopPreviewTracks();
		previewError = "";
		lastAutoConnectedVideoInputId = "";
		const selectedInput = selectedVideoInputOption();
		obsConnection = {
			connected: false,
			sceneName: null,
			sourceName: selectedInput?.label ?? "OBS Virtual Camera",
			message: selectedInput
				? `Connecting to ${selectedInput.label}...`
				: "Start OBS Virtual Camera, then refresh camera sources.",
		};
		setObsLiveCheck(false, obsConnection.message);
		if (!selectedInput) {
			return;
		}

		await connectObs({ useSelectedInput: true });
	}

	async function refreshCameraInputsFlow() {
		try {
			const devices = await refreshVideoInputDevices({
				ensurePermission: true,
			});
			const selectedInput = selectedVideoInputOption();
			if (
				devices.length > 0 &&
				selectedInput &&
				(!obsPreviewReady() ||
					lastAutoConnectedVideoInputId !== selectedInput.deviceId)
			) {
				await connectObs({ useSelectedInput: true });
				return;
			}

			await loadObsConnectionStatus();
		} catch (error) {
			await refreshDesktopCameraAccessStatus();
			const message = formatCameraAccessError(error);
			previewError = message;
			setObsLiveCheck(false, message);
		}
	}

	async function resetStaleRuntimeOverlayState() {
		try {
			await sendRuntimeOverlayCommand({
				action: "setVisible",
				visible: false,
			});
			await sendRuntimeOverlayCommand({
				action: "setMode",
				modeId: null,
			});
		} catch (error) {
			console.error("[runtime-overlay:startup-reset]", error);
		}
	}

	async function launchStudio() {
		if (!activeStudioProfile) {
			showToast("Log in with a profile before launching studio.");
			return;
		}

		launchingStudio = true;

		try {
			const uniqueId =
				normalizeUniqueId(activeStudioProfile.username) ||
				normalizeUniqueId(authSession?.tiktokProfileId);
			if (!uniqueId) {
				throw new Error("Connect a profile first.");
			}
			await resetAllGameScoreStores();
			await resetStaleRuntimeOverlayState();
			runningModeId = null;
			modePanel = "list";
			let obsOk = obsSourceReady();
			let obsMessage = obsConnection.message;
			if (!obsOk) {
				try {
					const selectedInput = await connectVideoInputWithRetry(
						selectedVideoInputOption()
							? connectSelectedVideoInput
							: connectObsVirtualCamera,
					);
					obsOk = true;
					obsMessage = `${selectedInput.label} is connected.`;
					obsConnection = {
						connected: true,
						sceneName: null,
						sourceName: selectedInput.label,
						message: obsMessage,
					};
					lastAutoConnectedVideoInputId = selectedInput.deviceId;
				} catch (error) {
					await refreshDesktopCameraAccessStatus();
					obsMessage = formatCameraAccessError(error);
					previewError = obsMessage;
					obsConnection = {
						connected: false,
						sceneName: null,
						sourceName:
							selectedVideoInputOption()?.label ??
							"OBS Virtual Camera",
						message: obsMessage,
					};
				}
			}
			liveStartedAt = null;
			updateLiveElapsed();
			liveChecks = {
				obs: {
					ok: obsOk,
					message: obsMessage,
				},
				live: {
					ok: false,
					status: "connecting",
					uniqueId,
					roomId: undefined,
					startedAt: undefined,
					viewerCount: 0,
					message: `Connecting to ${uniqueId} LIVE...`,
					errorKind: undefined,
				},
			};
			liveReconnectAttempt = 0;
			liveManualDisconnect = false;
			clearLiveReconnectTimer();
			openLiveEventSource({
				displayUniqueId: uniqueId,
			});
		} catch (error) {
			showToast(
				error instanceof Error
					? error.message
					: "Failed to connect to TikTok LIVE.",
			);
		} finally {
			launchingStudio = false;
		}
	}

	$: activeMode = modes.find((mode) => mode.id === activeModeId) ?? modes[0];
	$: liveMode =
		runningModeId === null
			? null
			: (modes.find((mode) => mode.id === runningModeId) ?? null);
	$: runningMode =
		modePanel === "detail"
			? (modes.find((mode) => mode.id === activeModeId) ?? null)
			: null;
	$: workspaceModeIsLive =
		liveMode !== null && runningMode?.id === liveMode.id;
	$: currentEvent = events[currentEventIndex] ?? null;
	$: if (browser) {
		performance;
		gifts;
		chat;
		allMessages;
		currentEvent;
		activeLiveUniqueId;
		scheduleCommentsSnapshotPush();
	}
	$: settingsOverlayStyle = [
		`left: ${(settingsOverlayFrame.x * 100).toFixed(2)}%`,
		`top: ${(settingsOverlayFrame.y * 100).toFixed(2)}%`,
		`width: ${(settingsOverlayFrame.width * 100).toFixed(2)}%`,
		`height: ${(settingsOverlayFrame.height * 100).toFixed(2)}%`,
	].join(";");
	$: settingsBattleLineStyle = [
		`left: ${(settingsBattleLineFrame.x * 100).toFixed(2)}%`,
		`top: ${(settingsBattleLineFrame.y * 100).toFixed(2)}%`,
		`width: ${(settingsBattleLineFrame.width * 100).toFixed(2)}%`,
		`height: ${(settingsBattleLineFrame.height * 100).toFixed(2)}%`,
	].join(";");
	$: sceneRankingsEditorSettings = sceneRankingsSettingsOpen
		? sceneRankingsDraftSettings
		: sceneRankingsSettings;
	$: sceneRankingsStyle = [
		`left: ${(sceneRankingsEditorSettings.frame.x * 100).toFixed(2)}%`,
		`top: ${(sceneRankingsEditorSettings.frame.y * 100).toFixed(2)}%`,
		`width: ${(sceneRankingsEditorSettings.frame.width * 100).toFixed(2)}%`,
		`height: ${(sceneRankingsEditorSettings.frame.height * 100).toFixed(2)}%`,
	].join(";");
	$: sceneRandomizerStyle = [
		`left: ${(sceneRandomizerDraftSettings.frame.x * 100).toFixed(2)}%`,
		`top: ${(sceneRandomizerDraftSettings.frame.y * 100).toFixed(2)}%`,
		`width: ${(sceneRandomizerDraftSettings.frame.width * 100).toFixed(2)}%`,
		`height: ${(sceneRandomizerDraftSettings.frame.height * 100).toFixed(2)}%`,
	].join(";");
	$: sceneRandomizerPreviewRun = sceneRandomizerSettingsOpen
		? {
				id: `${sceneRandomizerSettingsOpen}-preview`,
				randomizerId: sceneRandomizerSettingsOpen,
				result:
					sceneRandomizerOptionsFromText(
						sceneRandomizerDraftOptionsText,
						sceneRandomizerSettingsOpen,
					)[0] ?? "Preview",
				resultIndex: 0,
				options: sceneRandomizerOptionsFromText(
					sceneRandomizerDraftOptionsText,
					sceneRandomizerSettingsOpen,
				),
				startedAt: new Date().toISOString(),
				durationMs: 0,
				resultHoldMs: sceneRandomizerDraftSettings.resultHoldMs,
				seed: 0,
			}
		: null;
	$: sceneRankingScores = sceneRankingScoresFromFinalCounter(
		sharedCastNamesSnapshot,
		currentLiveGameSummaries,
		outsideGameCastScores,
		runningModeId ??
			(runtimeOverlayState.visible &&
			runtimeOverlayState.activeModeId &&
			isModeEnabled(runtimeOverlayState.activeModeId)
				? runtimeOverlayState.activeModeId
				: null),
		battleState,
		stickerDanceState,
		groupPkState,
		soloStageState,
	);
	$: sceneRankingRows = sceneRankingRowsForScene({
		battleState,
		stickerDanceState,
		groupPkState,
		soloStageState,
		castNames: sharedCastNamesSnapshot,
		scores: sceneRankingScores,
	});
	$: {
		const nextRankingsRuntimeSyncKey = sceneRankingRuntimeSyncKey(
			sharedCastNamesSnapshot,
			sceneRankingsSettings,
			sceneRankingScores,
		);
		if (
			browser &&
			authSession &&
			nextRankingsRuntimeSyncKey !== sceneRankingsRuntimeSyncKey
		) {
			sceneRankingsRuntimeSyncKey = nextRankingsRuntimeSyncKey;
			queueSceneRankingsRuntimeScoresSync(
				sharedCastNamesSnapshot,
				sceneRankingsSettings,
				sceneRankingScores,
			);
		}
	}
	$: sceneRankingPreviewRows =
		sceneRankingRows.length > 0
			? sceneRankingRows.slice(0, 5)
			: [
					{ rank: 1, name: "Nana", score: 8536963 },
					{ rank: 2, name: "Mona", score: 1263673 },
					{ rank: 3, name: "Lily", score: 423425 },
					{ rank: 4, name: "Meme", score: 232245 },
					{ rank: 5, name: "Iris", score: 212233 },
				];

	onMount(() => {
		const handlePageHide = () => beaconLiveHistoryCheckpoint();
		const handleWindowMessage = (event: MessageEvent) => {
			if (event.origin !== window.location.origin) {
				return;
			}

			if (
				event.data?.type !== COMMENTS_REQUEST_SNAPSHOT_MESSAGE_TYPE &&
				event.data?.type !==
					LEGACY_COMMENTS_REQUEST_SNAPSHOT_MESSAGE_TYPE
			) {
				return;
			}

			if (
				commentsWindowRef === null &&
				event.source &&
				"postMessage" in event.source
			) {
				commentsWindowRef = event.source as Window;
			}

			pushCommentsSnapshotToBrowserWindow();
		};

		window.addEventListener("message", handleWindowMessage);
		window.addEventListener("pagehide", handlePageHide);
		void syncAuthSession().catch((error) => {
			showToast(
				error instanceof Error
					? error.message
					: "Session validation failed.",
			);
		});
		isDesktopApp = Boolean(window.threeStudioDesktop?.isDesktop);
		void preloadGiftCatalog();
		if (window.threeStudioDesktop?.isDesktop) {
			void loadDesktopAppInfo().catch((error) => {
				showToast(
					error instanceof Error
						? error.message
						: "Failed to load desktop app status.",
				);
			});
		}
		void initializeVideoInputs();

		const studioStateSource = new EventSource("/api/studio/state-feed");

		studioStateSource.onmessage = (event) => {
			const payload = JSON.parse(event.data) as StudioStateFeedPayload;

			runtimeOverlayState = payload.runtimeOverlayState;
			if (
				!runtimeOverlayStartupResetDone &&
				runtimeOverlayState.visible &&
				runtimeOverlayState.activeModeId &&
				isModeEnabled(runtimeOverlayState.activeModeId) &&
				!liveChecks.live.ok &&
				liveChecks.live.status === "idle"
			) {
				runtimeOverlayStartupResetDone = true;
				runtimeOverlayState = {
					...runtimeOverlayState,
					activeModeId: null,
					visible: false,
				};
				runningModeId = null;
				modePanel = "list";
				void resetStaleRuntimeOverlayState();
			} else {
				runtimeOverlayStartupResetDone = true;
				runningModeId =
					runtimeOverlayState.visible &&
					runtimeOverlayState.activeModeId &&
					isModeEnabled(runtimeOverlayState.activeModeId)
						? runtimeOverlayState.activeModeId
						: null;
			}

			const nextBattleState = payload.battleState;
			const shouldSyncBattleFormFromFeed =
				settingsModeId !== "battle-ladder" &&
				(!battleFormDirty ||
					isIncomingStateNewer(battleState, nextBattleState));
			if (isIncomingStateCurrentOrNewer(battleState, nextBattleState)) {
				battleState = nextBattleState;
				if (shouldSyncBattleFormFromFeed) {
					syncBattleForm(battleState);
				}
			}

			if (
				isIncomingStateCurrentOrNewer(
					stickerDanceState,
					payload.stickerDanceState,
				)
			) {
				stickerDanceState = payload.stickerDanceState;
				if (settingsModeId !== "group-sticker") {
					syncStickerDanceForm(stickerDanceState);
				}
			}

			if (
				isIncomingStateCurrentOrNewer(
					groupPkState,
					payload.groupPkState,
				)
			) {
				groupPkState = payload.groupPkState;
				if (settingsModeId !== "group-pk") {
					syncGroupPkForm(groupPkState);
				}
			}

			if (
				isIncomingStateCurrentOrNewer(
					soloStageState,
					payload.soloStageState,
				)
			) {
				soloStageState = payload.soloStageState;
				if (settingsModeId !== "solo-target") {
					syncSoloStageForm(soloStageState);
				}
			}

			if (runningModeId) {
				captureLiveGameSummary(runningModeId, "game-update");
			}
		};

		eventRotateTimer = setInterval(() => {
			if (!document.hidden && events.length > 0) {
				currentEventIndex = (currentEventIndex + 1) % events.length;
			}
		}, 2200);

		liveTimerTick = setInterval(() => {
			const now = Date.now();
			const gameTimerActive =
				battleState.phase === "live" ||
				stickerDanceState.phase === "live" ||
				groupPkState.phase === "live" ||
				soloStageState.phase === "live";
			if (gameTimerActive) {
				modeTimerNow = now;
			}
			if (liveChecks.live.status === "connected") {
				updateLiveElapsed();
				if (now - lastLiveHistoryCheckpointAt >= 10_000) {
					lastLiveHistoryCheckpointAt = now;
					void saveLiveHistoryCheckpoint().catch((error) => {
						console.error("[score-history:checkpoint]", error);
					});
				}
			}
			if (
				liveChecks.live.status === "connected" &&
				lastLiveFeedActivityAt > 0 &&
				now - lastLiveFeedActivityAt > LIVE_FEED_STALE_MS
			) {
				handleStalledLiveFeed();
			}
		}, 1000);

		return () => {
			studioStateSource.close();
			clearLiveReconnectTimer();
			closeLiveEventSource();
			clearSessionRefreshTimer();
			if (sceneRankingsRuntimeSyncTimer) {
				clearTimeout(sceneRankingsRuntimeSyncTimer);
				sceneRankingsRuntimeSyncTimer = null;
			}
			pendingSceneRankingsRuntimeConfig = null;
			if (eventRotateTimer) clearInterval(eventRotateTimer);
			if (liveTimerTick) clearInterval(liveTimerTick);
			if (commentsSnapshotPushFrame !== null)
				cancelAnimationFrame(commentsSnapshotPushFrame);
			window.removeEventListener("message", handleWindowMessage);
			window.removeEventListener("pagehide", handlePageHide);
			stopDesktopUpdatePolling();
			stopPreviewTracks();
			stopSettingsOverlayInteraction();
			stopSceneRankingsInteraction();
			stopSceneRandomizerInteraction();
		};
	});
</script>

<svelte:head>
	<title>{APP_DISPLAY_NAME}</title>
	<meta
		name="description"
		content="Clean studio-only desktop layout for live production handoff."
	/>
</svelte:head>

<div class="h-screen overflow-hidden bg-[#071015] px-2 py-2 text-white">
	<div
		class="glass relative mx-auto grid h-[calc(100vh-1rem)] max-w-[1980px] grid-rows-[52px_minmax(0,1fr)] overflow-hidden rounded-[18px] border border-cyan-200/10"
	>
		<header
			class="flex items-center justify-between border-b border-white/8 px-4"
		>
			<div class="flex items-center gap-4">
				<div class="text-[15px] font-medium text-slate-300">
					{APP_DISPLAY_NAME}
				</div>
			</div>

			<div class="flex items-center gap-3 text-sm text-slate-300">
				{#if showLiveStatusBadge()}
					<span
						class={`rounded-[10px] border px-3 py-1.5 text-xs font-medium ${liveStatusTone()}`}
					>
						{liveStatusLabel()}
					</span>
				{/if}
				{#if liveChecks.live.ok}
					<button
						class="inline-flex h-10 items-center gap-2 rounded-[10px] bg-[#fe2c55] px-4 text-sm font-semibold text-white transition hover:bg-[#ff466a]"
						on:click={openEndLiveConfirm}
						aria-label="End LIVE"
						title="End LIVE"
					>
						<span
							class="h-2.5 w-2.5 rounded-full bg-white shadow-[0_0_12px_rgba(255,255,255,0.55)]"
						></span>
						<span class="tabular-nums"
							>{formatDuration(liveElapsedMs)}</span
						>
						<span
							class="text-[10px] uppercase tracking-[0.14em] text-white/82"
							>End</span
						>
					</button>
				{:else}
					<button
						class="h-10 rounded-[10px] bg-[#fe2c55] px-4 text-sm font-semibold text-white transition hover:bg-[#ff466a] disabled:cursor-not-allowed disabled:bg-[#7e2335] disabled:text-white/70"
						on:click={() => void launchStudio()}
						disabled={launchingStudio ||
							liveChecks.live.status === "connecting" ||
							!activeStudioProfile}
					>
						{launchingStudio ||
						liveChecks.live.status === "connecting"
							? "Connecting..."
							: "Start"}
					</button>
				{/if}
				{#if authSession}
					<button
						class="grid h-10 w-10 place-items-center rounded-[12px] border border-white/8 bg-white/[0.03] transition hover:bg-white/[0.05]"
						on:click={() => void openScoreHistory()}
						aria-label="Score history"
						title="LIVE & Score History"
					>
						<svg
							viewBox="0 0 16 16"
							class="h-4 w-4 fill-none stroke-current stroke-[1.4] text-slate-300"
						>
							<circle cx="8" cy="8" r="5.5" />
							<path d="M8 4.5v3.8l2.5 1.4" />
							<path d="M3.4 2.8v2.7H6" />
						</svg>
					</button>
					<button
						class="grid h-10 w-10 place-items-center rounded-[12px] border border-white/8 bg-white/[0.03] transition hover:bg-white/[0.05]"
						on:click={openGiftLogModal}
						aria-label="LIVE data and allocation audit"
						title="LIVE Data & Allocation Audit"
					>
						<svg
							viewBox="0 0 16 16"
							class="h-4 w-4 fill-none stroke-current stroke-[1.4] text-slate-300"
							><path d="M3 2.5h10v11H3z" /><path
								d="M5.3 5h5.4M5.3 7.8h5.4M5.3 10.6h3.2"
							/></svg
						>
					</button>
				{/if}
				{#if authSession}
					<div class="relative">
						<button
							class="flex items-center gap-2 rounded-[12px] border border-white/8 bg-white/[0.03] px-2 py-1.5 transition hover:bg-white/[0.05]"
							on:click={() => {
								profileMenuOpen = !profileMenuOpen;
							}}
						>
							<span
								class="grid h-8 w-8 place-items-center rounded-full bg-white/10 text-xs font-medium"
							>
								{initials(profileMenuAvatarLabel())}
							</span>
							<div class="max-w-[180px] text-left">
								{#if profileMenuButtonSubtitle()}
									<div
										class="truncate text-[12px] font-medium text-slate-100"
									>
										{profileMenuButtonSubtitle()}
									</div>
								{/if}
							</div>
							<svg
								viewBox="0 0 16 16"
								class="h-4 w-4 fill-none stroke-current stroke-[1.5] text-slate-500"
							>
								<path d="m4.5 6.5 3.5 3.5 3.5-3.5" />
							</svg>
						</button>

						{#if profileMenuOpen}
							<div
								class="absolute right-0 top-[calc(100%+8px)] z-40 w-[270px] rounded-[16px] border border-white/10 bg-[#0d151b] p-3 shadow-[0_18px_48px_rgba(0,0,0,0.42)]"
							>
								<div
									class="rounded-[12px] border border-white/8 bg-white/[0.03] px-3 py-2.5"
								>
									<div
										class="text-[10px] uppercase tracking-[0.16em] text-slate-500"
									>
										Active Profile
									</div>
									{#if activeStudioProfile}
										<div
											class="mt-2 text-[12px] font-medium text-slate-100"
										>
											{profileTitleLabel()}
										</div>
										{#if profileHandleLabel()}
											<div
												class="mt-0.5 text-[11px] text-slate-500"
											>
												{profileHandleLabel()}
											</div>
										{/if}
									{:else}
										<div
											class="mt-2 text-[12px] text-slate-400"
										>
											No profile selected.
										</div>
									{/if}
								</div>
								<div class="mt-3 space-y-2">
									{#if activeStudioProfile}
										<button
											class="w-full rounded-[10px] border border-white/8 px-3 py-2 text-[12px] text-slate-200 transition hover:bg-white/[0.05] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
											on:click={() => {
												if (castSettingsLocked()) {
													showToast(
														"Cast settings are locked while a mode is running.",
													);
													return;
												}
												castSettingsOpen = true;
												profileMenuOpen = false;
											}}
											disabled={castSettingsLocked()}
											title={castSettingsLocked()
												? "Cast settings are locked while a mode is running"
												: "Cast Settings"}
										>
											Cast Settings
										</button>
									{/if}
								</div>
								<div class="mt-3 border-t border-white/8 pt-3">
									<button
										class="w-full rounded-[10px] border border-white/8 px-3 py-2 text-[12px] text-slate-200 transition hover:bg-white/[0.05]"
										on:click={() => {
											void logoutFlow();
										}}
									>
										Log Out
									</button>
								</div>
							</div>
						{/if}
					</div>
				{/if}
				<button
					class="grid h-10 w-10 place-items-center rounded-[12px] border border-white/8 bg-white/[0.03] transition hover:bg-white/[0.05]"
					on:click={() => {
						void openStudioSettings();
					}}
					aria-label="Studio settings"
					title="Studio Settings"
				>
					<svg
						viewBox="0 0 16 16"
						class="h-4 w-4 fill-none stroke-current stroke-[1.4] text-slate-300"
					>
						<path
							d="M8 2.4 9 1.8l1.3.8 1.2-.2.6 1.2 1 .7-.1 1.4.7 1-.7 1 .1 1.4-1 .7-.6 1.2-1.2-.2-1.3.8-1-.6-1 .6-1.3-.8-1.2.2-.6-1.2-1-.7.1-1.4-.7-1 .7-1-.1-1.4 1-.7.6-1.2 1.2.2 1.3-.8 1 .6Z"
						/>
						<circle cx="8" cy="8" r="2.1" />
					</svg>
				</button>
			</div>
		</header>

		<main
			class="grid min-h-0 gap-0 p-2"
			style={`grid-template-columns:
                minmax(${MIN_LEFT_PANEL}px, ${leftPanelWidth}px)
                minmax(${MIN_CENTER_PANEL}px, 1fr)
                minmax(${MIN_RIGHT_PANEL}px, ${rightPanelWidth}px);`}
		>
			<aside class="flex min-h-0 flex-col gap-2 overflow-hidden pr-1">
				<section
					class="glass-soft max-h-[50%] shrink-0 overflow-y-auto rounded-[14px] p-2.5"
				>
					<div class="mb-2 flex items-center justify-between gap-3">
						<h2 class="text-[15px] font-semibold text-slate-100">
							Scene
						</h2>
					</div>
					<div class="space-y-1.5">
						{#each scenes as scene}
							<div
								class="flex items-center justify-between rounded-[10px] border border-white/8 bg-white/[0.03] px-2.5 py-1.5"
							>
								<div class="flex items-center gap-2">
									<span
										class="grid h-7 w-7 place-items-center rounded-[9px] bg-white/[0.05] text-slate-300"
									>
										<svg
											viewBox="0 0 16 16"
											class="h-3.5 w-3.5 fill-none stroke-current stroke-[1.4]"
										>
											<path
												d="M2.5 5.1a1.4 1.4 0 0 1 1.4-1.4h6.3a1.4 1.4 0 0 1 1.4 1.4v5.8a1.4 1.4 0 0 1-1.4 1.4H3.9a1.4 1.4 0 0 1-1.4-1.4z"
											/>
											<path
												d="m11.6 6.3 2.4-1.4v6.2l-2.4-1.4"
											/>
										</svg>
									</span>
									<div
										class="text-[12px] font-medium text-slate-100"
									>
										{scene}
									</div>
								</div>
								<div class="ml-2 flex items-center gap-1.5">
									<button
										type="button"
										class="grid h-7 w-7 place-items-center rounded-[9px] border border-white/8 bg-white/[0.03] text-slate-300 transition hover:bg-white/[0.05] hover:text-slate-100"
										on:click={() => {
											void openCameraSettings();
										}}
										aria-label="Camera settings"
										title="Camera Settings"
									>
										<svg
											xmlns="http://www.w3.org/2000/svg"
											viewBox="0 0 16 16"
											fill="none"
											stroke="currentColor"
											stroke-width="1.5"
											stroke-linecap="round"
											stroke-linejoin="round"
											class="h-3.5 w-3.5"
										>
											<path
												d="M8 1.5l.6 1.6a4.9 4.9 0 011.2.5l1.5-.8 1.2 1.2-.8 1.5c.2.4.4.8.5 1.2l1.6.6v1.8l-1.6.6a4.9 4.9 0 01-.5 1.2l.8 1.5-1.2 1.2-1.5-.8a4.9 4.9 0 01-1.2.5l-.6 1.6H7.1l-.6-1.6a4.9 4.9 0 01-1.2-.5l-1.5.8-1.2-1.2.8-1.5a4.9 4.9 0 01-.5-1.2L1.3 8.9V7.1l1.6-.6a4.9 4.9 0 01.5-1.2l-.8-1.5 1.2-1.2 1.5.8a4.9 4.9 0 011.2-.5l.6-1.6H8z"
											/>
											<circle cx="8" cy="8" r="2" />
										</svg>
									</button>
								</div>
							</div>
						{/each}
						
						<div class="relative">
							<div
								class="flex items-center justify-between rounded-[10px] border border-white/8 bg-white/[0.03] px-2.5 py-1.5"
							>
								<div class="flex min-w-0 items-center gap-2">
									<span
										class="grid h-7 w-7 place-items-center rounded-[9px] bg-white/[0.05] text-slate-300"
									>
										<svg
											viewBox="0 0 16 16"
											class="h-3.5 w-3.5 fill-none stroke-current stroke-[1.4]"
										>
											<path d="M3 12.5h10" />
											<path d="M4.5 10V6.5" />
											<path d="M8 10V4" />
											<path d="M11.5 10V7.5" />
										</svg>
									</span>
									<div class="min-w-0">
										<div
											class="truncate text-[12px] font-medium text-slate-100"
										>
											Ranking
										</div>
										<div
											class="truncate text-[10px] text-slate-500"
										>
											{sceneRankingsSettings.enabled
												? "Visible"
												: "Hidden"}
										</div>
									</div>
								</div>
								<button
									type="button"
									class="ml-2 grid h-7 w-7 place-items-center rounded-[9px] border border-white/8 bg-white/[0.03] text-slate-300 transition hover:bg-white/[0.05] hover:text-slate-100"
									on:click={() => {
										if (sceneRankingsSettingsOpen) {
											closeSceneRankingsSettings();
										} else {
											openSceneRankingsSettings();
										}
									}}
									aria-label="Ranking list settings"
									title="Ranking List Settings"
								>
									<svg
										xmlns="http://www.w3.org/2000/svg"
										viewBox="0 0 16 16"
										fill="none"
										stroke="currentColor"
										stroke-width="1.5"
										stroke-linecap="round"
										stroke-linejoin="round"
										class="h-3.5 w-3.5"
									>
										<path
											d="M8 1.5l.6 1.6a4.9 4.9 0 011.2.5l1.5-.8 1.2 1.2-.8 1.5c.2.4.4.8.5 1.2l1.6.6v1.8l-1.6.6a4.9 4.9 0 01-.5 1.2l.8 1.5-1.2 1.2-1.5-.8a4.9 4.9 0 01-1.2.5l-.6 1.6H7.1l-.6-1.6a4.9 4.9 0 01-1.2-.5l-1.5.8-1.2-1.2.8-1.5a4.9 4.9 0 01-.5-1.2L1.3 8.9V7.1l1.6-.6a4.9 4.9 0 01.5-1.2l-.8-1.5 1.2-1.2 1.5.8a4.9 4.9 0 011.2-.5l.6-1.6H8z"
										/>
										<circle cx="8" cy="8" r="2" />
									</svg>
								</button>
							</div>
						</div>

						<!-- profile frame code -->
						<!-- <div
							class="flex items-center justify-between rounded-[10px] border border-white/8 bg-white/[0.03] px-2.5 py-1.5"
						>
							<div class="flex items-center gap-2">
								<span
									class="grid h-7 w-7 place-items-center rounded-[9px] bg-white/[0.05] text-slate-300"
								>
									<svg
										xmlns="http://www.w3.org/2000/svg"
										viewBox="0 0 16 16"
										fill="none"
										stroke="currentColor"
										stroke-width="1.4"
										stroke-linecap="round"
										stroke-linejoin="round"
										class="h-3.5 w-3.5"
									>
										<rect
											x="2.5"
											y="2.5"
											width="11"
											height="11"
											rx="2"
										/>
										<circle cx="8" cy="8" r="2.3" />
									</svg>
								</span>

								<div
									class="text-[12px] font-medium text-slate-100"
								>
									Profile Frame
								</div>
							</div>

							<button
								type="button"
								class="ml-2 grid h-7 w-7 place-items-center rounded-[9px] border border-white/8 bg-white/[0.03] text-slate-300 transition hover:bg-white/[0.05] hover:text-slate-100"
								on:click={() => {
									if (profileBorderSettingsOpen) {
										closeProfileBorderSettings();
									} else {
										openProfileBorderSettings();
									}
								}}
								aria-label="Profile Border Settings"
								title="Profile Border Settings"
							>
								<svg
									xmlns="http://www.w3.org/2000/svg"
									viewBox="0 0 16 16"
									fill="none"
									stroke="currentColor"
									stroke-width="1.5"
									stroke-linecap="round"
									stroke-linejoin="round"
									class="h-3.5 w-3.5"
								>
									<path
										d="M8 1.5l.6 1.6a4.9 4.9 0 011.2.5l1.5-.8 1.2 1.2-.8 1.5c.2.4.4.8.5 1.2l1.6.6v1.8l-1.6.6a4.9 4.9 0 01-.5 1.2l.8 1.5-1.2 1.2-1.5-.8a4.9 4.9 0 01-1.2.5l-.6 1.6H7.1l-.6-1.6a4.9 4.9 0 01-1.2-.5l-1.5.8-1.2-1.2.8-1.5a4.9 4.9 0 01-.5-1.2L1.3 8.9V7.1l1.6-.6a4.9 4.9 0 01.5-1.2l-.8-1.5 1.2-1.2 1.5.8a4.9 4.9 0 011.2-.5l.6-1.6H8z"
									/>
									<circle cx="8" cy="8" r="2" />
								</svg>
							</button>
						</div> -->

						{#each sceneRandomizerDefinitions as randomizer}
							<div
								class="flex items-center justify-between gap-2 rounded-[10px] border border-white/8 bg-white/[0.03] px-2.5 py-1.5 transition hover:bg-white/[0.05]"
							>
								<div class="flex min-w-0 items-center gap-2">
									<span
										class="grid h-7 w-7 shrink-0 place-items-center rounded-[9px] border border-white/8 bg-[linear-gradient(135deg,rgba(26,86,219,0.24),rgba(168,85,247,0.12))] text-slate-200"
									>
										<svg
											viewBox="0 0 16 16"
											class="h-3.5 w-3.5 fill-none stroke-current stroke-[1.5]"
										>
											<circle cx="8" cy="8" r="5.4" />
											<path d="M8 2.6v10.8" />
											<path d="m4.2 4.2 7.6 7.6" />
											<path d="M2.6 8h10.8" />
											<path d="m4.2 11.8 7.6-7.6" />
										</svg>
									</span>
									<div class="min-w-0">
										<div
											class="truncate text-[12px] font-medium text-slate-100"
										>
											{randomizer.label}
										</div>
										<div
											class="truncate text-[10px] text-slate-500"
										>
											{randomizer.description}
										</div>
									</div>
								</div>
								<div class="flex shrink-0 items-center gap-1">
									<button
										type="button"
										class="grid h-7 w-7 place-items-center rounded-[9px] border border-blue-300/18 bg-[#1A56DB]/24 text-blue-100 transition hover:bg-[#1A56DB]/36"
										on:click={() => {
											void playSceneRandomizer(
												randomizer.id,
											);
										}}
										aria-label={`Play ${randomizer.label}`}
										title={`Play ${randomizer.label}`}
									>
										<svg
											viewBox="0 0 16 16"
											class="h-3.5 w-3.5 fill-current"
										>
											<path d="M5.3 3.5v9l7-4.5-7-4.5Z" />
										</svg>
									</button>
									<button
										type="button"
										class="grid h-7 w-7 place-items-center rounded-[9px] border border-white/8 bg-white/[0.03] text-slate-300 transition hover:bg-white/[0.05] hover:text-slate-100"
										on:click={() => {
											openSceneRandomizerSettings(
												randomizer.id,
											);
										}}
										aria-label={`${randomizer.label} settings`}
										title={`${randomizer.label} Settings`}
									>
										<svg
											xmlns="http://www.w3.org/2000/svg"
											viewBox="0 0 16 16"
											fill="none"
											stroke="currentColor"
											stroke-width="1.5"
											stroke-linecap="round"
											stroke-linejoin="round"
											class="h-3.5 w-3.5"
										>
											<path
												d="M8 1.5l.6 1.6a4.9 4.9 0 011.2.5l1.5-.8 1.2 1.2-.8 1.5c.2.4.4.8.5 1.2l1.6.6v1.8l-1.6.6a4.9 4.9 0 01-.5 1.2l.8 1.5-1.2 1.2-1.5-.8a4.9 4.9 0 01-1.2.5l-.6 1.6H7.1l-.6-1.6a4.9 4.9 0 01-1.2-.5l-1.5.8-1.2-1.2.8-1.5a4.9 4.9 0 01-.5-1.2L1.3 8.9V7.1l1.6-.6a4.9 4.9 0 01.5-1.2l-.8-1.5 1.2-1.2 1.5.8a4.9 4.9 0 011.2-.5l.6-1.6H8z"
											/>
											<circle cx="8" cy="8" r="2" />
										</svg>
									</button>
								</div>
							</div>
						{/each}
					</div>
				</section>

				<section
					class="glass-soft flex min-h-[50%] flex-1 flex-col overflow-hidden rounded-[14px] p-3"
				>
					<div class="mb-3 flex items-center justify-between gap-3">
						{#if modePanel === "detail"}
							<div class="flex items-center gap-2">
								<button
									class="grid h-9 w-9 place-items-center rounded-[10px] border border-white/8 text-slate-300 transition hover:bg-white/[0.05] hover:text-slate-100"
									on:click={() => {
										void handleModeBack();
									}}
									aria-label="Back to modes"
									title="Back"
								>
									<svg
										viewBox="0 0 16 16"
										class="h-4 w-4 fill-none stroke-current stroke-[1.6]"
									>
										<path d="M9.8 3.2 5 8l4.8 4.8" />
									</svg>
								</button>
								<div>
									<h2
										class="text-[16px] font-semibold text-slate-100"
									>
										{activeMode.label}
									</h2>
								</div>
							</div>
							<div class="flex items-center gap-2">
								{#if workspaceModeIsLive}
									<button
										class="grid h-9 w-9 place-items-center rounded-[10px] bg-white/[0.06] text-slate-100 transition hover:bg-white/[0.1]"
										on:click={() => {
											void endRunningMode();
										}}
										aria-label="End game"
										title="End"
									>
										<svg
											viewBox="0 0 16 16"
											class="h-4 w-4 fill-current"
										>
											<path d="M4 4h8v8H4z" />
										</svg>
									</button>
								{:else}
									<button
										class="grid h-9 w-9 place-items-center rounded-[10px] border border-white/8 text-slate-300 transition hover:bg-white/[0.05] hover:text-slate-100"
										on:click={() =>
											openModeSettings(activeMode.id)}
										aria-label={`Settings for ${activeMode.label}`}
										title="Settings"
									>
										<svg
											viewBox="0 0 16 16"
											class="h-4 w-4 fill-none stroke-current stroke-[1.4]"
										>
											<path
												d="M8 2.4 9 1.8l1.3.8 1.2-.2.6 1.2 1 .7-.1 1.4.7 1-.7 1 .1 1.4-1 .7-.6 1.2-1.2-.2-1.3.8-1-.6-1 .6-1.3-.8-1.2.2-.6-1.2-1-.7.1-1.4-.7-1 .7-1-.1-1.4 1-.7.6-1.2 1.2.2 1.3-.8 1 .6Z"
											/>
											<circle cx="8" cy="8" r="2.1" />
										</svg>
									</button>
									<button
										class="grid h-9 w-9 place-items-center rounded-[10px] bg-white/[0.08] text-slate-100 transition hover:bg-white/[0.12]"
										on:click={() => {
											void startMode(activeMode.id);
										}}
										aria-label={`Play ${activeMode.label}`}
										title="Play"
									>
										<svg
											viewBox="0 0 16 16"
											class="h-4 w-4 fill-current"
										>
											<path
												d="M5 3.3v9.4L12.7 8 5 3.3Z"
											/>
										</svg>
									</button>
								{/if}
							</div>
						{:else}
							<h2
								class="text-[16px] font-semibold text-slate-100"
							>
								Modes
							</h2>
							<button
								type="button"
								class={`grid h-8 w-8 place-items-center rounded-[10px] border transition ${
									modesSettingsOpen
										? "border-cyan-300/28 bg-cyan-300/12 text-cyan-100"
										: "border-white/8 bg-white/[0.03] text-slate-300 hover:bg-white/[0.05] hover:text-slate-100"
								}`}
								on:click={() => {
									if (modesSettingsOpen) {
										closeModesSettings();
									} else {
										openModesSettings();
									}
								}}
								aria-label="Modes settings"
								aria-pressed={modesSettingsOpen}
								title="Modes Settings"
							>
								<svg
									viewBox="0 0 16 16"
									class="h-4 w-4 fill-none stroke-current stroke-[1.4]"
								>
									<path
										d="M8 2.4 9 1.8l1.3.8 1.2-.2.6 1.2 1 .7-.1 1.4.7 1-.7 1 .1 1.4-1 .7-.6 1.2-1.2-.2-1.3.8-1-.6-1 .6-1.3-.8-1.2.2-.6-1.2-1-.7.1-1.4-.7-1 .7-1-.1-1.4 1-.7.6-1.2 1.2.2 1.3-.8 1 .6Z"
									/>
									<circle cx="8" cy="8" r="2.1" />
								</svg>
							</button>
						{/if}
					</div>

					{#if modePanel === "detail"}
						<div
							transition:fly={{ x: -14, duration: 180 }}
							class="min-h-0 flex-1 overflow-y-auto pr-1"
						>
							<div class="space-y-3">
								{#if activeMode.id === "battle-ladder"}
									<div
										class="rounded-[12px] border border-white/8 bg-black/20 p-2.5"
									>
										<div
											class="flex flex-col gap-2 text-[12px] text-slate-300"
										>
											<div
												class="flex items-center justify-between rounded-[10px] bg-white/[0.03] px-3 py-2"
											>
												<span>Timer</span>
												<span
													class="text-[16px] font-semibold text-slate-100"
												>
													{formatShortDuration(
														battleRemainingMs(
															modeTimerNow,
														),
													)}
												</span>
											</div>

											<div
												class="flex items-center justify-between rounded-[10px] bg-white/[0.03] px-3 py-2"
											>
												<span>Round coins</span>
												<span
													>{battleState.totalVotes}</span
												>
											</div>

											<div
												class="flex items-center justify-between rounded-[10px] bg-white/[0.03] px-3 py-2"
											>
												<span>Round unallocated</span>
												<span
													>{battleState.unallocatedVotes}</span
												>
											</div>
										</div>

										<div class="mt-3 flex flex-wrap gap-2">
											{#if workspaceModeIsLive}
												{#if battleState.phase !== "live"}
													<button
														class="inline-flex items-center gap-2 rounded-[12px] bg-indigo-500/70 px-3 py-2 text-[13px] font-medium text-white transition hover:bg-indigo-500"
														on:click={() => {
															void startBattleRound();
														}}
													>
														{#if battleState.phase === "ended"}
															<svg
																viewBox="0 0 16 16"
																class="h-4 w-4 fill-none stroke-current stroke-[1.6]"
															>
																<path
																	d="M13.2 8a5.2 5.2 0 1 1-1.5-3.7"
																/>
																<path
																	d="M10.6 2.7h2.9v2.9"
																/>
															</svg>
														{:else}
															<svg
																viewBox="0 0 16 16"
																class="h-4 w-4 fill-current"
															>
																<path
																	d="M5 3.3v9.4L12.7 8 5 3.3Z"
																/>
															</svg>
														{/if}
														{battleRoundActionLabel()}
													</button>
												{/if}
												{#if battleState.phase === "live" && giftArrivalBufferRemainingMs(battleState.endsAt, modeTimerNow) === 0}
													<button
														class="rounded-[12px] bg-rose-500/80 px-3 py-2 text-[13px] font-medium text-white transition hover:bg-rose-500"
														on:click={() => {
															void endBattleRound();
														}}
													>
														End round
													</button>
												{/if}
											{/if}
										</div>
									</div>

									<div
										class="rounded-[12px] border border-white/8 bg-black/20 p-3"
									>
										<div
											class="flex items-center justify-between gap-3"
										>
											<div>
												<div
													class="text-[11px] uppercase tracking-[0.16em] text-slate-500"
												>
													Round Queue
												</div>
											</div>
											<div
												class="rounded-[10px] border border-white/8 px-2.5 py-1 text-[11px] text-slate-300"
											>
												{battleDetailLineupRows.length} cast
											</div>
										</div>
										<div class="mt-3 space-y-2">
											{#if battleDetailLineupRows.length === 0}
												<div
													class="rounded-[12px] border border-dashed border-white/10 bg-white/[0.02] px-3 py-3 text-[12px] text-slate-500"
												>
													Add cast members from Cast
													Settings to build the 1v1
													queue.
												</div>
											{:else}
												<div
													class="space-y-2"
													role="list"
													on:dragover={allowBattleLineupDrop}
													on:drop={(event) => {
														if (
															event.target ===
															event.currentTarget
														) {
															allowBattleLineupDrop(
																event,
															);
															void commitBattleLineupOrder(
																battleDetailLineupContextValue,
																battleDetailLineupRows.length,
															);
														}
													}}
												>
													{#each battleDetailLineupRows as row, index (row.castName)}
														<button
															type="button"
															draggable={row.canReorder}
															class={`flex w-full items-center justify-between gap-2 rounded-[12px] border px-3 py-2 text-left transition ${
																battleDraggedContext ===
																	battleDetailLineupContextValue &&
																battleDraggedCastName ===
																	row.castName
																	? "border-indigo-300/40 bg-indigo-500/12"
																	: "border-white/8 bg-white/[0.03]"
															} ${row.canReorder ? "cursor-move hover:bg-white/[0.06]" : "cursor-default opacity-90"}`}
															title={row.canReorder
																? "Drag to reorder"
																: undefined}
															on:dragstart={(
																event,
															) => {
																if (
																	!row.canReorder
																) {
																	event.preventDefault();
																	return;
																}
																startBattleLineupDrag(
																	battleDetailLineupContextValue,
																	row.castName,
																	index,
																);
																if (
																	event.dataTransfer
																) {
																	event.dataTransfer.effectAllowed =
																		"move";
																	event.dataTransfer.setData(
																		"text/plain",
																		row.castName,
																	);
																}
															}}
															on:dragend={clearBattleLineupDrag}
															on:dragover={allowBattleLineupDrop}
															on:drop={(
																event,
															) => {
																allowBattleLineupDrop(
																	event,
																);
																void commitBattleLineupOrder(
																	battleDetailLineupContextValue,
																	battleLineupDropIndex(
																		event,
																		index,
																	),
																);
															}}
														>
															<div
																class="flex min-w-0 flex-1 items-center gap-2.5"
															>
																<div
																	class="w-5 text-[11px] text-slate-500"
																>
																	{index + 1}
																</div>
																<div
																	class="min-w-0 flex-1 truncate text-[13px] font-medium text-slate-100"
																>
																	{row.castName}
																</div>
															</div>
															<div
																class="flex shrink-0 items-center gap-1.5"
															>
																<div
																	class="min-w-[42px] text-right"
																>
																	<div
																		class="text-[16px] font-semibold text-slate-100"
																	>
																		{row.score}
																	</div>
																	{#if battleState.phase === "live" && index < 2}<div
																			class="text-[8px] uppercase tracking-[0.1em] text-slate-500"
																		>
																			Round
																			{row.roundScore}
																		</div>{/if}
																</div>
																<span
																	class={`rounded-full px-2 py-0.5 text-[9px] uppercase tracking-[0.14em] ${
																		index ===
																		0
																			? "bg-cyan-400/12 text-cyan-100"
																			: index ===
																				  1
																				? "bg-pink-400/12 text-pink-100"
																				: "bg-white/[0.05] text-slate-300"
																	}`}
																>
																	{battleLineupSlotLabel(
																		index,
																	)}
																</span>
															</div>
														</button>
													{/each}
												</div>
											{/if}
										</div>
									</div>
								{:else if activeMode.id === "group-sticker"}
									<div
										class="rounded-[12px] border border-white/8 bg-black/20 p-3"
									>
										<div
											class="flex flex-col gap-2 text-[12px] text-slate-300"
										>
											<div
												class="flex items-center justify-between rounded-[10px] bg-white/[0.03] px-3 py-2"
											>
												<span>Total coins</span>
												<span
													>{stickerDanceState.totalVotes}</span
												>
											</div>

											<div
												class="flex items-center justify-between rounded-[10px] bg-white/[0.03] px-3 py-2"
											>
												<span>Unallocated coins</span>
												<span
													>{stickerDanceState.unallocatedVotes}</span
												>
											</div>
										</div>
									</div>

									<div
										class="rounded-[12px] border border-white/8 bg-black/20 p-3"
									>
										<div
											class="mb-2 text-[11px] uppercase tracking-[0.16em] text-slate-500"
										>
											Scoreboard
										</div>
										<div class="space-y-2">
											{#each stickerDanceState.contestants as contestant}
												<div
													class="flex items-center justify-between gap-3 rounded-[12px] border border-white/8 bg-white/[0.03] px-3 py-2.5"
												>
													<div
														class="flex min-w-0 items-center gap-3"
													>
														<div
															class="grid h-9 w-9 place-items-center rounded-full bg-white/[0.06]"
														>
															{#if contestant.giftImageUrl}
																<img
																	src={contestant.giftImageUrl}
																	alt={contestant.giftName}
																	class="h-7 w-7 object-contain"
																/>
															{:else}
																<span
																	class="text-lg"
																	>🎁</span
																>
															{/if}
														</div>
														<div class="min-w-0">
															<div
																class="truncate text-[13px] font-medium text-slate-100"
															>
																{contestant.name}
															</div>
														</div>
													</div>
													<div
														class="min-w-[72px] text-right text-[18px] font-semibold text-slate-100"
													>
														{contestant.score}
													</div>
												</div>
											{/each}
										</div>
									</div>
								{:else if activeMode.id === "group-pk"}
									<div
										class="rounded-[12px] border border-white/8 bg-black/20 p-3"
									>
										<div
											class="flex flex-col gap-2 text-[12px] text-slate-300"
										>
											<div
												class="flex items-center justify-between rounded-[10px] bg-white/[0.03] px-3 py-2"
											>
												<span>Timer</span>
												<span
													class="text-[16px] font-semibold text-slate-100"
												>
													{formatShortDuration(
														groupPkRemainingMs(
															modeTimerNow,
														),
													)}
												</span>
											</div>

											<div
												class="flex items-center justify-between rounded-[10px] bg-white/[0.03] px-3 py-2"
											>
												<span>Total coins</span>
												<span
													>{groupPkState.totalVotes}</span
												>
											</div>

											<div
												class="flex items-center justify-between rounded-[10px] bg-white/[0.03] px-3 py-2"
											>
												<span>Unallocated coins</span>
												<span
													>{groupPkState.unallocatedVotes}</span
												>
											</div>
										</div>
										<div class="mt-3 flex flex-wrap gap-2">
											{#if workspaceModeIsLive}
												{#if groupPkState.phase !== "live"}
													<button
														class="inline-flex items-center gap-2 rounded-[12px] bg-indigo-500/70 px-3 py-2 text-[13px] font-medium text-white transition hover:bg-indigo-500"
														on:click={() => {
															void startGroupPkRound();
														}}
													>
														<svg
															viewBox="0 0 16 16"
															class="h-4 w-4 fill-current"
														>
															<path
																d="M5 3.3v9.4L12.7 8 5 3.3Z"
															/>
														</svg>
														{groupPkRoundActionLabel()}
													</button>
												{/if}
												{#if groupPkState.phase === "live" && giftArrivalBufferRemainingMs(groupPkState.endsAt, modeTimerNow) === 0}
													<button
														class="rounded-[12px] bg-rose-500/80 px-3 py-2 text-[13px] font-medium text-white transition hover:bg-rose-500"
														on:click={() => {
															void endGroupPkRound();
														}}
													>
														End round
													</button>
												{/if}
											{/if}
										</div>
									</div>

									<div
										class="rounded-[12px] border border-white/8 bg-black/20 p-3"
									>
										<div
											class="mb-2 text-[11px] uppercase tracking-[0.16em] text-slate-500"
										>
											Scoreboard
										</div>
										<div class="space-y-2">
											{#each groupPkState.contestants as contestant}
												<div
													class="flex items-center justify-between gap-3 rounded-[12px] border border-white/8 bg-white/[0.03] px-3 py-2"
												>
													<div class="min-w-0">
														<div
															class="truncate text-[13px] font-semibold text-slate-100"
														>
															{contestant.name}
														</div>
													</div>
													<div
														class="min-w-[72px] text-right text-[18px] font-bold text-slate-100"
													>
														{contestant.score}
													</div>
												</div>
											{/each}
										</div>
									</div>
								{:else if activeMode.id === "solo-target"}
									<div
										class="rounded-[12px] border border-white/8 bg-black/20 p-3"
									>
										<div
											class="flex items-center justify-between rounded-[10px] bg-white/[0.03] px-3 py-2 text-[12px] text-slate-300"
										>
											<span>Timer</span>
											<span
												class="text-[16px] font-semibold text-slate-100"
												>{formatShortDuration(
													soloStageRemainingMs(
														modeTimerNow,
													),
												)}</span
											>
										</div>
										{#if workspaceModeIsLive}
											<div
												class="mt-3 flex flex-wrap gap-2"
											>
												{#if soloStageState.phase !== "live"}
													<button
														class="rounded-[12px] bg-indigo-500/70 px-3 py-2 text-[13px] font-medium text-white transition hover:bg-indigo-500"
														on:click={startSoloStageRound}
													>
														Start
													</button>
												{/if}
												{#if soloStageState.phase === "live" && giftArrivalBufferRemainingMs(soloStageState.endsAt, modeTimerNow) === 0}
													<button
														class="rounded-[12px] bg-rose-500/80 px-3 py-2 text-[13px] font-medium text-white transition hover:bg-rose-500"
														on:click={async () => {
															soloStageState =
																await sendSoloStageCommand(
																	{
																		action: "endRound",
																	},
																);
															syncSoloStageForm(
																soloStageState,
															);
															captureLiveGameSummary(
																"solo-target",
																"end-round",
															);
														}}
													>
														End
													</button>
												{/if}
											</div>
										{/if}
									</div>

									<div
										class="rounded-[12px] border border-white/8 bg-black/20 p-3"
									>
										<div
											class="mb-2 text-[11px] uppercase tracking-[0.16em] text-slate-500"
										>
											Queue
										</div>
										<div
											class="space-y-2 overflow-y-auto pr-1"
											role="list"
											on:dragover={allowSoloCastDrop}
											on:drop={(event) => {
												if (
													event.target ===
													event.currentTarget
												) {
													allowSoloCastDrop(event);
													void commitSoloCastOrder(
														soloStageState
															.contestants.length,
													);
												}
											}}
										>
											{#each soloStageState.contestants as contestant, index}
												<div
													draggable={!soloStageQueueLocked()}
													role="listitem"
													class={`flex w-full items-center justify-between gap-3 rounded-[12px] border px-3 py-2 text-left transition ${
														index ===
														soloStageState.activeContestantIndex
															? "border-indigo-400/20 bg-indigo-500/12"
															: "border-white/8 bg-white/[0.03]"
													} ${soloDraggedCastName === contestant.name ? "opacity-60" : ""} ${
														soloStageQueueLocked()
															? "cursor-not-allowed opacity-80"
															: "cursor-move"
													}`}
													on:dragstart={(event) => {
														if (
															soloStageQueueLocked()
														) {
															event.preventDefault();
															return;
														}
														startSoloCastDrag(
															contestant.name,
														);
														if (
															event.dataTransfer
														) {
															event.dataTransfer.effectAllowed =
																"move";
														}
													}}
													on:dragend={clearSoloCastDrag}
													on:dragover={allowSoloCastDrop}
													on:drop={(event) => {
														allowSoloCastDrop(
															event,
														);
														void commitSoloCastOrder(
															soloCastDropIndex(
																event,
																index,
															),
														);
													}}
												>
													<div class="min-w-0">
														<div
															class="truncate text-[13px] font-semibold text-slate-100"
														>
															{contestant.name}
														</div>
													</div>
													<div
														class="min-w-[72px] text-right text-[18px] font-bold text-slate-100"
													>
														{contestant.score.toLocaleString()}
													</div>
												</div>
											{/each}
										</div>
									</div>
								{:else}
									<div
										class="rounded-[12px] border border-dashed border-white/10 bg-white/[0.02] px-3 py-4 text-[13px] leading-6 text-slate-400"
									>
										Runtime controls for this mode will
										appear here when the game is active.
									</div>
								{/if}
							</div>
						</div>
					{:else}
						<div
							transition:fly={{ x: 14, duration: 180 }}
							class="flex min-h-0 flex-1 flex-col overflow-hidden"
						>
							<div class="min-h-0 flex-1 overflow-y-auto pr-1">
								<div class="grid grid-cols-2 gap-2">
									{#each modes as mode}
										<button
											class={`group grid aspect-square place-items-center rounded-[14px] border border-white/6 bg-white/[0.03] px-3 py-3 text-center transition ${
												isModeEnabled(mode.id)
													? "hover:border-white/12 hover:bg-white/[0.06]"
													: "cursor-not-allowed opacity-45"
											}`}
											on:click={() => openMode(mode.id)}
											aria-label={`Open ${mode.label}`}
											disabled={!isModeEnabled(mode.id)}
										>
											<div
												class="grid place-items-center gap-3"
											>
												<span
													class="grid h-12 w-12 place-items-center rounded-[12px] bg-white/[0.05] text-slate-200 transition group-hover:bg-white/[0.09]"
												>
													{#if mode.id === "battle-ladder"}
														<svg
															viewBox="0 0 16 16"
															class="h-6 w-6 fill-none stroke-current stroke-[1.4]"
														>
															<path
																d="M3.2 4.5h3.6v2.8H3.2z"
															/>
															<path
																d="M9.2 8.7h3.6v2.8H9.2z"
															/>
															<path
																d="M6.8 5.9h2.4"
															/>
															<path
																d="M8 5.9v2.8"
															/>
														</svg>
													{:else if mode.id === "group-sticker"}
														<svg
															viewBox="0 0 16 16"
															class="h-6 w-6 fill-none stroke-current stroke-[1.4]"
														>
															<rect
																x="2.6"
																y="3.2"
																width="10.8"
																height="8.6"
																rx="1.6"
															/>
															<path
																d="M5.1 6h5.8"
															/>
															<path
																d="M8 4.8v2.5"
															/>
														</svg>
													{:else if mode.id === "group-pk"}
														<svg
															viewBox="0 0 16 16"
															class="h-6 w-6 fill-none stroke-current stroke-[1.4]"
														>
															<rect
																x="2.3"
																y="3"
																width="11.4"
																height="9.2"
																rx="1.4"
															/>
															<path
																d="M8 4.6v2.6"
															/>
															<path
																d="M6.2 1.8h3.6"
															/>
															<path
																d="M5.1 8.9h5.8"
															/>
														</svg>
													{:else if mode.id === "solo-target"}
														<svg
															viewBox="0 0 16 16"
															class="h-6 w-6 fill-none stroke-current stroke-[1.4]"
														>
															<path
																d="M3.1 4.1h9.8a1 1 0 0 1 1 1v5.6a1 1 0 0 1-1 1H3.1a1 1 0 0 1-1-1V5.1a1 1 0 0 1 1-1Z"
															/>
															<path
																d="M8 5.4v4.2"
															/>
															<path
																d="M5.9 7.5h4.2"
															/>
														</svg>
													{:else}
														<svg
															viewBox="0 0 16 16"
															class="h-6 w-6 fill-none stroke-current stroke-[1.4]"
														>
															<path
																d="M4 3.4h8v2.1H4z"
															/>
															<path
																d="M4 7h8v2.1H4z"
															/>
															<path
																d="M4 10.6h5.2v2.1H4z"
															/>
														</svg>
													{/if}
												</span>
												<span
													class="max-w-[7rem] text-[13px] font-medium leading-5 text-slate-100"
												>
													{mode.label}
												</span>
											</div>
										</button>
									{/each}
								</div>
							</div>
						</div>
					{/if}
				</section>
			</aside>

			<section class="px-1">
				<div class="grid h-full rounded-[12px] bg-[#0c0c10] px-2 py-3">
					<div class="grid min-h-0 place-items-center">
						<div
							class="relative grid h-full max-w-full place-items-center overflow-hidden rounded-[2px] bg-black video"
							style={previewFrameStyle()}
						>
							<video
								bind:this={previewElement}
								class={previewVideoClass()}
								autoplay
								muted
								playsinline
								on:loadedmetadata={updatePreviewAspectRatio}
								aria-label="OBS camera preview"
							></video>
						</div>
					</div>
				</div>
			</section>

			<LiveSidebar
				{gifts}
				{chat}
				{currentEvent}
				{performance}
				title="LIVE Chat"
				onOpenCommentsWindow={openCommentsWindow}
			/>
		</main>

		{#if endLiveConfirmOpen}
			<StudioEndLiveDialog
				uniqueId={liveChecks.live.uniqueId}
				onClose={closeEndLiveConfirm}
				onConfirm={confirmEndLive}
			/>
		{/if}

		{#if liveStatsModalOpen && hasFinalLiveScoreSummary(lastLiveModeScores)}
			<StudioLiveSummaryDialog
				summary={lastLiveModeScores}
				onClose={closeLiveStatsModal}
			/>
		{/if}

		{#if giftLogModalOpen && StudioGiftAuditDialog}
			<svelte:component
				this={StudioGiftAuditDialog}
				stats={currentLiveGiftStats}
				sceneScores={sceneRankingScores}
				rankingGroups={auditTopGiftersByCast}
				overallRankings={auditOverallTopGifters}
				auditGroups={liveAuditGroups}
				formatTime={formatStatusTime}
				giftAmount={giftLogEntryAmount}
				giftUnallocatedAmount={giftLogEntryUnallocatedAmount}
				manualAllocation={manualGiftAllocationFor}
				onClose={closeGiftLogModal}
				onSelectProfile={(row) => (selectedGiftProfile = row)}
				onAllocate={openGiftAllocation}
			/>
		{/if}

		{#if pendingGiftAllocation}
			<StudioGiftAllocationDialog
				giftLabel={pendingGiftAllocation.row.giftName ??
					pendingGiftAllocation.row.text}
				source={giftLogAllocationSource}
				bind:castName={giftLogAllocationCastName}
				castNames={giftLogAllocationCastNames(
					pendingGiftAllocation.modeId,
				)}
				availableAmount={giftLogAllocationAvailableAmount()}
				transferAmount={giftLogAllocationTransferAmount()}
				moving={giftLogAllocationMoving}
				onClose={() => (pendingGiftAllocation = null)}
				onConfirm={() => void confirmGiftAllocation()}
			/>
		{/if}

		{#if selectedGiftProfile}
			<ViewerProfileModal
				viewer={selectedGiftProfile.viewer}
				fallbackName={selectedGiftProfile.user}
				fallbackHandle={selectedGiftProfile.handle ?? ""}
				fallbackAvatar={selectedGiftProfile.avatar}
				fallbackAvatarClass={selectedGiftProfile.avatarClass}
				fallbackAvatarUrl={selectedGiftProfile.avatarUrl}
				onClose={() => (selectedGiftProfile = null)}
			/>
		{/if}

		{#if scoreHistoryOpen && StudioScoreHistoryDialog}
			<svelte:component
				this={StudioScoreHistoryDialog}
				history={scoreHistory}
				loading={scoreHistoryLoading}
				error={scoreHistoryError}
				bind:selectedSessionId={selectedScoreHistorySessionId}
				onClose={() => (scoreHistoryOpen = false)}
			/>
		{/if}

		{#if scoreCorrectionModeId === "battle-ladder"}
			<StudioScoreCorrectionDialog
				modeLabel={scoreCorrectionModeLabel(scoreCorrectionModeId)}
				source={battleCorrectionSource}
				target={battleCorrectionTarget}
				amount={battleCorrectionAmount}
				sourceOptions={[
					{ value: "unallocated", label: "Unallocated Pool" },
					{ value: "left", label: battleSideLabel("left") },
					{ value: "right", label: battleSideLabel("right") },
				]}
				targetOptions={[
					{ value: "left", label: battleSideLabel("left") },
					{ value: "right", label: battleSideLabel("right") },
				]}
				availableAmount={battleCorrectionAvailableAmount()}
				onSourceChange={(value) =>
					(battleCorrectionSource =
						value as BattleScoreTransferSource)}
				onTargetChange={(value) =>
					(battleCorrectionTarget = value as BattleSide)}
				onAmountChange={(value) => (battleCorrectionAmount = value)}
				onClose={closeScoreCorrectionModal}
				onTransfer={() => void transferBattleScore()}
			/>
		{:else if scoreCorrectionModeId === "group-sticker"}
			<StudioScoreCorrectionDialog
				modeLabel={scoreCorrectionModeLabel(scoreCorrectionModeId)}
				source={stickerDanceCorrectionSource}
				target={stickerDanceCorrectionTarget}
				amount={stickerDanceCorrectionAmount}
				sourceOptions={[
					{ value: "unallocated", label: "Unallocated Pool" },
					...stickerDanceState.contestants.map((contestant) => ({
						value: contestant.name,
						label: contestant.name,
					})),
				]}
				targetOptions={stickerDanceState.contestants.map(
					(contestant) => ({
						value: contestant.name,
						label: contestant.name,
					}),
				)}
				availableAmount={stickerDanceCorrectionAvailableAmount()}
				onSourceChange={(value) =>
					(stickerDanceCorrectionSource = value)}
				onTargetChange={(value) =>
					(stickerDanceCorrectionTarget = value)}
				onAmountChange={(value) =>
					(stickerDanceCorrectionAmount = value)}
				onClose={closeScoreCorrectionModal}
				onTransfer={() => void transferStickerDanceScore()}
			/>
		{:else if scoreCorrectionModeId === "group-pk"}
			<StudioScoreCorrectionDialog
				modeLabel={scoreCorrectionModeLabel(scoreCorrectionModeId)}
				source={groupPkCorrectionSource}
				target={groupPkCorrectionTarget}
				amount={groupPkCorrectionAmount}
				sourceOptions={[
					{ value: "unallocated", label: "Unallocated Pool" },
					...groupPkState.contestants.map((contestant) => ({
						value: contestant.name,
						label: contestant.name,
					})),
				]}
				targetOptions={groupPkState.contestants.map((contestant) => ({
					value: contestant.name,
					label: contestant.name,
				}))}
				availableAmount={groupPkCorrectionAvailableAmount()}
				onSourceChange={(value) => (groupPkCorrectionSource = value)}
				onTargetChange={(value) => (groupPkCorrectionTarget = value)}
				onAmountChange={(value) => (groupPkCorrectionAmount = value)}
				onClose={closeScoreCorrectionModal}
				onTransfer={() => void transferGroupPkScore()}
			/>
		{:else if scoreCorrectionModeId === "solo-target"}
			<StudioScoreCorrectionDialog
				modeLabel={scoreCorrectionModeLabel(scoreCorrectionModeId)}
				source={soloStageCorrectionSource}
				target={soloStageCorrectionTarget}
				amount={soloStageCorrectionAmount}
				sourceOptions={soloStageState.contestants.map((contestant) => ({
					value: contestant.name,
					label: contestant.name,
				}))}
				targetOptions={soloStageState.contestants.map((contestant) => ({
					value: contestant.name,
					label: contestant.name,
				}))}
				availableAmount={soloStageCorrectionAvailableAmount()}
				unitLabel={"Points"}
				onSourceChange={(value) => (soloStageCorrectionSource = value)}
				onTargetChange={(value) => (soloStageCorrectionTarget = value)}
				onAmountChange={(value) => (soloStageCorrectionAmount = value)}
				onClose={closeScoreCorrectionModal}
				onTransfer={() => void transferSoloStageScore()}
			/>
		{/if}

		<StudioToastStack {toasts} onDismiss={dismissToast} />

		{#if settingsModeId}
			<div
				class="absolute inset-0 z-50 grid place-items-center bg-black/55 px-6 py-8"
			>
				<div
					transition:fly={{ y: 18, duration: 180 }}
					class="glass max-h-[calc(100vh-4rem)] w-full max-w-[820px] overflow-y-auto rounded-[18px] border border-white/10 p-5"
				>
					<div class="mb-4 flex items-center justify-between gap-3">
						<div>
							<h2
								class="text-[20px] font-semibold text-slate-100"
							>
								Settings
							</h2>
						</div>
						<button
							type="button"
							class="text-slate-400 transition hover:text-white"
							on:click={() => closeModeSettings()}
							aria-label="Close settings"
						>
							<svg
								viewBox="0 0 16 16"
								class="h-5 w-5 fill-none stroke-current stroke-[1.6]"
							>
								<path d="m4 4 8 8" />
								<path d="M12 4 4 12" />
							</svg>
						</button>
					</div>

					{#if settingsModeId === "battle-ladder"}
						<div
							class="grid gap-4 md:grid-cols-[260px_minmax(0,1fr)]"
						>
							<div class="space-y-3">
								<div
									class="rounded-[12px] border border-white/8 bg-white/[0.03] p-3"
								>
									<div
										class="mb-3 flex items-center justify-between gap-3"
									>
										<div
											class="text-[11px] uppercase tracking-[0.16em] text-slate-500"
										>
											Placement
										</div>
										<button
											class="rounded-[10px] border border-white/8 px-2.5 py-1 text-[11px] text-slate-300 transition hover:bg-white/[0.05]"
											on:click={resetBattlePlacement}
										>
											Reset
										</button>
									</div>
									<div
										bind:this={settingsPreviewSurface}
										class="relative mx-auto aspect-[9/16] w-full max-w-[220px] overflow-hidden rounded-[12px] bg-[#0b0f14]"
									>
										<div
											class="absolute inset-0 bg-[radial-gradient(circle_at_50%_10%,rgba(255,255,255,0.16),transparent_34%),linear-gradient(180deg,#121922,#080d13)]"
										></div>
										<div
											class="absolute inset-0 opacity-35 [background-image:linear-gradient(rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.06)_1px,transparent_1px)] [background-size:10%_10%]"
										></div>
										{#if battleState.phase !== "live" && battleForm.scoreEffect !== "none"}
											<div
												class="pointer-events-none absolute inset-0 z-[1] overflow-hidden rounded-[12px]"
											>
											<BattlePkLineOverlaySurface
												contestants={battlePlacementPreviewContestants}
												phase="idle"
												lineFrame={settingsBattleLineFrame}
												lineStyle="none"
													scoreEffect={battleForm.scoreEffect}
													previewSide="left"
													fullStagePreview
												/>
											</div>
										{/if}
										<div
											class="absolute overflow-hidden"
											style={settingsOverlayStyle}
										>
											<button
												type="button"
												class="absolute inset-0 cursor-move rounded-[18px]"
												on:mousedown={(event) =>
													startSettingsOverlayInteraction(
														event,
														"move",
													)}
												aria-label="Move battle ladder board placement"
											></button>
											<div
												class="pointer-events-none relative z-10 h-full w-full"
											>
												<BattlePkOverlaySurface
													contestants={battlePlacementPreviewContestants}
													countdownLabel={formatShortDuration(
														battleForm.durationSeconds *
															1000,
													)}
													showCenterLine={false}
												/>
											</div>
											<button
												type="button"
												class="absolute bottom-2 right-2 z-20 grid h-7 w-7 cursor-se-resize place-items-center rounded-full border border-white/14 bg-black/65 text-slate-200"
												on:mousedown={(event) =>
													startSettingsOverlayInteraction(
														event,
														"resize",
													)}
												aria-label="Resize battle ladder board placement"
											>
												<svg
													viewBox="0 0 16 16"
													class="h-3.5 w-3.5 fill-none stroke-current stroke-[1.5]"
												>
													<path d="M5 11 11 5" />
													<path d="M7.5 11H11V7.5" />
												</svg>
											</button>
										</div>
										{#if battleForm.lineStyle !== "none" || battleForm.scoreEffect !== "none"}
											<div
												class={`group absolute rounded-[18px] border border-transparent shadow-[0_14px_36px_rgba(0,0,0,0.28)] transition hover:border-amber-300/70`}
												style={settingsBattleLineStyle}
											>
												<button
													type="button"
													class="absolute inset-y-0 left-1/2 z-20 w-8 -translate-x-1/2 cursor-move rounded-[18px]"
													on:mousedown={(event) =>
														startSettingsBattleLineInteraction(
															event,
															"move",
														)}
													aria-label="Move battle ladder split line placement"
												></button>

												<div
													class="pointer-events-none relative z-10 h-full w-full"
												>
													<BattlePkLineOverlaySurface
														contestants={battleState.phase ===
														"live"
															? battleState.contestants
															: battlePlacementPreviewContestants}
														phase={battleState.phase}
														lineFrame={settingsBattleLineFrame}
														lineStyle={battleForm.lineStyle}
														scoreEffect={battleState.phase ===
														"live"
															? battleForm.scoreEffect
															: "none"}
														previewSide={battleState.phase ===
														"live"
															? null
															: "left"}
													/>
												</div>

												<button
													type="button"
													class="absolute left-1/2 top-0 z-30 grid h-5 w-8 -translate-x-1/2 -translate-y-1/2 cursor-ns-resize place-items-center rounded-full border border-white/14 bg-black/65 text-slate-200"
													on:mousedown={(event) =>
														startSettingsBattleLineInteraction(
															event,
															"resize-top",
														)}
													aria-label="Resize battle ladder split line upward"
												>
													<svg
														viewBox="0 0 16 16"
														class="h-3 w-3 fill-none stroke-current stroke-[1.5]"
													>
														<path d="M8 3v10" />
														<path
															d="M5.5 5.5 8 3l2.5 2.5"
														/>
													</svg>
												</button>
												<button
													type="button"
													class="absolute bottom-0 left-1/2 z-30 grid h-5 w-8 -translate-x-1/2 translate-y-1/2 cursor-ns-resize place-items-center rounded-full border border-white/14 bg-black/65 text-slate-200"
													on:mousedown={(event) =>
														startSettingsBattleLineInteraction(
															event,
															"resize-bottom",
														)}
													aria-label="Resize battle ladder split line downward"
												>
													<svg
														viewBox="0 0 16 16"
														class="h-3 w-3 fill-none stroke-current stroke-[1.5]"
													>
														<path d="M8 3v10" />
														<path
															d="M5.5 10.5 8 13l2.5-2.5"
														/>
													</svg>
												</button>
											</div>
										{/if}
									</div>
								</div>
							</div>
							<div class="space-y-3">
								<div class="grid gap-3 sm:grid-cols-3">
									<label
										class="block rounded-[12px] border border-white/8 bg-white/[0.03] px-3 py-2.5"
									>
										<div
											class="text-[11px] uppercase tracking-[0.16em] text-slate-500"
										>
											Round Timer
										</div>

										<input
											bind:value={
												battleForm.durationSeconds
											}
											type="number"
											min="10"
											class="mt-2 w-full bg-transparent text-[13px] text-slate-100 outline-none"
										/>
									</label>

									<label
										class="block rounded-[12px] border border-white/8 bg-white/[0.03] px-3 py-2.5"
									>
										<div
											class="text-[11px] uppercase tracking-[0.16em] text-slate-500"
										>
											Divider Style
										</div>
										<select
											bind:value={battleForm.lineStyle}
											class="studio-select mt-2 w-full text-[13px] outline-none"
										>
											<option value="none">No line</option
											>
											<option value="white"
												>Middle white line</option
											>
											<option value="fire"
												>Fire line</option
											>
										</select>
									</label>
									<label
										class="block rounded-[12px] border border-white/8 bg-white/[0.03] px-3 py-2.5"
									>
										<div
											class="text-[11px] uppercase tracking-[0.16em] text-slate-500"
										>
											Losing Side Effect
										</div>
											<select
												bind:value={battleForm.scoreEffect}
												class="studio-select mt-2 w-full text-[13px] outline-none"
											>
												{#each pkVisualEffectOptions as option}
													<option value={option.value}>{option.label}</option>
												{/each}
											</select>
										</label>
								</div>
								<StudioCastSelection
									options={battleCastSelectionOptions}
									selected={battleCastNames}
									onToggle={toggleBattleCastSelection}
								/>
								<div
									class="rounded-[12px] border border-white/8 bg-white/[0.03] p-3"
								>
									<div
										class="text-[11px] uppercase tracking-[0.16em] text-slate-500"
									>
										Cast Gift Mapping
									</div>
									<div class="mt-3 space-y-2">
										{#each battleGiftRows as row}
											<div
												class="rounded-[12px] border border-white/8 bg-black/20 px-3 py-2.5"
											>
												<div
													class="flex items-center justify-between gap-3"
												>
													<div>
														<div
															class="text-[13px] font-medium text-slate-100"
														>
															{row.castName}
														</div>
														<div
															class="mt-0.5 text-[11px] text-slate-500"
														>
															{row.active
																? "Selected for 1v1 rotation"
																: "Saved for this cast"}
														</div>
													</div>
													<button
														type="button"
														class="rounded-[9px] border border-cyan-300/15 bg-cyan-300/8 px-2.5 py-1.5 text-[11px] text-cyan-100 transition hover:bg-cyan-300/14 disabled:cursor-not-allowed disabled:opacity-40"
														on:click={() =>
															addBattleGiftSlot(
																row.castName,
															)}
														disabled={row.slots
															.length >=
															MAX_BATTLE_STICKERS}
													>
														Add Gift
													</button>
												</div>
												<div
													class="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3"
												>
													{#each row.slots as slot, slotIndex}
														<div class="relative">
															<button
																class="flex w-full items-center gap-3 rounded-[10px] border border-white/8 bg-white/[0.03] px-3 py-2 text-left transition hover:bg-white/[0.06]"
																on:click={() => {
																	openStickerGiftSelector(
																		row.castName,
																		{
																			mode: "battle-ladder",
																			slotIndex,
																		},
																	);
																}}
																type="button"
															>
																<div
																	class="grid h-10 w-10 shrink-0 place-items-center rounded-[10px] bg-black/20"
																>
																	{#if slot.giftImageUrl}
																		<img
																			src={slot.giftImageUrl}
																			alt={slot.giftDisplayName}
																			class="h-8 w-8 object-contain"
																		/>
																	{:else}
																		<span
																			class="text-lg"
																			>🎁</span
																		>
																	{/if}
																</div>
																<div
																	class="min-w-0 flex-1"
																>
																	<div
																		class="truncate text-[12px] font-medium text-slate-100"
																	>
																		{slot.giftDisplayName}
																	</div>
																	<div
																		class="mt-0.5 text-[11px] text-slate-500"
																	>
																		Gift {slotIndex +
																			1}
																	</div>
																</div>
															</button>
															{#if row.slots.length > DEFAULT_BATTLE_GIFTS_PER_SIDE}
																<button
																	type="button"
																	class="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full border border-white/10 bg-[#172129] text-[11px] text-slate-400 transition hover:bg-rose-500/20 hover:text-rose-100"
																	on:click={() =>
																		removeBattleGiftSlot(
																			row.castName,
																			slotIndex,
																		)}
																	aria-label={`Remove gift ${slotIndex + 1}`}
																	>×</button
																>
															{/if}
														</div>
													{/each}
												</div>
											</div>
										{/each}
									</div>
								</div>
							</div>
						</div>
						<div class="mt-4 flex justify-end gap-2">
							<button
								class="rounded-[12px] bg-white/[0.08] px-4 py-2 text-[13px] font-medium text-slate-100 transition hover:bg-white/[0.12]"
								on:click={saveModeSettings}
							>
								Save Settings
							</button>
						</div>
					{:else if settingsModeId === "group-sticker"}
						<div
							class="grid gap-4 md:grid-cols-[240px_minmax(0,1fr)]"
						>
							<div class="space-y-3">
								<div
									class="overlay-placement rounded-[12px] border border-white/8 bg-white/[0.03] p-3"
								>
									<div
										class="mb-3 flex items-center justify-between gap-3"
									>
										<div
											class="text-[11px] uppercase tracking-[0.16em] text-slate-500"
										>
											Placement
										</div>
										<button
											class="rounded-[10px] border border-white/8 px-2.5 py-1 text-[11px] text-slate-300 transition hover:bg-white/[0.05]"
											on:click={() =>
												resetSettingsOverlayPlacement(
													"group-sticker",
												)}
										>
											Reset
										</button>
									</div>
									<div
										bind:this={settingsPreviewSurface}
										class="relative mx-auto aspect-[9/16] w-full max-w-[220px] overflow-hidden rounded-[12px] bg-[#0b0f14]"
									>
										<div
											class="absolute inset-0 bg-[radial-gradient(circle_at_50%_16%,rgba(255,255,255,0.14),transparent_32%),linear-gradient(180deg,#121922,#080d13)]"
										></div>
										<div
											class="absolute inset-0 opacity-35 [background-image:linear-gradient(rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.06)_1px,transparent_1px)] [background-size:10%_10%]"
										></div>
										<div
											class="absolute inset-x-[12%] inset-y-[6%] rounded-[18px] border border-white/6 bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0))]"
										></div>
										<div
											class="absolute overflow-hidden"
											style={settingsOverlayStyle}
										>
											<button
												type="button"
												class="absolute inset-0 cursor-move rounded-[18px]"
												on:mousedown={(event) =>
													startSettingsOverlayInteraction(
														event,
														"move",
													)}
												aria-label="Move sticker dance overlay placement"
											></button>
											<div
												class="pointer-events-none relative z-10 h-full w-full"
											>
												<PortraitCardOverlaySurface
													mode="group-sticker"
													stickerContestants={stickerDancePlacementPreviewContestants}
													visualEffect={stickerDanceForm.visualEffect}
												/>
											</div>
											<button
												type="button"
												class="absolute bottom-2 right-2 z-20 grid h-7 w-7 cursor-se-resize place-items-center rounded-full border border-white/14 bg-black/65 text-slate-200"
												on:mousedown={(event) =>
													startSettingsOverlayInteraction(
														event,
														"resize",
													)}
												aria-label="Resize sticker dance overlay placement"
											>
												<svg
													viewBox="0 0 16 16"
													class="h-3.5 w-3.5 fill-none stroke-current stroke-[1.5]"
												>
													<path d="M5 11 11 5" />
													<path d="M7.5 11H11V7.5" />
												</svg>
											</button>
										</div>
									</div>
								</div>
							</div>
								<div class="space-y-3">
									<label
										class="block rounded-[12px] border border-white/8 bg-white/[0.03] px-3 py-2.5"
									>
										<div
											class="text-[11px] uppercase tracking-[0.16em] text-slate-500"
										>
											PK Effect
										</div>
										<select
											bind:value={stickerDanceForm.visualEffect}
											class="studio-select mt-2 w-full text-[13px] outline-none"
										>
											{#each pkVisualEffectOptions as option}
												<option value={option.value}>{option.label}</option>
											{/each}
										</select>
									</label>
									<StudioCastSelection
										options={stickerDanceCastSelectionOptions}
										selected={stickerDanceCastNames}
									onToggle={toggleStickerDanceCastSelection}
								/>
								<div
									class="rounded-[12px] border border-white/8 bg-white/[0.03] p-3"
								>
									<div
										class="text-[11px] uppercase tracking-[0.16em] text-slate-500"
									>
										Gift Mapping
									</div>
									<div
										class="mt-3 max-h-[460px] space-y-2 overflow-y-auto pr-1"
									>
										{#each stickerDanceGiftRows as row, index}
											<div
												class={`flex items-center gap-3 rounded-[12px] border px-3 py-2.5 ${
													row.active
														? "border-white/8 bg-black/20"
														: "border-white/6 bg-black/10 opacity-80"
												}`}
											>
												<span
													class="text-[11px] text-slate-500"
													>{index + 1}</span
												>
												<div
													class="flex-1 text-[13px] font-medium text-slate-100"
												>
													{row.castName}
												</div>
												<button
													class="items-center gap-3 rounded-[10px] border border-white/8 bg-white/[0.03] px-3 py-2 text-left transition hover:bg-white/[0.06]"
													on:click={() => {
														openStickerGiftSelector(
															row.castName,
														);
													}}
													type="button"
												>
													<div
														class="grid h-10 w-10 shrink-0 place-items-center rounded-[10px] bg-black/20"
													>
														{#if row.giftImageUrl}
															<img
																src={row.giftImageUrl}
																alt={row.giftDisplayName}
																class="h-8 w-8 object-contain"
															/>
														{:else}
															<span
																class="text-lg"
																>🎁</span
															>
														{/if}
													</div>
												</button>
											</div>
										{/each}
									</div>
								</div>
								<div class="flex justify-end gap-2">
									<button
										class="rounded-[12px] bg-white/[0.08] px-4 py-2 text-[13px] font-medium text-slate-100 transition hover:bg-white/[0.12]"
										on:click={saveModeSettings}
									>
										Save Settings
									</button>
								</div>
							</div>
						</div>
					{:else if settingsModeId === "group-pk"}
						<div
							class="grid gap-4 md:grid-cols-[240px_minmax(0,1fr)]"
						>
							<div class="space-y-3">
								<div
									class="rounded-[12px] border border-white/8 bg-white/[0.03] p-3"
								>
									<div
										class="mb-3 flex items-center justify-between gap-3"
									>
										<div
											class="text-[11px] uppercase tracking-[0.16em] text-slate-500"
										>
											Placement
										</div>
										<button
											class="rounded-[10px] border border-white/8 px-2.5 py-1 text-[11px] text-slate-300 transition hover:bg-white/[0.05]"
											on:click={() =>
												resetSettingsOverlayPlacement(
													"group-pk",
												)}
										>
											Reset
										</button>
									</div>
									<div
										bind:this={settingsPreviewSurface}
										class="relative mx-auto aspect-[9/16] w-full max-w-[220px] overflow-hidden rounded-[12px] bg-[#0b0f14]"
									>
										<div
											class="absolute inset-0 bg-[radial-gradient(circle_at_50%_16%,rgba(255,255,255,0.14),transparent_32%),linear-gradient(180deg,#121922,#080d13)]"
										></div>
										<div
											class="absolute inset-0 opacity-35 [background-image:linear-gradient(rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.06)_1px,transparent_1px)] [background-size:10%_10%]"
										></div>
										<div
											class="absolute inset-x-[12%] inset-y-[6%] rounded-[18px] border border-white/6 bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0))]"
										></div>
										<div
											class="absolute overflow-hidden"
											style={settingsOverlayStyle}
										>
											<button
												type="button"
												class="absolute inset-0 cursor-move rounded-[18px]"
												on:mousedown={(event) =>
													startSettingsOverlayInteraction(
														event,
														"move",
													)}
												aria-label="Move group pk overlay placement"
											></button>
											<div
												class="pointer-events-none relative z-10 h-full w-full"
											>
												<PortraitCardOverlaySurface
													mode="group-pk"
													groupPkContestants={groupPkPlacementPreviewContestants}
													countdownLabel={formatShortDuration(
														groupPkForm.durationSeconds *
															1000,
													)}
													visualEffect={groupPkForm.visualEffect}
												/>
											</div>
											<button
												type="button"
												class="absolute bottom-2 right-2 z-20 grid h-7 w-7 cursor-se-resize place-items-center rounded-full border border-white/14 bg-black/65 text-slate-200"
												on:mousedown={(event) =>
													startSettingsOverlayInteraction(
														event,
														"resize",
													)}
												aria-label="Resize group pk overlay placement"
											>
												<svg
													viewBox="0 0 16 16"
													class="h-3.5 w-3.5 fill-none stroke-current stroke-[1.5]"
												>
													<path d="M5 11 11 5" />
													<path d="M7.5 11H11V7.5" />
												</svg>
											</button>
										</div>
									</div>
								</div>
							</div>
							<div class="space-y-3">
								<div class="grid gap-3 sm:grid-cols-2">
									<label
										class="block rounded-[12px] border border-white/8 bg-white/[0.03] px-3 py-2.5"
									>
										<div
											class="text-[11px] uppercase tracking-[0.16em] text-slate-500"
										>
											Round Timer
										</div>
										<input
											bind:value={
												groupPkForm.durationSeconds
											}
											type="number"
											min="10"
											class="mt-2 w-full bg-transparent text-[13px] text-slate-100 outline-none"
										/>
									</label>
									<label
										class="block rounded-[12px] border border-white/8 bg-white/[0.03] px-3 py-2.5"
									>
										<div
											class="text-[11px] uppercase tracking-[0.16em] text-slate-500"
										>
											PK Effect
										</div>
										<select
											bind:value={groupPkForm.visualEffect}
											class="studio-select mt-2 w-full text-[13px] outline-none"
										>
											{#each pkVisualEffectOptions as option}
												<option value={option.value}>{option.label}</option>
											{/each}
										</select>
									</label>
								</div>
								<StudioCastSelection
									options={groupPkCastSelectionOptions}
									selected={groupPkCastNames}
									onToggle={toggleGroupPkCastSelection}
								/>
								<div
									class="rounded-[12px] border border-white/8 bg-white/[0.03] p-3"
								>
									<div
										class="text-[11px] uppercase tracking-[0.16em] text-slate-500"
									>
										Gift Mapping
									</div>
									<div
										class="mt-3 max-h-[460px] space-y-2 overflow-y-auto pr-1"
									>
										{#each groupPkGiftRows as row, index}
											<div
												class={`rounded-[12px] border px-3 py-2.5 ${
													row.active
														? "border-white/8 bg-black/20"
														: "border-white/6 bg-black/10 opacity-80"
												}`}
											>
												<div
													class="flex items-center gap-3"
												>
													<span
														class="w-4 text-[11px] text-slate-500"
														>{index + 1}</span
													>
													<div class="w-full">
														<div
															class="flex items-center gap-2"
														>
															<div
																class="flex-1 text-[13px] font-medium text-slate-100"
															>
																{row.castName}
															</div>
															<div
																class="grid gap-2 sm:grid-cols-3"
															>
																{#each row.slots as slot, slotIndex}
																	<button
																		class="flex items-center gap-3 rounded-[10px] border border-white/8 bg-white/[0.03] px-3 py-2 text-left transition hover:bg-white/[0.06]"
																		on:click={() => {
																			openStickerGiftSelector(
																				row.castName,
																				{
																					mode: "group-pk",
																					slotIndex,
																				},
																			);
																		}}
																		type="button"
																	>
																		<div
																			class="grid h-10 w-10 shrink-0 place-items-center rounded-[10px] bg-black/20"
																		>
																			{#if slot.giftImageUrl}
																				<img
																					src={slot.giftImageUrl}
																					alt={slot.giftDisplayName}
																					class="h-8 w-8 object-contain"
																				/>
																			{:else}
																				<span
																					class="text-lg"
																					>🎁</span
																				>
																			{/if}
																		</div>
																	</button>
																{/each}
															</div>
														</div>
													</div>
												</div>
											</div>
										{/each}
									</div>
								</div>
								<div class="flex justify-end gap-2">
									<button
										class="rounded-[12px] bg-white/[0.08] px-4 py-2 text-[13px] font-medium text-slate-100 transition hover:bg-white/[0.12]"
										on:click={saveModeSettings}
									>
										Save Settings
									</button>
								</div>
							</div>
						</div>
					{:else if settingsModeId === "solo-target"}
						<div
							class="grid gap-3 md:grid-cols-[220px_minmax(0,1fr)]"
						>
							<div class="space-y-2">
								<div
									class="overlay-placement rounded-[12px] border border-white/8 bg-white/[0.03] p-3"
								>
									<div
										class="mb-3 flex items-center justify-between gap-3"
									>
										<div
											class="text-[11px] uppercase tracking-[0.16em] text-slate-500"
										>
											Placement
										</div>
										<button
											class="rounded-[10px] border border-white/8 px-2.5 py-1 text-[11px] text-slate-300 transition hover:bg-white/[0.05] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
											on:click={() =>
												resetSettingsOverlayPlacement(
													"solo-target",
												)}
											disabled={soloStagePlacementLocked(
												"solo-target",
											)}
										>
											Reset
										</button>
									</div>
									<div
										bind:this={settingsPreviewSurface}
										class="relative mx-auto aspect-[9/16] w-full max-w-[220px] overflow-hidden rounded-[12px] bg-[#0b0f14]"
									>
										<div
											class="absolute inset-0 bg-[radial-gradient(circle_at_50%_16%,rgba(255,255,255,0.14),transparent_32%),linear-gradient(180deg,#121922,#080d13)]"
										></div>
										<div
											class="absolute inset-0 opacity-35 [background-image:linear-gradient(rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.06)_1px,transparent_1px)] [background-size:10%_10%]"
										></div>
										<div
											class="absolute inset-x-[12%] inset-y-[6%] rounded-[18px] border border-white/6 bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0))]"
										></div>
										<div
											class="absolute overflow-hidden"
											style={settingsOverlayStyle}
										>
											<button
												type="button"
												class="absolute inset-0 cursor-move rounded-[18px] disabled:cursor-not-allowed"
												on:mousedown={(event) =>
													startSettingsOverlayInteraction(
														event,
														"move",
													)}
												aria-label={soloStagePlacementLocked(
													"solo-target",
												)
													? "Solo stage placement locked while live"
													: "Move solo stage overlay placement"}
												disabled={soloStagePlacementLocked(
													"solo-target",
												)}
											></button>

											<div
												class="pointer-events-none relative z-10 h-full w-full"
											>
												<SoloStageOverlaySurface
													scoreMode={soloStageForm.scoreMode}
													contestantName={soloStagePreviewContestantName()}
													countdownLabel={formatShortDuration(
														soloStageForm.durationSeconds *
															1000,
													)}
													scoreLabel={soloStagePreviewScore().toLocaleString()}
													targetScoreLabel={soloStagePreviewTargetScoreLabel()}
													colorTier={soloStagePreviewColorTier()}
													progressPercent={soloStagePreviewProgressPercent()}
													visualEffect={soloStageForm.visualEffect}
												/>
											</div>
											<button
												type="button"
												class="absolute bottom-2 right-2 z-30 grid h-7 w-7 cursor-se-resize place-items-center rounded-full border border-white/14 bg-black/65 text-slate-200 disabled:cursor-not-allowed disabled:opacity-40"
												on:mousedown={(event) =>
													startSettingsOverlayInteraction(
														event,
														"resize",
													)}
												aria-label={soloStagePlacementLocked(
													"solo-target",
												)
													? "Solo stage placement locked while live"
													: "Resize solo stage overlay placement"}
												disabled={soloStagePlacementLocked(
													"solo-target",
												)}
											>
												<svg
													viewBox="0 0 16 16"
													class="h-3.5 w-3.5 fill-none stroke-current stroke-[1.5]"
												>
													<path d="M5 11 11 5" />
													<path d="M7.5 11H11V7.5" />
												</svg>
											</button>
										</div>
									</div>
								</div>
							</div>

							<div class="space-y-3">
								<StudioCastSelection
									options={soloStageCastSelectionOptions}
									selected={soloStageCastNames}
									onToggle={toggleSoloStageCastSelection}
								/>

								<div
									class="rounded-[12px] border border-white/8 bg-white/[0.03] p-3"
								>
									<div
										class="mb-3 text-[11px] uppercase tracking-[0.16em] text-slate-500"
									>
										Solo Type
									</div>
									<div
										class="grid grid-cols-2 gap-2 rounded-[12px] bg-black/20 p-1"
									>
										{#each [{ id: "target", label: "Target" }, { id: "freedom", label: "Freedom" }] as option}
											<button
												type="button"
												class={`rounded-[10px] px-3 py-2 text-[12px] font-semibold transition ${
													soloStageForm.scoreMode ===
													option.id
														? "bg-cyan-400/18 text-cyan-50 shadow-[inset_0_0_0_1px_rgba(103,232,249,0.28)]"
														: "text-slate-400 hover:bg-white/[0.04] hover:text-slate-100"
												}`}
												on:click={() => {
													soloStageForm = {
														...soloStageForm,
														scoreMode:
															option.id as SoloStageScoreMode,
													};
												}}
											>
												{option.label}
											</button>
										{/each}
									</div>
								</div>

								<label
									class="block rounded-[12px] border border-white/8 bg-white/[0.03] px-3 py-2.5"
								>
									<div
										class="text-[11px] uppercase tracking-[0.16em] text-slate-500"
									>
										PK Effect
									</div>
									<select
										bind:value={soloStageForm.visualEffect}
										class="studio-select mt-2 w-full text-[13px] outline-none"
									>
										{#each pkVisualEffectOptions as option}
											<option value={option.value}>{option.label}</option>
										{/each}
									</select>
								</label>

								<div
									class="rounded-[12px] border border-white/8 bg-white/[0.03] p-3"
								>
									<div
										class="mb-3 flex items-center justify-between"
									>
										<div
											class="text-[11px] uppercase tracking-[0.16em] text-slate-500"
										>
											{soloStageForm.scoreMode ===
											"target"
												? "Targets"
												: "Timer"}
										</div>
										<div
											class="rounded-[10px] border border-white/8 px-2.5 py-1 text-[11px] text-slate-300"
										>
											{soloStageForm.scoreMode ===
											"target"
												? "0 to infinity"
												: "No target"}
										</div>
									</div>
									<div
										class="rounded-[14px] border border-white/8 bg-black/20 p-4"
									>
										<div
											class="flex items-center gap-2 text-[32px] font-semibold text-slate-100"
										>
											<svg
												viewBox="0 0 16 16"
												class="h-6 w-6 fill-none stroke-current stroke-[1.5] text-sky-200"
											>
												<path
													d="M11.8 3.2H6.2l-2 2v5.6l2 2h5.6l2-2V5.2z"
												/>
												<path d="M9.7 1.9v2.6H12.3" />
											</svg>
											{formatShortDuration(
												soloStageForm.durationSeconds *
													1000,
											)}
										</div>
										{#if soloStageForm.scoreMode === "target"}
											<div
												class="mt-4 h-5 rounded-full bg-[linear-gradient(90deg,#65d4ff_0%,#65d4ff_45%,#9a65ff_45%,#9a65ff_78%,#f5c84f_78%,#f5c84f_100%)]"
											></div>
											<div
												class="mt-2 flex items-center justify-between text-[11px] text-slate-400"
											>
												<span>0</span>
												<span
													>A {soloStageForm.targetA.toLocaleString()}</span
												>
												<span
													>B {soloStageForm.targetB.toLocaleString()}</span
												>
												<span>∞</span>
											</div>
										{:else}
											<!-- <div
												class="mt-4 rounded-[12px] border border-cyan-200/10 bg-cyan-300/[0.06] px-3 py-2 text-[12px] text-slate-300"
											>
												Freedom mode counts gifts
												without a target. The overlay
												keeps the current score
												centered.
											</div> -->
										{/if}
										<div
											class={`mt-4 grid gap-2 ${soloStageForm.scoreMode === "target" ? "sm:grid-cols-3" : "sm:grid-cols-1"}`}
										>
											<label
												class="rounded-[10px] bg-white/[0.03] px-3 py-2"
											>
												<div
													class="text-[10px] uppercase tracking-[0.14em] text-slate-500"
												>
													Timer (seconds)
												</div>
												<input
													bind:value={
														soloStageForm.durationSeconds
													}
													type="number"
													min="10"
													class="mt-1 w-full bg-transparent text-[13px] text-slate-100 outline-none"
												/>
											</label>
											{#if soloStageForm.scoreMode === "target"}
												<label
													class="rounded-[10px] bg-white/[0.03] px-3 py-2"
												>
													<div
														class="text-[10px] uppercase tracking-[0.14em] text-slate-500"
													>
														Target A
													</div>
													<input
														bind:value={
															soloStageForm.targetA
														}
														type="number"
														min="1"
														class="mt-1 w-full bg-transparent text-[13px] text-slate-100 outline-none"
													/>
												</label>
												<label
													class="rounded-[10px] bg-white/[0.03] px-3 py-2"
												>
													<div
														class="text-[10px] uppercase tracking-[0.14em] text-slate-500"
													>
														Target B
													</div>
													<input
														bind:value={
															soloStageForm.targetB
														}
														type="number"
														min="2"
														class="mt-1 w-full bg-transparent text-[13px] text-slate-100 outline-none"
													/>
												</label>
											{/if}
										</div>
									</div>
								</div>

								<div class="flex justify-end gap-2">
									<button
										class="rounded-[12px] bg-white/[0.08] px-4 py-2 text-[13px] font-medium text-slate-100 transition hover:bg-white/[0.12]"
										on:click={saveModeSettings}
									>
										Save Settings
									</button>
								</div>
							</div>
						</div>
					{:else}
						<div
							class="grid gap-4 md:grid-cols-[320px_minmax(0,1fr)]"
						>
							<div class="space-y-3">
								<div
									class="rounded-[12px] border border-white/8 bg-white/[0.03] p-3"
								>
									<div
										class="mb-3 flex items-center justify-between gap-3"
									>
										<div
											class="text-[11px] uppercase tracking-[0.16em] text-slate-500"
										>
											Saved Placement
										</div>
										<button
											class="rounded-[10px] border border-white/8 px-2.5 py-1 text-[11px] text-slate-300 transition hover:bg-white/[0.05]"
											on:click={() =>
												resetSettingsOverlayPlacement(
													settingsModeId ??
														activeModeId,
												)}
										>
											Reset
										</button>
									</div>
									<div
										bind:this={settingsPreviewSurface}
										class="relative mx-auto aspect-[9/16] w-full max-w-[220px] overflow-hidden rounded-[12px] bg-[#0b0f14]"
									>
										<div
											class="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0))]"
										></div>
										<div
											class="absolute inset-0 opacity-35 [background-image:linear-gradient(rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.06)_1px,transparent_1px)] [background-size:10%_10%]"
										></div>
										<div
											class="absolute border border-cyan-300/70 shadow-[0_14px_36px_rgba(0,0,0,0.28)]"
											style={settingsOverlayStyle}
										>
											<button
												type="button"
												class="absolute inset-0 cursor-move rounded-[18px]"
												on:mousedown={(event) =>
													startSettingsOverlayInteraction(
														event,
														"move",
													)}
												aria-label="Move overlay placement"
											></button>
											<div
												class="pointer-events-none relative z-10 flex h-full items-center justify-center rounded-[18px] bg-[linear-gradient(180deg,rgba(8,17,22,0.6),rgba(8,17,22,0.25))] p-3 text-center"
											>
												<div>
													<div
														class="text-[13px] font-medium text-slate-100"
													>
														{modes.find(
															(mode) =>
																mode.id ===
																settingsModeId,
														)?.label}
													</div>
													<div
														class="mt-2 text-[11px] leading-5 text-slate-400"
													>
														Generic overlay frame
														preset for this mode.
													</div>
												</div>
											</div>
											<button
												type="button"
												class="absolute bottom-2 right-2 z-20 grid h-7 w-7 cursor-se-resize place-items-center rounded-full border border-white/14 bg-black/65 text-slate-200"
												on:mousedown={(event) =>
													startSettingsOverlayInteraction(
														event,
														"resize",
													)}
												aria-label="Resize overlay placement"
											>
												<svg
													viewBox="0 0 16 16"
													class="h-3.5 w-3.5 fill-none stroke-current stroke-[1.5]"
												>
													<path d="M5 11 11 5" />
													<path d="M7.5 11H11V7.5" />
												</svg>
											</button>
										</div>
									</div>
								</div>
							</div>
							<div
								class="flex min-h-[320px] flex-col justify-between rounded-[12px] border border-dashed border-white/10 bg-white/[0.03] px-4 py-6 text-[13px] leading-6 text-slate-400"
							>
								<div>
									This mode follows the same contract:
									configure placement once here, keep runtime
									controls in the left rail, and let the
									shared fullscreen browser source render it
									during the show.
								</div>
								<div class="flex justify-end gap-2">
									<button
										class="rounded-[12px] bg-white/[0.08] px-4 py-2 text-[13px] font-medium text-slate-100 transition hover:bg-white/[0.12]"
										on:click={saveModeSettings}
									>
										Save Settings
									</button>
								</div>
							</div>
						</div>
					{/if}
				</div>
			</div>
		{/if}

		{#if stickerGiftSelectorOpen && StudioGiftSelectorDialog}
			<svelte:component
				this={StudioGiftSelectorDialog}
				gifts={giftsCatalog}
				castName={stickerGiftSelectorCastName}
				slotIndex={stickerGiftSelectorSlotIndex}
				showSlot={stickerGiftSelectorMode !== "group-sticker"}
				unavailableGiftIds={stickerGiftSelectorMode === "battle-ladder"
					? battleUnavailableGiftIds(
							stickerGiftSelectorCastName,
							stickerGiftSelectorSlotIndex,
						)
					: []}
				onClose={closeStickerGiftSelector}
				onSelect={(giftId) =>
					assignSelectedGift(stickerGiftSelectorCastName, giftId)}
			/>
		{/if}

		{#if studioSettingsOpen}
			<div
				class="absolute inset-0 z-[60] grid place-items-center bg-black/55 px-6 py-8"
			>
				<div
					transition:fly={{ y: 18, duration: 180 }}
					class="glass max-h-[calc(100vh-4rem)] w-full max-w-[720px] overflow-y-auto rounded-[18px] border border-white/10 p-5"
				>
					<div class="flex items-center justify-between gap-3">
						<div>
							<h2
								class="text-[20px] font-semibold text-slate-100"
							>
								Studio Settings
							</h2>
						</div>
						<button
							type="button"
							class="text-slate-400 transition hover:text-white"
							on:click={() => {
								closeStudioSettings();
							}}
							aria-label="Close studio settings"
						>
							<svg
								viewBox="0 0 16 16"
								class="h-5 w-5 fill-none stroke-current stroke-[1.6]"
							>
								<path d="m4 4 8 8" />
								<path d="M12 4 4 12" />
							</svg>
						</button>
					</div>
					<div class="mt-5 space-y-4">
						<div class="grid gap-3">
							<div
								class="rounded-[12px] border border-white/8 bg-white/[0.03] p-3"
							>
								<div
									class="text-[11px] uppercase tracking-[0.16em] text-slate-500"
								>
									App Version
								</div>
								<div
									class="mt-1 text-[15px] font-medium text-slate-100"
								>
									{desktopAppVersion}
								</div>
							</div>
							<div
								class="rounded-[12px] border border-white/8 bg-white/[0.03] p-3"
							>
								<div
									class="flex items-center justify-between gap-3"
								>
									<div class="min-w-0">
										<div
											class="text-[11px] uppercase tracking-[0.16em] text-slate-500"
										>
											OBS Overlay Runtime
										</div>
										<div
											class="mt-1 truncate font-mono text-[12px] text-slate-100"
											title={overlayRuntimeUrl()}
										>
											{overlayRuntimeUrl()}
										</div>
									</div>
									<button
										type="button"
										class="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] border border-white/8 text-slate-300 transition hover:bg-white/[0.06] hover:text-white"
										on:click={() => {
											void copyOverlayRuntimeUrl();
										}}
										aria-label="Copy OBS overlay runtime link"
										title="Copy Overlay Link"
									>
										<svg
											viewBox="0 0 16 16"
											class="h-4 w-4 fill-none stroke-current stroke-[1.5]"
										>
											<rect
												x="5.2"
												y="4.2"
												width="7"
												height="8"
												rx="1.3"
											/>
											<path
												d="M3.8 10.5H3.4A1.4 1.4 0 0 1 2 9.1V3.4A1.4 1.4 0 0 1 3.4 2h5.3a1.4 1.4 0 0 1 1.4 1.4v.4"
											/>
										</svg>
									</button>
								</div>
							</div>
							<div
								class="rounded-[12px] border border-white/8 bg-white/[0.03] p-3"
							>
								<div
									class="flex items-center justify-between gap-3"
								>
									<div>
										<div
											class="text-[11px] uppercase tracking-[0.16em] text-slate-500"
										>
											Custom Overlay Code
										</div>
										<div
											class="mt-1 text-[12px] text-slate-500"
										>
											CSS for the OBS runtime overlays
										</div>
									</div>
									<div
										class="rounded-full border border-white/8 px-2 py-0.5 text-[10px] text-slate-400"
									>
										{customOverlayCssDraft.length.toLocaleString()}
										chars
									</div>
								</div>
								<textarea
									bind:value={customOverlayCssDraft}
									rows="10"
									spellcheck="false"
									class="mt-3 min-h-[220px] w-full resize-y rounded-[10px] border border-white/8 bg-black/25 px-3 py-2 font-mono text-[12px] leading-5 text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-cyan-300/40"
									placeholder={`#sp-solo-card { transform: scale(1.04); }\n#sp-scene-ranking-frame { filter: drop-shadow(0 0 18px gold); }\n[data-sp-overlay-frame=\"lucky-wheel\"] { opacity: 0.95; }`}
								></textarea>
								<div
									class="mt-3 grid gap-2 rounded-[10px] bg-black/20 px-3 py-2 text-[11px] text-slate-400 sm:grid-cols-2"
								>
									<div class="truncate font-mono">
										#sp-overlay-root
									</div>
									<div class="truncate font-mono">
										#sp-solo-overlay
									</div>
									<div class="truncate font-mono">
										#sp-solo-progress-fill
									</div>
									<div class="truncate font-mono">
										#sp-solo-freedom-score-value
									</div>
									<div class="truncate font-mono">
										#sp-battle-overlay
									</div>
									<div class="truncate font-mono">
										#sp-battle-left-score
									</div>
									<div class="truncate font-mono">
										#sp-group-sticker-overlay
									</div>
									<div class="truncate font-mono">
										#sp-group-pk-overlay
									</div>
									<div class="truncate font-mono">
										#sp-scene-ranking-overlay
									</div>
									<div class="truncate font-mono">
										#sp-lucky-wheel-overlay
									</div>
									<div class="truncate font-mono">
										#sp-lucky-wheel-result
									</div>
								</div>
								<div class="mt-3 flex justify-end gap-2">
									<button
										type="button"
										class="rounded-[12px] border border-white/8 px-4 py-2 text-[13px] font-medium text-slate-100 transition hover:bg-white/[0.06]"
										on:click={resetCustomOverlayCssDraft}
										disabled={customOverlayCssSaving}
									>
										Clear
									</button>
									<button
										type="button"
										class="rounded-[12px] bg-white/[0.08] px-4 py-2 text-[13px] font-medium text-slate-100 transition hover:bg-white/[0.12] disabled:cursor-not-allowed disabled:opacity-50"
										on:click={() => {
											void saveCustomOverlayCss();
										}}
										disabled={customOverlayCssSaving}
									>
										{customOverlayCssSaving
											? "Saving..."
											: "Save Code"}
									</button>
								</div>
							</div>
						</div>

						{#if isDesktopApp}
							<div
								class="rounded-[12px] border border-white/8 bg-white/[0.03] p-3"
							>
								<div
									class="flex items-center justify-between gap-3"
								>
									<div
										class="text-[11px] uppercase tracking-[0.16em] text-slate-500"
									>
										System Status
									</div>
									<button
										type="button"
										class="inline-flex items-center gap-2 rounded-[10px] border border-white/8 px-3 py-1.5 text-[12px] font-medium text-slate-100 transition hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-50"
										on:click={() => {
											void refreshDesktopSystemStatus();
										}}
										disabled={desktopSystemStatusLoading}
									>
										<svg
											viewBox="0 0 16 16"
											class={`h-3.5 w-3.5 fill-none stroke-current stroke-[1.5] ${desktopSystemStatusLoading ? "animate-spin" : ""}`}
										>
											<path
												d="M13 5.5A5.5 5.5 0 1 0 14 8"
											/>
											<path d="M13 2.5v3h-3" />
										</svg>
										{desktopSystemStatusLoading
											? "Refreshing..."
											: "Refresh"}
									</button>
								</div>

								<div class="mt-3 grid gap-2 sm:grid-cols-3">
									<div
										class="rounded-[10px] bg-black/20 px-3 py-2"
									>
										<div
											class="text-[10px] uppercase tracking-[0.14em] text-slate-500"
										>
											CPU
										</div>
										<div
											class="mt-1 text-[18px] font-semibold text-slate-100"
										>
											{formatStatusPercent(
												desktopSystemStatus?.cpu
													.usagePercent,
											)}
										</div>
										<div
											class="mt-0.5 text-[11px] text-slate-500"
										>
											{desktopSystemStatus?.cpu.cores ??
												"N/A"} cores
										</div>
									</div>
									<div
										class="rounded-[10px] bg-black/20 px-3 py-2"
									>
										<div
											class="text-[10px] uppercase tracking-[0.14em] text-slate-500"
										>
											RAM
										</div>
										<div
											class="mt-1 text-[18px] font-semibold text-slate-100"
										>
											{formatStatusPercent(
												desktopSystemStatus?.memory
													.usedPercent,
											)}
										</div>
										<div
											class="mt-0.5 text-[11px] text-slate-500"
										>
											{formatByteSize(
												desktopSystemStatus?.memory
													.usedBytes,
											)} / {formatByteSize(
												desktopSystemStatus?.memory
													.totalBytes,
											)}
										</div>
									</div>
									<div
										class="rounded-[10px] bg-black/20 px-3 py-2"
									>
										<div
											class="text-[10px] uppercase tracking-[0.14em] text-slate-500"
										>
											App Memory
										</div>
										<div
											class="mt-1 text-[18px] font-semibold text-slate-100"
										>
											{formatByteSize(
												desktopSystemStatus?.process
													.rssBytes,
											)}
										</div>
										<div
											class="mt-0.5 text-[11px] text-slate-500"
										>
											Heap {formatByteSize(
												desktopSystemStatus?.process
													.heapUsedBytes,
											)}
										</div>
									</div>
								</div>

								{#if desktopSystemStatusError}
									<div
										class="mt-3 rounded-[10px] border border-amber-300/15 bg-amber-400/10 px-3 py-2 text-[12px] text-amber-100"
									>
										{desktopSystemStatusError}
									</div>
								{/if}
							</div>

							<div
								class="rounded-[12px] border border-white/8 bg-white/[0.03] p-3"
							>
								<div
									class="flex items-center justify-between gap-3"
								>
									<div>
										<div
											class="text-[11px] uppercase tracking-[0.16em] text-slate-500"
										>
											Streaming Network Test
										</div>
										{#if desktopNetworkTest}
											<div
												class="mt-1 text-[11px] text-slate-500"
											>
												{desktopNetworkTest.provider} / {formatStatusTime(
													desktopNetworkTest.completedAt,
												)}
											</div>
										{/if}
									</div>
									<button
										type="button"
										class="inline-flex items-center gap-2 rounded-[10px] border border-white/8 px-3 py-1.5 text-[12px] font-medium text-slate-100 transition hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-50"
										on:click={() => {
											void runDesktopNetworkTestFlow();
										}}
										disabled={desktopNetworkTestRunning ||
											!isDesktopApp}
									>
										<svg
											viewBox="0 0 16 16"
											class={`h-3.5 w-3.5 fill-none stroke-current stroke-[1.5] ${desktopNetworkTestRunning ? "animate-pulse" : ""}`}
										>
											<path d="M8 2v8" />
											<path
												d="m4.5 6.5 3.5 3.5 3.5-3.5"
											/>
											<path d="M3 13h10" />
										</svg>
										{desktopNetworkTestRunning
											? "Testing..."
											: "Run Stream Test"}
									</button>
								</div>

								<div
									class="mt-3 grid gap-2 sm:grid-cols-[0.85fr_1.15fr]"
								>
									<div
										class={`rounded-[10px] border px-3 py-2 ${stabilityScoreTone(desktopNetworkTest?.streaming?.stabilityScore)}`}
									>
										<div
											class="text-[10px] uppercase tracking-[0.14em] opacity-70"
										>
											Network Score
										</div>
										<div
											class="mt-1 text-[24px] font-semibold"
										>
											{formatStabilityScore(
												desktopNetworkTest?.streaming
													?.stabilityScore,
											)}
										</div>
									</div>
									<div
										class="rounded-[10px] bg-black/20 px-3 py-2"
									>
										<div class="grid grid-cols-2 gap-3">
											<div>
												<div
													class="text-[10px] uppercase tracking-[0.14em] text-slate-500"
												>
													Upload
												</div>
												<div
													class="mt-1 text-[24px] font-semibold text-slate-100"
												>
													{formatSpeedMbps(
														desktopNetworkTest?.uploadMbps,
													)}
												</div>
											</div>
											<div>
												<div
													class="text-[10px] uppercase tracking-[0.14em] text-slate-500"
												>
													Download
												</div>
												<div
													class="mt-1 text-[24px] font-semibold text-slate-100"
												>
													{formatSpeedMbps(
														desktopNetworkTest?.downloadMbps,
													)}
												</div>
											</div>
										</div>
									</div>
								</div>

								<div class="mt-2 grid gap-2 sm:grid-cols-3">
									<div
										class="rounded-[10px] bg-black/20 px-3 py-2"
									>
										<div
											class="text-[10px] uppercase tracking-[0.14em] text-slate-500"
										>
											Latency
										</div>
										<div
											class="mt-1 text-[17px] font-semibold text-slate-100"
										>
											{formatLatencyMs(
												desktopNetworkTest?.latencyMs,
											)}
										</div>
										<div
											class="mt-0.5 text-[11px] text-slate-500"
										>
											{formatLatencyMs(
												desktopNetworkTest?.latencyMinMs,
											)} - {formatLatencyMs(
												desktopNetworkTest?.latencyMaxMs,
											)}
										</div>
									</div>
									<div
										class="rounded-[10px] bg-black/20 px-3 py-2"
									>
										<div
											class="text-[10px] uppercase tracking-[0.14em] text-slate-500"
										>
											Loaded Latency
										</div>
										<div
											class="mt-1 text-[17px] font-semibold text-slate-100"
										>
											{formatLatencyMs(
												desktopNetworkTest?.loadedLatencyMs,
											)}
										</div>
										<div
											class="mt-0.5 text-[11px] text-slate-500"
										>
											During upload
										</div>
									</div>
									<div
										class="rounded-[10px] bg-black/20 px-3 py-2"
									>
										<div
											class="text-[10px] uppercase tracking-[0.14em] text-slate-500"
										>
											Bufferbloat
										</div>
										<div
											class="mt-1 text-[17px] font-semibold text-slate-100"
										>
											+{formatLatencyMs(
												desktopNetworkTest?.bufferbloatMs,
											)}
										</div>
										<div
											class="mt-0.5 text-[11px] text-slate-500"
										>
											Latency increase
										</div>
									</div>
									<div
										class="rounded-[10px] bg-black/20 px-3 py-2"
									>
										<div
											class="text-[10px] uppercase tracking-[0.14em] text-slate-500"
										>
											Jitter
										</div>
										<div
											class="mt-1 text-[17px] font-semibold text-slate-100"
										>
											{formatLatencyMs(
												desktopNetworkTest?.jitterMs,
											)}
										</div>
										<div
											class="mt-0.5 text-[11px] text-slate-500"
										>
											Avg variation
										</div>
									</div>
									<div
										class="rounded-[10px] bg-black/20 px-3 py-2"
									>
										<div
											class="text-[10px] uppercase tracking-[0.14em] text-slate-500"
										>
											Upload Jitter
										</div>
										<div
											class="mt-1 text-[17px] font-semibold text-slate-100"
										>
											{formatSpeedMbps(
												desktopNetworkTest?.uploadJitterMbps,
											)}
										</div>
										<div
											class="mt-0.5 text-[11px] text-slate-500"
										>
											{desktopNetworkTest
												?.uploadSamplesMbps?.length ??
												0} samples
										</div>
									</div>
									<div
										class="rounded-[10px] bg-black/20 px-3 py-2"
									>
										<div
											class="text-[10px] uppercase tracking-[0.14em] text-slate-500"
										>
											Probe Loss
										</div>
										<div
											class="mt-1 text-[17px] font-semibold text-slate-100"
										>
											{formatStatusPercent(
												desktopNetworkTest?.packetLossPercent,
											)}
										</div>
										<div
											class="mt-0.5 text-[11px] text-slate-500"
										>
											{desktopNetworkTest?.latencyFailedSamples ??
												0}/{desktopNetworkTest?.latencySampleCount ??
												8} failed
										</div>
									</div>
								</div>

								{#if desktopNetworkTestError || desktopNetworkTest?.error}
									<div
										class="mt-3 rounded-[10px] border border-amber-300/15 bg-amber-400/10 px-3 py-2 text-[12px] text-amber-100"
									>
										{desktopNetworkTestError ||
											desktopNetworkTest?.error}
									</div>
								{/if}
							</div>
						{/if}

						{#if isDesktopApp}
							<div
								class="rounded-[12px] border border-white/8 bg-white/[0.03] p-3"
							>
								<div
									class="flex items-center justify-between gap-3"
								>
									<div>
										<div
											class="text-[11px] uppercase tracking-[0.16em] text-slate-500"
										>
											Desktop Update
										</div>
									</div>
									{#if desktopUpdateState.availableVersion && desktopUpdateState.availableVersion !== desktopAppVersion}
										<div
											class="rounded-full border border-cyan-300/20 bg-cyan-400/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-cyan-100"
										>
											{desktopUpdateState.availableVersion}
										</div>
									{/if}
								</div>
								<div
									class="mt-3 rounded-[10px] bg-black/20 px-3 py-2 text-[12px] leading-5 text-slate-300"
								>
									{desktopUpdateState.message}
								</div>
								{#if desktopUpdateState.downloadPercent !== null && desktopUpdateState.status === "downloading"}
									<div
										class="mt-3 rounded-full bg-white/8 p-1"
									>
										<div
											class="h-2 rounded-full bg-[linear-gradient(90deg,#67e8f9,#38bdf8)]"
											style={`width: ${Math.max(4, Math.min(desktopUpdateState.downloadPercent, 100)).toFixed(0)}%`}
										></div>
									</div>
								{/if}
								<div
									class="mt-3 flex flex-wrap justify-end gap-2"
								>
									<button
										class="rounded-[12px] border border-white/8 px-4 py-2 text-[13px] font-medium text-slate-100 transition hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-50"
										on:click={() => {
											void checkForDesktopUpdatesFlow();
										}}
										disabled={!desktopUpdateState.canCheck}
									>
										{desktopUpdateState.status ===
										"checking"
											? "Checking..."
											: "Check For Updates"}
									</button>
									{#if desktopUpdateState.canInstall}
										<button
											class="rounded-[12px] bg-cyan-400/15 px-4 py-2 text-[13px] font-medium text-cyan-50 transition hover:bg-cyan-400/25"
											on:click={() => {
												void installDesktopUpdateFlow();
											}}
										>
											Restart And Install
										</button>
									{/if}
								</div>
							</div>
						{/if}
					</div>
				</div>
			</div>
		{/if}

		{#if sceneRankingsSettingsOpen}
			<div
				class="absolute inset-0 z-[60] grid place-items-center bg-black/55 px-6 py-8"
			>
				<div
					transition:fly={{ y: 18, duration: 180 }}
					class="glass w-full max-w-[500px] rounded-[18px] border border-white/10 p-5"
				>
					<div class="flex items-center justify-between gap-3">
						<div class="min-w-0">
							<h2
								class="text-[20px] font-semibold text-slate-100"
							>
								Ranking
							</h2>
						</div>
						<button
							type="button"
							class="text-slate-400 transition hover:text-white"
							on:click={() => {
								closeSceneRankingsSettings();
							}}
							aria-label="Close ranking list settings"
						>
							<svg
								viewBox="0 0 16 16"
								class="h-5 w-5 fill-none stroke-current stroke-[1.6]"
							>
								<path d="m4 4 8 8" />
								<path d="M12 4 4 12" />
							</svg>
						</button>
					</div>

					<div class="mt-5 space-y-3">
						<div
							class="flex items-center justify-between gap-3 rounded-[12px] border border-white/8 bg-white/[0.03] px-3 py-2.5"
						>
							<div class="min-w-0">
								<div
									class="text-[13px] font-medium text-slate-100"
								>
									Visibility
								</div>
								<!-- <div class="mt-0.5 text-[11px] text-slate-500">
											{sceneRankingsSettings.enabled ? 'Visible' : 'Hidden'}
										</div> -->
							</div>
							<label
								class="relative inline-flex cursor-pointer items-center"
							>
								<input
									type="checkbox"
									class="peer sr-only"
									checked={sceneRankingsEditorSettings.enabled}
									on:change={(event) => {
										setSceneRankingsEnabled(
											(
												event.currentTarget as HTMLInputElement
											).checked,
										);
									}}
								/>
								<span
									class="h-6 w-10 rounded-full border border-white/10 bg-black/35 transition peer-checked:border-cyan-300/30 peer-checked:bg-cyan-400/30"
								></span>
								<span
									class="absolute left-1 top-1 h-4 w-4 rounded-full bg-slate-400 transition peer-checked:translate-x-4 peer-checked:bg-cyan-100"
								></span>
							</label>
						</div>

						<div
							class="rounded-[12px] border border-white/8 bg-white/[0.03] p-3"
						>
							<div
								class="mb-3 flex items-center justify-between gap-3"
							>
								<div
									class="text-[11px] uppercase tracking-[0.14em] text-slate-500"
								>
									Placement
								</div>
								<button
									type="button"
									class="rounded-[10px] border border-white/8 px-2.5 py-1.5 text-[11px] text-slate-300 transition hover:bg-white/[0.05]"
									on:click={resetSceneRankingsPlacement}
								>
									Reset
								</button>
							</div>
							<div
								bind:this={sceneRankingsPreviewSurface}
								class="relative mx-auto aspect-[9/16] w-full max-w-[190px] overflow-hidden rounded-[12px] bg-[#0b0f14]"
							>
								<div
									class="absolute inset-0 bg-[radial-gradient(circle_at_50%_14%,rgba(255,255,255,0.14),transparent_32%),linear-gradient(180deg,#121922,#080d13)]"
								></div>
								<div
									class="absolute inset-0 opacity-35 [background-image:linear-gradient(rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.06)_1px,transparent_1px)] [background-size:10%_10%]"
								></div>
								<div
									class="absolute overflow-hidden"
									style={sceneRankingsStyle}
								>
									<button
										type="button"
										class="absolute inset-0 z-20 cursor-move"
										on:mousedown={(event) =>
											startSceneRankingsInteraction(
												event,
												"move",
											)}
										aria-label="Move ranking list placement"
									></button>
									<div
										class="pointer-events-none relative z-10 h-full w-full"
									>
										<SceneRankingOverlaySurface
											rows={sceneRankingPreviewRows}
										/>
									</div>
									<button
										type="button"
										class="absolute bottom-1 right-1 z-30 grid h-5 w-5 cursor-se-resize place-items-center rounded-full border border-white/14 bg-black/65 text-slate-200"
										on:mousedown={(event) =>
											startSceneRankingsInteraction(
												event,
												"resize",
											)}
										aria-label="Resize ranking list placement"
									>
										<svg
											viewBox="0 0 16 16"
											class="h-3 w-3 fill-none stroke-current stroke-[1.5]"
										>
											<path d="M5 11 11 5" />
											<path d="M7.5 11H11V7.5" />
										</svg>
									</button>
								</div>
							</div>
						</div>
					</div>
					<div class="mt-4 flex justify-end gap-2">
						<button
							type="button"
							class="rounded-[12px] bg-white/[0.08] px-4 py-2 text-[13px] font-medium text-slate-100 transition hover:bg-white/[0.12] disabled:cursor-not-allowed disabled:opacity-50"
							on:click={() => {
								void saveSceneRankingsSettingsFromPopup();
							}}
							disabled={sceneRankingsSaving}
						>
							{sceneRankingsSaving
								? "Saving..."
								: "Save Settings"}
						</button>
					</div>
				</div>
			</div>
		{/if}

		{#if modesSettingsOpen}
			<div
				class="absolute inset-0 z-[60] grid place-items-center bg-black/55 px-6 py-8"
			>
				<div
					transition:fly={{ y: 18, duration: 180 }}
					class="glass w-full max-w-[420px] rounded-[18px] border border-white/10 p-5"
				>
					<div class="flex items-center justify-between gap-3">
						<div>
							<h2
								class="text-[20px] font-semibold text-slate-100"
							>
								Modes Settings
							</h2>
						</div>
						<button
							type="button"
							class="text-slate-400 transition hover:text-white"
							on:click={closeModesSettings}
							aria-label="Close modes settings"
						>
							<svg
								viewBox="0 0 16 16"
								class="h-5 w-5 fill-none stroke-current stroke-[1.6]"
							>
								<path d="m4 4 8 8" />
								<path d="M12 4 4 12" />
							</svg>
						</button>
					</div>

					<div
						class="mt-5 rounded-[14px] border border-white/8 bg-white/[0.03] p-3"
					>
						<div class="flex items-center justify-between gap-3">
							<div class="min-w-0">
								<div
									class="truncate text-[13px] font-medium text-slate-100"
								>
									Gifter Binding
								</div>
								<div class="mt-1 text-[11px] text-slate-500">
									{runtimeOverlayState.gifterBinding.enabled
										? "Enabled"
										: "Disabled"}
								</div>
							</div>
							<button
								type="button"
								class={`h-7 w-12 rounded-full border px-1 transition ${
									runtimeOverlayState.gifterBinding.enabled
										? "border-cyan-400/50 bg-cyan-400/20"
										: "border-white/8 bg-white/[0.03]"
								}`}
								on:click={() => {
									void toggleGifterBinding();
								}}
								aria-label="Toggle gifter binding"
								aria-pressed={runtimeOverlayState.gifterBinding
									.enabled}
								title="Gifter Binding"
							>
								<span
									class={`block h-5 w-5 rounded-full transition ${
										runtimeOverlayState.gifterBinding
											.enabled
											? "translate-x-5 bg-cyan-100"
											: "translate-x-0 bg-slate-500"
									}`}
								></span>
							</button>
						</div>
					</div>
				</div>
			</div>
		{/if}

		{#if sceneRandomizerSettingsOpen}
			<div
				class="absolute inset-0 z-[60] grid place-items-center bg-black/55 px-6 py-8"
			>
				<div
					transition:fly={{ y: 18, duration: 180 }}
					class="glass w-full max-w-[620px] rounded-[18px] border border-white/10 p-5"
				>
					<div class="flex items-center justify-between gap-3">
						<div class="min-w-0">
							<h2
								class="text-[20px] font-semibold text-slate-100"
							>
								{sceneRandomizerDefinition(
									sceneRandomizerSettingsOpen,
								).label}
							</h2>
							<div class="mt-1 text-[12px] text-slate-500">
								{sceneRandomizerDefinition(
									sceneRandomizerSettingsOpen,
								).description}
							</div>
						</div>
						<button
							type="button"
							class="text-slate-400 transition hover:text-white"
							on:click={closeSceneRandomizerSettings}
							aria-label="Close scene tool settings"
						>
							<svg
								viewBox="0 0 16 16"
								class="h-5 w-5 fill-none stroke-current stroke-[1.6]"
							>
								<path d="m4 4 8 8" />
								<path d="M12 4 4 12" />
							</svg>
						</button>
					</div>

					<div
						class="mt-5 grid gap-3 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]"
					>
						<div
							class="rounded-[12px] border border-white/8 bg-white/[0.03] p-3"
						>
							<div
								class="flex items-center justify-between gap-3"
							>
								<div
									class="text-[11px] uppercase tracking-[0.14em] text-slate-500"
								>
									Options
								</div>
								<div class="text-[11px] text-slate-500">
									{sceneRandomizerOptionsFromText(
										sceneRandomizerDraftOptionsText,
										sceneRandomizerSettingsOpen,
									).length} total
								</div>
							</div>
							<textarea
								bind:value={sceneRandomizerDraftOptionsText}
								rows="12"
								class="mt-3 min-h-[220px] w-full resize-none rounded-[10px] border border-white/8 bg-black/25 px-3 py-2 text-[13px] leading-6 text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-cyan-300/40"
								placeholder="One option per line"
							></textarea>
							<label
								class="mt-3 grid gap-1.5 rounded-[10px] border border-white/8 bg-black/20 px-3 py-2.5"
							>
								<span
									class="text-[11px] uppercase tracking-[0.14em] text-slate-500"
									>Result Hold</span
								>
								<div class="flex items-center gap-2">
									<input
										type="number"
										min="1"
										max="15"
										step="1"
										value={Math.round(
											sceneRandomizerDraftSettings.resultHoldMs /
												1000,
										)}
										class="w-20 rounded-[8px] border border-white/8 bg-black/25 px-2 py-1.5 text-[13px] font-medium text-slate-100 outline-none transition focus:border-cyan-300/40"
										on:input={(event) => {
											updateSceneRandomizerResultHoldSeconds(
												(
													event.currentTarget as HTMLInputElement
												).value,
											);
										}}
									/>
									<span class="text-[12px] text-slate-500"
										>seconds after spin</span
									>
								</div>
							</label>
						</div>

						<div
							class="rounded-[12px] border border-white/8 bg-white/[0.03] p-3"
						>
							<div
								class="mb-3 flex items-center justify-between gap-3"
							>
								<div
									class="text-[11px] uppercase tracking-[0.14em] text-slate-500"
								>
									Placement
								</div>
								<button
									type="button"
									class="rounded-[10px] border border-white/8 px-2.5 py-1.5 text-[11px] text-slate-300 transition hover:bg-white/[0.05]"
									on:click={resetSceneRandomizerPlacement}
								>
									Reset
								</button>
							</div>
							<div
								bind:this={sceneRandomizerPreviewSurface}
								class="relative mx-auto aspect-[9/16] w-full max-w-[230px] overflow-hidden rounded-[12px] bg-[#0b0f14]"
							>
								<div
									class="absolute inset-0 bg-[radial-gradient(circle_at_50%_14%,rgba(255,255,255,0.14),transparent_32%),linear-gradient(180deg,#121922,#080d13)]"
								></div>
								<div
									class="absolute inset-0 opacity-35 [background-image:linear-gradient(rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.06)_1px,transparent_1px)] [background-size:10%_10%]"
								></div>
								<div
									class="absolute"
									style={sceneRandomizerStyle}
								>
									<button
										type="button"
										class="absolute inset-0 z-20 cursor-move rounded-[12px]"
										on:mousedown={(event) =>
											startSceneRandomizerInteraction(
												event,
												"move",
											)}
										aria-label="Move scene tool placement"
									></button>
									<div
										class="pointer-events-none relative z-10 h-full w-full"
									>
										<SceneRandomizerOverlaySurface
											randomizerId={sceneRandomizerSettingsOpen}
											options={sceneRandomizerOptionsFromText(
												sceneRandomizerDraftOptionsText,
												sceneRandomizerSettingsOpen,
											)}
											run={sceneRandomizerPreviewRun}
											preview
										/>
									</div>
									<button
										type="button"
										class="absolute bottom-1 right-1 z-30 grid h-5 w-5 cursor-se-resize place-items-center rounded-full border border-white/14 bg-black/65 text-slate-200"
										on:mousedown={(event) =>
											startSceneRandomizerInteraction(
												event,
												"resize",
											)}
										aria-label="Resize scene tool placement"
									>
										<svg
											viewBox="0 0 16 16"
											class="h-3 w-3 fill-none stroke-current stroke-[1.5]"
										>
											<path d="M5 11 11 5" />
											<path d="M7.5 11H11V7.5" />
										</svg>
									</button>
								</div>
							</div>
						</div>
					</div>
					<div class="mt-4 flex justify-end gap-2">
						<button
							type="button"
							class="rounded-[12px] bg-white/[0.08] px-4 py-2 text-[13px] font-medium text-slate-100 transition hover:bg-white/[0.12] disabled:cursor-not-allowed disabled:opacity-50"
							on:click={() => {
								void saveSceneRandomizerSettingsFromPopup();
							}}
							disabled={sceneRandomizerSaving}
						>
							{sceneRandomizerSaving
								? "Saving..."
								: "Save Settings"}
						</button>
					</div>
				</div>
			</div>
		{/if}

		{#if cameraSettingsOpen}
			<div
				class="absolute inset-0 z-[60] grid place-items-center bg-black/55 px-6 py-8"
			>
				<div
					transition:fly={{ y: 18, duration: 180 }}
					class="glass w-full max-w-[620px] rounded-[18px] border border-white/10 p-5"
				>
					<div class="flex items-center justify-between gap-3">
						<div>
							<h2
								class="text-[20px] font-semibold text-slate-100"
							>
								Camera Settings
							</h2>
						</div>
						<button
							class="text-slate-400 transition hover:text-white"
							on:click={closeCameraSettings}
							type="button"
							aria-label="Close camera settings"
						>
							<svg
								viewBox="0 0 16 16"
								class="h-5 w-5 fill-none stroke-current stroke-[1.6]"
							>
								<path d="m4 4 8 8" />
								<path d="M12 4 4 12" />
							</svg>
						</button>
					</div>
					<div class="mt-5 space-y-4">
						<div
							class="rounded-[12px] border border-white/8 bg-white/[0.03] p-3"
						>
							<div
								class="text-[11px] uppercase tracking-[0.16em] text-slate-500"
							>
								Camera Source
							</div>
							<div class="mt-3 flex flex-col gap-3">
								<select
									bind:value={selectedVideoInputId}
									class="studio-select w-full rounded-[10px] border border-white/10 px-3 py-2.5 text-[13px] outline-none"
									disabled={refreshingVideoInputs ||
										obsConnecting}
									on:change={() => {
										void handleVideoInputSelectionChange();
									}}
								>
									{#if videoInputDevices.length === 0}
										<option value=""
											>No camera sources</option
										>
									{:else}
										{#each videoInputDevices as device}
											<option value={device.deviceId}
												>{device.label}</option
											>
										{/each}
									{/if}
								</select>
								<div class="flex flex-wrap justify-end gap-2">
									<button
										class="rounded-[10px] border border-white/10 px-3 py-2 text-[12px] text-slate-200 transition hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-50"
										disabled={refreshingVideoInputs ||
											obsConnecting}
										on:click={() => {
											void refreshCameraInputsFlow();
										}}
										type="button"
									>
										{refreshingVideoInputs
											? "Refreshing..."
											: "Refresh Sources"}
									</button>
									{#if isWindowsDesktopApp()}
										<button
											class="rounded-[10px] border border-white/10 px-3 py-2 text-[12px] text-slate-200 transition hover:bg-white/[0.06]"
											on:click={() => {
												void openDesktopCameraSettings();
											}}
											type="button"
										>
											Camera Settings
										</button>
									{/if}
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>
		{/if}

		{#if castSettingsOpen}
			<div
				class="absolute inset-0 z-[60] grid place-items-center bg-black/55 px-6 py-8"
			>
				<div
					transition:fly={{ y: 18, duration: 180 }}
					class="glass flex h-full max-h-[760px] w-full max-w-[920px] flex-col rounded-[18px] border border-white/10 p-5"
				>
					<div class="mb-4 flex items-center justify-between gap-3">
						<div>
							<h2
								class="text-[20px] font-semibold text-slate-100"
							>
								Cast Settings
							</h2>
							<p class="mt-1 text-[12px] text-slate-500">
								Casts added here become the shared roster for
								every game.
							</p>
						</div>
						<button
							type="button"
							class="text-slate-400 transition hover:text-white"
							on:click={() => {
								castSettingsOpen = false;
							}}
							aria-label="Close cast settings"
						>
							<svg
								viewBox="0 0 16 16"
								class="h-5 w-5 fill-none stroke-current stroke-[1.6]"
							>
								<path d="m4 4 8 8" />
								<path d="M12 4 4 12" />
							</svg>
						</button>
					</div>

					{#if castSettingsLocked()}
						<div
							class="mb-4 rounded-[12px] border border-amber-300/20 bg-amber-300/10 px-3 py-2 text-[12px] text-amber-100"
						>
							Cast settings are locked while a mode is running.
						</div>
					{/if}

					<div
						class="grid min-h-0 flex-1 gap-4 md:grid-cols-[320px_minmax(0,1fr)]"
					>
						<div class="space-y-3">
							<div
								class="rounded-[12px] border border-white/8 bg-white/[0.03] p-3"
							>
								<div
									class="flex items-center justify-between gap-3"
								>
									<div
										class="text-[11px] uppercase tracking-[0.16em] text-slate-500"
									>
										Add Cast
									</div>
									<button
										class="rounded-[10px] border border-white/8 px-2.5 py-1 text-[11px] text-slate-300 transition hover:bg-white/[0.05] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
										on:click={() => {
											void addStudioCastFlow();
										}}
										disabled={castSettingsLocked() ||
											!newCastNickname.trim()}
									>
										Save Cast
									</button>
								</div>
								<label
									class="mt-3 block rounded-[10px] bg-black/20 px-3 py-2"
								>
									<div
										class="text-[10px] uppercase tracking-[0.14em] text-slate-500"
									>
										Cast Nickname
									</div>
									<input
										bind:value={newCastNickname}
										class="mt-1 w-full bg-transparent text-[13px] text-slate-100 outline-none placeholder:text-slate-600 disabled:cursor-not-allowed disabled:opacity-50"
										placeholder="Nickname shown in games"
										disabled={castSettingsLocked()}
									/>
								</label>
							</div>
						</div>

						<div
							class="flex min-h-0 flex-col rounded-[12px] border border-white/8 bg-white/[0.03] p-3"
						>
							<div class="mb-3">
								<div>
									<div
										class="text-[11px] uppercase tracking-[0.16em] text-slate-500"
									>
										Shared Cast List
									</div>
									<div
										class="mt-1 text-[12px] text-slate-500"
									>
										{$studioCasts.length} cast saved
									</div>
								</div>
							</div>

							<div class="min-h-0 flex-1 overflow-y-auto pr-1">
								{#if $studioCasts.length > 0}
									<div class="space-y-2">
										{#each $studioCasts as cast}
											<div
												class="flex items-center justify-between gap-3 rounded-[12px] border border-white/8 bg-black/20 px-3 py-2.5"
											>
												<div class="min-w-0">
													<div
														class="truncate text-[13px] font-medium text-slate-100"
													>
														{cast.nickname}
													</div>
													{#if cast.username}
														<div
															class="mt-0.5 truncate text-[12px] text-slate-500"
														>
															@{cast.username}
														</div>
													{/if}
												</div>
												<button
													class="rounded-[10px] border border-rose-400/20 bg-rose-500/10 px-2.5 py-1 text-[11px] text-rose-100 transition hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-rose-500/10"
													on:click={() => {
														void removeStudioCastFlow(
															cast.id,
														);
													}}
													disabled={castSettingsLocked()}
												>
													Remove
												</button>
											</div>
										{/each}
									</div>
								{:else}
									<div
										class="grid h-full min-h-[260px] place-items-center rounded-[12px] border border-dashed border-white/10 px-6 text-center text-[13px] leading-6 text-slate-500"
									>
										Add casts here first. Sticker Dance,
										Group PK, and the other games will use
										this shared roster.
									</div>
								{/if}
							</div>
						</div>
					</div>
				</div>
			</div>
		{/if}

		{#if profileBorderSettingsOpen}
			<ProfileBorderSettings
				casts={$studioCasts}
				on:close={closeProfileBorderSettings}
			/>
		{/if}
	</div>
</div>
