import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { env as privateEnv } from '$env/dynamic/private';
import {
	addGiftTotal as addSharedGiftTotal,
	consumeGiftTotals as consumeSharedGiftTotals,
	giftCatalogDefaultId,
	giftCatalogDisplayName,
	giftCatalogImageUrl,
	giftCatalogMatchKey,
	giftCatalogStoredId
} from '$lib/gift-catalog';
import { sanitizeCastNameList, trimValue } from '$lib/helpers';
import { GIFT_ARRIVAL_BUFFER_MS } from '$lib/game-timing';
import { recordScoreHistory } from '$lib/server/score-history';
import type {
	BattleCommand,
	BattleContestant,
	BattleSettings,
	BattleSide,
	BattleState,
	GroupPkCommand,
	GroupPkContestant,
	GroupPkGift,
	GroupPkGiftEvent,
	GroupPkGiftMap,
	GroupPkGiftTotal,
	GroupPkRoundResult,
	GroupPkSettings,
	GroupPkState,
	PkVisualEffect,
	RuntimeOverlayFrame,
	SoloStageCommand,
	SoloStageContestant,
	SoloStageSettings,
	SoloStageState,
	StickerDanceCommand,
	StickerDanceContestant,
	StickerDanceGiftTotal,
	StickerDanceRoundResult,
	StickerDanceSettings,
	StickerDanceStickerMap,
	StickerDanceState
} from '$lib/app-types';

function nowIso() {
	return new Date().toISOString();
}

function normalizePositiveInt(value: unknown, fallback: number, minimum = 0) {
	const nextValue = Math.floor(Number(value));
	return Number.isFinite(nextValue) ? Math.max(nextValue, minimum) : fallback;
}

function normalizePkVisualEffect(value: unknown, fallback: PkVisualEffect = 'freeze'): PkVisualEffect {
	return value === 'none' ||
		value === 'freeze' ||
		value === 'fire' ||
		value === 'thunder' ||
		value === 'gold-crown' ||
		value === 'gift-blast'
		? value
		: fallback;
}

namespace BattleGame {
	type Subscriber = (state: BattleState) => void

	type BattleStoredData = {
		settings: BattleSettings
	}

	type BattleStoredCollection = {
		profiles: Record<string, BattleStoredData>
	}

	const DEFAULT_DURATION_SECONDS = 120
	const DEFAULT_TITLE = '1v1 PK'
	const DEFAULT_BATTLE_GIFTS_PER_SIDE = 3
	const MAX_GIFTS_PER_SIDE = 9
	const MIN_OVERLAY_WIDTH = 0.32
	const MIN_OVERLAY_HEIGHT = 0.1
	const DEFAULT_OVERLAY_FRAME: RuntimeOverlayFrame = {
		x: 0.04,
		y: 0.08,
		width: 0.92,
		height: 0.22,
	}
	const DEFAULT_LINE_FRAME: RuntimeOverlayFrame = {
		x: 0.496,
		y: 0.31,
		width: 0.008,
		height: 0.28,
	}
	const LEGACY_DEFAULT_LINE_FRAME: RuntimeOverlayFrame = {
		x: 0.496,
		y: 0.08,
		width: 0.008,
		height: 0.22,
	}

	let cachedStoredData: BattleStoredCollection | null = null

	function normalizeDurationSeconds(
		value: unknown,
		fallback = DEFAULT_DURATION_SECONDS,
	) {
		return normalizePositiveInt(value, fallback, 10)
	}

	function clamp(value: number, minimum: number, maximum: number) {
		return Math.min(Math.max(value, minimum), maximum)
	}

	function sanitizeOverlayFrame(value: unknown): RuntimeOverlayFrame {
		const source = value && typeof value === 'object' ? (value as Partial<RuntimeOverlayFrame>) : {}
		const widthValue = Number(source.width)
		const heightValue = Number(source.height)
		const width = clamp(
			Number.isFinite(widthValue) ? widthValue : DEFAULT_OVERLAY_FRAME.width,
			MIN_OVERLAY_WIDTH,
			1,
		)
		const height = clamp(
			Number.isFinite(heightValue) ? heightValue : DEFAULT_OVERLAY_FRAME.height,
			MIN_OVERLAY_HEIGHT,
			1,
		)
		const xValue = Number(source.x)
		const yValue = Number(source.y)
		const x = clamp(Number.isFinite(xValue) ? xValue : DEFAULT_OVERLAY_FRAME.x, 0, 1 - width)
		const y = clamp(Number.isFinite(yValue) ? yValue : DEFAULT_OVERLAY_FRAME.y, 0, 1 - height)

		return { x, y, width, height }
	}

	function sanitizeLineFrame(value: unknown): RuntimeOverlayFrame {
		const source = value && typeof value === 'object' ? (value as Partial<RuntimeOverlayFrame>) : {}
		const widthValue = Number(source.width)
		const heightValue = Number(source.height)
		const width = clamp(
			Number.isFinite(widthValue) ? widthValue : DEFAULT_LINE_FRAME.width,
			0.004,
			0.12,
		)
		const height = clamp(
			Number.isFinite(heightValue) ? heightValue : DEFAULT_LINE_FRAME.height,
			0.12,
			1,
		)
		const xValue = Number(source.x)
		const yValue = Number(source.y)
		const x = clamp(Number.isFinite(xValue) ? xValue : DEFAULT_LINE_FRAME.x, 0, 1 - width)
		const y = clamp(Number.isFinite(yValue) ? yValue : DEFAULT_LINE_FRAME.y, 0, 1 - height)

		const nextFrame = { x, y, width, height }
		if (
			nextFrame.x === LEGACY_DEFAULT_LINE_FRAME.x &&
			nextFrame.y === LEGACY_DEFAULT_LINE_FRAME.y &&
			nextFrame.width === LEGACY_DEFAULT_LINE_FRAME.width &&
			nextFrame.height === LEGACY_DEFAULT_LINE_FRAME.height
		) {
			return { ...DEFAULT_LINE_FRAME }
		}

		return nextFrame
	}

	function battleGiftMatchKey(value: string | { giftId?: string | null; giftName?: string | null }) {
		return giftCatalogMatchKey(value)
	}

	function defaultGiftName(index: number) {
		return giftCatalogDefaultId(index)
	}

	function defaultGiftList(sideIndex: number) {
		return Array.from(
			{ length: DEFAULT_BATTLE_GIFTS_PER_SIDE },
			(_, slotIndex) =>
				defaultGiftName(sideIndex * DEFAULT_BATTLE_GIFTS_PER_SIDE + slotIndex),
		);
	}

	function sanitizeGiftList(
		value: string[] | undefined,
		sideIndex: number,
	) {
		const seen = new Set<string>();

		const validNames = (value ?? [])
			.map((giftName) => giftCatalogStoredId(giftName))
			.filter(Boolean)
			.filter((giftName) => {
				const normalized = battleGiftMatchKey(giftName);

				if (!normalized || seen.has(normalized)) {
					return false;
				}

				seen.add(normalized);
				return true;
			})
			.slice(0, MAX_GIFTS_PER_SIDE);

		if (validNames.length >= DEFAULT_BATTLE_GIFTS_PER_SIDE) {
			return validNames;
		}

		const defaults = defaultGiftList(sideIndex);

		// new code
		return [
			...validNames,
			...defaults.filter(
				(giftName) =>
					!validNames.some(
						(existing) =>
							battleGiftMatchKey(existing) ===
							battleGiftMatchKey(giftName),
					),
			),
		].slice(0, DEFAULT_BATTLE_GIFTS_PER_SIDE);
		// till here
	}

	function sanitizeGiftMap(value: unknown, castNames: string[]) {
		const source = value && typeof value === 'object' ? value as Record<string, unknown> : {}
		return Object.fromEntries(
			castNames
				.map((castName, index) => ({ castName, index }))
				.filter(({ castName }) => Array.isArray(source[castName]))
				.map(({ castName, index }) => [
					castName,
					sanitizeGiftList(source[castName] as string[], index),
				]),
		)
	}

	function normalizeName(value: unknown, fallback: string) {
		return trimValue(String(value ?? '')) || fallback
	}

	function sameNames(left: string[], right: string[]) {
		return (
			left.length === right.length &&
			left.every((value, index) => value === right[index])
		)
	}

	function normalizeCastNames(value: unknown, fallback: string[] = []) {
		const source = Array.isArray(value) ? value : fallback
		return sanitizeCastNameList(
			source.map((entry) => trimValue(String(entry ?? ''))),
		)
	}

	function normalizeLineupOrder(value: unknown, castNames: string[]) {
		const normalizedCastNames = normalizeCastNames(castNames)
		if (normalizedCastNames.length === 0) {
			return []
		}

		const requestedOrder = Array.isArray(value)
			? normalizeCastNames(value).filter((name) =>
				normalizedCastNames.includes(name),
			)
			: []

		return [
			...requestedOrder,
			...normalizedCastNames.filter((name) => !requestedOrder.includes(name)),
		]
	}

	function normalizeSettings(input?: Partial<BattleSettings>): BattleSettings {
		const castNames = normalizeCastNames(input?.castNames)
		const lineStyle =
			input?.lineStyle === 'none' || input?.lineStyle === 'fire' || input?.lineStyle === 'white'
				? input.lineStyle
				: input?.showBattlePkLineOverlaySurface === false
					? 'none'
					: 'white'
		const scoreEffect = normalizePkVisualEffect(input?.scoreEffect, 'freeze')

		return {
			title: normalizeName(input?.title, DEFAULT_TITLE),
			durationSeconds: normalizeDurationSeconds(input?.durationSeconds),
			castNames,
			leftGifts: sanitizeGiftList(input?.leftGifts, 0),
			rightGifts: sanitizeGiftList(input?.rightGifts, 1),
			giftsByCast: sanitizeGiftMap(input?.giftsByCast, castNames),
			overlayFrame: sanitizeOverlayFrame(input?.overlayFrame),
			lineFrame: sanitizeLineFrame(input?.lineFrame),
			lineStyle,
			scoreEffect,
			showBattlePkLineOverlaySurface: lineStyle !== 'none' || scoreEffect !== 'none',
		}
	}

	function buildDefaultSettings() {
		return normalizeSettings({
			title: DEFAULT_TITLE,
			durationSeconds: DEFAULT_DURATION_SECONDS,
			castNames: [],
			leftGifts: [],
			rightGifts: [],
			giftsByCast: {},
			overlayFrame: DEFAULT_OVERLAY_FRAME,
			lineFrame: DEFAULT_LINE_FRAME,
			scoreEffect: 'freeze',
		})
	}

	function sanitizeStoredSettings(value: unknown) {
		if (!value || typeof value !== 'object') {
			return buildDefaultSettings()
		}

		return normalizeSettings(value as Partial<BattleSettings>)
	}

	function getBattleFilePath() {
		const explicitPath = trimValue(
			privateEnv.STREAMPLAY_STUDIO_BATTLE_LADDER_FILE ||
			privateEnv.STREAMPLAY_BATTLE_LADDER_FILE ||
			'',
		)
		if (explicitPath) {
			return explicitPath
		}

		const userDataPath = trimValue(
			privateEnv.STREAMPLAY_STUDIO_USER_DATA_DIR || privateEnv.STREAMPLAY_USER_DATA_DIR || '',
		)
		if (userDataPath) {
			return path.join(userDataPath, 'battle-ladder.json')
		}

		return path.join(process.cwd(), '.studio-data', 'battle-ladder.json')
	}

	function sanitizeStoredData(value: unknown): BattleStoredData {
		const parsed = value && typeof value === 'object' ? (value as Partial<BattleStoredData>) : {}
		return {
			settings: sanitizeStoredSettings(parsed.settings ?? parsed),
		}
	}

	function readStoredCollection(): BattleStoredCollection {
		if (cachedStoredData) {
			return cachedStoredData
		}

		const filePath = getBattleFilePath()

		try {
			const parsed = JSON.parse(
				fs.readFileSync(filePath, 'utf8'),
			) as Partial<BattleStoredCollection>
			cachedStoredData = {
				profiles: Object.fromEntries(
					Object.entries(parsed.profiles ?? {}).map(([profileId, value]) => [
						profileId,
						sanitizeStoredData(value),
					]),
				),
			}
		} catch {
			cachedStoredData = {
				profiles: {},
			}
		}

		return cachedStoredData
	}

	function readStoredData(profileId: string | null = null): BattleStoredData {
		const current = readStoredCollection()

		if (!profileId) {
			return {
				settings: buildDefaultSettings(),
			}
		}

		return (
			current.profiles[profileId] ?? {
				settings: buildDefaultSettings(),
			}
		)
	}

	function writeStoredData(
		data: BattleStoredData,
		profileId: string | null = null,
	) {
		if (!profileId) {
			return
		}

		const filePath = getBattleFilePath()
		fs.mkdirSync(path.dirname(filePath), { recursive: true })
		const current = readStoredCollection()
		const nextData: BattleStoredCollection = {
			profiles: {
				...current.profiles,
				[profileId]: data,
			},
		}
		fs.writeFileSync(filePath, `${JSON.stringify(nextData, null, 2)}\n`, 'utf8')
		cachedStoredData = nextData
	}

	function saveStoredSettings(
		settings: BattleSettings,
		profileId: string | null = null,
	) {
		writeStoredData({ settings }, profileId)
	}

	function initials(name: string) {
		return name
			.split(/\s+/)
			.map((part) => part[0])
			.join('')
			.slice(0, 2)
			.toUpperCase()
	}

	function matchupName(lineupOrder: string[], index: number, fallback: string) {
		return lineupOrder[index] ?? fallback
	}

	function buildContestant(
		side: BattleSide,
		name: string,
		giftNames: string[],
		sideIndex: number,
	) {
		return {
			id: `${side}-${name.toLowerCase().replace(/\s+/g, '-') || side}`,
			side,
			name,
			avatar: initials(name) || (side === 'left' ? 'L' : 'R'),
			gifts: sanitizeGiftList(giftNames, sideIndex).map((giftName) => ({
				giftId: giftCatalogStoredId(giftName),
				giftName: giftCatalogDisplayName(giftName),
				giftImageUrl: giftCatalogImageUrl(giftName),
			})),
			score: 0,
			voters: 0,
		} satisfies BattleContestant
	}

	function battleGiftListForCast(settings: BattleSettings, castName: string, lineupIndex: number) {
		const castIndex = settings.castNames.findIndex((name) => name === castName)
		const giftIndex = castIndex >= 0 ? castIndex : lineupIndex
		const castGifts = settings.giftsByCast[castName]
		if (Array.isArray(castGifts) && castGifts.length > 0) {
			return sanitizeGiftList(castGifts, giftIndex)
		}

		if (lineupIndex === 0) {
			return settings.leftGifts
		}

		if (lineupIndex === 1) {
			return settings.rightGifts
		}

		return defaultGiftList(giftIndex)
	}

	function buildContestants(settings: BattleSettings, lineupOrder: string[]) {
		const leftName = matchupName(lineupOrder, 0, 'Left Cast')
		const rightName = matchupName(lineupOrder, 1, 'Right Cast')

		return [
			buildContestant(
				'left',
				leftName,
				battleGiftListForCast(settings, leftName, 0),
				0,
			),
			buildContestant(
				'right',
				rightName,
				battleGiftListForCast(settings, rightName, 1),
				1,
			),
		]
	}

	function normalizeSettingsWithLineup(
		settings: BattleSettings,
		lineupOrder: string[],
	) {
		const nextLineupOrder = normalizeLineupOrder(lineupOrder, settings.castNames)
		return {
			settings: {
				...settings,
				castNames: nextLineupOrder,
			},
			lineupOrder: nextLineupOrder,
		}
	}

	function reorderUnlockedLineup(
		currentLineupOrder: string[],
		requestedLineupOrder: string[],
		lockedCount: number,
	) {
		const lockedNames = currentLineupOrder.slice(0, lockedCount)
		const unlockedNames = currentLineupOrder.slice(lockedCount)
		const requestedUnlockedNames = normalizeCastNames(requestedLineupOrder).filter((name) =>
			unlockedNames.includes(name),
		)

		return [
			...lockedNames,
			...requestedUnlockedNames,
			...unlockedNames.filter((name) => !requestedUnlockedNames.includes(name)),
		]
	}

	function lineupOrderWithActiveContestants(
		lineupOrder: string[],
		contestants: BattleContestant[],
	) {
		const activeNames = normalizeCastNames(contestants.map((contestant) => contestant.name))
		const normalizedLineupOrder = normalizeCastNames(lineupOrder)

		return [
			...activeNames,
			...normalizedLineupOrder.filter((name) => !activeNames.includes(name)),
		]
	}

	function idleEventText(castNames: string[]) {
		return castNames.length < 2
			? 'Add at least two cast members to start 1v1 PK.'
			: 'Set the lineup and start the round.'
	}

	function buildIdleState(
		settings: BattleSettings,
		lineupOrder = settings.castNames,
	): BattleState {
		const normalized = normalizeSettingsWithLineup(settings, lineupOrder)

		return {
			settings: normalized.settings,
			phase: 'idle',
			contestants: buildContestants(normalized.settings, normalized.lineupOrder),
			lineupOrder: normalized.lineupOrder,
			totalVotes: 0,
			unallocatedVotes: 0,
			unallocatedGifts: [],
			collecting: false,
			startedAt: null,
			endsAt: null,
			lastUpdatedAt: nowIso(),
			eventText: idleEventText(normalized.lineupOrder),
		}
	}

	function winnerFromContestants(contestants: BattleContestant[]) {
		const [left, right] = contestants
		if (!left || !right || left.score === right.score) {
			return null
		}

		return left.score > right.score ? left.name : right.name
	}

	function winnerSideFromContestants(contestants: BattleContestant[]) {
		const [left, right] = contestants
		if (!left || !right || left.score === right.score) {
			return null
		}

		return left.score > right.score ? 'left' : 'right'
	}

	function rotateLineupOrder(
		lineupOrder: string[],
		winnerSide: BattleSide | null,
	) {
		if (winnerSide === null || lineupOrder.length < 3) {
			return [...lineupOrder]
		}

		const [leftName, rightName, nextChallenger, ...remainingQueue] = lineupOrder
		if (!leftName || !rightName || !nextChallenger) {
			return [...lineupOrder]
		}

		return winnerSide === 'left'
			? [leftName, nextChallenger, ...remainingQueue, rightName]
			: [nextChallenger, rightName, ...remainingQueue, leftName]
	}

	function finishedRoundEventText(
		contestants: BattleContestant[],
		winnerSide: BattleSide | null,
		lineupOrder: string[],
	) {
		const winner = winnerFromContestants(contestants)
		if (!winner) {
			return 'The round ended in a tie. Same matchup stays on.'
		}

		if (lineupOrder.length < 3) {
			return `${winner} won the round.`
		}

		const nextChallenger = winnerSide === 'left' ? lineupOrder[1] : lineupOrder[0]
		return nextChallenger
			? `${winner} won the round. ${nextChallenger} is up next.`
			: `${winner} won the round.`
	}

	class BattleStore {
		private state = buildIdleState(readStoredData().settings)
		private activeProfileId: string | null = null
		private profileStateCache = new Map<string, BattleState>()
		private subscribers = new Set<Subscriber>()
		private finishTimer: ReturnType<typeof setTimeout> | null = null

		useProfile(profileId: string | null, castNames: string[]) {
			const nextProfileId = profileId?.trim() || null
			const hasSharedRoster = normalizeCastNames(castNames).length > 0
			if (this.activeProfileId === nextProfileId) {
				return hasSharedRoster ? this.syncSharedCastRoster(castNames) : this.state
			}

			if (this.activeProfileId) {
				this.profileStateCache.set(this.activeProfileId, this.state)
			}

			this.stopFinishTimer()
			this.activeProfileId = nextProfileId

			const nextState =
				nextProfileId && this.profileStateCache.has(nextProfileId)
					? (this.profileStateCache.get(nextProfileId) as BattleState)
					: buildIdleState(
						nextProfileId
							? readStoredData(nextProfileId).settings
							: buildDefaultSettings(),
					)

			this.commit(nextState)

			if (this.state.phase === 'live' && this.state.endsAt) {
				this.scheduleFinish(Date.parse(this.state.endsAt))
			}

			if (!nextProfileId || !hasSharedRoster) {
				return this.state
			}

			return this.syncSharedCastRoster(castNames)
		}

		getState() {
			return this.state
		}

		syncSharedCastRoster(castNames: string[]) {
			if (this.state.phase === 'live') {
				return this.state
			}

			const nextRoster = normalizeCastNames(castNames)

			const requestedOrder =
				this.state.lineupOrder.length > 0
					? this.state.lineupOrder
					: this.state.settings.castNames
			const selectedCastNames =
				requestedOrder.length > 0
					? requestedOrder.filter((name) => nextRoster.includes(name))
					: nextRoster
			const nextSettings = normalizeSettings({
				...this.state.settings,
				// Keep an explicit saved 1v1 selection, otherwise use the shared roster.
				castNames: selectedCastNames,
			})
			const normalized = normalizeSettingsWithLineup(nextSettings, requestedOrder)
			const settingsChanged = !sameNames(
				this.state.settings.castNames,
				normalized.settings.castNames,
			)
			const lineupChanged = !sameNames(
				this.state.lineupOrder,
				normalized.lineupOrder,
			)

			if (!settingsChanged && !lineupChanged) {
				return this.state
			}

			saveStoredSettings(normalized.settings, this.activeProfileId)

			if (this.state.phase === 'idle') {
				this.commit(buildIdleState(normalized.settings, normalized.lineupOrder))
				return this.state
			}

			this.commit({
				...this.state,
				settings: normalized.settings,
				lineupOrder: normalized.lineupOrder,
			})
			return this.state
		}

		subscribe(subscriber: Subscriber) {
			this.subscribers.add(subscriber)
			subscriber(this.state)

			return () => {
				this.subscribers.delete(subscriber)
			}
		}

		update(command: BattleCommand) {
			switch (command.action) {
				case 'replaceSettings': {
					if (this.state.phase === 'live') {
						return this.state
					}

					const nextSettings = normalizeSettings({
						...this.state.settings,
						...command.settings,
					})
					const nextLineupOrder = normalizeLineupOrder(
						Array.isArray(command.settings.castNames)
							? command.settings.castNames
							: this.state.lineupOrder,
						nextSettings.castNames,
					)
					const normalized = normalizeSettingsWithLineup(
						nextSettings,
						nextLineupOrder,
					)

					this.stopFinishTimer()
					saveStoredSettings(normalized.settings, this.activeProfileId)
					this.commit(buildIdleState(normalized.settings, normalized.lineupOrder))
					return this.state
				}

				case 'reorderLineup': {
					const normalizedCurrentOrder = normalizeLineupOrder(
						this.state.lineupOrder,
						this.state.settings.castNames,
					)
					const currentOrder =
						this.state.phase === 'live'
							? lineupOrderWithActiveContestants(
								normalizedCurrentOrder,
								this.state.contestants,
							)
							: normalizedCurrentOrder
					const requestedOrder =
						this.state.phase === 'live'
							? reorderUnlockedLineup(currentOrder, command.castNames, 2)
							: normalizeLineupOrder(
								command.castNames,
								this.state.settings.castNames,
							)
					const normalized = normalizeSettingsWithLineup(
						this.state.settings,
						requestedOrder,
					)

					saveStoredSettings(normalized.settings, this.activeProfileId)
					if (this.state.phase === 'idle') {
						this.commit(
							buildIdleState(normalized.settings, normalized.lineupOrder),
						)
						return this.state
					}

					this.commit({
						...this.state,
						settings: normalized.settings,
						lineupOrder: normalized.lineupOrder,
						lastUpdatedAt: nowIso(),
						eventText:
							this.state.phase === 'live'
								? '1v1 PK queue reordered.'
								: this.state.eventText,
					})
					return this.state
				}

				case 'addScore': {
					if (this.state.phase !== 'live') {
						return this.state
					}

					const amount = normalizePositiveInt(command.amount, 0, 0)
					if (amount <= 0) {
						return this.state
					}

					const targetIndex = this.state.contestants.findIndex(
						(contestant) => contestant.side === command.side,
					)
					if (targetIndex < 0) {
						return this.state
					}

					const contestants = this.state.contestants.map(
						(contestant, contestantIndex) =>
							contestantIndex === targetIndex
								? {
									...contestant,
									score: contestant.score + amount,
								}
								: contestant,
					)
					const scoringContestant = contestants[targetIndex]

					this.commit({
						...this.state,
						contestants,
						totalVotes: this.state.totalVotes + amount,
						eventText: `${scoringContestant?.name ?? 'A cast member'} received a manual +${amount.toLocaleString()} coin adjustment.`,
					})
					return this.state
				}

				case 'transferScore': {
					if (this.state.phase !== 'live' && this.state.phase !== 'ended') {
						return this.state
					}

					const amount = normalizePositiveInt(command.amount, 0, 0)
					if (amount <= 0) {
						return this.state
					}

					if (command.fromSide !== null && command.fromSide === command.toSide) {
						return this.state
					}

					const targetIndex = this.state.contestants.findIndex(
						(contestant) => contestant.side === command.toSide,
					)
					if (targetIndex < 0) {
						return this.state
					}

					const sourceIndex =
						command.fromSide === null
							? -1
							: this.state.contestants.findIndex(
								(contestant) => contestant.side === command.fromSide,
							)
					if (command.fromSide !== null && sourceIndex < 0) {
						return this.state
					}

					const availableAmount =
						command.fromSide === null
							? this.state.unallocatedVotes
							: this.state.contestants[sourceIndex]?.score ?? 0
					const transferAmount = Math.min(amount, availableAmount)
					if (transferAmount <= 0) {
						return this.state
					}

					const contestants = this.state.contestants.map(
						(contestant, contestantIndex) => {
							if (contestantIndex === targetIndex) {
								return {
									...contestant,
									score: contestant.score + transferAmount,
								}
							}

							if (contestantIndex === sourceIndex) {
								return {
									...contestant,
									score: Math.max(contestant.score - transferAmount, 0),
								}
							}

							return contestant
						},
					)
					const targetContestant = contestants[targetIndex]
					const sourceContestant =
						sourceIndex >= 0 ? this.state.contestants[sourceIndex] : null

					this.commit({
						...this.state,
						contestants,
						unallocatedVotes:
							command.fromSide === null
								? Math.max(this.state.unallocatedVotes - transferAmount, 0)
								: this.state.unallocatedVotes,
						unallocatedGifts:
							command.fromSide === null
								? consumeSharedGiftTotals(this.state.unallocatedGifts, transferAmount)
								: this.state.unallocatedGifts,
						eventText:
							command.fromSide === null
								? `${targetContestant?.name ?? 'A cast member'} received ${transferAmount.toLocaleString()} coins from the unallocated pool.`
								: `${transferAmount.toLocaleString()} coins moved from ${sourceContestant?.name ?? 'a cast member'} to ${targetContestant?.name ?? 'a cast member'}.`,
					})
					if (this.state.phase === 'ended') {
						recordScoreHistory(this.activeProfileId, {
							modeId: 'battle-ladder',
							modeLabel: '1v1 PK',
							title: this.state.settings.title,
							startedAt: this.state.startedAt ?? nowIso(),
							endedAt: this.state.endsAt ?? nowIso(),
							totalScore: this.state.totalVotes,
							unallocatedScore: this.state.unallocatedVotes,
							winnerNames: winnerFromContestants(this.state.contestants)
								? [winnerFromContestants(this.state.contestants) as string]
								: [],
							contestants: this.state.contestants.map(({ name, score }) => ({ name, score }))
						})
					}
					return this.state
				}

				case 'start': {
					if (this.state.phase === 'live') {
						return this.state
					}

					const nextSettings = command.settings
						? normalizeSettings({
							...this.state.settings,
							...command.settings,
						})
						: this.state.settings
					const requestedLineup = Array.isArray(command.settings?.castNames)
						? command.settings.castNames
						: this.state.lineupOrder
					const normalized = normalizeSettingsWithLineup(
						nextSettings,
						requestedLineup,
					)
					if (normalized.lineupOrder.length < 2) {
						this.stopFinishTimer()
						saveStoredSettings(normalized.settings, this.activeProfileId)
						this.commit(
							buildIdleState(normalized.settings, normalized.lineupOrder),
						)
						return this.state
					}

					const now = Date.now()
					const endsAt = new Date(
						now + normalized.settings.durationSeconds * 1000,
					).toISOString()

					saveStoredSettings(normalized.settings, this.activeProfileId)
					this.commit({
						settings: normalized.settings,
						phase: 'live',
						contestants: buildContestants(
							normalized.settings,
							normalized.lineupOrder,
						),
						lineupOrder: normalized.lineupOrder,
						totalVotes: 0,
						unallocatedVotes: 0,
						unallocatedGifts: [],
						collecting: true,
						startedAt: new Date(now).toISOString(),
						endsAt,
						lastUpdatedAt: nowIso(),
						eventText: '1v1 PK round is live.',
					})
					this.scheduleFinish(Date.parse(endsAt))
					return this.state
				}

				case 'endRound': {
					return this.finishRound()
				}

				case 'resetScores': {
					this.stopFinishTimer()
					this.commit(buildIdleState(this.state.settings, this.state.lineupOrder))
					return this.state
				}

				case 'gift': {
					if (this.state.phase !== 'live' || !this.state.collecting) {
						return this.state
					}

					const giftReference = { giftId: command.giftId, giftName: command.giftName }
					const normalizedGiftName = battleGiftMatchKey(giftReference)
					if (!normalizedGiftName) {
						return this.state
					}
					const displayGiftName = giftCatalogDisplayName(giftReference, command.giftName)

					const amount = normalizePositiveInt(command.count ?? 1, 0, 0)
					if (amount <= 0) {
						return this.state
					}

					const boundTargetName = trimValue(command.targetCastName)
					const boundTargetIndex = boundTargetName
						? this.state.contestants.findIndex((contestant) => contestant.name === boundTargetName)
						: -1
					const matchedGiftIndex = this.state.contestants.findIndex((contestant) =>
						contestant.gifts.some(
							(gift) => battleGiftMatchKey(gift) === normalizedGiftName,
						),
					)
					const targetIndex = boundTargetIndex >= 0 ? boundTargetIndex : matchedGiftIndex
					if (targetIndex < 0) {
						this.commit({
							...this.state,
							totalVotes: this.state.totalVotes + amount,
							unallocatedVotes: this.state.unallocatedVotes + amount,
							unallocatedGifts: addSharedGiftTotal(
								this.state.unallocatedGifts,
								giftReference,
								amount,
							),
							eventText: `${displayGiftName} +${amount} coins are unallocated.`,
						})
						return this.state
					}

					const contestants = this.state.contestants.map(
						(contestant, contestantIndex) =>
							contestantIndex === targetIndex
								? {
									...contestant,
									score: contestant.score + amount,
									voters: contestant.voters + 1,
								}
								: contestant,
					)
					const scoringContestant = contestants[targetIndex]
					const matchedGift = scoringContestant?.gifts.find(
						(gift) => battleGiftMatchKey(gift) === normalizedGiftName,
					)
					const eventText = matchedGift
						? `${scoringContestant?.name ?? 'A cast member'} matched ${matchedGift.giftName} +${amount} coin${amount === 1 ? '' : 's'}.`
						: `${scoringContestant?.name ?? 'A cast member'} received ${displayGiftName} +${amount} coin${amount === 1 ? '' : 's'} from gifter binding.`

					this.commit({
						...this.state,
						contestants,
						totalVotes: this.state.totalVotes + amount,
						eventText,
					})
					return this.state
				}
			}
		}

		private finishRound(endedAt = nowIso()) {
			if (this.state.phase !== 'live') {
				return this.state
			}

			this.stopFinishTimer()
			const winnerSide = winnerSideFromContestants(this.state.contestants)
			const currentLineupOrder = lineupOrderWithActiveContestants(
				this.state.lineupOrder,
				this.state.contestants,
			)
			const nextLineupOrder = rotateLineupOrder(
				currentLineupOrder,
				winnerSide,
			)
			const normalized = normalizeSettingsWithLineup(
				this.state.settings,
				nextLineupOrder,
			)

			saveStoredSettings(normalized.settings, this.activeProfileId)
			this.commit({
				...this.state,
				settings: normalized.settings,
				phase: 'ended',
				lineupOrder: normalized.lineupOrder,
				collecting: false,
				endsAt: endedAt,
				lastUpdatedAt: endedAt,
				eventText: finishedRoundEventText(
					this.state.contestants,
					winnerSide,
					normalized.lineupOrder,
				),
			})
			recordScoreHistory(this.activeProfileId, {
				modeId: 'battle-ladder',
				modeLabel: '1v1 PK',
				title: this.state.settings.title,
				startedAt: this.state.startedAt ?? endedAt,
				endedAt,
				totalScore: this.state.totalVotes,
				unallocatedScore: this.state.unallocatedVotes,
				winnerNames: winnerFromContestants(this.state.contestants)
					? [winnerFromContestants(this.state.contestants) as string]
					: [],
				contestants: this.state.contestants.map(({ name, score }) => ({ name, score }))
			})
			return this.state
		}

		private scheduleFinish(endMs: number) {
			this.stopFinishTimer()

			const delay = Math.max(endMs + GIFT_ARRIVAL_BUFFER_MS - Date.now(), 0)
			this.finishTimer = setTimeout(() => {
				this.finishTimer = null
				this.finishRound(new Date(endMs).toISOString())
			}, delay)
		}

		private stopFinishTimer() {
			if (this.finishTimer) {
				clearTimeout(this.finishTimer)
				this.finishTimer = null
			}
		}

		private commit(nextState: BattleState) {
			const normalizedNextState =
				nextState.phase === 'live'
					? {
						...nextState,
						lineupOrder: lineupOrderWithActiveContestants(
							nextState.lineupOrder,
							nextState.contestants,
						),
					}
					: nextState
			this.state = {
				...normalizedNextState,
				lastUpdatedAt: nowIso(),
			}
			if (this.activeProfileId) {
				this.profileStateCache.set(this.activeProfileId, this.state)
			}

			for (const subscriber of this.subscribers) {
				subscriber(this.state)
			}
		}
	}

	export const battleStore = new BattleStore()
}

namespace StickerDanceGame {
	type Subscriber = (state: StickerDanceState) => void;

	type StickerDanceStoredData = {
		settings: StickerDanceSettings;
		rounds: StickerDanceRoundResult[];
	};

	type StickerDanceStoredCollection = {
		profiles: Record<string, StickerDanceStoredData>;
	};

	type StickerDanceStateInput = Omit<StickerDanceState, 'lastUpdatedAt'> & {
		lastUpdatedAt?: string;
	};

	const MAX_STORED_ROUNDS = 200;
	const DEFAULT_EVENT_TEXT = 'Set the gift mapping, then start the round.';

	let cachedStoredData: StickerDanceStoredCollection | null = null;

	function sanitizeCastNames(castNames?: string[]) {
		return sanitizeCastNameList(castNames?.map((name) => trimValue(name)), { limit: 21 });
	}

	function sanitizeRoundCastNames(roundCastNames: string[] | undefined, castNames: string[]) {
		const requested = (roundCastNames ?? castNames).map((name) => trimValue(name)).filter(Boolean);
		const ordered = castNames.filter((name) => requested.includes(name));
		return [...ordered, ...castNames.filter((name) => !ordered.includes(name))];
	}

	function sameNames(left: string[], right: string[]) {
		return left.length === right.length && left.every((value, index) => value === right[index]);
	}

	function resolveGiftEntry(value: string) {
		return giftCatalogStoredId(value);
	}

	function stickerGiftMatchKey(value: string | { giftId?: string | null; giftName?: string | null }) {
		return giftCatalogMatchKey(value);
	}

	function defaultGiftName(index: number) {
		return giftCatalogDefaultId(index);
	}

	function buildDefaultStickerMap(castNames: string[]) {
		const stickerByCast: StickerDanceStickerMap = {};

		castNames.forEach((name, index) => {
			stickerByCast[name] = defaultGiftName(index);
		});

		return stickerByCast;
	}

	function sanitizeStickerMap(stickerByCast: StickerDanceStickerMap | undefined, castNames: string[]) {
		const knownNames = sanitizeCastNameList(
			[
				...castNames,
				...Object.keys(stickerByCast ?? {})
			],
			{ limit: 21 }
		);
		const defaults = buildDefaultStickerMap(knownNames);

		for (const castName of knownNames) {
			const value = trimValue(stickerByCast?.[castName] ?? '');
			if (value && resolveGiftEntry(value)) {
				defaults[castName] = resolveGiftEntry(value);
			}
		}

		return defaults;
	}

	function normalizeRoundDurationSeconds(value: unknown) {
		return normalizePositiveInt(value, 0, 0);
	}

	function normalizeSettings(input?: Partial<StickerDanceSettings>): StickerDanceSettings {
		const castNames = sanitizeCastNames(input?.castNames);

		return {
			title: trimValue(String(input?.title ?? '')) || 'Group Sticker',
			castNames,
			roundCastNames: sanitizeRoundCastNames(input?.roundCastNames, castNames),
			stickerByCast: sanitizeStickerMap(input?.stickerByCast, castNames),
			visualEffect: normalizePkVisualEffect(input?.visualEffect, 'gift-blast')
		};
	}

	function buildDefaultSettings() {
		return normalizeSettings({
			title: 'Group Sticker',
			castNames: [],
			roundCastNames: [],
			stickerByCast: {},
			visualEffect: 'gift-blast'
		});
	}

	function getStickerDanceFilePath() {
		const explicitPath = trimValue(
			privateEnv.STREAMPLAY_STUDIO_STICKER_DANCE_FILE || privateEnv.STREAMPLAY_STICKER_DANCE_FILE || ''
		);
		if (explicitPath) {
			return explicitPath;
		}

		const userDataPath = trimValue(
			privateEnv.STREAMPLAY_STUDIO_USER_DATA_DIR || privateEnv.STREAMPLAY_USER_DATA_DIR || ''
		);
		if (userDataPath) {
			return path.join(userDataPath, 'sticker-dance.json');
		}

		return path.join(process.cwd(), '.studio-data', 'sticker-dance.json');
	}

	function sanitizeStoredContestants(value: unknown): StickerDanceContestant[] {
		if (!Array.isArray(value)) {
			return [];
		}

		return value
			.map<StickerDanceContestant | null>((entry, index) => {
				if (!entry || typeof entry !== 'object') {
					return null;
				}

				const contestant = entry as Partial<StickerDanceContestant>;
				const name = trimValue(String(contestant.name ?? ''));
				const giftId = giftCatalogStoredId({
					giftId: contestant.giftId,
					giftName: contestant.giftName
				});
				const giftName = giftCatalogDisplayName({ giftId, giftName: contestant.giftName }, '');
				if (!name || !giftName) {
					return null;
				}

				return {
					id: trimValue(String(contestant.id ?? `${index}-${name.toLowerCase().replace(/\s+/g, '-')}`)),
					name,
					avatar:
						trimValue(String(contestant.avatar ?? '')) ||
						name
							.split(/\s+/)
							.map((part) => part[0])
							.join('')
							.slice(0, 2)
							.toUpperCase(),
					giftId,
					giftName,
					giftImageUrl:
						typeof contestant.giftImageUrl === 'string' && contestant.giftImageUrl.trim()
							? contestant.giftImageUrl.trim()
							: giftCatalogImageUrl({ giftId, giftName }),
					score: normalizePositiveInt(contestant.score, 0, 0),
					voters: normalizePositiveInt(contestant.voters, 0, 0)
				};
			})
			.filter((contestant): contestant is StickerDanceContestant => contestant !== null);
	}

	function winnerNamesFromContestants(contestants: StickerDanceContestant[]) {
		const winningScore = Math.max(...contestants.map((contestant) => contestant.score), 0);
		if (winningScore <= 0) {
			return [];
		}

		return contestants
			.filter((contestant) => contestant.score === winningScore)
			.map((contestant) => contestant.name);
	}

	function sanitizeStoredRounds(value: unknown): StickerDanceRoundResult[] {
		if (!Array.isArray(value)) {
			return [];
		}

		return value
			.map<StickerDanceRoundResult | null>((entry, index) => {
				if (!entry || typeof entry !== 'object') {
					return null;
				}

				const round = entry as Partial<StickerDanceRoundResult>;
				const startedAt = trimValue(String(round.startedAt ?? ''));
				const endedAt = trimValue(String(round.endedAt ?? ''));
				const contestants = sanitizeStoredContestants(round.contestants);
				if (!startedAt || !endedAt || contestants.length === 0) {
					return null;
				}

				const winnerNames =
					Array.isArray(round.winnerNames) && round.winnerNames.length > 0
						? round.winnerNames.map((name) => trimValue(String(name))).filter(Boolean)
						: winnerNamesFromContestants(contestants);

				return {
					id: trimValue(String(round.id ?? `${startedAt}-${index}`)) || `${startedAt}-${index}`,
					title: trimValue(String(round.title ?? '')) || 'Group Sticker',
					startedAt,
					endedAt,
					durationSeconds: normalizeRoundDurationSeconds(round.durationSeconds),
					totalVotes: normalizePositiveInt(round.totalVotes, 0, 0),
					unallocatedVotes: normalizePositiveInt(round.unallocatedVotes, 0, 0),
					unallocatedGifts: sanitizeStoredGiftTotals(round.unallocatedGifts),
					winnerNames,
					contestants
				};
			})
			.filter((round): round is StickerDanceRoundResult => round !== null)
			.slice(0, MAX_STORED_ROUNDS);
	}

	function sanitizeStoredGiftTotals(value: unknown): StickerDanceGiftTotal[] {
		if (!Array.isArray(value)) {
			return [];
		}

		return value
			.map<StickerDanceGiftTotal | null>((entry) => {
				if (!entry || typeof entry !== 'object') {
					return null;
				}

				const gift = entry as Partial<StickerDanceGiftTotal>;
				const giftId = giftCatalogStoredId({ giftId: gift.giftId, giftName: gift.giftName });
				const giftName = giftCatalogDisplayName({ giftId, giftName: gift.giftName }, '');
				const count = normalizePositiveInt(gift.count, 0, 0);
				if (!giftName || count <= 0) {
					return null;
				}

				return {
					giftId,
					giftName,
					giftImageUrl:
						typeof gift.giftImageUrl === 'string' && gift.giftImageUrl.trim()
							? gift.giftImageUrl.trim()
							: giftCatalogImageUrl({ giftId, giftName }),
					count
				};
			})
			.filter((gift): gift is StickerDanceGiftTotal => gift !== null);
	}

	function sanitizeStoredData(value: unknown): StickerDanceStoredData {
		const parsed = value && typeof value === 'object' ? (value as Partial<StickerDanceStoredData>) : {};
		return {
			settings: normalizeSettings(parsed.settings),
			rounds: sanitizeStoredRounds(parsed.rounds)
		};
	}

	function readStoredCollection() {
		if (cachedStoredData) {
			return cachedStoredData;
		}

		const filePath = getStickerDanceFilePath();

		try {
			const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as
				Partial<StickerDanceStoredCollection>;
			cachedStoredData = {
				profiles: Object.fromEntries(
					Object.entries(parsed.profiles ?? {}).map(([profileId, value]) => [
						profileId,
						sanitizeStoredData(value)
					])
				)
			};
		} catch {
			cachedStoredData = {
				profiles: {}
			};
		}

		return cachedStoredData;
	}

	function readStoredData(profileId: string | null = null): StickerDanceStoredData {
		const current = readStoredCollection();

		if (!profileId) {
			return {
				settings: buildDefaultSettings(),
				rounds: []
			};
		}

		return (
			current.profiles[profileId] ?? {
				settings: buildDefaultSettings(),
				rounds: []
			}
		);
	}

	function writeStoredData(data: StickerDanceStoredData, profileId: string | null = null) {
		if (!profileId) {
			return;
		}

		const filePath = getStickerDanceFilePath();
		fs.mkdirSync(path.dirname(filePath), { recursive: true });
		const current = readStoredCollection();
		const nextData: StickerDanceStoredCollection = {
			profiles: {
				...current.profiles,
				[profileId]: data
			}
		};
		fs.writeFileSync(filePath, `${JSON.stringify(nextData, null, 2)}\n`, 'utf8');
		cachedStoredData = nextData;
	}

	function saveStoredSettings(settings: StickerDanceSettings, profileId: string | null = null) {
		const current = readStoredData(profileId);
		writeStoredData({
			...current,
			settings
		}, profileId);
	}

	function appendStoredRound(round: StickerDanceRoundResult, profileId: string | null = null) {
		const current = readStoredData(profileId);
		writeStoredData({
			...current,
			rounds: [round, ...current.rounds].slice(0, MAX_STORED_ROUNDS)
		}, profileId);
	}

	function buildContestants(names: string[], stickerByCast: StickerDanceStickerMap) {
		return names.map((name, index) => {
			const giftId = giftCatalogStoredId(stickerByCast[name] ?? defaultGiftName(index));
			const giftName = giftCatalogDisplayName(giftId);

			return {
				id: `${index}-${name.toLowerCase().replace(/\s+/g, '-')}`,
				name,
				avatar: name
					.split(/\s+/)
					.map((part) => part[0])
					.join('')
					.slice(0, 2)
					.toUpperCase(),
				giftId,
				giftName,
				giftImageUrl: giftCatalogImageUrl({ giftId, giftName }),
				score: 0,
				voters: 0
			};
		});
	}

	function buildIdleState(settings: StickerDanceSettings): StickerDanceState {
		return {
			settings,
			phase: 'idle',
			contestants: buildContestants(settings.roundCastNames, settings.stickerByCast),
			totalVotes: 0,
			unallocatedVotes: 0,
			unallocatedGifts: [],
			collecting: false,
			startedAt: null,
			lastUpdatedAt: nowIso(),
			eventText: DEFAULT_EVENT_TEXT
		};
	}

	function buildRoundRecord(state: StickerDanceState, endedAt: string): StickerDanceRoundResult {
		const contestants = state.contestants.map((contestant) => ({ ...contestant }));
		const startedAt = state.startedAt ?? endedAt;
		const elapsedSeconds = Math.round(
			Math.max(Date.parse(endedAt) - Date.parse(startedAt), 0) / 1000
		);

		return {
			id: `${startedAt}-${endedAt}`,
			title: state.settings.title,
			startedAt,
			endedAt,
			durationSeconds: elapsedSeconds,
			totalVotes: state.totalVotes,
			unallocatedVotes: state.unallocatedVotes,
			unallocatedGifts: state.unallocatedGifts.map((gift) => ({ ...gift })),
			winnerNames: winnerNamesFromContestants(contestants),
			contestants
		};
	}

	class StickerDanceStore {
		private state = buildIdleState(readStoredData().settings);
		private activeProfileId: string | null = null;
		private profileStateCache = new Map<string, StickerDanceState>();
		private subscribers = new Set<Subscriber>();

		useProfile(profileId: string | null, castNames: string[]) {
			const nextProfileId = profileId?.trim() || null;
			const hasSharedRoster = sanitizeCastNames(castNames).length > 0;
			if (this.activeProfileId === nextProfileId) {
				return hasSharedRoster ? this.syncSharedCastRoster(castNames) : this.state;
			}

			if (this.activeProfileId) {
				this.profileStateCache.set(this.activeProfileId, this.state);
			}

			this.activeProfileId = nextProfileId;
			const nextState =
				nextProfileId && this.profileStateCache.has(nextProfileId)
					? (this.profileStateCache.get(nextProfileId) as StickerDanceState)
					: buildIdleState(nextProfileId ? readStoredData(nextProfileId).settings : buildDefaultSettings());

			this.commit(nextState);

			if (!nextProfileId || !hasSharedRoster) {
				return this.state;
			}

			return this.syncSharedCastRoster(castNames);
		}

		getState() {
			return this.state;
		}

		syncSharedCastRoster(castNames: string[]) {
			if (this.state.phase === 'live') {
				return this.state;
			}

			const nextSettings = normalizeSettings({
				...this.state.settings,
				castNames,
				roundCastNames: this.state.settings.roundCastNames
			});

			if (
				sameNames(this.state.settings.castNames, nextSettings.castNames) &&
				sameNames(this.state.settings.roundCastNames, nextSettings.roundCastNames)
			) {
				return this.state;
			}

			saveStoredSettings(nextSettings, this.activeProfileId);
			this.commit(buildIdleState(nextSettings));
			return this.state;
		}

		subscribe(subscriber: Subscriber) {
			this.subscribers.add(subscriber);
			subscriber(this.state);

			return () => {
				this.subscribers.delete(subscriber);
			};
		}

		update(command: StickerDanceCommand) {
			switch (command.action) {
				case 'replaceSettings': {
					if (this.state.phase === 'live') {
						return this.state;
					}

					const nextSettings = normalizeSettings({
						...this.state.settings,
						...command.settings
					});

					saveStoredSettings(nextSettings, this.activeProfileId);
					this.commit(buildIdleState(nextSettings));
					return this.state;
				}

				case 'start': {
					if (this.state.phase === 'live') {
						return this.state;
					}

					const nextSettings = command.settings
						? normalizeSettings({
							...this.state.settings,
							...command.settings
						})
						: this.state.settings;
					saveStoredSettings(nextSettings, this.activeProfileId);

					this.commit({
						settings: nextSettings,
						phase: 'live',
						contestants: buildContestants(
							nextSettings.roundCastNames,
							nextSettings.stickerByCast
						),
						totalVotes: 0,
						unallocatedVotes: 0,
						unallocatedGifts: [],
						collecting: true,
						startedAt: nowIso(),
						eventText: 'Group Sticker round is live.'
					});
					return this.state;
				}

				case 'addScore': {
					if (this.state.phase !== 'live') {
						return this.state;
					}

					const amount = normalizePositiveInt(command.amount, 0, 0);
					if (amount <= 0) {
						return this.state;
					}

					const index = this.state.contestants.findIndex(
						(contestant) => contestant.name === trimValue(command.castName)
					);
					if (index < 0) {
						return this.state;
					}

					const contestants = this.state.contestants.map((contestant, contestantIndex) =>
						contestantIndex === index
							? {
								...contestant,
								score: contestant.score + amount
							}
							: contestant
					);
					const activeContestant = contestants[index];

					this.commit({
						...this.state,
						contestants,
						totalVotes: this.state.totalVotes + amount,
						eventText: `${activeContestant?.name ?? 'Contestant'} received a manual +${amount.toLocaleString()} coin adjustment.`
					});
					return this.state;
				}

				case 'transferScore': {
					if (this.state.phase !== 'live' && this.state.phase !== 'ended') {
						return this.state;
					}

					const amount = normalizePositiveInt(command.amount, 0, 0);
					if (amount <= 0) {
						return this.state;
					}

					if (command.fromCastName && trimValue(command.fromCastName) === trimValue(command.toCastName)) {
						return this.state;
					}

					const targetIndex = this.state.contestants.findIndex(
						(contestant) => contestant.name === trimValue(command.toCastName)
					);
					if (targetIndex < 0) {
						return this.state;
					}

					const sourceCastName = command.fromCastName === null ? null : trimValue(command.fromCastName);
					const sourceIndex =
						sourceCastName === null
							? -1
							: this.state.contestants.findIndex(
								(contestant) => contestant.name === sourceCastName
							);
					if (command.fromCastName !== null && sourceIndex < 0) {
						return this.state;
					}

					const availableAmount =
						command.fromCastName === null
							? this.state.unallocatedVotes
							: this.state.contestants[sourceIndex]?.score ?? 0;
					const transferAmount = Math.min(amount, availableAmount);
					if (transferAmount <= 0) {
						return this.state;
					}

					const contestants = this.state.contestants.map((contestant, contestantIndex) => {
						if (contestantIndex === targetIndex) {
							return {
								...contestant,
								score: contestant.score + transferAmount
							};
						}

						if (contestantIndex === sourceIndex) {
							return {
								...contestant,
								score: Math.max(contestant.score - transferAmount, 0)
							};
						}

						return contestant;
					});
					const targetContestant = contestants[targetIndex];
					const sourceContestant = sourceIndex >= 0 ? this.state.contestants[sourceIndex] : null;

					this.commit({
						...this.state,
						contestants,
						unallocatedVotes:
							command.fromCastName === null
								? Math.max(this.state.unallocatedVotes - transferAmount, 0)
								: this.state.unallocatedVotes,
						unallocatedGifts:
							command.fromCastName === null
								? consumeSharedGiftTotals(this.state.unallocatedGifts, transferAmount)
								: this.state.unallocatedGifts,
						eventText:
							command.fromCastName === null
								? `${targetContestant?.name ?? 'Contestant'} received ${transferAmount.toLocaleString()} coins from the unallocated pool.`
								: `${transferAmount.toLocaleString()} coins moved from ${sourceContestant?.name ?? 'Contestant'} to ${targetContestant?.name ?? 'Contestant'}.`
					});
					if (this.state.phase === 'ended') {
						recordScoreHistory(this.activeProfileId, {
							modeId: 'group-sticker',
							modeLabel: 'Group Sticker',
							title: this.state.settings.title,
							startedAt: this.state.startedAt ?? nowIso(),
							endedAt: nowIso(),
							totalScore: this.state.totalVotes,
							unallocatedScore: this.state.unallocatedVotes,
							winnerNames: winnerNamesFromContestants(this.state.contestants),
							contestants: this.state.contestants.map(({ name, score }) => ({ name, score }))
						});
					}
					return this.state;
				}

				case 'endRound': {
					return this.finishRound();
				}

				case 'resetScores': {
					this.commit(buildIdleState(this.state.settings));
					return this.state;
				}

				case 'gift': {
					if (!this.state.collecting || this.state.phase !== 'live') {
						return this.state;
					}

					const giftReference = { giftId: command.giftId, giftName: command.giftName };
					const normalizedGiftName = stickerGiftMatchKey(giftReference);
					if (!normalizedGiftName) {
						return this.state;
					}
					const displayGiftName = giftCatalogDisplayName(giftReference, command.giftName);

					const boundTargetName = trimValue(command.targetCastName);
					const boundTargetIndex = boundTargetName
						? this.state.contestants.findIndex((contestant) => contestant.name === boundTargetName)
						: -1;
					const matchedGiftIndex = this.state.contestants.findIndex(
						(contestant) => stickerGiftMatchKey(contestant) === normalizedGiftName
					);
					const index = boundTargetIndex >= 0 ? boundTargetIndex : matchedGiftIndex;

					const amount = normalizePositiveInt(command.count ?? 1, 0, 0);
					if (amount <= 0) {
						return this.state;
					}

					if (index < 0) {
						this.commit({
							...this.state,
							totalVotes: this.state.totalVotes + amount,
							unallocatedVotes: this.state.unallocatedVotes + amount,
							unallocatedGifts: addSharedGiftTotal(this.state.unallocatedGifts, giftReference, amount),
							eventText: `${displayGiftName} +${amount} coins are unallocated.`
						});
						return this.state;
					}

					const contestants = this.state.contestants.map((contestant, contestantIndex) =>
						contestantIndex === index
							? {
								...contestant,
								score: contestant.score + amount,
								voters: contestant.voters + 1
							}
							: contestant
					);
					const activeContestant = contestants[index];
					const matchedGift = stickerGiftMatchKey(activeContestant ?? {}) === normalizedGiftName;

					this.commit({
						...this.state,
						contestants,
						totalVotes: this.state.totalVotes + amount,
						eventText: matchedGift
							? `${activeContestant?.name ?? 'Contestant'} matched ${activeContestant?.giftName ?? displayGiftName
							} +${amount} coins.`
							: `${activeContestant?.name ?? 'Contestant'} received ${displayGiftName} +${amount} coins from gifter binding.`
					});
					return this.state;
				}
			}

			return this.state;
		}

		private finishRound() {
			if (this.state.phase !== 'live') {
				return this.state;
			}

			// Group Sticker has no delayed-arrival timer, so it records its actual finish time.
			const endedAt = nowIso();
			const roundRecord = buildRoundRecord(this.state, endedAt);
			const winnerLabel =
				roundRecord.winnerNames.length > 0
					? `Winner${roundRecord.winnerNames.length > 1 ? 's' : ''}: ${roundRecord.winnerNames.join(', ')}.`
					: 'No winning cast this round.';

			this.commit({
				...this.state,
				phase: 'ended',
				collecting: false,
				eventText: `Group Sticker round ended. ${winnerLabel}`
			});
			appendStoredRound(roundRecord, this.activeProfileId);
			recordScoreHistory(this.activeProfileId, {
				modeId: 'group-sticker',
				modeLabel: 'Group Sticker',
				title: roundRecord.title,
				startedAt: roundRecord.startedAt,
				endedAt: roundRecord.endedAt,
				totalScore: roundRecord.totalVotes,
				unallocatedScore: roundRecord.unallocatedVotes,
				winnerNames: roundRecord.winnerNames,
				contestants: roundRecord.contestants.map(({ name, score }) => ({ name, score }))
			});
			return this.state;
		}

		private commit(nextState: StickerDanceStateInput) {
			this.state = {
				...nextState,
				lastUpdatedAt: nowIso()
			};
			if (this.activeProfileId) {
				this.profileStateCache.set(this.activeProfileId, this.state);
			}

			for (const subscriber of this.subscribers) {
				subscriber(this.state);
			}
		}
	}

	export const stickerDanceStore = new StickerDanceStore();
}

namespace GroupPkGame {
	type Subscriber = (state: GroupPkState) => void;

	type GroupPkStoredData = {
		settings: GroupPkSettings;
		rounds: GroupPkRoundResult[];
		activeRound: GroupPkState | null;
	};

	type GroupPkStoredCollection = {
		profiles: Record<string, GroupPkStoredData>;
	};

	type GroupPkStateInput = Omit<GroupPkState, 'lastUpdatedAt'> & {
		lastUpdatedAt?: string;
	};

	const DEFAULT_DURATION_SECONDS = 120;
	const MAX_GIFTS_PER_CAST = 3;
	const MAX_STORED_ROUNDS = 200;

	let cachedStoredData: GroupPkStoredCollection | null = null;

	function giftMatchKey(value: string | { giftId?: string | null; giftName?: string | null }) {
		return giftCatalogMatchKey(value);
	}

	function sanitizeCastNames(castNames?: string[]) {
		return sanitizeCastNameList(castNames?.map((name) => trimValue(name)), { limit: 21 });
	}

	function sanitizeRoundCastNames(roundCastNames: string[] | undefined, castNames: string[]) {
		const requested = (roundCastNames ?? castNames).map((name) => trimValue(name)).filter(Boolean);
		const ordered = castNames.filter((name) => requested.includes(name));
		return [...ordered, ...castNames.filter((name) => !ordered.includes(name))];
	}

	function sameNames(left: string[], right: string[]) {
		return left.length === right.length && left.every((value, index) => value === right[index]);
	}

	function resolveGiftEntry(value: string) {
		return giftCatalogStoredId(value);
	}

	function defaultGiftName(index: number) {
		return giftCatalogDefaultId(index);
	}

	function defaultGiftList(index: number) {
		return Array.from({ length: MAX_GIFTS_PER_CAST }, (_, slotIndex) =>
			defaultGiftName(index * MAX_GIFTS_PER_CAST + slotIndex)
		);
	}

	function buildDefaultGiftMap(castNames: string[]) {
		const giftsByCast: GroupPkGiftMap = {};

		castNames.forEach((name, index) => {
			giftsByCast[name] = defaultGiftList(index);
		});

		return giftsByCast;
	}

	function sanitizeGiftList(value: string[] | undefined, fallbackIndex: number) {
		const defaults = defaultGiftList(fallbackIndex);
		const seen = new Set<string>();
		const validNames = Array.from({ length: MAX_GIFTS_PER_CAST }, (_, slotIndex) => {
			const requestedName = trimValue(value?.[slotIndex] ?? '');
			const fallbackName = defaults[slotIndex] ?? defaults[0] ?? '';
			const giftName = requestedName && resolveGiftEntry(requestedName)
				? resolveGiftEntry(requestedName)
				: fallbackName;
			const normalized = giftMatchKey(giftName);
			if (!normalized || seen.has(normalized)) {
				return '';
			}

			seen.add(normalized);
			return giftName;
		}).filter(Boolean);

		return validNames.length > 0 ? validNames : defaults;
	}

	function sanitizeGiftMap(giftsByCast: GroupPkGiftMap | undefined, castNames: string[]) {
		const knownNames = sanitizeCastNameList(
			[
				...castNames,
				...Object.keys(giftsByCast ?? {})
			],
			{ limit: 21 }
		);
		const defaults = buildDefaultGiftMap(knownNames);

		for (const [index, castName] of knownNames.entries()) {
			defaults[castName] = sanitizeGiftList(giftsByCast?.[castName], index);
		}

		return defaults;
	}

	function normalizeDurationSeconds(value: unknown, fallback = DEFAULT_DURATION_SECONDS) {
		return normalizePositiveInt(value, fallback, 10);
	}

	function normalizeSettings(input?: Partial<GroupPkSettings>): GroupPkSettings {
		const castNames = sanitizeCastNames(input?.castNames);

		return {
			title: trimValue(String(input?.title ?? '')) || 'Group PK',
			durationSeconds: normalizeDurationSeconds(input?.durationSeconds),
			castNames,
			roundCastNames: sanitizeRoundCastNames(input?.roundCastNames, castNames),
			giftsByCast: sanitizeGiftMap(input?.giftsByCast, castNames),
			visualEffect: normalizePkVisualEffect(input?.visualEffect, 'thunder')
		};
	}

	function buildDefaultSettings() {
		return normalizeSettings({
			title: 'Group PK',
			durationSeconds: DEFAULT_DURATION_SECONDS,
			castNames: [],
			roundCastNames: [],
			giftsByCast: {},
			visualEffect: 'thunder'
		});
	}

	function getGroupPkFilePath() {
		const explicitPath = trimValue(
			privateEnv.STREAMPLAY_STUDIO_GROUP_PK_FILE || privateEnv.STREAMPLAY_GROUP_PK_FILE || ''
		);
		if (explicitPath) {
			return explicitPath;
		}

		const userDataPath = trimValue(
			privateEnv.STREAMPLAY_STUDIO_USER_DATA_DIR || privateEnv.STREAMPLAY_USER_DATA_DIR || ''
		);
		if (userDataPath) {
			return path.join(userDataPath, 'group-pk.json');
		}

		return path.join(process.cwd(), '.studio-data', 'group-pk.json');
	}

	function sanitizeStoredGifts(value: unknown): GroupPkGift[] {
		if (!Array.isArray(value)) {
			return [];
		}

		return value
			.map<GroupPkGift | null>((entry) => {
				if (!entry || typeof entry !== 'object') {
					return null;
				}

				const gift = entry as Partial<GroupPkGift>;
				const giftId = giftCatalogStoredId({ giftId: gift.giftId, giftName: gift.giftName });
				const giftName = giftCatalogDisplayName({ giftId, giftName: gift.giftName }, '');
				if (!giftName) {
					return null;
				}

				return {
					giftId,
					giftName,
					giftImageUrl:
						typeof gift.giftImageUrl === 'string' && gift.giftImageUrl.trim()
							? gift.giftImageUrl.trim()
							: giftCatalogImageUrl({ giftId, giftName })
				};
			})
			.filter((gift): gift is GroupPkGift => gift !== null)
			.slice(0, MAX_GIFTS_PER_CAST);
	}

	function sanitizeStoredGiftTotals(value: unknown): GroupPkGiftTotal[] {
		if (!Array.isArray(value)) {
			return [];
		}

		return value
			.map<GroupPkGiftTotal | null>((entry) => {
				if (!entry || typeof entry !== 'object') {
					return null;
				}

				const gift = entry as Partial<GroupPkGiftTotal>;
				const giftId = giftCatalogStoredId({ giftId: gift.giftId, giftName: gift.giftName });
				const giftName = giftCatalogDisplayName({ giftId, giftName: gift.giftName }, '');
				const count = normalizePositiveInt(gift.count, 0, 0);
				if (!giftName || count <= 0) {
					return null;
				}

				return {
					giftId,
					giftName,
					giftImageUrl:
						typeof gift.giftImageUrl === 'string' && gift.giftImageUrl.trim()
							? gift.giftImageUrl.trim()
							: giftCatalogImageUrl({ giftId, giftName }),
					count
				};
			})
			.filter((gift): gift is GroupPkGiftTotal => gift !== null);
	}

	function sanitizeStoredGiftEvents(value: unknown): GroupPkGiftEvent[] {
		if (!Array.isArray(value)) {
			return [];
		}

		return value
			.map<GroupPkGiftEvent | null>((entry, index) => {
				if (!entry || typeof entry !== 'object') {
					return null;
				}

				const event = entry as Partial<GroupPkGiftEvent>;
				const giftId = giftCatalogStoredId({ giftId: event.giftId, giftName: event.giftName });
				const giftName = giftCatalogDisplayName({ giftId, giftName: event.giftName }, '');
				const count = normalizePositiveInt(event.count, 0, 0);
				const receivedAt = trimValue(String(event.receivedAt ?? ''));
				if (!giftName || count <= 0 || !receivedAt) {
					return null;
				}

				const targetCastName =
					typeof event.targetCastName === 'string' && event.targetCastName.trim()
						? event.targetCastName.trim()
						: null;

				return {
					id: trimValue(String(event.id ?? `${receivedAt}-${index}`)) || `${receivedAt}-${index}`,
					receivedAt,
					giftId,
					giftName,
					giftImageUrl:
						typeof event.giftImageUrl === 'string' && event.giftImageUrl.trim()
							? event.giftImageUrl.trim()
							: giftCatalogImageUrl({ giftId, giftName }),
					count,
					targetCastName
				};
			})
			.filter((event): event is GroupPkGiftEvent => event !== null);
	}

	function sanitizeStoredContestants(value: unknown): GroupPkContestant[] {
		if (!Array.isArray(value)) {
			return [];
		}

		return value
			.map<GroupPkContestant | null>((entry, index) => {
				if (!entry || typeof entry !== 'object') {
					return null;
				}

				const contestant = entry as Partial<GroupPkContestant>;
				const name = trimValue(String(contestant.name ?? ''));
				if (!name) {
					return null;
				}

				const gifts = sanitizeStoredGifts(contestant.gifts);
				if (gifts.length === 0) {
					return null;
				}

				return {
					id: trimValue(String(contestant.id ?? `${index}-${name.toLowerCase().replace(/\s+/g, '-')}`)),
					name,
					avatar:
						trimValue(String(contestant.avatar ?? '')) ||
						name
							.split(/\s+/)
							.map((part) => part[0])
							.join('')
							.slice(0, 2)
							.toUpperCase(),
					gifts,
					score: normalizePositiveInt(contestant.score, 0, 0),
					voters: normalizePositiveInt(contestant.voters, 0, 0)
				};
			})
			.filter((contestant): contestant is GroupPkContestant => contestant !== null);
	}

	function winnerNamesFromContestants(contestants: GroupPkContestant[]) {
		const winningScore = Math.max(...contestants.map((contestant) => contestant.score), 0);
		if (winningScore <= 0) {
			return [];
		}

		return contestants
			.filter((contestant) => contestant.score === winningScore)
			.map((contestant) => contestant.name);
	}

	function sanitizeStoredRounds(value: unknown): GroupPkRoundResult[] {
		if (!Array.isArray(value)) {
			return [];
		}

		return value
			.map<GroupPkRoundResult | null>((entry, index) => {
				if (!entry || typeof entry !== 'object') {
					return null;
				}

				const round = entry as Partial<GroupPkRoundResult>;
				const startedAt = trimValue(String(round.startedAt ?? ''));
				const endedAt = trimValue(String(round.endedAt ?? ''));
				const contestants = sanitizeStoredContestants(round.contestants);
				if (!startedAt || !endedAt || contestants.length === 0) {
					return null;
				}

				const winnerNames =
					Array.isArray(round.winnerNames) && round.winnerNames.length > 0
						? round.winnerNames.map((name) => trimValue(String(name))).filter(Boolean)
						: winnerNamesFromContestants(contestants);
				const unallocatedVotes = normalizePositiveInt(round.unallocatedVotes, 0, 0);
				const unallocatedGifts = sanitizeStoredGiftTotals(round.unallocatedGifts);
				const giftEvents = sanitizeStoredGiftEvents(round.giftEvents);

				return {
					id: trimValue(String(round.id ?? `${startedAt}-${index}`)) || `${startedAt}-${index}`,
					title: trimValue(String(round.title ?? '')) || 'Group PK',
					startedAt,
					endedAt,
					durationSeconds: normalizeDurationSeconds(round.durationSeconds),
					totalVotes: normalizePositiveInt(round.totalVotes, 0, 0),
					unallocatedVotes,
					unallocatedGifts,
					giftEvents,
					winnerNames,
					contestants
				};
			})
			.filter((round): round is GroupPkRoundResult => round !== null)
			.slice(0, MAX_STORED_ROUNDS);
	}

	function sanitizeStoredActiveRound(value: unknown, fallbackSettings: GroupPkSettings): GroupPkState | null {
		if (!value || typeof value !== 'object') {
			return null;
		}

		const storedState = value as Partial<GroupPkState>;
		const phase = storedState.phase === 'live' || storedState.phase === 'ended' ? storedState.phase : null;
		if (!phase) {
			return null;
		}

		const settings = normalizeSettings(
			storedState.settings && typeof storedState.settings === 'object'
				? storedState.settings
				: fallbackSettings
		);
		const contestants = sanitizeStoredContestants(storedState.contestants);
		const startedAt =
			typeof storedState.startedAt === 'string' && storedState.startedAt.trim()
				? storedState.startedAt.trim()
				: null;
		const endsAt =
			typeof storedState.endsAt === 'string' && storedState.endsAt.trim()
				? storedState.endsAt.trim()
				: null;

		if (!startedAt || !endsAt) {
			return null;
		}

		const unallocatedVotes = normalizePositiveInt(storedState.unallocatedVotes, 0, 0);
		const allocatedVotes = contestants.reduce((total, contestant) => total + contestant.score, 0);

		return {
			settings,
			phase,
			contestants:
				contestants.length > 0 ? contestants : buildContestants(settings.roundCastNames, settings.giftsByCast),
			totalVotes: Math.max(normalizePositiveInt(storedState.totalVotes, 0, 0), allocatedVotes + unallocatedVotes),
			unallocatedVotes,
			unallocatedGifts: sanitizeStoredGiftTotals(storedState.unallocatedGifts),
			giftEvents: sanitizeStoredGiftEvents(storedState.giftEvents),
			collecting: phase === 'live',
			startedAt,
			endsAt,
			lastUpdatedAt:
				typeof storedState.lastUpdatedAt === 'string' && storedState.lastUpdatedAt.trim()
					? storedState.lastUpdatedAt.trim()
					: nowIso(),
			eventText:
				typeof storedState.eventText === 'string' && storedState.eventText.trim()
					? storedState.eventText.trim()
					: phase === 'live'
						? 'Group PK round is live.'
						: 'Group PK round ended.'
		};
	}

	function sanitizeStoredData(value: unknown): GroupPkStoredData {
		const storedState = value && typeof value === 'object' ? (value as Partial<GroupPkStoredData>) : {};
		const rounds = sanitizeStoredRounds(storedState.rounds);
		const settings = normalizeSettings(
			storedState.settings && typeof storedState.settings === 'object' ? storedState.settings : undefined
		);

		return {
			settings,
			rounds,
			activeRound: sanitizeStoredActiveRound(storedState.activeRound, settings)
		};
	}

	function readStoredCollection() {
		if (cachedStoredData) {
			return cachedStoredData;
		}

		const filePath = getGroupPkFilePath();

		try {
			const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as
				Partial<GroupPkStoredCollection>;
			cachedStoredData = {
				profiles: Object.fromEntries(
					Object.entries(parsed.profiles ?? {}).map(([profileId, value]) => [
						profileId,
						sanitizeStoredData(value)
					])
				)
			};
		} catch {
			cachedStoredData = {
				profiles: {}
			};
		}

		return cachedStoredData;
	}

	function readStoredData(profileId: string | null = null): GroupPkStoredData {
		const current = readStoredCollection();

		if (!profileId) {
			return {
				settings: buildDefaultSettings(),
				rounds: [],
				activeRound: null
			};
		}

		return (
			current.profiles[profileId] ?? {
				settings: buildDefaultSettings(),
				rounds: [],
				activeRound: null
			}
		);
	}

	function writeStoredData(data: GroupPkStoredData, profileId: string | null = null) {
		if (!profileId) {
			return;
		}

		const filePath = getGroupPkFilePath();
		fs.mkdirSync(path.dirname(filePath), { recursive: true });
		const current = readStoredCollection();
		const nextData: GroupPkStoredCollection = {
			profiles: {
				...current.profiles,
				[profileId]: data
			}
		};
		fs.writeFileSync(filePath, `${JSON.stringify(nextData, null, 2)}\n`, 'utf8');
		cachedStoredData = nextData;
	}

	function saveStoredSettings(settings: GroupPkSettings, profileId: string | null = null) {
		const current = readStoredData(profileId);
		writeStoredData({
			...current,
			settings
		}, profileId);
	}

	function saveActiveRound(activeRound: GroupPkState | null, profileId: string | null = null) {
		const current = readStoredData(profileId);
		writeStoredData({
			...current,
			activeRound
		}, profileId);
	}

	function appendStoredRound(round: GroupPkRoundResult, profileId: string | null = null) {
		const current = readStoredData(profileId);
		writeStoredData({
			...current,
			activeRound: null,
			rounds: [round, ...current.rounds].slice(0, MAX_STORED_ROUNDS)
		}, profileId);
	}

	function buildContestants(names: string[], giftsByCast: GroupPkGiftMap) {
		return names.map((name, index) => ({
			id: `${index}-${name.toLowerCase().replace(/\s+/g, '-')}`,
			name,
			avatar: name
				.split(/\s+/)
				.map((part) => part[0])
				.join('')
				.slice(0, 2)
				.toUpperCase(),
			gifts: sanitizeGiftList(giftsByCast[name], index).map((giftName) => {
				const giftId = giftCatalogStoredId(giftName);
				const displayName = giftCatalogDisplayName(giftId);
				return {
					giftId,
					giftName: displayName,
					giftImageUrl: giftCatalogImageUrl({ giftId, giftName: displayName })
				};
			}),
			score: 0,
			voters: 0
		}));
	}

	function buildGiftEvent(
		gift: string | { giftId?: string | null; giftName?: string | null },
		amount: number,
		targetCastName: string | null
	): GroupPkGiftEvent {
		const giftId = giftCatalogStoredId(gift);
		const giftName = giftCatalogDisplayName(gift, typeof gift === 'string' ? gift : 'Gift');
		const receivedAt = nowIso();
		return {
			id: randomUUID(),
			receivedAt,
			giftId,
			giftName,
			giftImageUrl: giftCatalogImageUrl({ giftId, giftName }),
			count: amount,
			targetCastName
		};
	}

	function buildIdleState(settings: GroupPkSettings): GroupPkState {
		return {
			settings,
			phase: 'idle',
			contestants: buildContestants(settings.roundCastNames, settings.giftsByCast),
			totalVotes: 0,
			unallocatedVotes: 0,
			unallocatedGifts: [],
			giftEvents: [],
			collecting: false,
			startedAt: null,
			endsAt: null,
			lastUpdatedAt: nowIso(),
			eventText: 'Set the gift mappings, then start the round.'
		};
	}

	function buildRoundRecord(state: GroupPkState, endedAt: string): GroupPkRoundResult {
		const contestants = state.contestants.map((contestant) => ({
			...contestant,
			gifts: contestant.gifts.map((gift) => ({ ...gift }))
		}));
		const startedAt = state.startedAt ?? endedAt;
		const elapsedSeconds = Math.round(
			Math.max(Date.parse(endedAt) - Date.parse(startedAt), 0) / 1000
		);

		return {
			id: `${startedAt}-${endedAt}`,
			title: state.settings.title,
			startedAt,
			endedAt,
			durationSeconds: elapsedSeconds || state.settings.durationSeconds,
			totalVotes: state.totalVotes,
			unallocatedVotes: state.unallocatedVotes,
			unallocatedGifts: state.unallocatedGifts.map((gift) => ({ ...gift })),
			giftEvents: state.giftEvents.map((event) => ({ ...event })),
			winnerNames: winnerNamesFromContestants(contestants),
			contestants
		};
	}

	class GroupPkStore {
		private state: GroupPkState;
		private activeProfileId: string | null = null;
		private profileStateCache = new Map<string, GroupPkState>();
		private subscribers = new Set<Subscriber>();
		private finishTimer: ReturnType<typeof setTimeout> | null = null;

		constructor() {
			const storedData = readStoredData(this.activeProfileId);
			this.state = storedData.activeRound ?? buildIdleState(storedData.settings);

			if (this.state.phase === 'live' && this.state.endsAt) {
				this.scheduleFinish(Date.parse(this.state.endsAt));
			}
		}

		useProfile(profileId: string | null, castNames: string[]) {
			const nextProfileId = profileId?.trim() || null;
			const hasSharedRoster = sanitizeCastNames(castNames).length > 0;
			if (this.activeProfileId === nextProfileId) {
				return hasSharedRoster ? this.syncSharedCastRoster(castNames) : this.state;
			}

			if (this.activeProfileId) {
				this.profileStateCache.set(this.activeProfileId, this.state);
			}

			this.stopFinishTimer();
			this.activeProfileId = nextProfileId;

			const nextState =
				nextProfileId && this.profileStateCache.has(nextProfileId)
					? (this.profileStateCache.get(nextProfileId) as GroupPkState)
					: (() => {
						const storedData = nextProfileId ? readStoredData(nextProfileId) : null;
						return storedData?.activeRound ?? buildIdleState(storedData?.settings ?? buildDefaultSettings());
					})();

			this.commit(nextState);

			if (this.state.phase === 'live' && this.state.endsAt) {
				this.scheduleFinish(Date.parse(this.state.endsAt));
			}

			if (!nextProfileId || !hasSharedRoster) {
				return this.state;
			}

			return this.syncSharedCastRoster(castNames);
		}

		getState() {
			return this.state;
		}

		syncSharedCastRoster(castNames: string[]) {
			if (this.state.phase === 'live') {
				return this.state;
			}

			const nextSettings = normalizeSettings({
				...this.state.settings,
				castNames,
				roundCastNames: this.state.settings.roundCastNames
			});

			if (
				sameNames(this.state.settings.castNames, nextSettings.castNames) &&
				sameNames(this.state.settings.roundCastNames, nextSettings.roundCastNames)
			) {
				return this.state;
			}

			this.stopFinishTimer();
			saveStoredSettings(nextSettings, this.activeProfileId);
			this.commit(buildIdleState(nextSettings));
			return this.state;
		}

		subscribe(subscriber: Subscriber) {
			this.subscribers.add(subscriber);
			subscriber(this.state);

			return () => {
				this.subscribers.delete(subscriber);
			};
		}

		update(command: GroupPkCommand) {
			switch (command.action) {
				case 'replaceSettings': {
					if (this.state.phase === 'live') {
						return this.state;
					}

					const nextSettings = normalizeSettings({
						...this.state.settings,
						...command.settings
					});

					this.stopFinishTimer();
					saveStoredSettings(nextSettings, this.activeProfileId);
					this.commit(buildIdleState(nextSettings));
					return this.state;
				}

				case 'start': {
					if (this.state.phase === 'live') {
						return this.state;
					}

					const nextSettings = command.settings
						? normalizeSettings({
							...this.state.settings,
							...command.settings
						})
						: this.state.settings;
					const now = Date.now();
					const endsAt = new Date(now + nextSettings.durationSeconds * 1000).toISOString();

					this.commit({
						settings: nextSettings,
						phase: 'live',
						contestants: buildContestants(
							nextSettings.roundCastNames,
							nextSettings.giftsByCast
						),
						totalVotes: 0,
						unallocatedVotes: 0,
						unallocatedGifts: [],
						giftEvents: [],
						collecting: true,
						startedAt: new Date(now).toISOString(),
						endsAt,
						eventText: 'Group PK round is live.'
					});
					saveStoredSettings(nextSettings, this.activeProfileId);
					saveActiveRound(this.state, this.activeProfileId);
					this.scheduleFinish(Date.parse(endsAt));
					return this.state;
				}

				case 'addScore': {
					if (this.state.phase !== 'live') {
						return this.state;
					}

					const amount = normalizePositiveInt(command.amount, 0, 0);
					if (amount <= 0) {
						return this.state;
					}

					const index = this.state.contestants.findIndex(
						(contestant) => contestant.name === trimValue(command.castName)
					);
					if (index < 0) {
						return this.state;
					}

					const contestants = this.state.contestants.map((contestant, contestantIndex) =>
						contestantIndex === index
							? {
								...contestant,
								score: contestant.score + amount
							}
							: contestant
					);
					const activeContestant = contestants[index];

					this.commit({
						...this.state,
						contestants,
						totalVotes: this.state.totalVotes + amount,
						eventText: `${activeContestant?.name ?? 'Contestant'} received a manual +${amount.toLocaleString()} coin adjustment.`
					});
					saveActiveRound(this.state, this.activeProfileId);
					return this.state;
				}

				case 'transferScore': {
					if (this.state.phase !== 'live' && this.state.phase !== 'ended') {
						return this.state;
					}

					const amount = normalizePositiveInt(command.amount, 0, 0);
					if (amount <= 0) {
						return this.state;
					}

					if (command.fromCastName && trimValue(command.fromCastName) === trimValue(command.toCastName)) {
						return this.state;
					}

					const targetIndex = this.state.contestants.findIndex(
						(contestant) => contestant.name === trimValue(command.toCastName)
					);
					if (targetIndex < 0) {
						return this.state;
					}

					const sourceCastName = command.fromCastName === null ? null : trimValue(command.fromCastName);
					const sourceIndex =
						sourceCastName === null
							? -1
							: this.state.contestants.findIndex(
								(contestant) => contestant.name === sourceCastName
							);
					if (command.fromCastName !== null && sourceIndex < 0) {
						return this.state;
					}

					const availableAmount =
						command.fromCastName === null
							? this.state.unallocatedVotes
							: this.state.contestants[sourceIndex]?.score ?? 0;
					const transferAmount = Math.min(amount, availableAmount);
					if (transferAmount <= 0) {
						return this.state;
					}

					const contestants = this.state.contestants.map((contestant, contestantIndex) => {
						if (contestantIndex === targetIndex) {
							return {
								...contestant,
								score: contestant.score + transferAmount
							};
						}

						if (contestantIndex === sourceIndex) {
							return {
								...contestant,
								score: Math.max(contestant.score - transferAmount, 0)
							};
						}

						return contestant;
					});
					const targetContestant = contestants[targetIndex];
					const sourceContestant = sourceIndex >= 0 ? this.state.contestants[sourceIndex] : null;

					this.commit({
						...this.state,
						contestants,
						unallocatedVotes:
							command.fromCastName === null
								? Math.max(this.state.unallocatedVotes - transferAmount, 0)
								: this.state.unallocatedVotes,
						unallocatedGifts:
							command.fromCastName === null
								? consumeSharedGiftTotals(this.state.unallocatedGifts, transferAmount)
								: this.state.unallocatedGifts,
						eventText:
							command.fromCastName === null
								? `${targetContestant?.name ?? 'Contestant'} received ${transferAmount.toLocaleString()} coins from the unallocated pool.`
								: `${transferAmount.toLocaleString()} coins moved from ${sourceContestant?.name ?? 'Contestant'} to ${targetContestant?.name ?? 'Contestant'}.`
					});
					saveActiveRound(this.state, this.activeProfileId);
					if (this.state.phase === 'ended') {
						recordScoreHistory(this.activeProfileId, {
							modeId: 'group-pk',
							modeLabel: 'Group PK',
							title: this.state.settings.title,
							startedAt: this.state.startedAt ?? nowIso(),
							endedAt: this.state.endsAt ?? nowIso(),
							totalScore: this.state.totalVotes,
							unallocatedScore: this.state.unallocatedVotes,
							winnerNames: winnerNamesFromContestants(this.state.contestants),
							contestants: this.state.contestants.map(({ name, score }) => ({ name, score }))
						});
					}
					return this.state;
				}

				case 'endRound': {
					return this.finishRound();
				}

				case 'resetScores': {
					this.stopFinishTimer();
					this.commit(buildIdleState(this.state.settings));
					saveActiveRound(null, this.activeProfileId);
					return this.state;
				}

				case 'gift': {
					if (!this.state.collecting || this.state.phase !== 'live') {
						return this.state;
					}

					const giftReference = { giftId: command.giftId, giftName: command.giftName };
					const normalizedGiftName = giftMatchKey(giftReference);
					if (!normalizedGiftName) {
						return this.state;
					}
					const displayGiftName = giftCatalogDisplayName(giftReference, command.giftName);

					const boundTargetName = trimValue(command.targetCastName);
					const boundTargetIndex = boundTargetName
						? this.state.contestants.findIndex((contestant) => contestant.name === boundTargetName)
						: -1;
					const matchedGiftIndex = this.state.contestants.findIndex((contestant) =>
						contestant.gifts.some(
							(gift) => giftMatchKey(gift) === normalizedGiftName
						)
					);
					const index = boundTargetIndex >= 0 ? boundTargetIndex : matchedGiftIndex;

					const amount = normalizePositiveInt(command.count ?? 1, 0, 0);
					if (amount <= 0) {
						return this.state;
					}

					if (index < 0) {
						this.commit({
							...this.state,
							totalVotes: this.state.totalVotes + amount,
							unallocatedVotes: this.state.unallocatedVotes + amount,
							unallocatedGifts: addSharedGiftTotal(this.state.unallocatedGifts, giftReference, amount),
							giftEvents: [...this.state.giftEvents, buildGiftEvent(giftReference, amount, null)],
							eventText: `${displayGiftName} +${amount} coins are unallocated.`
						});
						saveActiveRound(this.state, this.activeProfileId);
						return this.state;
					}

					const contestants = this.state.contestants.map((contestant, contestantIndex) =>
						contestantIndex === index
							? {
								...contestant,
								score: contestant.score + amount,
								voters: contestant.voters + 1
							}
							: contestant
					);
					const activeContestant = contestants[index];
					const matchedGift = activeContestant?.gifts.find(
						(gift) => giftMatchKey(gift) === normalizedGiftName
					);
					const eventText = matchedGift
						? `${activeContestant?.name ?? 'Contestant'} matched ${matchedGift.giftName
						} +${amount} coins.`
						: `${activeContestant?.name ?? 'Contestant'} received ${displayGiftName} +${amount} coins from gifter binding.`;

					this.commit({
						...this.state,
						contestants,
						totalVotes: this.state.totalVotes + amount,
						giftEvents: [
							...this.state.giftEvents,
							buildGiftEvent(giftReference, amount, activeContestant?.name ?? null)
						],
						eventText
					});
					saveActiveRound(this.state, this.activeProfileId);
					return this.state;
				}
			}

			return this.state;
		}

		private finishRound(endedAt = nowIso()) {
			if (this.state.phase !== 'live') {
				return this.state;
			}

			this.stopFinishTimer();

			const previewState: GroupPkState = {
				...this.state,
				phase: 'ended',
				collecting: false,
				endsAt: endedAt,
				lastUpdatedAt: endedAt,
				eventText: ''
			};
			const roundRecord = buildRoundRecord(previewState, endedAt);
			const winnerLabel =
				roundRecord.winnerNames.length > 0
					? `Winner${roundRecord.winnerNames.length > 1 ? 's' : ''}: ${roundRecord.winnerNames.join(', ')}.`
					: 'No winning cast this round.';

			this.commit({
				...previewState,
				eventText: `Group PK round ended. ${winnerLabel}`
			});
			appendStoredRound(roundRecord, this.activeProfileId);
			recordScoreHistory(this.activeProfileId, {
				modeId: 'group-pk',
				modeLabel: 'Group PK',
				title: roundRecord.title,
				startedAt: roundRecord.startedAt,
				endedAt: roundRecord.endedAt,
				totalScore: roundRecord.totalVotes,
				unallocatedScore: roundRecord.unallocatedVotes,
				winnerNames: roundRecord.winnerNames,
				contestants: roundRecord.contestants.map(({ name, score }) => ({ name, score }))
			});
			return this.state;
		}

		private scheduleFinish(endAtMs: number) {
			this.stopFinishTimer();
			const delay = Math.max(endAtMs + GIFT_ARRIVAL_BUFFER_MS - Date.now(), 0);
			this.finishTimer = setTimeout(() => {
				this.finishTimer = null;
				this.finishRound(new Date(endAtMs).toISOString());
			}, delay);
		}

		private stopFinishTimer() {
			if (this.finishTimer) {
				clearTimeout(this.finishTimer);
				this.finishTimer = null;
			}
		}

		private commit(nextState: GroupPkStateInput) {
			this.state = {
				...nextState,
				lastUpdatedAt: nowIso()
			};
			if (this.activeProfileId) {
				this.profileStateCache.set(this.activeProfileId, this.state);
			}

			for (const subscriber of this.subscribers) {
				subscriber(this.state);
			}
		}
	}

	export const groupPkStore = new GroupPkStore();
}

namespace SoloStageGame {
	type Subscriber = (state: SoloStageState) => void;

	type SoloStageStoredData = {
		settings: SoloStageSettings;
	};

	type SoloStageStoredCollection = {
		profiles: Record<string, SoloStageStoredData>;
	};

	const DEFAULT_ICONS = ['🪩', '🕶️', '🌹', '🦄', '🎵', '🌶️', '🎁', '🎯', '🔥', '🎤'];

	let cachedStoredData: SoloStageStoredCollection | null = null;

	function getSoloStageFilePath() {
		const explicitPath =
			privateEnv.STREAMPLAY_STUDIO_SOLO_STAGE_FILE?.trim() ||
			privateEnv.STREAMPLAY_SOLO_STAGE_FILE?.trim();
		if (explicitPath) {
			return explicitPath;
		}

		const userDataPath =
			privateEnv.STREAMPLAY_STUDIO_USER_DATA_DIR?.trim() ||
			privateEnv.STREAMPLAY_USER_DATA_DIR?.trim();
		if (userDataPath) {
			return path.join(userDataPath, 'solo-stage.json');
		}

		return path.join(process.cwd(), '.studio-data', 'solo-stage.json');
	}

	function sanitizeCastNames(castNames?: string[]) {
		return sanitizeCastNameList(
			castNames?.map((name) => name.trim()),
			{ limit: 12 }
		);
	}

	function sanitizeRoundCastNames(roundCastNames: string[] | undefined, castNames: string[]) {
		const requested = sanitizeCastNameList(roundCastNames ?? castNames);
		const ordered = requested.filter((name) => castNames.includes(name));
		return [...ordered, ...castNames.filter((name) => !ordered.includes(name))];
	}

	function reorderCastNames(currentNames: string[], requestedNames: string[]) {
		const requested = requestedNames.map((name) => name.trim()).filter(Boolean);
		return [
			...requested.filter((name) => currentNames.includes(name)),
			...currentNames.filter((name) => !requested.includes(name))
		];
	}

	function rotateRoundCastNames(currentNames: string[]) {
		if (currentNames.length < 2) {
			return [...currentNames];
		}

		const [activeName, ...remainingNames] = currentNames;
		return [...remainingNames, activeName];
	}

	function sameNames(left: string[], right: string[]) {
		return left.length === right.length && left.every((value, index) => value === right[index]);
	}

	function buildContestants(names: string[]) {
		return names.map((name, index) => {
			return {
				id: `${index}-${name.toLowerCase().replace(/\s+/g, '-')}`,
				name,
				avatar: name
					.split(/\s+/)
					.map((part) => part[0])
					.join('')
					.slice(0, 2)
					.toUpperCase(),
				giftIcon: DEFAULT_ICONS[index % DEFAULT_ICONS.length],
				score: 0,
				giftSenders: 0
			};
		});
	}

	function buildDefaultSettings(): SoloStageSettings {
		return {
			title: 'Solo Stage',
			scoreMode: 'target',
			durationSeconds: 120,
			castNames: [],
			roundCastNames: [],
			targetA: 10000,
			targetB: 50000,
			visualEffect: 'gold-crown'
		};
	}

	function normalizeSettings(input?: Partial<SoloStageSettings>): SoloStageSettings {
		const castNames = sanitizeCastNames(input?.castNames);
		const requestedTargetA = Number(input?.targetA);
		const targetA = Math.max(1, Number.isFinite(requestedTargetA) ? requestedTargetA : 10000);
		const requestedTargetB = Number(input?.targetB);
		const targetB = Math.max(targetA + 1, Number.isFinite(requestedTargetB) ? requestedTargetB : targetA * 5);
		const scoreMode = input?.scoreMode === 'freedom' ? 'freedom' : 'target';

		return {
			title: input?.title?.trim() || 'Solo Stage',
			scoreMode,
			durationSeconds: Math.max(10, Number(input?.durationSeconds ?? 120)),
			castNames,
			roundCastNames: sanitizeRoundCastNames(input?.roundCastNames, castNames),
			targetA,
			targetB,
			visualEffect: normalizePkVisualEffect(input?.visualEffect, 'gold-crown')
		};
	}

	function readStoredCollection() {
		if (cachedStoredData) {
			return cachedStoredData;
		}

		try {
			const parsed = JSON.parse(fs.readFileSync(getSoloStageFilePath(), 'utf8')) as
				Partial<SoloStageStoredCollection>;
			cachedStoredData = {
				profiles: Object.fromEntries(
					Object.entries(parsed.profiles ?? {}).map(([profileId, value]) => [
						profileId,
						{
							settings: normalizeSettings((value as Partial<SoloStageStoredData>)?.settings)
						}
					])
				)
			};
		} catch {
			cachedStoredData = {
				profiles: {}
			};
		}

		return cachedStoredData;
	}

	function readStoredData(profileId: string | null = null): SoloStageStoredData {
		const storedCollection = readStoredCollection();

		if (!profileId) {
			return {
				settings: buildDefaultSettings()
			};
		}

		return storedCollection.profiles[profileId] ?? {
			settings: buildDefaultSettings()
		};
	}

	function writeStoredData(data: SoloStageStoredData, profileId: string | null = null) {
		if (!profileId) {
			return;
		}

		const filePath = getSoloStageFilePath();
		fs.mkdirSync(path.dirname(filePath), { recursive: true });
		const current = readStoredCollection();
		const nextData: SoloStageStoredCollection = {
			profiles: {
				...current.profiles,
				[profileId]: data
			}
		};
		fs.writeFileSync(filePath, `${JSON.stringify(nextData, null, 2)}\n`, 'utf8');
		cachedStoredData = nextData;
	}

	function writeStoredSettings(settings: SoloStageSettings, profileId: string | null = null) {
		writeStoredData(
			{
				settings
			},
			profileId
		);
	}

	function buildInitialStateFromSettings(settings: SoloStageSettings): SoloStageState {
		return {
			settings,
			phase: 'idle',
			activeContestantIndex: 0,
			contestants: buildContestants(settings.roundCastNames),
			totalAmount: 0,
			totalGiftSenders: 0,
			collecting: false,
			startedAt: null,
			endsAt: null,
			lastUpdatedAt: nowIso(),
			eventText: ''
		};
	}

	function buildInitialState(): SoloStageState {
		return buildInitialStateFromSettings(readStoredData().settings);
	}

	class SoloStageStore {
		private state = buildInitialState();
		private activeProfileId: string | null = null;
		private profileStateCache = new Map<string, SoloStageState>();
		private subscribers = new Set<Subscriber>();
		private finishTimer: ReturnType<typeof setTimeout> | null = null;

		useProfile(profileId: string | null, castNames: string[]) {
			const nextProfileId = profileId?.trim() || null;
			const hasSharedRoster = sanitizeCastNames(castNames).length > 0;
			if (this.activeProfileId === nextProfileId) {
				return hasSharedRoster ? this.syncSharedCastRoster(castNames) : this.state;
			}

			if (this.activeProfileId) {
				this.profileStateCache.set(this.activeProfileId, this.state);
			}

			this.stopFinishTimer();
			this.activeProfileId = nextProfileId;

			const nextState =
				nextProfileId && this.profileStateCache.has(nextProfileId)
					? (this.profileStateCache.get(nextProfileId) as SoloStageState)
					: buildInitialStateFromSettings(
						nextProfileId ? readStoredData(nextProfileId).settings : buildDefaultSettings()
					);

			this.commit(nextState);
			if (this.state.phase === 'live' && this.state.endsAt) {
				this.scheduleFinish(Date.parse(this.state.endsAt));
			}

			if (!nextProfileId || !hasSharedRoster) {
				return this.state;
			}

			return this.syncSharedCastRoster(castNames);
		}

		getState() {
			return this.state;
		}

		syncSharedCastRoster(castNames: string[]) {
			if (this.state.phase === 'live') {
				return this.state;
			}

			const nextSettings = normalizeSettings({
				...this.state.settings,
				castNames,
				roundCastNames: this.state.settings.roundCastNames
			});

			if (
				sameNames(this.state.settings.castNames, nextSettings.castNames) &&
				sameNames(this.state.settings.roundCastNames, nextSettings.roundCastNames)
			) {
				return this.state;
			}

			writeStoredSettings(nextSettings, this.activeProfileId);
			this.commit(buildInitialStateFromSettings(nextSettings));
			return this.state;
		}

		subscribe(subscriber: Subscriber) {
			this.subscribers.add(subscriber);
			subscriber(this.state);

			return () => {
				this.subscribers.delete(subscriber);
			};
		}

		update(command: SoloStageCommand) {
			switch (command.action) {
				case 'replaceSettings': {
					const nextSettings = normalizeSettings({
						...this.state.settings,
						...command.settings
					});
					writeStoredSettings(nextSettings, this.activeProfileId);

					const contestants = buildContestants(nextSettings.roundCastNames);
					const nextIndex =
						this.state.phase === 'live'
							? Math.max(
								contestants.findIndex(
									(contestant) =>
										contestant.name ===
										this.state.contestants[this.state.activeContestantIndex]?.name
								),
								0
							)
							: contestants.length > 0
								? 0
								: -1;

					this.commit({
						...this.state,
						settings: nextSettings,
						contestants,
						activeContestantIndex: Math.max(nextIndex, 0),
						lastUpdatedAt: nowIso()
					});
					return this.state;
				}

				case 'selectCast': {
					if (this.state.phase === 'live') {
						return this.state;
					}

					const nextIndex = Math.min(Math.max(command.index, 0), this.state.contestants.length - 1);
					this.commit({
						...this.state,
						activeContestantIndex: nextIndex,
						lastUpdatedAt: nowIso(),
						eventText: `${this.state.contestants[nextIndex]?.name ?? 'Contestant'} is selected.`
					});
					return this.state;
				}

				case 'reorderCast': {
					if (this.state.phase === 'live') {
						return this.state;
					}

					const currentNames = this.state.contestants.map((contestant) => contestant.name);
					const nextRoundCastNames = reorderCastNames(currentNames, command.castNames);
					const nextSettings = {
						...this.state.settings,
						roundCastNames: nextRoundCastNames
					};
					const contestants = buildContestants(nextRoundCastNames);
					writeStoredSettings(nextSettings, this.activeProfileId);

					this.commit({
						...this.state,
						settings: nextSettings,
						contestants,
						activeContestantIndex: contestants.length > 0 ? 0 : -1,
						lastUpdatedAt: nowIso()
					});
					return this.state;
				}

				case 'start': {
					const nextSettings = command.settings
						? normalizeSettings({
							...this.state.settings,
							...command.settings
						})
						: this.state.settings;
					const contestants = buildContestants(nextSettings.roundCastNames);
					const nextIndex = contestants.length > 0 ? 0 : -1;
					const now = Date.now();
					const activeName =
						contestants[Math.max(nextIndex, 0)]?.name ?? 'Contestant';
					writeStoredSettings(nextSettings, this.activeProfileId);
					this.stopFinishTimer();

					this.commit({
						...this.state,
						settings: nextSettings,
						contestants,
						activeContestantIndex: Math.max(nextIndex, 0),
						totalAmount: 0,
						totalGiftSenders: 0,
						phase: 'live',
						collecting: true,
						startedAt: new Date(now).toISOString(),
						endsAt: new Date(now + nextSettings.durationSeconds * 1000).toISOString(),
						lastUpdatedAt: nowIso(),
						eventText: `${activeName} is now on stage.`
					});
					this.scheduleFinish(Date.parse(this.state.endsAt as string));
					return this.state;
				}

				case 'endRound': {
					return this.finishRound();
				}

				case 'setCollecting': {
					this.commit({
						...this.state,
						collecting: command.collecting,
						lastUpdatedAt: nowIso(),
						eventText: command.collecting ? 'Collection is enabled.' : 'Collection is paused.'
					});
					return this.state;
				}

				case 'addScore': {
					if (this.state.phase !== 'live' || !this.state.collecting) {
						return this.state;
					}
					const amount = Math.max(0, command.amount);
					const countGiftSender = command.countGiftSender ?? true;
					const contestants = this.state.contestants.map((contestant, index) =>
						index === this.state.activeContestantIndex
							? {
								...contestant,
								score: contestant.score + amount,
								giftSenders: contestant.giftSenders + (countGiftSender ? 1 : 0)
							}
							: contestant
					);
					const activeName = contestants[this.state.activeContestantIndex]?.name ?? 'Contestant';

					this.commit({
						...this.state,
						contestants,
						totalAmount: this.state.totalAmount + amount,
						totalGiftSenders: this.state.totalGiftSenders + (countGiftSender ? 1 : 0),
						lastUpdatedAt: nowIso(),
						eventText: countGiftSender
							? `${activeName} gained ${amount.toLocaleString()} points.`
							: `${activeName} received a manual +${amount.toLocaleString()} point adjustment.`
					});
					return this.state;
				}

				case 'transferScore': {
					if (this.state.phase !== 'live' && this.state.phase !== 'ended') {
						return this.state;
					}

					const sourceName = command.fromCastName.trim();
					const targetName = command.toCastName.trim();
					if (!sourceName || !targetName || sourceName === targetName) {
						return this.state;
					}

					const amount = Math.max(0, Math.floor(command.amount));
					if (amount <= 0) {
						return this.state;
					}

					const sourceIndex = this.state.contestants.findIndex((contestant) => contestant.name === sourceName);
					const targetIndex = this.state.contestants.findIndex((contestant) => contestant.name === targetName);
					if (sourceIndex < 0 || targetIndex < 0) {
						return this.state;
					}

					const transferAmount = Math.min(amount, this.state.contestants[sourceIndex]?.score ?? 0);
					if (transferAmount <= 0) {
						return this.state;
					}

					const contestants = this.state.contestants.map((contestant, index) => {
						if (index === sourceIndex) {
							return {
								...contestant,
								score: Math.max(contestant.score - transferAmount, 0)
							};
						}

						if (index === targetIndex) {
							return {
								...contestant,
								score: contestant.score + transferAmount
							};
						}

						return contestant;
					});

					this.commit({
						...this.state,
						contestants,
						lastUpdatedAt: nowIso(),
						eventText: `${transferAmount.toLocaleString()} points moved from ${sourceName} to ${targetName}.`
					});
					if (this.state.phase === 'ended') {
						const winningScore = Math.max(...this.state.contestants.map((contestant) => contestant.score), 0);
						recordScoreHistory(this.activeProfileId, {
							modeId: 'solo-target',
							modeLabel: 'Solo Stage',
							title: this.state.settings.title,
							startedAt: this.state.startedAt ?? nowIso(),
							endedAt: this.state.endsAt ?? nowIso(),
							totalScore: this.state.totalAmount,
							unallocatedScore: 0,
							winnerNames: winningScore > 0
								? this.state.contestants.filter((contestant) => contestant.score === winningScore).map((contestant) => contestant.name)
								: [],
							contestants: this.state.contestants.map(({ name, score }) => ({ name, score }))
						});
					}
					return this.state;
				}

				case 'resetScores': {
					this.stopFinishTimer();
					const contestants = this.state.contestants.map((contestant) => ({
						...contestant,
						score: 0,
						giftSenders: 0
					}));

					this.commit({
						...this.state,
						phase: 'idle',
						contestants,
						totalAmount: 0,
						totalGiftSenders: 0,
						collecting: false,
						startedAt: null,
						endsAt: null,
						lastUpdatedAt: nowIso(),
						eventText: 'Solo Stage has been reset.'
					});
					return this.state;
				}
			}
		}

		private finishRound(endedAt = nowIso()) {
			if (this.state.phase !== 'live') {
				return this.state;
			}
			this.stopFinishTimer();

			const activeName =
				this.state.contestants[this.state.activeContestantIndex]?.name ?? 'Contestant';
			const nextRoundCastNames = rotateRoundCastNames(
				this.state.contestants.map((contestant) => contestant.name)
			);
			const nextSettings = {
				...this.state.settings,
				roundCastNames: nextRoundCastNames
			};
			const contestants = buildContestants(nextRoundCastNames);
			const nextActiveName = contestants[0]?.name ?? '';
			writeStoredSettings(nextSettings, this.activeProfileId);
			const completedContestants = this.state.contestants.map(({ name }) => ({
				name,
				score: name === activeName ? this.state.totalAmount : 0
			}));
			const winningScore = this.state.totalAmount;

			this.commit({
				...this.state,
				settings: nextSettings,
				// Keep the completed contestants visible and editable until the next
				// round starts. The rotated roster is already stored in settings.
				contestants: this.state.contestants,
				activeContestantIndex: this.state.activeContestantIndex,
				phase: 'ended',
				collecting: false,
				endsAt: endedAt,
				lastUpdatedAt: nowIso(),
				eventText: nextActiveName
					? `${activeName}'s round has ended. ${nextActiveName} is up next.`
					: `${activeName}'s round has ended.`
			});
			recordScoreHistory(this.activeProfileId, {
				modeId: 'solo-target',
				modeLabel: 'Solo Stage',
				title: this.state.settings.title,
				startedAt: this.state.startedAt ?? endedAt,
				endedAt,
				totalScore: this.state.totalAmount,
				unallocatedScore: 0,
				winnerNames:
					winningScore > 0
						? completedContestants
							.filter((contestant) => contestant.score === winningScore)
							.map((contestant) => contestant.name)
						: [],
				contestants: completedContestants
			});
			return this.state;
		}

		private scheduleFinish(endAtMs: number) {
			this.stopFinishTimer();
			const delay = Math.max(endAtMs + GIFT_ARRIVAL_BUFFER_MS - Date.now(), 0);
			this.finishTimer = setTimeout(() => {
				this.finishTimer = null;
				this.finishRound(new Date(endAtMs).toISOString());
			}, delay);
		}

		private stopFinishTimer() {
			if (this.finishTimer) {
				clearTimeout(this.finishTimer);
				this.finishTimer = null;
			}
		}

		private commit(nextState: SoloStageState) {
			this.state = nextState;
			if (this.activeProfileId) {
				this.profileStateCache.set(this.activeProfileId, this.state);
			}
			for (const subscriber of this.subscribers) {
				subscriber(this.state);
			}
		}
	}

	export const soloStageStore = new SoloStageStore();
}


export const battleStore = BattleGame.battleStore;
export const stickerDanceStore = StickerDanceGame.stickerDanceStore;
export const groupPkStore = GroupPkGame.groupPkStore;
export const soloStageStore = SoloStageGame.soloStageStore;
