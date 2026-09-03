import { normalizeGameSettings, trimValue } from '$lib/helpers';
import type {
	ProfileGameSetting,
	ProfileGameSettingsResponse,
	StudioCast,
	StudioProfileCastsResponse
} from '$lib/app-types';

const LOCAL_DATA_VERSION = 1;
const PROFILE_DATA_PREFIX = 'streamplay-studio-profile-data';

type LocalProfileData = {
	version: number;
	gameSettings: ProfileGameSetting[];
	casts: StudioCast[];
};

function profileStorageKey(profileId: string) {
	return `${PROFILE_DATA_PREFIX}:${profileId}`;
}

function canUseLocalStorage() {
	try {
		return typeof window !== 'undefined' && Boolean(window.localStorage);
	} catch {
		return false;
	}
}

function emptyProfileData(): LocalProfileData {
	return {
		version: LOCAL_DATA_VERSION,
		gameSettings: [],
		casts: []
	};
}

function createLocalId() {
	return globalThis.crypto?.randomUUID?.() ?? `local-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function sanitizeProfileData(value: unknown): LocalProfileData {
	const source = value && typeof value === 'object' ? (value as Partial<LocalProfileData>) : {};
	const casts = Array.isArray(source.casts)
		? source.casts
				.map((cast) => {
					const entry = cast && typeof cast === 'object' ? (cast as Partial<StudioCast>) : {};
					const nickname = trimValue(entry.nickname);
					if (!nickname) {
						return null;
					}

					return {
						id: trimValue(entry.id) || createLocalId(),
						username: trimValue(entry.username),
						nickname,
						createdAt: trimValue(entry.createdAt) || new Date().toISOString()
					} satisfies StudioCast;
				})
				.filter((cast): cast is StudioCast => Boolean(cast))
		: [];

	return {
		version: LOCAL_DATA_VERSION,
		gameSettings: normalizeGameSettings(source.gameSettings),
		casts
	};
}

function readLocalProfileData(profileId: string | null | undefined): LocalProfileData {
	const normalizedProfileId = trimValue(profileId);
	if (!normalizedProfileId || !canUseLocalStorage()) {
		return emptyProfileData();
	}

	try {
		return sanitizeProfileData(
			JSON.parse(window.localStorage.getItem(profileStorageKey(normalizedProfileId)) || 'null')
		);
	} catch {
		return emptyProfileData();
	}
}

function writeLocalProfileData(
	profileId: string | null | undefined,
	data: LocalProfileData
) {
	const normalizedProfileId = trimValue(profileId);
	if (!normalizedProfileId || !canUseLocalStorage()) {
		return;
	}

	window.localStorage.setItem(
		profileStorageKey(normalizedProfileId),
		JSON.stringify(sanitizeProfileData(data))
	);
}

export function readLocalProfileGameSettings(
	profileId: string | null | undefined
): ProfileGameSettingsResponse {
	return {
		ok: true,
		gameSettings: readLocalProfileData(profileId).gameSettings
	};
}

export function writeLocalProfileGameSettings(
	profileId: string | null | undefined,
	gameSettings: ProfileGameSetting[]
) {
	const current = readLocalProfileData(profileId);
	writeLocalProfileData(profileId, {
		...current,
		gameSettings
	});
}

export function upsertLocalProfileGameSetting(
	profileId: string | null | undefined,
	gameKey: string,
	config: Record<string, unknown>
) {
	const current = readLocalProfileData(profileId);
	const nextEntry: ProfileGameSetting = {
		gameKey,
		updatedAt: new Date().toISOString(),
		config
	};
	const gameSettings = [
		...current.gameSettings.filter((entry) => entry.gameKey !== gameKey),
		nextEntry
	];

	writeLocalProfileData(profileId, {
		...current,
		gameSettings
	});

	return {
		ok: true,
		gameSettings
	} satisfies ProfileGameSettingsResponse;
}

export function readLocalStudioCasts(
	profileId: string | null | undefined
): StudioProfileCastsResponse {
	return {
		ok: true,
		casts: readLocalProfileData(profileId).casts
	};
}

export function writeLocalStudioCasts(
	profileId: string | null | undefined,
	casts: StudioCast[]
) {
	const current = readLocalProfileData(profileId);
	writeLocalProfileData(profileId, {
		...current,
		casts
	});

	return {
		ok: true,
		casts
	} satisfies StudioProfileCastsResponse;
}
