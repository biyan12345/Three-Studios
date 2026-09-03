import type { ProfileGameSetting } from '$lib/app-types';

export function trimValue(value: string | null | undefined) {
	return value?.trim() ?? '';
}

export function normalizeTikTokUsername(value: string | null | undefined) {
	return trimValue(value).replace(/^@/, '').toLowerCase();
}

const PLACEHOLDER_CAST_NAMES = new Set(['left cast', 'right cast']);

function isPlaceholderCastName(value: string) {
	return PLACEHOLDER_CAST_NAMES.has(value.trim().toLowerCase());
}

export function sanitizeCastNameList(
	values: Array<string | null | undefined> | null | undefined,
	options: { limit?: number } = {}
) {
	const result: string[] = [];
	const limit = Math.max(0, Math.floor(options.limit ?? Number.POSITIVE_INFINITY));

	for (const rawValue of values ?? []) {
		const value = typeof rawValue === 'string' ? rawValue.trim() : '';
		if (!value || isPlaceholderCastName(value) || result.includes(value)) {
			continue;
		}

		result.push(value);
		if (result.length >= limit) {
			break;
		}
	}

	return result;
}

function normalizeGameSetting(value: unknown): ProfileGameSetting | null {
	if (!value || typeof value !== 'object') {
		return null;
	}

	const entry = value as Record<string, unknown>;
	const gameKey = trimValue(String(entry.gameKey ?? ''));
	const updatedAt = trimValue(String(entry.updatedAt ?? ''));

	if (!gameKey || !updatedAt) {
		return null;
	}

	return {
		gameKey,
		updatedAt,
		config:
			entry.config && typeof entry.config === 'object'
				? (entry.config as Record<string, unknown>)
				: {}
	};
}

export function normalizeGameSettings(value: unknown) {
	return Array.isArray(value)
		? value
				.map(normalizeGameSetting)
				.filter((gameSetting): gameSetting is ProfileGameSetting => gameSetting !== null)
		: [];
}

type Cleanup = () => void;

type SseStreamOptions = {
	heartbeatMs?: number;
	signal?: AbortSignal;
};

export function encodeSseData(data: unknown) {
	return `data: ${JSON.stringify(data)}\n\n`;
}

export function createSseStreamResponse(
	onConnect: (send: (chunk: string) => void, close: () => void) => Cleanup,
	options: SseStreamOptions = {}
) {
	const encoder = new TextEncoder();
	const heartbeatMs = options.heartbeatMs ?? 15000;
	const signal = options.signal;
	let closed = false;
	let cleanup: Cleanup | null = null;
	let pendingClose = false;

	const runCleanup = () => {
		const currentCleanup = cleanup;
		cleanup = null;
		currentCleanup?.();
	};

	const close = () => {
		if (closed) {
			return;
		}

		closed = true;
		if (cleanup) {
			runCleanup();
		} else {
			pendingClose = true;
		}
	};

	const stream = new ReadableStream({
		start(controller) {
			const send = (chunk: string) => {
				if (closed) {
					return;
				}

				try {
					controller.enqueue(encoder.encode(chunk));
				} catch {
					close();
				}
			};

			const disconnect = onConnect(send, close);
			const handleAbort = () => {
				close();
			};
			const heartbeat = setInterval(() => {
				send(': keepalive\n\n');
			}, heartbeatMs);

			cleanup = () => {
				clearInterval(heartbeat);
				signal?.removeEventListener('abort', handleAbort);
				disconnect();

				try {
					controller.close();
				} catch {
					// Ignore double-close and already-aborted streams.
				}
			};

			if (signal) {
				if (signal.aborted) {
					close();
					return;
				}

				signal.addEventListener('abort', handleAbort);
			}

			if (pendingClose) {
				runCleanup();
			}
		},
		cancel() {
			close();
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache, no-transform',
			Connection: 'keep-alive'
		}
	});
}
