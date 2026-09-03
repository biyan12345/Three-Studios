import { json } from '@sveltejs/kit';
import {
	battleStore,
	groupPkStore,
	soloStageStore,
	stickerDanceStore
} from '$lib/server/games';
import type { RequestHandler } from './$types';

type CommandStore = {
	update(command: unknown): unknown;
};

const stores: Record<string, CommandStore> = {
	'battle-ladder': battleStore as unknown as CommandStore,
	'group-pk': groupPkStore as unknown as CommandStore,
	'solo-stage': soloStageStore as unknown as CommandStore,
	'sticker-dance': stickerDanceStore as unknown as CommandStore
};

export const POST: RequestHandler = async ({ params, request }) => {
	const store = stores[params.mode];
	if (!store) {
		return json({ error: 'Unknown game mode.' }, { status: 404 });
	}

	return json(store.update(await request.json()));
};
