import { trimValue } from '$lib/helpers';
import type {
	AuthLoginResponse,
	AuthSessionRefreshResponse,
	PersistedAuthSession,
	NewLiveSessionHistoryEntry,
	ScoreHistoryResponse,
	StudioBootstrap
} from '$lib/app-types';

const REFRESH_LEEWAY_SECONDS = 60;

let authSession: PersistedAuthSession | null = null;
let initialized = false;
let syncPromise: Promise<PersistedAuthSession | null> | null = null;

export class ApiError extends Error {
	status: number;

	constructor(status: number, message: string) {
		super(message);
		this.name = 'ApiError';
		this.status = status;
	}
}

type LoginRequest =
	| {
			tiktokProfileId: string;
			password: string;
	  }
	| {
			email: string;
			password: string;
	  };

async function parseError(response: Response, fallback: string) {
	const raw = (await response.text()).trim();
	if (!raw) {
		return fallback;
	}

	try {
		const payload = JSON.parse(raw) as { error?: string; message?: string };
		return payload.error || payload.message || raw;
	} catch {
		return raw;
	}
}

async function requestJson<T>(input: RequestInfo | URL, init?: RequestInit) {
	const response = await fetch(input, init);
	if (!response.ok) {
		throw new ApiError(response.status, await parseError(response, 'Request failed.'));
	}

	return (await response.json()) as T;
}

async function loginRequest(payload: LoginRequest) {
	return requestJson<AuthLoginResponse>('/api/auth/login', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			accept: 'application/json'
		},
		body: JSON.stringify(payload)
	});
}

async function sessionRequest() {
	return requestJson<AuthSessionRefreshResponse>('/api/auth/session', {
		method: 'POST',
		headers: {
			accept: 'application/json'
		}
	});
}

async function logoutRequest() {
	return requestJson<{ ok: true }>('/api/auth/logout', {
		method: 'POST',
		headers: {
			accept: 'application/json'
		}
	});
}

function toAuthSession(payload: AuthLoginResponse | AuthSessionRefreshResponse): PersistedAuthSession {
	return {
		userId: trimValue(payload.userId),
		sessionId: trimValue(payload.sessionId),
		tiktokProfileId: trimValue(payload.tiktokProfileId),
		accessToken: trimValue(payload.accessToken),
		refreshToken: trimValue(payload.refreshToken),
		accessTokenExpiresAt: payload.accessTokenExpiresAt
	};
}

function setAuthSession(payload: AuthLoginResponse | AuthSessionRefreshResponse) {
	authSession = toAuthSession(payload);
	initialized = true;
	return authSession;
}

function clearAuthSession() {
	authSession = null;
	initialized = true;
}

function isTokenExpiringSoon(session: PersistedAuthSession | null) {
	if (!session) {
		return true;
	}

	return session.accessTokenExpiresAt - Math.floor(Date.now() / 1000) <= REFRESH_LEEWAY_SECONDS;
}

async function syncSessionInternal() {
	try {
		return setAuthSession(await sessionRequest());
	} catch (error) {
		if (error instanceof ApiError && [401, 403].includes(error.status)) {
			clearAuthSession();
			return null;
		}

		throw error;
	}
}

export async function initializeAuthSession() {
	if (initialized && authSession) {
		return authSession;
	}

	return syncSessionInternal();
}

export async function refreshAuthSession() {
	if (syncPromise) {
		return syncPromise;
	}

	syncPromise = syncSessionInternal().finally(() => {
		syncPromise = null;
	});

	return syncPromise;
}

async function ensureFreshAuthSession(options: { force?: boolean } = {}) {
	const current = authSession;
	if (!current) {
		return initializeAuthSession();
	}

	if (!options.force && !isTokenExpiringSoon(current)) {
		return current;
	}

	return refreshAuthSession();
}

export async function loginToAuthSession(identifier: string, password: string) {
	const trimmedIdentifier = trimValue(identifier);
	const payload = await loginRequest(
		trimmedIdentifier.includes('@')
			? {
					email: trimmedIdentifier,
					password
				}
			: {
					tiktokProfileId: trimmedIdentifier,
					password
			}
	);

	return setAuthSession(payload);
}

export async function logoutFromAuthSession() {
	try {
		await logoutRequest();
	} catch {}

	clearAuthSession();
}

export async function requestProtectedResponse(input: RequestInfo | URL, init?: RequestInit) {
	const currentSession = await ensureFreshAuthSession();
	if (!currentSession) {
		await logoutFromAuthSession();
		throw new ApiError(401, 'Authentication is required.');
	}

	const response = await fetch(input, init);
	if (response.status === 401 || response.status === 403) {
		await logoutFromAuthSession();
		throw new ApiError(response.status, 'Authentication is required.');
	}

	return response;
}

async function requestProtectedJson<T>(input: RequestInfo | URL, init?: RequestInit) {
	const response = await requestProtectedResponse(input, init);

	if (!response.ok) {
		throw new ApiError(response.status, await parseError(response, 'Request failed.'));
	}

	return (await response.json()) as T;
}

export async function getStudioBootstrapRequest() {
	return requestProtectedJson<StudioBootstrap>('/api/studio/bootstrap', {
		headers: {
			accept: 'application/json'
		}
	});
}

function profileRequestHeaders(profileId: string, initialHeaders?: HeadersInit) {
	const headers = new Headers(initialHeaders);
	headers.set('x-streamplay-studio-profile-id', trimValue(profileId));
	return headers;
}

export async function getScoreHistoryRequest(profileId: string) {
	return requestProtectedJson<ScoreHistoryResponse>('/api/studio/score-history', {
		headers: profileRequestHeaders(profileId, { accept: 'application/json' })
	});
}

export async function saveLiveSessionHistoryRequest(
	profileId: string,
	session: NewLiveSessionHistoryEntry
) {
	return requestProtectedJson<{ ok: true }>('/api/studio/score-history', {
		method: 'POST',
		headers: profileRequestHeaders(profileId, {
			'Content-Type': 'application/json',
			accept: 'application/json'
		}),
		body: JSON.stringify(session)
	});
}
