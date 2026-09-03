import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { env as privateEnv } from '$env/dynamic/private';
import { trimValue } from '$lib/helpers';
import type {
	DailyScoreHistory,
	LiveSessionGiftHistory,
	LiveSessionGameHistory,
	LiveSessionGameSnapshot,
	LiveSessionHistoryEntry,
	NewLiveSessionHistoryEntry,
	ScoreHistoryContestant,
	ScoreHistoryEntry,
	ScoreHistoryModeId,
	ScoreHistoryResponse
} from '$lib/app-types';

type ProfileScoreHistory = {
	entries: ScoreHistoryEntry[];
	liveSessions: LiveSessionHistoryEntry[];
};

type StoredScoreHistory = {
	profiles: Record<string, ProfileScoreHistory>;
};

type NewScoreHistoryEntry = Omit<ScoreHistoryEntry, 'id' | 'dayKey'>;

const DEFAULT_TIME_ZONE = 'Asia/Dubai';
const MODE_LABELS: Record<ScoreHistoryModeId, string> = {
	'battle-ladder': '1v1 PK',
	'group-sticker': 'Group Sticker',
	'group-pk': 'Group PK',
	'solo-target': 'Solo Stage'
};

let cachedHistory: StoredScoreHistory | null = null;

function scoreHistoryFilePath() {
	const explicitPath = trimValue(privateEnv.STREAMPLAY_STUDIO_SCORE_HISTORY_FILE ?? '');
	if (explicitPath) return explicitPath;

	const userDataPath = trimValue(
		privateEnv.STREAMPLAY_STUDIO_USER_DATA_DIR || privateEnv.STREAMPLAY_USER_DATA_DIR || ''
	);
	return userDataPath
		? path.join(userDataPath, 'score-history.json')
		: path.join(process.cwd(), '.studio-data', 'score-history.json');
}

function historyTimeZone() {
	const requested = trimValue(privateEnv.STREAMPLAY_STUDIO_TIME_ZONE ?? '') || DEFAULT_TIME_ZONE;
	try {
		new Intl.DateTimeFormat('en-CA', { timeZone: requested }).format(new Date());
		return requested;
	} catch {
		return DEFAULT_TIME_ZONE;
	}
}

function dayKeyFor(isoDate: string) {
	const parts = new Intl.DateTimeFormat('en-CA', {
		timeZone: historyTimeZone(),
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	}).formatToParts(new Date(isoDate));
	const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
	return `${value.year}-${value.month}-${value.day}`;
}

function positiveInteger(value: unknown) {
	const number = Math.floor(Number(value));
	return Number.isFinite(number) ? Math.max(number, 0) : 0;
}

function sanitizeContestants(value: unknown): ScoreHistoryContestant[] {
	if (!Array.isArray(value)) return [];
	return value
		.map((row) => {
			const source = row && typeof row === 'object' ? (row as Partial<ScoreHistoryContestant>) : {};
			return { name: trimValue(String(source.name ?? '')), score: positiveInteger(source.score) };
		})
		.filter((row) => Boolean(row.name));
}

function optionalText(value: unknown) {
	const normalized = trimValue(String(value ?? ''));
	return normalized || undefined;
}

function sanitizeGifts(value: unknown): LiveSessionGiftHistory[] {
	if (!Array.isArray(value)) return [];
	return value
		.map<LiveSessionGiftHistory | null>((item) => {
			if (!item || typeof item !== 'object') return null;
			const source = item as Partial<LiveSessionGiftHistory>;
			const giftName = trimValue(String(source.giftName ?? ''));
			const capturedAt = trimValue(String(source.capturedAt ?? ''));
			if (!giftName || !capturedAt || !Number.isFinite(Date.parse(capturedAt))) return null;
			const coins = positiveInteger(source.coins);
			return {
				id: trimValue(String(source.id ?? '')) || randomUUID(),
				capturedAt,
				viewerName: trimValue(String(source.viewerName ?? '')) || 'Viewer',
				viewerUsername: optionalText(source.viewerUsername),
				viewerAvatarUrl: optionalText(source.viewerAvatarUrl),
				giftId: optionalText(source.giftId),
				giftName,
				giftImageUrl: optionalText(source.giftImageUrl),
				count: positiveInteger(source.count),
				coins,
				allocatedCoins: Math.min(positiveInteger(source.allocatedCoins), coins),
				unallocatedCoins: Math.min(positiveInteger(source.unallocatedCoins), coins),
				allocatedTo: optionalText(source.allocatedTo),
				allocationModeId: isModeId(source.allocationModeId) ? source.allocationModeId : undefined,
				allocationModeLabel: optionalText(source.allocationModeLabel),
				allocatedAt: optionalText(source.allocatedAt),
				allocationReason: optionalText(source.allocationReason),
				gameSessionId: optionalText(source.gameSessionId)
			};
		})
		.filter((gift): gift is LiveSessionGiftHistory => gift !== null);
}

function sanitizeGameSessions(value: unknown): LiveSessionGameHistory[] {
	if (!Array.isArray(value)) return [];
	return value
		.map<LiveSessionGameHistory | null>((item) => {
			if (!item || typeof item !== 'object') return null;
			const source = item as Partial<LiveSessionGameHistory>;
			if (!isModeId(source.modeId)) return null;
			const startedAt = trimValue(String(source.startedAt ?? ''));
			const endedAt = trimValue(String(source.endedAt ?? ''));
			if (!Number.isFinite(Date.parse(startedAt)) || !Number.isFinite(Date.parse(endedAt))) return null;
			return {
				id: trimValue(String(source.id ?? '')) || randomUUID(),
				modeId: source.modeId,
				modeLabel: trimValue(String(source.modeLabel ?? '')) || MODE_LABELS[source.modeId],
				startedAt,
				endedAt,
				totalCoins: positiveInteger(source.totalCoins),
				allocatedCoins: positiveInteger(source.allocatedCoins),
				unallocatedCoins: positiveInteger(source.unallocatedCoins),
				rows: sanitizeContestants(source.rows),
				snapshots: sanitizeGameSnapshots(source.snapshots),
				gifts: sanitizeGifts(source.gifts)
			};
		})
		.filter((game): game is LiveSessionGameHistory => game !== null);
}

function sanitizeGameSnapshots(value: unknown): LiveSessionGameSnapshot[] {
	if (!Array.isArray(value)) return [];
	return value
		.map<LiveSessionGameSnapshot | null>((item) => {
			if (!item || typeof item !== 'object') return null;
			const source = item as Partial<LiveSessionGameSnapshot>;
			if (!isModeId(source.modeId)) return null;
			const capturedAt = trimValue(String(source.capturedAt ?? ''));
			if (!capturedAt || !Number.isFinite(Date.parse(capturedAt))) return null;
			return {
				id: trimValue(String(source.id ?? '')) || randomUUID(),
				modeId: source.modeId,
				modeLabel: trimValue(String(source.modeLabel ?? '')) || MODE_LABELS[source.modeId],
				reason: trimValue(String(source.reason ?? '')) || 'game-update',
				capturedAt,
				totalCoins: positiveInteger(source.totalCoins),
				allocatedCoins: positiveInteger(source.allocatedCoins),
				unallocatedCoins: positiveInteger(source.unallocatedCoins),
				rows: sanitizeContestants(source.rows)
			};
		})
		.filter((snapshot): snapshot is LiveSessionGameSnapshot => snapshot !== null);
}

function sanitizeLiveSession(value: unknown): LiveSessionHistoryEntry | null {
	if (!value || typeof value !== 'object') return null;
	const source = value as Partial<LiveSessionHistoryEntry>;
	const startedAt = trimValue(String(source.startedAt ?? ''));
	const endedAt = trimValue(String(source.endedAt ?? ''));
	if (!startedAt || !endedAt || !Number.isFinite(Date.parse(startedAt)) || !Number.isFinite(Date.parse(endedAt))) {
		return null;
	}
	const gifts = sanitizeGifts(source.gifts);
	const giftCount = gifts.reduce((total, gift) => total + gift.count, 0);
	const capturedCoins = gifts.reduce((total, gift) => total + gift.coins, 0);
	const gameSnapshots = sanitizeGameSnapshots(source.gameSnapshots);
	const gameSessions = sanitizeGameSessions(source.gameSessions);
	return {
		id: trimValue(String(source.id ?? '')) || randomUUID(),
		dayKey: /^\d{4}-\d{2}-\d{2}$/.test(String(source.dayKey ?? ''))
			? String(source.dayKey)
			: dayKeyFor(endedAt),
		uniqueId: trimValue(String(source.uniqueId ?? '')),
		roomId: optionalText(source.roomId),
		startedAt,
		endedAt,
		durationSeconds: Math.max(Math.floor((Date.parse(endedAt) - Date.parse(startedAt)) / 1000), 0),
		totalGiftCount: Math.max(positiveInteger(source.totalGiftCount), giftCount),
		totalCapturedCoins: Math.max(positiveInteger(source.totalCapturedCoins), capturedCoins),
		allocatedCoins: positiveInteger(source.allocatedCoins),
		unallocatedCoins: positiveInteger(source.unallocatedCoins),
		totalViews: positiveInteger(source.totalViews),
		totalLikes: positiveInteger(source.totalLikes),
		totalFollows: positiveInteger(source.totalFollows),
		peakViewers: positiveInteger(source.peakViewers),
		outsideGameScores: sanitizeContestants(source.outsideGameScores),
		gifts,
		gameSnapshots,
		gameSessions: gameSessions.length > 0
			? gameSessions
			: gameSnapshots.map((snapshot) => ({
					id: snapshot.id,
					modeId: snapshot.modeId,
					modeLabel: snapshot.modeLabel,
					startedAt: snapshot.capturedAt,
					endedAt: snapshot.capturedAt,
					totalCoins: snapshot.totalCoins,
					allocatedCoins: snapshot.allocatedCoins,
					unallocatedCoins: snapshot.unallocatedCoins,
					rows: snapshot.rows,
					snapshots: [snapshot],
					gifts: gifts.filter((gift) => gift.allocationModeId === snapshot.modeId)
				}))
	};
}

function isModeId(value: unknown): value is ScoreHistoryModeId {
	return typeof value === 'string' && value in MODE_LABELS;
}

function sanitizeEntry(value: unknown): ScoreHistoryEntry | null {
	if (!value || typeof value !== 'object') return null;
	const source = value as Partial<ScoreHistoryEntry>;
	if (!isModeId(source.modeId)) return null;
	const startedAt = trimValue(String(source.startedAt ?? ''));
	const endedAt = trimValue(String(source.endedAt ?? ''));
	if (!startedAt || !endedAt || !Number.isFinite(Date.parse(endedAt))) return null;
	const contestants = sanitizeContestants(source.contestants);
	const allocatedScore = contestants.reduce((total, row) => total + row.score, 0);
	const unallocatedScore = positiveInteger(source.unallocatedScore);
	return {
		id: trimValue(String(source.id ?? '')) || randomUUID(),
		modeId: source.modeId,
		modeLabel: trimValue(String(source.modeLabel ?? '')) || MODE_LABELS[source.modeId],
		title: trimValue(String(source.title ?? '')) || MODE_LABELS[source.modeId],
		dayKey: /^\d{4}-\d{2}-\d{2}$/.test(String(source.dayKey ?? ''))
			? String(source.dayKey)
			: dayKeyFor(endedAt),
		startedAt,
		endedAt,
		totalScore: Math.max(positiveInteger(source.totalScore), allocatedScore + unallocatedScore),
		unallocatedScore,
		winnerNames: Array.isArray(source.winnerNames)
			? source.winnerNames.map((name) => trimValue(String(name))).filter(Boolean)
			: [],
		contestants
	};
}

function readHistory(): StoredScoreHistory {
	if (cachedHistory) return cachedHistory;
	try {
		const parsed = JSON.parse(fs.readFileSync(scoreHistoryFilePath(), 'utf8')) as Partial<StoredScoreHistory>;
		cachedHistory = {
			profiles: Object.fromEntries(
				Object.entries(parsed.profiles ?? {}).map(([profileId, storedProfile]) => {
					const legacyEntries = Array.isArray(storedProfile) ? storedProfile : [];
					const profile = !Array.isArray(storedProfile) && storedProfile && typeof storedProfile === 'object'
						? (storedProfile as Partial<ProfileScoreHistory>)
						: {};
					return [profileId, {
						entries: (legacyEntries.length ? legacyEntries : Array.isArray(profile.entries) ? profile.entries : [])
							.map(sanitizeEntry)
							.filter((entry): entry is ScoreHistoryEntry => entry !== null),
						liveSessions: (Array.isArray(profile.liveSessions) ? profile.liveSessions : [])
							.map(sanitizeLiveSession)
							.filter((session): session is LiveSessionHistoryEntry => session !== null)
					}];
				})
			)
		};
	} catch {
		cachedHistory = { profiles: {} };
	}
	return cachedHistory;
}

function writeHistory(history: StoredScoreHistory) {
	const filePath = scoreHistoryFilePath();
	fs.mkdirSync(path.dirname(filePath), { recursive: true });
	const temporaryPath = `${filePath}.${process.pid}.tmp`;
	fs.writeFileSync(temporaryPath, `${JSON.stringify(history, null, 2)}\n`, 'utf8');
	fs.renameSync(temporaryPath, filePath);
	cachedHistory = history;
}

export function recordScoreHistory(profileId: string | null, input: NewScoreHistoryEntry) {
	const normalizedProfileId = trimValue(profileId ?? '');
	if (!normalizedProfileId) return null;
	const entry = sanitizeEntry({ ...input, id: randomUUID(), dayKey: dayKeyFor(input.endedAt) });
	if (!entry) return null;

	const current = readHistory();
	const previousEntries = current.profiles[normalizedProfileId]?.entries ?? [];
	const existing = previousEntries.find(
		(candidate) => candidate.modeId === entry.modeId && candidate.startedAt === entry.startedAt
	);
	const storedEntry = existing
		? { ...entry, id: existing.id, dayKey: existing.dayKey, endedAt: existing.endedAt }
		: entry;
	writeHistory({
		profiles: {
			...current.profiles,
			[normalizedProfileId]: {
				entries: [
					storedEntry,
					...previousEntries.filter((candidate) => candidate.id !== existing?.id)
				],
				liveSessions: current.profiles[normalizedProfileId]?.liveSessions ?? []
			}
		}
	});
	return storedEntry;
}

export function recordLiveSessionHistory(profileId: string | null, input: NewLiveSessionHistoryEntry) {
	const normalizedProfileId = trimValue(profileId ?? '');
	if (!normalizedProfileId) return null;
	const requestedSessionId = trimValue(String(input.id ?? ''));
	const session = sanitizeLiveSession({
		...input,
		id: requestedSessionId || randomUUID(),
		dayKey: dayKeyFor(input.endedAt)
	});
	if (!session) return null;
	const current = readHistory();
	const previousSessions = current.profiles[normalizedProfileId]?.liveSessions ?? [];
	writeHistory({ profiles: {
		...current.profiles,
		[normalizedProfileId]: {
			entries: current.profiles[normalizedProfileId]?.entries ?? [],
			liveSessions: [
				session,
				...previousSessions.filter((candidate) => candidate.id !== session.id)
			]
		}
	} });
	return session;
}

function dailySummaries(entries: ScoreHistoryEntry[], liveSessions: LiveSessionHistoryEntry[]): DailyScoreHistory[] {
	const days = new Map<string, DailyScoreHistory>();
	for (const entry of entries) {
		const day = days.get(entry.dayKey) ?? {
			dayKey: entry.dayKey,
			calculationCount: 0,
			liveSessionCount: 0,
			totalGiftCount: 0,
			totalScore: 0,
			unallocatedScore: 0,
			modeTotals: {},
			castTotals: []
		};
		day.calculationCount += 1;
		day.totalScore += entry.totalScore;
		day.unallocatedScore += entry.unallocatedScore;
		day.modeTotals[entry.modeId] = (day.modeTotals[entry.modeId] ?? 0) + entry.totalScore;
		const castTotals = new Map(day.castTotals.map((row) => [row.name, row.score]));
		for (const contestant of entry.contestants) {
			castTotals.set(contestant.name, (castTotals.get(contestant.name) ?? 0) + contestant.score);
		}
		day.castTotals = Array.from(castTotals, ([name, score]) => ({ name, score })).sort(
			(left, right) => right.score - left.score || left.name.localeCompare(right.name)
		);
		days.set(entry.dayKey, day);
	}
	for (const session of liveSessions) {
		const day = days.get(session.dayKey) ?? {
			dayKey: session.dayKey,
			calculationCount: 0,
			liveSessionCount: 0,
			totalGiftCount: 0,
			totalScore: 0,
			unallocatedScore: 0,
			modeTotals: {},
			castTotals: []
		};
		day.liveSessionCount += 1;
		day.totalGiftCount += session.totalGiftCount;
		const outsideGifts = session.gifts.filter((gift) => !gift.gameSessionId);
		const outsideCoins = outsideGifts.reduce((total, gift) => total + gift.coins, 0);
		const outsideUnallocated = outsideGifts.reduce((total, gift) => total + gift.unallocatedCoins, 0);
		// Completed game calculations already contribute their round totals. Only add the
		// session-scoped gifts in that case so the same coins are never counted twice.
		if (session.gameSessions.length === 0) {
			day.totalScore += session.totalCapturedCoins;
			day.unallocatedScore += session.unallocatedCoins;
		} else {
			day.totalScore += outsideCoins;
			day.unallocatedScore += outsideUnallocated;
		}
		const castTotals = new Map(day.castTotals.map((row) => [row.name, row.score]));
		for (const contestant of session.outsideGameScores) {
			castTotals.set(contestant.name, (castTotals.get(contestant.name) ?? 0) + contestant.score);
		}
		day.castTotals = Array.from(castTotals, ([name, score]) => ({ name, score })).sort(
			(left, right) => right.score - left.score || left.name.localeCompare(right.name)
		);
		days.set(session.dayKey, day);
	}
	return Array.from(days.values()).sort((left, right) => right.dayKey.localeCompare(left.dayKey));
}

export function getScoreHistory(profileId: string | null): ScoreHistoryResponse {
	const normalizedProfileId = trimValue(profileId ?? '');
	const profile = normalizedProfileId ? readHistory().profiles[normalizedProfileId] : undefined;
	const entries = [...(profile?.entries ?? [])];
	const liveSessions = [...(profile?.liveSessions ?? [])];
	entries.sort((left, right) => right.endedAt.localeCompare(left.endedAt));
	liveSessions.sort((left, right) => right.endedAt.localeCompare(left.endedAt));
	return { timeZone: historyTimeZone(), days: dailySummaries(entries, liveSessions), entries, liveSessions };
}
