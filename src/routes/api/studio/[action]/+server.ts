import { json } from '@sveltejs/kit';
import { battleStore, groupPkStore, soloStageStore, stickerDanceStore } from '$lib/server/games';
import { runtimeOverlayStore } from '$lib/server/runtime-overlay';
import { createSseStreamResponse, encodeSseData } from '$lib/helpers';
import { getStudioBootstrap } from '$lib/server/studio-data';
import { getScoreHistory, recordLiveSessionHistory } from '$lib/server/score-history';
import type {
	BattleState,
	GroupPkState,
	LiveErrorKind,
	LiveStatus,
	RuntimeOverlayState,
	SoloStageState,
	StickerDanceState
} from '$lib/app-types';
import type { RequestHandler } from './$types';

type LaunchChecks = {
	obs: {
		ok: boolean;
		message: string;
	};
	live: {
		ok: boolean;
		status: LiveStatus;
		uniqueId: string;
		roomId?: string;
		startedAt?: string;
		viewerCount: number;
		message: string;
		errorKind?: LiveErrorKind;
	};
};

type StudioStateFeedPayload = {
	runtimeOverlayState: RuntimeOverlayState;
	battleState: BattleState;
	stickerDanceState: StickerDanceState;
	groupPkState: GroupPkState;
	soloStageState: SoloStageState;
};

function syncGameStoresToProfile(profileId: string | null) {
	battleStore.useProfile(profileId, []);
	stickerDanceStore.useProfile(profileId, []);
	groupPkStore.useProfile(profileId, []);
	soloStageStore.useProfile(profileId, []);
}

function syncedBootstrap(profiles: App.Locals['authorizedStudioProfiles']) {
	const bootstrap = getStudioBootstrap(profiles);
	syncGameStoresToProfile(bootstrap.activeProfile?.id ?? null);
	return bootstrap;
}

function requestedProfileId(request: Request, profiles: App.Locals['authorizedStudioProfiles']) {
	const requested = (
		request.headers.get('x-streamplay-studio-profile-id') ??
		new URL(request.url).searchParams.get('profileId') ??
		''
	).trim();
	if (!requested) {
		return getStudioBootstrap(profiles).activeProfile?.id ?? null;
	}
	return profiles.some((profile) => profile.id === requested) ? requested : null;
}

function currentStudioStatePayload(): StudioStateFeedPayload {
	return {
		runtimeOverlayState: runtimeOverlayStore.getState(),
		battleState: battleStore.getState(),
		stickerDanceState: stickerDanceStore.getState(),
		groupPkState: groupPkStore.getState(),
		soloStageState: soloStageStore.getState()
	};
}

function studioStateFeed(request: Request) {
	return createSseStreamResponse(
		(send) => {
			const ignoreInitial = {
				overlay: true,
				battle: true,
				sticker: true,
				groupPk: true,
				solo: true
			};

			const push = () => {
				send(encodeSseData(currentStudioStatePayload()));
			};

			push();

			const unsubscribeOverlay = runtimeOverlayStore.subscribe(() => {
				if (ignoreInitial.overlay) {
					ignoreInitial.overlay = false;
					return;
				}

				push();
			});
			const unsubscribeBattle = battleStore.subscribe(() => {
				if (ignoreInitial.battle) {
					ignoreInitial.battle = false;
					return;
				}

				push();
			});
			const unsubscribeSticker = stickerDanceStore.subscribe(() => {
				if (ignoreInitial.sticker) {
					ignoreInitial.sticker = false;
					return;
				}

				push();
			});
			const unsubscribeGroupPk = groupPkStore.subscribe(() => {
				if (ignoreInitial.groupPk) {
					ignoreInitial.groupPk = false;
					return;
				}

				push();
			});
			const unsubscribeSolo = soloStageStore.subscribe(() => {
				if (ignoreInitial.solo) {
					ignoreInitial.solo = false;
					return;
				}

				push();
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

function createDefaultChecks(uniqueId: string, obsReady: boolean): LaunchChecks {
	return {
		obs: {
			ok: obsReady,
			message: obsReady
				? 'Preview source is connected.'
				: 'OBS preview source is not connected yet.'
		},
		live: {
			ok: false,
			status: 'idle',
			uniqueId,
			roomId: undefined,
			startedAt: undefined,
			viewerCount: 0,
			message: 'TikTok live checks have not started yet.',
			errorKind: undefined
		}
	};
}

function readObsReadyHeader(headerValue: string | null) {
	return headerValue === '1' || headerValue?.toLowerCase() === 'true';
}

function launchStudio({
	locals,
	request
}: {
	locals: App.Locals;
	request: Request;
}) {
	const obsReady = readObsReadyHeader(request.headers.get('x-obs-ready'));
	const bootstrap = syncedBootstrap(locals.authorizedStudioProfiles);
	const profile = bootstrap.activeProfile;

	if (!profile) {
		return json({ error: 'Log in with a profile first.' }, { status: 404 });
	}

	const checks = createDefaultChecks(profile.username, obsReady);
	checks.live = {
		...checks.live,
		status: 'connecting',
		message: `Ready to connect to ${profile.username} LIVE.`
	};

	return json({
		ok: true,
		profile: {
			id: profile.id,
			username: profile.username,
			displayName: profile.displayName
		},
		checks
	});
}

export const GET: RequestHandler = ({ locals, params, request }) => {
	switch (params.action) {
		case 'bootstrap':
			return json(syncedBootstrap(locals.authorizedStudioProfiles));
		case 'state-feed':
			return studioStateFeed(request);
		case 'score-history': {
			const profileId = requestedProfileId(request, locals.authorizedStudioProfiles);
			if (!profileId) return json({ error: 'Profile access denied.' }, { status: 403 });
			syncGameStoresToProfile(profileId);
			return json(getScoreHistory(profileId));
		}
		default:
			return json({ error: 'Not found.' }, { status: 404 });
	}
};

export const POST: RequestHandler = async ({ locals, params, request }) => {
	try {
			switch (params.action) {
				case 'profile': {
					const body = await request.json();
					if (body.action === 'list') {
						return json(syncedBootstrap(locals.authorizedStudioProfiles));
					}

				return json({ error: 'Unsupported action.' }, { status: 400 });
			}

			case 'launch':
				return launchStudio({ locals, request });

			case 'score-history': {
				const profileId = requestedProfileId(request, locals.authorizedStudioProfiles);
				if (!profileId) return json({ error: 'Profile access denied.' }, { status: 403 });
				const session = recordLiveSessionHistory(profileId, await request.json());
				return session
					? json({ ok: true, session })
					: json({ error: 'Invalid LIVE session history.' }, { status: 400 });
			}

			default:
				return json({ error: 'Not found.' }, { status: 404 });
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Studio request failed.';
		console.error('[studio]', error);
		return json({ error: message }, { status: 500 });
	}
};
