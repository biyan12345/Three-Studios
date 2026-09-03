import { json, type Handle, type RequestEvent } from '@sveltejs/kit';
import { readStoredBackendAuthSession } from '$lib/server/auth';
import type { StudioProfile } from '$lib/app-types';

type RequestAuthState =
	| {
			kind: 'anonymous';
			responseHeaders: Headers;
	  }
	| {
			kind: 'session';
			payload: NonNullable<App.Locals['authSession']>;
			authorizedProfiles: StudioProfile[];
			responseHeaders: Headers;
	  };

function resolveRequestAuth(event: Pick<RequestEvent, 'cookies'>) {
	const storedSession = readStoredBackendAuthSession(event.cookies);
	if (!storedSession) {
		return {
			kind: 'anonymous',
			responseHeaders: new Headers()
		} satisfies RequestAuthState;
	}

	const now = new Date().toISOString();
	const authorizedProfiles = [
		{
			id: storedSession.tiktokProfileId,
			username: storedSession.tiktokProfileId,
			displayName: storedSession.tiktokProfileId,
			createdAt: now,
			lastUsedAt: now
		}
	] satisfies StudioProfile[];

	return {
		kind: 'session',
		payload: storedSession,
		authorizedProfiles,
		responseHeaders: new Headers()
	} satisfies RequestAuthState;
}

function isAssetPath(pathname: string) {
	return pathname.startsWith('/_app/') || pathname === '/favicon.png';
}

function isLoginPath(pathname: string) {
	return pathname === '/login';
}

function isAuthApiPath(pathname: string) {
	return pathname === '/api/auth/login' || pathname === '/api/auth/session' || pathname === '/api/auth/logout';
}

function isOverlayRuntimePath(pathname: string) {
	return (
		pathname === '/overlay/runtime' ||
		pathname === '/api/runtime-overlay/feed' ||
		pathname === '/api/runtime-overlay/state'
	);
}

function isLoopbackValue(value: string) {
	const normalized = value.trim().toLowerCase();
	return (
		normalized === '127.0.0.1' ||
		normalized === 'localhost' ||
		normalized === '::1' ||
		normalized === '[::1]' ||
		normalized === '::ffff:127.0.0.1'
	);
}

function isLocalOverlayRequest(event: Pick<RequestEvent, 'getClientAddress' | 'url'>) {
	if (!isOverlayRuntimePath(event.url.pathname)) {
		return false;
	}

	if (isLoopbackValue(event.url.hostname)) {
		return true;
	}

	try {
		return isLoopbackValue(event.getClientAddress());
	} catch {
		return false;
	}
}

function isHtmlRequest(acceptHeader: string | null) {
	return acceptHeader?.includes('text/html') ?? false;
}

function applyResponseHeaders(response: Response, headers: Headers) {
	for (const [key, value] of headers.entries()) {
		response.headers.set(key, value);
	}

	return response;
}

function redirectResponse(location: string, headers: Headers) {
	return applyResponseHeaders(
		new Response(null, {
			status: 303,
			headers: {
				Location: location
			}
		}),
		headers
	);
}

export const handle: Handle = async ({ event, resolve }) => {
	const pathname = event.url.pathname;

	if (isAssetPath(pathname)) {
		return resolve(event);
	}

	const authState = await resolveRequestAuth(event);

	event.locals.authSession = null;
	event.locals.authorizedStudioProfiles = [];

	if (authState.kind === 'session') {
		event.locals.authSession = authState.payload;
		event.locals.authorizedStudioProfiles = authState.authorizedProfiles;
	}

	if (isLoginPath(pathname) && authState.kind === 'session') {
		return redirectResponse('/', authState.responseHeaders);
	}

	if (authState.kind === 'session') {
		return applyResponseHeaders(await resolve(event), authState.responseHeaders);
	}

	if (isLocalOverlayRequest(event)) {
		return applyResponseHeaders(await resolve(event), authState.responseHeaders);
	}

	if (isLoginPath(pathname) || isAuthApiPath(pathname)) {
		return applyResponseHeaders(await resolve(event), authState.responseHeaders);
	}

	if (isOverlayRuntimePath(pathname)) {
		return applyResponseHeaders(
			new Response('Overlay access denied.', { status: 401 }),
			authState.responseHeaders
		);
	}

	if (pathname.startsWith('/api/')) {
		return applyResponseHeaders(
			json({ error: 'Authentication is required.' }, { status: 401 }),
			authState.responseHeaders
		);
	}

	if (isHtmlRequest(event.request.headers.get('accept'))) {
		const nextPath = `${event.url.pathname}${event.url.search}`;
		return redirectResponse(
			`/login?reason=auth-required&next=${encodeURIComponent(nextPath)}`,
			authState.responseHeaders
		);
	}

	return applyResponseHeaders(
		new Response('Authentication is required.', { status: 401 }),
		authState.responseHeaders
	);
};
