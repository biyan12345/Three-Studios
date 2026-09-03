import { buildBackendUrl, createBackendAuthHeaders } from '$lib/server/auth';
import { processLiveFeedServerEvent } from '$lib/server/runtime-overlay';
import type { LiveErrorKind, LiveFeedEvent } from '$lib/app-types';
import type { RequestHandler } from './$types';

const BACKEND_RESPONSE_TIMEOUT_MS = 15000;
const PROXY_HEARTBEAT_MS = 15000;
const HTML_DOCUMENT_PATTERN = /<!doctype html|<html[\s>]/i;

function classifyLiveErrorKind(message: string, upstreamStatus?: number): LiveErrorKind {
	if (upstreamStatus === 404) {
		return 'not_found';
	}

	if (upstreamStatus === 429) {
		return 'rate_limited';
	}

	const normalizedMessage = message.trim().toLowerCase();

	if (
		normalizedMessage.includes('offline') ||
		normalizedMessage.includes('not live') ||
		normalizedMessage.includes('live ended') ||
		normalizedMessage.includes('ended the live') ||
		normalizedMessage.includes('has ended') ||
		normalizedMessage.includes('stream ended') ||
		normalizedMessage.includes('room has ended') ||
		normalizedMessage.includes('user is not live')
	) {
		return 'offline';
	}

	if (
		normalizedMessage.includes('rate limit') ||
		normalizedMessage.includes('too many requests')
	) {
		return 'rate_limited';
	}

	if (
		normalizedMessage.includes('not found') ||
		normalizedMessage.includes('does not exist') ||
		normalizedMessage.includes('unknown user')
	) {
		return 'not_found';
	}

	if (
		normalizedMessage.includes('disabled') ||
		normalizedMessage.includes('not configured') ||
		normalizedMessage.includes('missing backend') ||
		normalizedMessage.includes('invalid backend')
	) {
		return 'disabled';
	}

	return 'generic';
}

function createErrorStatusEvent(
	uniqueId: string,
	message: string,
	options: {
		errorKind?: LiveErrorKind;
		upstreamStatus?: number;
	} = {}
): LiveFeedEvent {
	return {
		type: 'status',
		status: 'error',
		uniqueId,
		viewerCount: 0,
		message,
		errorKind: options.errorKind ?? classifyLiveErrorKind(message, options.upstreamStatus)
	};
}

function eventStreamResponse(payload: LiveFeedEvent, upstreamStatus = 200) {
	const encoder = new TextEncoder();
	const stream = new ReadableStream({
		start(controller) {
			controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
			controller.close();
		}
	});

	return new Response(stream, {
		status: 200,
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache, no-transform',
			Connection: 'keep-alive',
			'X-Accel-Buffering': 'no',
			'X-Streamplay-Studio-Upstream-Status': String(upstreamStatus)
		}
	});
}

function proxyEventStreamResponse(response: Response, uniqueId: string) {
	const encoder = new TextEncoder();
	const decoder = new TextDecoder();
	const reader = response.body!.getReader();
	const headers = new Headers();
	headers.set('Content-Type', response.headers.get('content-type') || 'text/event-stream');
	headers.set('Cache-Control', response.headers.get('cache-control') || 'no-cache, no-transform');
	headers.set('Connection', 'keep-alive');
	headers.set('X-Accel-Buffering', response.headers.get('x-accel-buffering') || 'no');
	headers.set('X-Streamplay-Studio-Upstream-Status', String(response.status));
	let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

	const clearHeartbeat = () => {
		if (!heartbeatTimer) {
			return;
		}

		clearInterval(heartbeatTimer);
		heartbeatTimer = null;
	};

	return new Response(
			new ReadableStream({
				async start(controller) {
					let receivedChunk = false;
					let eventBuffer = '';

					const startHeartbeat = () => {
						if (heartbeatTimer) {
							return;
						}

						heartbeatTimer = setInterval(() => {
							try {
								controller.enqueue(
									encoder.encode(
										`event: heartbeat\ndata: {"at":${Date.now()}}\n\n`
									)
								);
							} catch {
								clearHeartbeat();
							}
						}, PROXY_HEARTBEAT_MS);
					};

					const emitError = async (
						message: string,
						options: {
							errorKind?: LiveErrorKind;
							upstreamStatus?: number;
						} = {}
					) => {
						try {
							await reader.cancel(message);
						} catch {}

						clearHeartbeat();
						const payload = createErrorStatusEvent(uniqueId, message, options);
						await processLiveFeedServerEvent(payload);
						controller.enqueue(
							encoder.encode(`data: ${JSON.stringify(payload)}\n\n`)
						);
						controller.close();
					};

					const flushServerEvents = async (chunkText: string) => {
						if (!chunkText) {
							return;
						}

						eventBuffer += chunkText.replace(/\r\n/g, '\n');

						while (true) {
							const boundaryIndex = eventBuffer.indexOf('\n\n');
							if (boundaryIndex < 0) {
								return;
							}

							const rawEvent = eventBuffer.slice(0, boundaryIndex);
							eventBuffer = eventBuffer.slice(boundaryIndex + 2);

							const dataPayload = rawEvent
								.split('\n')
								.filter((line) => line.startsWith('data:'))
								.map((line) => line.slice(5).trimStart())
								.join('\n')
								.trim();

							if (!dataPayload) {
								continue;
							}

							try {
								await processLiveFeedServerEvent(JSON.parse(dataPayload) as LiveFeedEvent);
							} catch {}
						}
					};

					try {
						while (true) {
							const result = receivedChunk
								? await reader.read()
								: await new Promise<ReadableStreamReadResult<Uint8Array> | null>(
									(resolve, reject) => {
										const timeoutId = setTimeout(
											() => resolve(null),
											BACKEND_RESPONSE_TIMEOUT_MS
										);

										reader.read().then(
											(value) => {
												clearTimeout(timeoutId);
												resolve(value);
											},
											(error) => {
												clearTimeout(timeoutId);
												reject(error);
											}
										);
									}
									);

							if (result === null) {
								await emitError(
									`Timed out after ${Math.round(BACKEND_RESPONSE_TIMEOUT_MS / 1000)}s waiting for the TikTok backend to send the first live event. The browser automation may be stuck before the live frame is ready.`
								);
								return;
							}

							if (result.done) {
								if (!receivedChunk) {
									await emitError(
										'TikTok backend closed the live stream before sending any live events.',
										{ upstreamStatus: response.status }
									);
									return;
								}

								await emitError('TikTok backend closed the live stream unexpectedly.', {
									upstreamStatus: response.status
								});
								return;
							}

							receivedChunk = true;
							startHeartbeat();
							await flushServerEvents(decoder.decode(result.value, { stream: true }));
							controller.enqueue(result.value);
						}
					} catch (error) {
						await emitError(
							error instanceof Error ? error.message : 'TikTok live stream request failed.',
							{ upstreamStatus: response.status }
						);
					} finally {
						clearHeartbeat();
						await flushServerEvents(decoder.decode());
						try {
							reader.releaseLock();
						} catch {}
					}
				},
				async cancel(reason) {
					clearHeartbeat();
					try {
						await reader.cancel(reason);
					} catch {}
				}
			}),
		{
			status: response.status,
			headers
		}
	);
}

function isAbortError(error: unknown) {
	return error instanceof Error && error.name === 'AbortError';
}

async function readBackendError(response: Response, routeLabel: string) {
	const raw = (await response.text()).trim();

	if (!raw) {
		return `TikTok backend returned HTTP ${response.status} for ${routeLabel}.`;
	}

	try {
		const payload = JSON.parse(raw) as { error?: string; message?: string };
		const message = payload.error || payload.message;
		if (message?.trim()) {
			return message.trim();
		}
	} catch {}

	if (
		response.headers.get('content-type')?.includes('text/html') ||
		HTML_DOCUMENT_PATTERN.test(raw)
	) {
		return `TikTok backend returned HTTP ${response.status} for ${routeLabel}. Check that Server points to the TikTok backend, not a frontend URL.`;
	}

	return raw.length > 240 ? `${raw.slice(0, 237)}...` : raw;
}

export const GET: RequestHandler = async ({ fetch, locals, request }) => {
	const uniqueId =
		locals.authSession?.tiktokProfileId?.trim() ??
		locals.authorizedStudioProfiles[0]?.username.trim() ??
		'';
	if (!uniqueId) {
		return eventStreamResponse(
			createErrorStatusEvent(uniqueId, 'Log in with a TikTok profile before connecting LIVE.', {
				upstreamStatus: 403
			}),
			403
		);
	}

	let target: URL;

	try {
		target = buildBackendUrl('/api/tiktok-live');
	} catch (error) {
		return eventStreamResponse(
			createErrorStatusEvent(
				uniqueId,
				error instanceof Error ? error.message : 'TikTok live stream is unavailable.',
				{ errorKind: 'disabled' }
			),
			500
		);
	}

	try {
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), BACKEND_RESPONSE_TIMEOUT_MS);
		const headers = createBackendAuthHeaders(locals, {
			accept: request.headers.get('accept') ?? 'text/event-stream'
		});
		const response = await fetch(target, {
			method: 'GET',
			headers,
			signal: controller.signal
		}).finally(() => {
			clearTimeout(timeoutId);
		});

		if (!response.ok || !response.body) {
			const message =
				(await readBackendError(response, '/api/tiktok-live')) ||
				'TikTok live stream is unavailable.';
			return eventStreamResponse(
				createErrorStatusEvent(uniqueId, message, {
					upstreamStatus: response.status || 502
				}),
				response.status || 502
			);
		}

		return proxyEventStreamResponse(response, uniqueId);
	} catch (error) {
		const message = isAbortError(error)
			? `Timed out after ${Math.round(BACKEND_RESPONSE_TIMEOUT_MS / 1000)}s waiting for the TikTok backend. Check the configured Server and its browser automation logs.`
			: error instanceof Error
				? error.message
				: 'TikTok live stream request failed.';
		return eventStreamResponse(createErrorStatusEvent(uniqueId, message, { upstreamStatus: 502 }), 502);
	}
};
