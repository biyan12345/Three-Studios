import { battleStore } from '$lib/server/games';
import { groupPkStore } from '$lib/server/games';
import { soloStageStore } from '$lib/server/games';
import { stickerDanceStore } from '$lib/server/games';
import {
	giftCatalogMatchKey,
	giftCatalogStoredId,
	loadGiftCatalog,
	resolveGiftCatalogEntry as resolveGiftCatalogLookup
} from '$lib/gift-catalog';
import { sanitizeCastNameList, trimValue } from '$lib/helpers';
import type { BattleState } from '$lib/app-types';
import type { GifterBindingSettings } from '$lib/app-types';
import type { GroupPkState } from '$lib/app-types';
import type {
	LiveFeedEvent,
	RuntimeOverlayCustomCodeSettings,
	RuntimeOverlayCommand,
	RuntimeOverlayFrame,
	RuntimeOverlayModeId,
	RuntimeOverlayState,
	SceneRandomizerId,
	SceneRandomizerRun,
	SceneRandomizerSettings,
	SceneRandomizersState,
	SceneRankingScore,
	SceneRankingsSettings
} from '$lib/app-types';
import type { SoloStageState } from '$lib/app-types';
import type { StickerDanceState } from '$lib/app-types';

type Subscriber = (state: RuntimeOverlayState) => void;

const DEFAULT_FRAME: RuntimeOverlayFrame = {
	x: 0.18,
	y: 0.14,
	width: 0.34,
	height: 0.56
};

const DEFAULT_RANKINGS_FRAME: RuntimeOverlayFrame = {
	x: 0.04,
	y: 0.5,
	width: 0.38,
	height: 0.24
};

const DEFAULT_RANKINGS: SceneRankingsSettings = {
	enabled: false,
	frame: DEFAULT_RANKINGS_FRAME,
	castNames: [],
	scores: []
};

const DEFAULT_GIFTER_BINDING: GifterBindingSettings = {
	enabled: false
};

const DEFAULT_CUSTOM_CODE: RuntimeOverlayCustomCodeSettings = {
	css: ''
};

const MAX_CUSTOM_OVERLAY_CSS_LENGTH = 30000;

const SCENE_RANDOMIZER_IDS: SceneRandomizerId[] = ['lucky-wheel'];
const SCENE_RANDOMIZER_SURFACE_ASPECT_RATIO = 9 / 16;
const LUCKY_WHEEL_OVERLAY_ASPECT_RATIO = 1;
const MIN_LUCKY_WHEEL_OVERLAY_WIDTH = 0.22;
const DEFAULT_SCENE_RANDOMIZER_RESULT_HOLD_MS = 5000;
const MIN_SCENE_RANDOMIZER_RESULT_HOLD_MS = 1000;
const MAX_SCENE_RANDOMIZER_RESULT_HOLD_MS = 15000;

const DEFAULT_SCENE_RANDOMIZER_FRAMES: Record<SceneRandomizerId, RuntimeOverlayFrame> = {
	'lucky-wheel': { x: 0.24, y: 0.22, width: 0.52, height: 0.2925 }
};

const DEFAULT_SCENE_RANDOMIZER_OPTIONS: Record<SceneRandomizerId, string[]> = {
	'lucky-wheel': ['Double Points', 'Reset Score', 'Bonus Gift', 'Swap Cast', 'Free Pick', 'Safe Round']
};

function isEnabledModeId(
	modeId: RuntimeOverlayModeId
): modeId is Exclude<RuntimeOverlayModeId, null> {
	return modeId !== null;
}

function nowIso() {
	return new Date().toISOString();
}

function clampFrame(frame: RuntimeOverlayFrame): RuntimeOverlayFrame {
	const width = Math.min(Math.max(frame.width, 0.16), 1);
	const height = Math.min(Math.max(frame.height, 0.16), 1);
	const x = Math.min(Math.max(frame.x, 0), 1 - width);
	const y = Math.min(Math.max(frame.y, 0), 1 - height);

	return { x, y, width, height };
}

function clampRankingsFrame(frame: RuntimeOverlayFrame): RuntimeOverlayFrame {
	const width = Math.min(Math.max(frame.width, 0.22), 1);
	const height = Math.min(Math.max(frame.height, 0.1), 1);
	const x = Math.min(Math.max(frame.x, 0), 1 - width);
	const y = Math.min(Math.max(frame.y, 0), 1 - height);

	return { x, y, width, height };
}

function clampSceneRandomizerFrame(frame: RuntimeOverlayFrame): RuntimeOverlayFrame {
	const fallback = DEFAULT_SCENE_RANDOMIZER_FRAMES['lucky-wheel'];
	const widthValue = Number(frame.width);
	const rawWidth = Math.min(
		Math.max(Number.isFinite(widthValue) ? widthValue : fallback.width, MIN_LUCKY_WHEEL_OVERLAY_WIDTH),
		1
	);
	const heightFromWidth =
		rawWidth * (SCENE_RANDOMIZER_SURFACE_ASPECT_RATIO / LUCKY_WHEEL_OVERLAY_ASPECT_RATIO);
	const height = Math.min(
		Math.max(
			heightFromWidth,
			MIN_LUCKY_WHEEL_OVERLAY_WIDTH *
			(SCENE_RANDOMIZER_SURFACE_ASPECT_RATIO / LUCKY_WHEEL_OVERLAY_ASPECT_RATIO)
		),
		1
	);
	const width = Math.min(
		Math.max(
			height * (LUCKY_WHEEL_OVERLAY_ASPECT_RATIO / SCENE_RANDOMIZER_SURFACE_ASPECT_RATIO),
			MIN_LUCKY_WHEEL_OVERLAY_WIDTH
		),
		1
	);
	const xValue = Number(frame.x);
	const yValue = Number(frame.y);
	const x = Math.min(Math.max(Number.isFinite(xValue) ? xValue : fallback.x, 0), 1 - width);
	const y = Math.min(Math.max(Number.isFinite(yValue) ? yValue : fallback.y, 0), 1 - height);

	return { x, y, width, height };
}

function sanitizeRankingScores(value: unknown, castNames: string[] = []): SceneRankingScore[] {
	const allowedNames = new Set(sanitizeCastNameList(castNames));
	const restrictToRoster = allowedNames.size > 0;
	const totals = new Map<string, number>();

	if (!Array.isArray(value)) {
		return [];
	}

	for (const entry of value) {
		const source = entry && typeof entry === 'object' ? (entry as Partial<SceneRankingScore>) : {};
		const name = trimValue(source.name);
		if (!name || (restrictToRoster && !allowedNames.has(name))) {
			continue;
		}

		const score = Math.max(Math.floor(Number(source.score) || 0), 0);
		totals.set(name, (totals.get(name) ?? 0) + score);
	}

	return Array.from(totals.entries()).map(([name, score]) => ({ name, score }));
}

function sanitizeRankingsSettings(
	rankings: Partial<SceneRankingsSettings> | null | undefined,
	fallback = DEFAULT_RANKINGS
): SceneRankingsSettings {
	const castNames = Array.isArray(rankings?.castNames) ? rankings.castNames : fallback.castNames;
	const sanitizedCastNames = sanitizeCastNameList(castNames);

	return {
		enabled: Boolean(rankings?.enabled ?? fallback.enabled),
		frame: clampRankingsFrame({
			...fallback.frame,
			...(rankings?.frame ?? {})
		}),
		castNames: sanitizedCastNames,
		scores: sanitizeRankingScores(
			Array.isArray(rankings?.scores) ? rankings?.scores : fallback.scores,
			sanitizedCastNames
		)
	};
}

function sanitizeGifterBindingSettings(
	settings: Partial<GifterBindingSettings> | null | undefined,
	fallback = DEFAULT_GIFTER_BINDING
): GifterBindingSettings {
	return {
		enabled: Boolean(settings?.enabled ?? fallback.enabled)
	};
}

function sanitizeCustomCodeSettings(
	settings: Partial<RuntimeOverlayCustomCodeSettings> | null | undefined,
	fallback = DEFAULT_CUSTOM_CODE
): RuntimeOverlayCustomCodeSettings {
	const css = typeof settings?.css === 'string' ? settings.css : fallback.css;
	return {
		css: css.slice(0, MAX_CUSTOM_OVERLAY_CSS_LENGTH)
	};
}

function defaultSceneRandomizerSettings(randomizerId: SceneRandomizerId): SceneRandomizerSettings {
	return {
		frame: DEFAULT_SCENE_RANDOMIZER_FRAMES[randomizerId],
		options: [...DEFAULT_SCENE_RANDOMIZER_OPTIONS[randomizerId]],
		resultHoldMs: DEFAULT_SCENE_RANDOMIZER_RESULT_HOLD_MS
	};
}

function sanitizeSceneRandomizerOptions(value: unknown, randomizerId: SceneRandomizerId) {
	const fallback = DEFAULT_SCENE_RANDOMIZER_OPTIONS[randomizerId];
	if (!Array.isArray(value)) {
		return [...fallback];
	}

	const seen = new Set<string>();
	const options = value
		.map((entry) => trimValue(String(entry ?? '')).slice(0, 40))
		.filter((entry) => {
			const key = entry.toLowerCase();
			if (!entry || seen.has(key)) {
				return false;
			}
			seen.add(key);
			return true;
		})
		.slice(0, 100);

	return options.length > 0 ? options : [...fallback];
}

function sanitizeSceneRandomizerResultHoldMs(value: unknown, fallback = DEFAULT_SCENE_RANDOMIZER_RESULT_HOLD_MS) {
	const holdMs = Math.round(Number(value));
	const fallbackValue = Math.round(Number(fallback));
	return Math.min(
		Math.max(
			Number.isFinite(holdMs)
				? holdMs
				: Number.isFinite(fallbackValue)
					? fallbackValue
					: DEFAULT_SCENE_RANDOMIZER_RESULT_HOLD_MS,
			MIN_SCENE_RANDOMIZER_RESULT_HOLD_MS
		),
		MAX_SCENE_RANDOMIZER_RESULT_HOLD_MS
	);
}

function sanitizeSceneRandomizerSettings(
	randomizerId: SceneRandomizerId,
	settings: Partial<SceneRandomizerSettings> | null | undefined,
	fallback = defaultSceneRandomizerSettings(randomizerId)
): SceneRandomizerSettings {
	return {
		frame: clampSceneRandomizerFrame({
			...fallback.frame,
			...(settings?.frame ?? {})
		}),
		options: sanitizeSceneRandomizerOptions(
			Array.isArray(settings?.options) ? settings.options : fallback.options,
			randomizerId
		),
		resultHoldMs: sanitizeSceneRandomizerResultHoldMs(settings?.resultHoldMs, fallback.resultHoldMs)
	};
}

function defaultSceneRandomizersState(): SceneRandomizersState {
	return {
		items: Object.fromEntries(
			SCENE_RANDOMIZER_IDS.map((randomizerId) => [
				randomizerId,
				defaultSceneRandomizerSettings(randomizerId)
			])
		) as Record<SceneRandomizerId, SceneRandomizerSettings>,
		activeRun: null
	};
}

function sanitizeSceneRandomizersState(
	state: Partial<SceneRandomizersState> | null | undefined,
	fallback = defaultSceneRandomizersState()
): SceneRandomizersState {
	const sourceItems = (state?.items ?? {}) as Partial<Record<SceneRandomizerId, Partial<SceneRandomizerSettings>>>;
	const sourceActiveRun = state?.activeRun;
	const fallbackActiveRun = fallback.activeRun;
	return {
		items: Object.fromEntries(
			SCENE_RANDOMIZER_IDS.map((randomizerId) => [
				randomizerId,
				sanitizeSceneRandomizerSettings(
					randomizerId,
					sourceItems[randomizerId],
					fallback.items[randomizerId]
				)
			])
		) as Record<SceneRandomizerId, SceneRandomizerSettings>,
		activeRun: sourceActiveRun && isSceneRandomizerId(sourceActiveRun.randomizerId)
			? sourceActiveRun
			: fallbackActiveRun && isSceneRandomizerId(fallbackActiveRun.randomizerId)
				? fallbackActiveRun
				: null
	};
}

function isSceneRandomizerId(value: unknown): value is SceneRandomizerId {
	return typeof value === 'string' && SCENE_RANDOMIZER_IDS.includes(value as SceneRandomizerId);
}

function buildSceneRandomizerRun(
	randomizerId: SceneRandomizerId,
	settings: SceneRandomizerSettings
): SceneRandomizerRun {
	const seed = Math.random();
	const resultIndex = Math.min(Math.floor(seed * settings.options.length), settings.options.length - 1);
	const startedAt = nowIso();
	return {
		id: `${randomizerId}-${Date.now()}-${Math.floor(seed * 1_000_000)}`,
		randomizerId,
		result: settings.options[resultIndex] ?? settings.options[0] ?? '',
		resultIndex: Math.max(resultIndex, 0),
		options: [...settings.options],
		startedAt,
		durationMs: 5450,
		resultHoldMs: sanitizeSceneRandomizerResultHoldMs(settings.resultHoldMs),
		seed
	};
}

function createInitialState(): RuntimeOverlayState {
	return {
		activeModeId: null,
		visible: false,
		frame: DEFAULT_FRAME,
		rankings: DEFAULT_RANKINGS,
		gifterBinding: DEFAULT_GIFTER_BINDING,
		sceneRandomizers: defaultSceneRandomizersState(),
		customCode: DEFAULT_CUSTOM_CODE,
		version: 0,
		lastUpdatedAt: nowIso()
	};
}

class RuntimeOverlayStore {
	private state = createInitialState();
	private subscribers = new Set<Subscriber>();

	getState() {
		return this.state;
	}

	subscribe(subscriber: Subscriber) {
		this.subscribers.add(subscriber);
		subscriber(this.state);

		return () => {
			this.subscribers.delete(subscriber);
		};
	}

	update(command: RuntimeOverlayCommand) {
		switch (command.action) {
			case 'setMode':
				const nextModeId = isEnabledModeId(command.modeId) ? command.modeId : null;
				this.commit({
					...this.state,
					activeModeId: nextModeId,
					version: this.state.version + 1,
					lastUpdatedAt: nowIso()
				});
				return this.state;

			case 'setVisible':
				this.commit({
					...this.state,
					visible: command.visible,
					version: this.state.version + 1,
					lastUpdatedAt: nowIso()
				});
				return this.state;

			case 'setFrame':
				this.commit({
					...this.state,
					frame: clampFrame(command.frame),
					version: this.state.version + 1,
					lastUpdatedAt: nowIso()
				});
				return this.state;

			case 'setRankings':
				this.commit({
					...this.state,
					rankings: sanitizeRankingsSettings(command.rankings, this.state.rankings),
					version: this.state.version + 1,
					lastUpdatedAt: nowIso()
				});
				return this.state;

			case 'setGifterBinding': {
				const gifterBinding = sanitizeGifterBindingSettings(
					command.gifterBinding,
					this.state.gifterBinding
				);
				if (!gifterBinding.enabled) {
					clearGifterBindings();
				}
				this.commit({
					...this.state,
					gifterBinding,
					version: this.state.version + 1,
					lastUpdatedAt: nowIso()
				});
				return this.state;
			}

			case 'setSceneRandomizer': {
				if (!isSceneRandomizerId(command.randomizerId)) {
					return this.state;
				}

				const currentSceneRandomizers = sanitizeSceneRandomizersState(this.state.sceneRandomizers);
				const items = {
					...currentSceneRandomizers.items,
					[command.randomizerId]: sanitizeSceneRandomizerSettings(
						command.randomizerId,
						command.settings,
						currentSceneRandomizers.items[command.randomizerId]
					)
				};
				this.commit({
					...this.state,
					sceneRandomizers: {
						items,
						activeRun: currentSceneRandomizers.activeRun
					},
					version: this.state.version + 1,
					lastUpdatedAt: nowIso()
				});
				return this.state;
			}

			case 'setCustomCode':
				this.commit({
					...this.state,
					customCode: sanitizeCustomCodeSettings(command.customCode, this.state.customCode),
					version: this.state.version + 1,
					lastUpdatedAt: nowIso()
				});
				return this.state;

			case 'playSceneRandomizer': {
				if (!isSceneRandomizerId(command.randomizerId)) {
					return this.state;
				}

				const currentSceneRandomizers = sanitizeSceneRandomizersState(this.state.sceneRandomizers);
				const settings = currentSceneRandomizers.items[command.randomizerId];
				this.commit({
					...this.state,
					sceneRandomizers: {
						items: currentSceneRandomizers.items,
						activeRun: buildSceneRandomizerRun(command.randomizerId, settings)
					},
					version: this.state.version + 1,
					lastUpdatedAt: nowIso()
				});
				return this.state;
			}

			case 'clearSceneRandomizer':
				this.commit({
					...this.state,
					sceneRandomizers: {
						...sanitizeSceneRandomizersState(this.state.sceneRandomizers),
						activeRun: null
					},
					version: this.state.version + 1,
					lastUpdatedAt: nowIso()
				});
				return this.state;

			case 'resetFrame':
				this.commit({
					...this.state,
					frame: DEFAULT_FRAME,
					version: this.state.version + 1,
					lastUpdatedAt: nowIso()
				});
				return this.state;
		}
	}

	private commit(nextState: RuntimeOverlayState) {
		this.state = nextState;

		for (const subscriber of this.subscribers) {
			subscriber(this.state);
		}
	}
}

export const runtimeOverlayStore = new RuntimeOverlayStore();

export type RuntimeOverlayFeedPayload = {
	overlayState: RuntimeOverlayState;
	battleState: BattleState;
	stickerDanceState: StickerDanceState;
	groupPkState: GroupPkState;
	soloStageState: SoloStageState;
};

export function currentRuntimeOverlayPayload(): RuntimeOverlayFeedPayload {
	return {
		overlayState: runtimeOverlayStore.getState(),
		battleState: battleStore.getState(),
		stickerDanceState: stickerDanceStore.getState(),
		groupPkState: groupPkStore.getState(),
		soloStageState: soloStageStore.getState()
	};
}

type GiftEvent = Extract<LiveFeedEvent, { type: 'gift' }>;

type GiftEventSeen = {
	lastSeenAt: number;
};

const MAX_SEEN_GIFT_EVENT_IDS = 5000;

let recentGiftEvents = new Map<string, GiftEventSeen>();
let gifterBindings = new Map<string, { castName: string; lastBoundAt: number }>();

function clearGifterBindings() {
	gifterBindings = new Map();
}

function rememberGifterBinding(bindingKey: string, castName: string) {
	gifterBindings.delete(bindingKey);
	gifterBindings.set(bindingKey, {
		castName,
		lastBoundAt: Date.now()
	});

	if (gifterBindings.size > MAX_SEEN_GIFT_EVENT_IDS) {
		const oldestBindingKey = gifterBindings.keys().next().value;
		if (oldestBindingKey) {
			gifterBindings.delete(oldestBindingKey);
		}
	}
}

function mappedLiveGiftName(message: GiftEvent) {
	return resolveGiftCatalogLookup(message)?.name ?? trimValue(message.giftName);
}

function liveGiftUnitCoins(message: GiftEvent) {
	const catalogPoints = Number(resolveGiftCatalogLookup(message)?.points);
	if (Number.isFinite(catalogPoints) && catalogPoints > 0) {
		return Math.floor(catalogPoints);
	}

	return 0;
}

function liveGiftCoins(message: GiftEvent, count: number) {
	const normalizedCount = Math.max(0, Math.floor(count));
	return normalizedCount > 0 ? liveGiftUnitCoins(message) * normalizedCount : 0;
}

function normalizeGiftCount(count: unknown) {
	const normalizedCount = Number(count);
	return Number.isFinite(normalizedCount) && normalizedCount > 0
		? Math.floor(normalizedCount)
		: 0;
}

function eventId(value: unknown) {
	if (typeof value === 'number' && Number.isFinite(value)) {
		return String(value);
	}

	return typeof value === 'string' ? value.trim() : '';
}

function giftBackendEventId(message: GiftEvent) {
	return (
		eventId(message.eventID) ||
		eventId(message.eventId) ||
		eventId(message.event_id) ||
		eventId(message.id)
	);
}

function alreadyHandledGiftEvent(message: GiftEvent) {
	const id = giftBackendEventId(message);
	if (!id) {
		return false;
	}

	if (recentGiftEvents.has(id)) {
		return true;
	}

	recentGiftEvents.delete(id);
	recentGiftEvents.set(id, {
		lastSeenAt: Date.now()
	});

	if (recentGiftEvents.size > MAX_SEEN_GIFT_EVENT_IDS) {
		const oldestEventId = recentGiftEvents.keys().next().value;
		if (oldestEventId) {
			recentGiftEvents.delete(oldestEventId);
		}
	}

	return false;
}

function liveGiftGifterKey(message: GiftEvent) {
	return (
		trimValue(message.userDetails?.userId) ||
		trimValue(message.userDetails?.uniqueId) ||
		trimValue(message.user).toLowerCase()
	);
}

function resetGiftRoutingState() {
	recentGiftEvents = new Map();
	clearGifterBindings();
}

function activeModeGiftTargetName(
	modeId: RuntimeOverlayModeId,
	gift: { giftId?: string | null; giftName?: string | null }
) {
	const giftMatchKey = giftCatalogMatchKey(gift);
	if (!giftMatchKey) {
		return '';
	}

	switch (modeId) {
		case 'group-sticker':
			return (
				stickerDanceStore
					.getState()
					.contestants.find((contestant) => giftCatalogMatchKey(contestant) === giftMatchKey)?.name ??
				''
			);
		case 'group-pk':
			return (
				groupPkStore
					.getState()
					.contestants.find((contestant) =>
						contestant.gifts.some((contestantGift) => giftCatalogMatchKey(contestantGift) === giftMatchKey)
					)?.name ?? ''
			);
		case 'battle-ladder':
			return (
				battleStore
					.getState()
					.contestants.find((contestant) =>
						contestant.gifts.some((contestantGift) => giftCatalogMatchKey(contestantGift) === giftMatchKey)
					)?.name ?? ''
			);
		default:
			return '';
	}
}

function boundGiftTargetName(
	modeId: RuntimeOverlayModeId,
	gift: { giftId?: string | null; giftName?: string | null },
	gifterId: string
) {
	if (!isEnabledModeId(modeId) || !gifterId) {
		return '';
	}

	const representativeTargetName = activeModeGiftTargetName(modeId, gift);
	const bindingKey = `${modeId}::${gifterId}`;
	if (representativeTargetName) {
		rememberGifterBinding(bindingKey, representativeTargetName);
		return representativeTargetName;
	}

	return gifterBindings.get(bindingKey)?.castName ?? '';
}

function routeGiftToActiveMode(giftId: string, giftName: string, coins: number, gifterId = '') {
	if (!giftId || coins <= 0) {
		return;
	}

	const overlayState = runtimeOverlayStore.getState();
	const targetCastName = overlayState.gifterBinding.enabled
		? boundGiftTargetName(overlayState.activeModeId, { giftId, giftName }, gifterId)
		: '';

	switch (overlayState.activeModeId) {
		case 'group-sticker': {
			stickerDanceStore.update({
				action: 'gift',
				giftId,
				giftName,
				count: coins,
				targetCastName,
				gifterId
			});
			return;
		}
		case 'group-pk': {
			groupPkStore.update({
				action: 'gift',
				giftId,
				giftName,
				count: coins,
				targetCastName,
				gifterId
			});
			return;
		}
		case 'battle-ladder': {
			battleStore.update({
				action: 'gift',
				giftId,
				giftName,
				count: coins,
				targetCastName,
				gifterId
			});
			return;
		}
		case 'solo-target': {
			soloStageStore.update({ action: 'addScore', amount: coins });
			return;
		}
		case null:
			return;
	}
}

export async function processLiveFeedServerEvent(event: LiveFeedEvent) {
	if (event.type === 'status') {
		if (['connected', 'idle', 'disconnected', 'error'].includes(event.status)) {
			resetGiftRoutingState();
		}
		if (event.status === 'connected') {
			void loadGiftCatalog();
		}
		return;
	}

	if (event.type !== 'gift' || alreadyHandledGiftEvent(event)) {
		return;
	}

	await loadGiftCatalog();
	const giftName = mappedLiveGiftName(event);
	const giftId = giftCatalogStoredId({ giftId: event.giftId });
	routeGiftToActiveMode(
		giftId,
		giftName,
		liveGiftCoins(event, normalizeGiftCount(event.count)),
		liveGiftGifterKey(event)
	);
}