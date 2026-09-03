import { derived, get, writable } from 'svelte/store';
import { readLocalStudioCasts } from '$lib/client/studio-local-data';
import { sanitizeCastNameList } from '$lib/helpers';
import type { StudioCast, StudioProfileCastsResponse } from '$lib/app-types';

type StudioCastsStatus = 'idle' | 'loading' | 'ready' | 'error';

type StudioCastsState = {
	profileId: string | null;
	casts: StudioCast[];
	status: StudioCastsStatus;
	error: string | null;
};

type LoadStudioCastsOptions = {
	fallbackCasts?: StudioCast[];
};

const initialStudioCastsState: StudioCastsState = {
	profileId: null,
	casts: [],
	status: 'idle',
	error: null
};

const studioCastsStateStore = writable<StudioCastsState>(initialStudioCastsState);

let activeLoadId = 0;

function normalizeProfileId(profileId: string | null | undefined) {
	return profileId?.trim() || null;
}

export const studioCastsState = {
	subscribe: studioCastsStateStore.subscribe
};

export const studioCasts = derived(studioCastsStateStore, ($state) => $state.casts);

export const studioCastNames = derived(studioCasts, ($casts) =>
	sanitizeCastNameList($casts.map((cast) => cast.nickname))
);

export function setStudioCasts(
	profileId: string | null | undefined,
	casts: StudioCast[],
	status: StudioCastsStatus = 'ready'
) {
	activeLoadId += 1;
	studioCastsStateStore.set({
		profileId: normalizeProfileId(profileId),
		casts,
		status,
		error: null
	});
}

function clearStudioCasts() {
	activeLoadId += 1;
	studioCastsStateStore.set(initialStudioCastsState);
}

export async function loadStudioCasts(
	profileId: string | null | undefined,
	options: LoadStudioCastsOptions = {}
) {
	const normalizedProfileId = normalizeProfileId(profileId);
	if (!normalizedProfileId) {
		clearStudioCasts();
		return { ok: true, casts: [] } satisfies StudioProfileCastsResponse;
	}

	const loadId = activeLoadId + 1;
	activeLoadId = loadId;
	const currentState = get(studioCastsStateStore);
	const fallbackCasts =
		options.fallbackCasts ?? (currentState.profileId === normalizedProfileId ? currentState.casts : []);

	studioCastsStateStore.update((state) => ({
		profileId: normalizedProfileId,
		casts: state.profileId === normalizedProfileId ? state.casts : fallbackCasts,
		status: 'loading',
		error: null
	}));

	try {
		const response = readLocalStudioCasts(normalizedProfileId);
		const casts = response.casts.length === 0 && fallbackCasts.length > 0 ? fallbackCasts : response.casts;
		if (activeLoadId === loadId) {
			setStudioCasts(normalizedProfileId, casts);
		}
		return { ok: true, casts } satisfies StudioProfileCastsResponse;
	} catch (error) {
		if (activeLoadId === loadId) {
			studioCastsStateStore.update((state) => ({
				...state,
				status: 'error',
				error: error instanceof Error ? error.message : 'Failed to load profile casts.'
			}));
		}
		throw error;
	}
}
