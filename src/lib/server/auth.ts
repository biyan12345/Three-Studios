import { error, type Cookies } from '@sveltejs/kit';
import { normalizeTikTokUsername, trimValue } from '$lib/helpers';
import { studioBackendUrl } from '$lib/server/backend-config';
import type {
	AuthLoginResponse,
	AuthSessionTokens,
	AuthSessionRefreshResponse,
	PersistedAuthSession
} from '$lib/app-types';

const AUTH_TOKEN_COOKIE_NAME = 'streamplay_studio_auth_token';
const REFRESH_TOKEN_COOKIE_NAME = 'streamplay_studio_refresh_token';
const AUTH_STATE_COOKIE_NAME = 'streamplay_studio_auth_state';
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

type StoredAuthState = {
	userId: string;
	sessionId: string;
	tiktokProfileId: string;
	accessTokenExpiresAt: number;
};

type BackendResolvedAuthSession = {
	payload: PersistedAuthSession;
	response: AuthLoginResponse | AuthSessionRefreshResponse;
};

type BackendLoginInput =
	| {
			tiktokProfileId: string;
			password: string;
	  }
	| {
			email: string;
			password: string;
	  };

export type BackendLoginResult =
	| {
			ok: true;
			session: BackendResolvedAuthSession;
	  }
	| {
			ok: false;
			status: number;
			error: string;
	  };

export type BackendSessionReadResult =
	| {
			kind: 'session';
			session: BackendResolvedAuthSession;
	  }
	| {
			kind: 'anonymous';
	  }
	| {
			kind: 'forbidden';
			error: string;
	  }
	| {
			kind: 'unavailable';
			error: string;
	  };

function normalizeBaseUrl(baseUrl: string) {
	return baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
}

export function buildBackendUrl(pathname: string, search = '') {
	const configuredUrl = studioBackendUrl().trim();
	if (!configuredUrl) {
		throw new Error('Streamplay Studio backend URL is not configured.');
	}

	const baseUrl = normalizeBaseUrl(configuredUrl);
	return new URL(`${pathname.replace(/^\/+/, '')}${search}`, baseUrl);
}

export function createBackendAuthHeaders(
	locals: App.Locals,
	initialHeaders?: HeadersInit
) {
	if (!locals.authSession) {
		throw error(401, 'Authentication is required.');
	}

	const headers = new Headers(initialHeaders);
	headers.set('Authorization', `Bearer ${locals.authSession.accessToken}`);
	headers.set('X-Streamplay-Studio-User-Id', locals.authSession.userId);
	headers.set('X-Streamplay-Studio-Session-Id', locals.authSession.sessionId);

	return headers;
}

function cookieOptions() {
	return {
		path: '/',
		httpOnly: true,
		sameSite: 'strict' as const,
		secure: false,
		maxAge: COOKIE_MAX_AGE_SECONDS,
		expires: new Date(Date.now() + COOKIE_MAX_AGE_SECONDS * 1000)
	};
}

function authStateFromPayload(payload: PersistedAuthSession): StoredAuthState {
	return {
		userId: payload.userId,
		sessionId: payload.sessionId,
		tiktokProfileId: payload.tiktokProfileId,
		accessTokenExpiresAt: payload.accessTokenExpiresAt
	};
}

function parseStoredAuthState(raw: string | null | undefined) {
	if (!raw) {
		return null;
	}

	try {
		const parsed = JSON.parse(raw) as Partial<StoredAuthState> | null;
		if (!parsed || typeof parsed !== 'object') {
			return null;
		}

		const userId = trimValue(String(parsed.userId ?? ''));
		const sessionId = trimValue(String(parsed.sessionId ?? ''));
		const tiktokProfileId = normalizeTikTokUsername(String(parsed.tiktokProfileId ?? ''));
		const accessTokenExpiresAt = Number.parseInt(String(parsed.accessTokenExpiresAt ?? ''), 10);

		if (
			!userId ||
			!sessionId ||
			!tiktokProfileId ||
			!Number.isFinite(accessTokenExpiresAt)
		) {
			return null;
		}

		return {
			userId,
			sessionId,
			tiktokProfileId,
			accessTokenExpiresAt
		} satisfies StoredAuthState;
	} catch {
		return null;
	}
}

function readBackendError(payload: unknown, fallback: string) {
	if (!payload || typeof payload !== 'object') {
		return fallback;
	}

	const record = payload as Record<string, unknown>;
	const message = record.error ?? record.message ?? record.detail ?? record.reason;

	return typeof message === 'string' && message.trim() ? message.trim() : fallback;
}

function normalizeSessionTokensPayload(payload: unknown) {
	if (!payload || typeof payload !== 'object') {
		return null;
	}

	const root = payload as Record<string, unknown>;
	if (root.ok !== true) {
		return null;
	}

	const userId = trimValue(String(root.userId ?? ''));
	const sessionId = trimValue(String(root.sessionId ?? ''));
	const tiktokProfileId = normalizeTikTokUsername(String(root.tiktokProfileId ?? ''));
	const accessToken = trimValue(String(root.accessToken ?? ''));
	const refreshToken = trimValue(String(root.refreshToken ?? ''));
	const tokenType = trimValue(String(root.tokenType ?? ''));
	const accessTokenExpiresAt = Number.parseInt(String(root.accessTokenExpiresAt ?? ''), 10);
	const accessTokenExpiresIn = Number.parseInt(String(root.accessTokenExpiresIn ?? ''), 10);

	if (
		!userId ||
		!sessionId ||
		!tiktokProfileId ||
		!accessToken ||
		!refreshToken ||
		!tokenType ||
		!Number.isFinite(accessTokenExpiresAt) ||
		!Number.isFinite(accessTokenExpiresIn)
	) {
		return null;
	}

	return {
		ok: true,
		userId,
		sessionId,
		tiktokProfileId,
		accessToken,
		refreshToken,
		tokenType,
		accessTokenExpiresAt,
		accessTokenExpiresIn
	} satisfies AuthSessionTokens;
}

function resolvePersistedSession(payload: AuthSessionTokens) {
	return {
		userId: payload.userId,
		sessionId: payload.sessionId,
		tiktokProfileId: payload.tiktokProfileId,
		accessToken: payload.accessToken,
		refreshToken: payload.refreshToken,
		accessTokenExpiresAt: payload.accessTokenExpiresAt
	} satisfies PersistedAuthSession;
}

function normalizeLoginPayload(payload: unknown) {
	const normalizedPayload = normalizeSessionTokensPayload(payload);
	if (!normalizedPayload) {
		return null;
	}

	const loginPayload = normalizedPayload satisfies AuthLoginResponse;

	const persistedPayload = resolvePersistedSession(loginPayload);
	return {
		payload: persistedPayload,
		response: loginPayload
	} satisfies BackendResolvedAuthSession;
}

function readBackendAuthToken(cookies: Cookies) {
	return trimValue(cookies.get(AUTH_TOKEN_COOKIE_NAME));
}

function readBackendRefreshToken(cookies: Cookies) {
	return trimValue(cookies.get(REFRESH_TOKEN_COOKIE_NAME));
}

function writeBackendAuthTokens(
	cookies: Cookies,
	accessToken: string,
	refreshToken: string
) {
	cookies.set(AUTH_TOKEN_COOKIE_NAME, accessToken, cookieOptions());
	cookies.set(REFRESH_TOKEN_COOKIE_NAME, refreshToken, cookieOptions());
}

function writeBackendAuthState(cookies: Cookies, payload: PersistedAuthSession) {
	cookies.set(
		AUTH_STATE_COOKIE_NAME,
		JSON.stringify(authStateFromPayload(payload)),
		cookieOptions()
	);
}

export function writeBackendAuthSession(cookies: Cookies, payload: PersistedAuthSession) {
	writeBackendAuthTokens(cookies, payload.accessToken, payload.refreshToken);
	writeBackendAuthState(cookies, payload);
}

function readBackendAuthState(cookies: Cookies) {
	return parseStoredAuthState(cookies.get(AUTH_STATE_COOKIE_NAME));
}

export function readStoredBackendAuthSession(cookies: Cookies) {
	const accessToken = readBackendAuthToken(cookies);
	const refreshToken = readBackendRefreshToken(cookies);
	const state = readBackendAuthState(cookies);

	if (!accessToken || !refreshToken || !state) {
		return null;
	}

	return {
		userId: state.userId,
		sessionId: state.sessionId,
		tiktokProfileId: state.tiktokProfileId,
		accessToken,
		refreshToken,
		accessTokenExpiresAt: state.accessTokenExpiresAt
	} satisfies PersistedAuthSession;
}

export function clearBackendAuthToken(cookies: Cookies) {
	cookies.set(AUTH_TOKEN_COOKIE_NAME, '', {
		...cookieOptions(),
		expires: new Date(0),
		maxAge: 0
	});
	cookies.set(REFRESH_TOKEN_COOKIE_NAME, '', {
		...cookieOptions(),
		expires: new Date(0),
		maxAge: 0
	});
	cookies.set(AUTH_STATE_COOKIE_NAME, '', {
		...cookieOptions(),
		expires: new Date(0),
		maxAge: 0
	});
}

export async function loginWithBackend(
	fetchFn: typeof fetch,
	input: BackendLoginInput
): Promise<BackendLoginResult> {
	let response: Response;

	try {
		response = await fetchFn(buildBackendUrl('/api/auth/login'), {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				accept: 'application/json'
			},
			body: JSON.stringify(input)
		});
	} catch (error) {
		return {
			ok: false,
			status: 503,
			error:
				error instanceof Error
					? error.message
					: 'Authentication service is unavailable.'
		};
	}

	const payload = await response.json().catch(() => null);
	if (!response.ok) {
		return {
			ok: false,
			status: response.status,
			error: readBackendError(payload, 'Sign-in failed.')
		};
	}

	const session = normalizeLoginPayload(payload);
	if (!session) {
		return {
			ok: false,
			status: 502,
			error: 'Authentication service returned an invalid session payload.'
		};
	}

	return {
		ok: true,
		session
	};
}

export async function readBackendAuthSession(
	fetchFn: typeof fetch,
	accessToken: string,
	refreshToken: string,
	method: 'GET' | 'POST' = 'GET'
): Promise<BackendSessionReadResult> {
	if (!trimValue(accessToken) || !trimValue(refreshToken)) {
		return { kind: 'anonymous' };
	}

	let response: Response;

	try {
		response = await fetchFn(buildBackendUrl('/api/auth/session'), {
			method,
			headers: {
				accept: 'application/json',
				Authorization: `Bearer ${accessToken}`,
				'X-Streamplay-Studio-Refresh-Token': refreshToken
			}
		});
	} catch (error) {
		return {
			kind: 'unavailable',
			error:
				error instanceof Error
					? error.message
					: 'Authentication service is unavailable.'
		};
	}

	if (response.status === 401) {
		return { kind: 'anonymous' };
	}

	if (response.status === 403) {
		const payload = await response.json().catch(() => null);
		return {
			kind: 'forbidden',
			error: readBackendError(payload, 'Authentication is not active.')
		};
	}

	if (!response.ok) {
		const payload = await response.json().catch(() => null);
		return {
			kind: 'unavailable',
			error: readBackendError(payload, 'Authentication service is unavailable.')
		};
	}

	const payload = await response.json().catch(() => null);
	const tokenPayload = normalizeSessionTokensPayload(payload);
	if (!tokenPayload) {
		return {
			kind: 'unavailable',
			error: 'Authentication service returned an invalid session payload.'
		};
	}

	const persistedPayload = resolvePersistedSession(tokenPayload);
	const sessionResponse = tokenPayload satisfies AuthSessionRefreshResponse;

	return {
		kind: 'session',
		session: {
			payload: persistedPayload,
			response: sessionResponse
		}
	};
}

export async function logoutWithBackend(
	fetchFn: typeof fetch,
	accessToken: string,
	refreshToken: string
) {
	if (!trimValue(accessToken) || !trimValue(refreshToken)) {
		return;
	}

	try {
		await fetchFn(buildBackendUrl('/api/auth/logout'), {
			method: 'POST',
			headers: {
				accept: 'application/json',
				Authorization: `Bearer ${accessToken}`,
				'X-Streamplay-Studio-Refresh-Token': refreshToken
			}
		});
	} catch {}
}
