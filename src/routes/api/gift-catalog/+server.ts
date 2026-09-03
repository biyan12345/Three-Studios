import { json } from '@sveltejs/kit';
import { loadGiftCatalog } from '$lib/gift-catalog';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	const gifts = await loadGiftCatalog();

	return json({
		gifts,
		count: gifts.length
	});
};
