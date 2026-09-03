import { json } from '@sveltejs/kit';
import { battleStore, groupPkStore, soloStageStore, stickerDanceStore } from '$lib/server/games';
import { currentRuntimeOverlayPayload, runtimeOverlayStore } from '$lib/server/runtime-overlay';
import { createSseStreamResponse, encodeSseData } from '$lib/helpers';
import type { RuntimeOverlayCommand } from '$lib/app-types';
import type { RequestHandler } from './$types';

type FeedChangeKind = 'overlay' | 'battle' | 'sticker' | 'groupPk' | 'solo';

function shouldPush(change: FeedChangeKind) {
	if (change === 'overlay') {
		return true;
	}

	const overlayState = runtimeOverlayStore.getState();
	if (!overlayState.visible) {
		return false;
	}

	switch (overlayState.activeModeId) {
		case 'battle-ladder':
			return change === 'battle';
		case 'group-sticker':
			return change === 'sticker';
		case 'group-pk':
			return change === 'groupPk';
		case 'solo-target':
			return change === 'solo';
		default:
			return false;
	}
}

function runtimeFeed(request: Request) {
	return createSseStreamResponse(
		(send) => {
			const ignoreInitial = {
				overlay: true,
				battle: true,
				sticker: true,
				groupPk: true,
				solo: true
			};

			const push = (change?: FeedChangeKind) => {
				if (!change || shouldPush(change)) {
					send(encodeSseData(currentRuntimeOverlayPayload()));
				}
			};

			push();

			const unsubscribeOverlay = runtimeOverlayStore.subscribe(() => {
				if (ignoreInitial.overlay) {
					ignoreInitial.overlay = false;
					return;
				}

				push('overlay');
			});
			const unsubscribeBattle = battleStore.subscribe(() => {
				if (ignoreInitial.battle) {
					ignoreInitial.battle = false;
					return;
				}

				push('battle');
			});
			const unsubscribeSticker = stickerDanceStore.subscribe(() => {
				if (ignoreInitial.sticker) {
					ignoreInitial.sticker = false;
					return;
				}

				push('sticker');
			});
			const unsubscribeGroupPk = groupPkStore.subscribe(() => {
				if (ignoreInitial.groupPk) {
					ignoreInitial.groupPk = false;
					return;
				}

				push('groupPk');
			});
			const unsubscribeSolo = soloStageStore.subscribe(() => {
				if (ignoreInitial.solo) {
					ignoreInitial.solo = false;
					return;
				}

				push('solo');
			});

			return () => {
				unsubscribeOverlay();
				unsubscribeBattle();
				unsubscribeSticker();
				unsubscribeGroupPk();
				unsubscribeSolo();
			};
		},
		{ signal: request.signal }
	);
}

export const GET: RequestHandler = ({ params, request }) => {
	switch (params.action) {
		case 'feed':
			return runtimeFeed(request);
		case 'state':
			return json(currentRuntimeOverlayPayload(), {
				headers: {
					'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
					Pragma: 'no-cache',
					Expires: '0'
				}
			});
		default:
			return json({ error: 'Not found.' }, { status: 404 });
	}
};

export const POST: RequestHandler = async ({ params, request }) => {
	if (params.action !== 'command') {
		return json({ error: 'Not found.' }, { status: 404 });
	}

	const command = (await request.json()) as RuntimeOverlayCommand;
	return json(runtimeOverlayStore.update(command));
};
