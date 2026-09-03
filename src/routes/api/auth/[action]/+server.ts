import { json } from '@sveltejs/kit';
import { trimValue } from '$lib/helpers';
import {
	clearBackendAuthToken,
	loginWithBackend,
	logoutWithBackend,
	readBackendAuthSession,
	readStoredBackendAuthSession,
	writeBackendAuthSession
} from '$lib/server/auth';
import type { RequestHandler } from './$types';

function noStoreHeaders() {
	return {
		'Cache-Control': 'no-store'
	};
}

function unauthorizedResponse() {
	return json({ error: 'Authentication is required.' }, { status: 401, headers: noStoreHeaders() });
}

export const POST: RequestHandler = async (event) => {
	switch (event.params.action) {
		case 'login': {
			let payload: unknown;

			try {
				payload = await event.request.json();
			} catch {
				return json({ error: 'Invalid login request.' }, { status: 400 });
			}

			const record = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : null;
			const tiktokProfileId = trimValue(String(record?.tiktokProfileId ?? ''));
			const email = trimValue(String(record?.email ?? ''));
			const password = String(record?.password ?? '');

			if ((!tiktokProfileId && !email) || !password) {
				return json({ error: 'Enter ID and password.' }, { status: 400 });
			}

			const loginResult = await loginWithBackend(
				event.fetch,
				email ? { email, password } : { tiktokProfileId, password }
			);
			if (!loginResult.ok) {
				return json({ error: loginResult.error }, { status: loginResult.status });
			}

			writeBackendAuthSession(event.cookies, loginResult.session.payload);
			return json(loginResult.session.response, { headers: noStoreHeaders() });
		}

		case 'logout':
			if (event.locals.authSession) {
				await logoutWithBackend(
					event.fetch,
					event.locals.authSession.accessToken,
					event.locals.authSession.refreshToken
				);
			}

			clearBackendAuthToken(event.cookies);
			return json({ ok: true });

		case 'session': {
			const storedSession = readStoredBackendAuthSession(event.cookies);

			if (!storedSession) {
				return unauthorizedResponse();
			}

			const sessionResult = await readBackendAuthSession(
				event.fetch,
				storedSession.accessToken,
				storedSession.refreshToken,
				'POST'
			);
			if (sessionResult.kind === 'anonymous') {
				clearBackendAuthToken(event.cookies);
				return unauthorizedResponse();
			}

			if (sessionResult.kind === 'forbidden') {
				clearBackendAuthToken(event.cookies);
				return json({ error: sessionResult.error }, { status: 403, headers: noStoreHeaders() });
			}

			if (sessionResult.kind === 'unavailable') {
				return json({ error: sessionResult.error }, { status: 503, headers: noStoreHeaders() });
			}

			writeBackendAuthSession(event.cookies, sessionResult.session.payload);
			return json(sessionResult.session.response, { headers: noStoreHeaders() });
		}

		default:
			return json({ error: 'Not found.' }, { status: 404 });
	}
};
