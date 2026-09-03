export const GIFT_CATALOG_URL = 'https://updates.devkit.sh/app/gifts/gifts.json';
export const GIFT_ASSET_BASE_URL = 'https://updates.devkit.sh/app/gifts/';

export type GiftCatalogEntry = {
	giftId: string;
	name: string;
	points: number;
	image: string;
	giftImageUrl: string;
};

export type GiftTotal = {
	giftId?: string;
	giftName: string;
	giftImageUrl?: string;
	count: number;
};

type GiftCatalogLookupValue = {
	giftId?: string | number | null;
	giftName?: string | null;
};

let activeGiftCatalog: GiftCatalogEntry[] = [];
let giftCatalogById = buildGiftCatalogById(activeGiftCatalog);
let giftCatalogLoadPromise: Promise<GiftCatalogEntry[]> | null = null;
let giftCatalogLoaded = false;

function trimCatalogValue(value: unknown) {
	return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
}

function looksLikeGiftId(value: string) {
	return /^\d+$/.test(value);
}

function giftImageFilename(value: unknown) {
	const rawValue = trimCatalogValue(value);
	return rawValue.split('/').filter(Boolean).pop() ?? '';
}

function giftCatalogAssetUrl(image?: string | null) {
	const filename = giftImageFilename(image);
	return filename ? `${GIFT_ASSET_BASE_URL}${filename}` : '';
}

function normalizeGiftCatalogEntry(value: unknown): GiftCatalogEntry | null {
	const source = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
	const giftId = trimCatalogValue(source.giftId);
	const name = trimCatalogValue(source.name);
	if (!giftId || !name) {
		return null;
	}

	const image = giftImageFilename(source.image);
	const points = Math.floor(Number(source.points));

	return {
		giftId,
		name,
		points: Number.isFinite(points) && points > 0 ? points : 0,
		image,
		giftImageUrl: giftCatalogAssetUrl(image)
	};
}

function sanitizeGiftCatalog(value: unknown) {
	return Array.isArray(value)
		? value
				.map(normalizeGiftCatalogEntry)
				.filter((gift): gift is GiftCatalogEntry => gift !== null)
				.sort((left, right) => left.points - right.points || left.name.localeCompare(right.name))
		: [];
}

function buildGiftCatalogById(catalog: GiftCatalogEntry[]) {
	return new Map(catalog.map((gift) => [gift.giftId, gift] as const));
}

function setGiftCatalog(catalog: GiftCatalogEntry[]) {
	if (catalog.length === 0) {
		return activeGiftCatalog;
	}

	activeGiftCatalog = catalog;
	giftCatalogById = buildGiftCatalogById(catalog);
	giftCatalogLoaded = true;
	return activeGiftCatalog;
}

export function useGiftCatalog(catalog: unknown) {
	return setGiftCatalog(sanitizeGiftCatalog(catalog));
}

export function giftCatalogEntries() {
	return activeGiftCatalog;
}

export async function loadGiftCatalog(fetcher: typeof fetch = fetch) {
	if (giftCatalogLoaded) {
		return activeGiftCatalog;
	}

	if (giftCatalogLoadPromise) {
		return giftCatalogLoadPromise;
	}

	giftCatalogLoadPromise = fetcher(GIFT_CATALOG_URL, {
		headers: {
			accept: 'application/json'
		}
	})
		.then(async (response) => {
			if (!response.ok) {
				throw new Error(`Gift catalog request failed with HTTP ${response.status}`);
			}

			return setGiftCatalog(sanitizeGiftCatalog(await response.json()));
		})
		.catch(() => activeGiftCatalog)
		.finally(() => {
			giftCatalogLoadPromise = null;
		});

	return giftCatalogLoadPromise;
}

export function normalizeGiftSearchValue(value: string) {
	return value
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, ' ')
		.trim();
}

export function giftCatalogEntryById(giftId?: string | number | null) {
	const normalized = trimCatalogValue(giftId);
	return normalized ? giftCatalogById.get(normalized) : undefined;
}

function resolveGiftCatalogInput(value?: GiftCatalogLookupValue | string | null) {
	return typeof value === 'object' && value !== null
		? resolveGiftCatalogEntry(value)
		: resolveGiftCatalogEntry({ giftId: value });
}

export function giftCatalogImageUrl(value?: GiftCatalogLookupValue | string | null) {
	return resolveGiftCatalogInput(value)?.giftImageUrl ?? '';
}

export function giftCatalogDefaultId(index: number) {
	return activeGiftCatalog[index % activeGiftCatalog.length]?.giftId ?? activeGiftCatalog[0]?.giftId ?? '';
}

export function resolveGiftCatalogEntry(value: GiftCatalogLookupValue) {
	return giftCatalogEntryById(value.giftId);
}

function giftCatalogDisplayFallback(value?: GiftCatalogLookupValue | string | null) {
	return typeof value === 'object' && value !== null
		? trimCatalogValue(value.giftName) || trimCatalogValue(value.giftId)
		: trimCatalogValue(value);
}

export function giftCatalogDisplayName(value?: GiftCatalogLookupValue | string | null, fallback = 'Gift') {
	return resolveGiftCatalogInput(value)?.name ?? (giftCatalogDisplayFallback(value) || fallback);
}

export function giftCatalogStoredId(value?: GiftCatalogLookupValue | string | null) {
	const giftId =
		typeof value === 'object' && value !== null ? trimCatalogValue(value.giftId) : trimCatalogValue(value);
	if (!giftId) {
		return '';
	}

	const isKnownOrNumericId = Boolean(giftCatalogEntryById(giftId)) || looksLikeGiftId(giftId);
	return isKnownOrNumericId ? giftId : '';
}

export function giftCatalogMatchKey(value?: GiftCatalogLookupValue | string | null) {
	const giftId = giftCatalogStoredId(value);
	return giftId ? `id:${giftId}` : '';
}

export function addGiftTotal<T extends GiftTotal>(
	gifts: readonly T[],
	gift: string | GiftCatalogLookupValue,
	count: number
) {
	const giftId = giftCatalogStoredId(gift);
	const entry = giftCatalogEntryById(giftId);
	const giftName = entry?.name ?? giftCatalogDisplayFallback(gift);
	const matchKey = giftCatalogMatchKey(giftId);
	if (!matchKey || count <= 0) {
		return [...gifts];
	}

	const existing = gifts.find(
		(giftTotal) => giftCatalogMatchKey(giftTotal) === matchKey
	);
	if (!existing) {
		return [
			...gifts,
			{
				giftId,
				giftName,
				giftImageUrl: entry?.giftImageUrl ?? '',
				count
			} as T
		];
	}

	return gifts.map((giftTotal) =>
		giftCatalogMatchKey(giftTotal) === matchKey
			? ({ ...giftTotal, count: giftTotal.count + count } as T)
			: giftTotal
	);
}

export function consumeGiftTotals<T extends GiftTotal>(gifts: readonly T[], amount: number) {
	let remaining = Math.max(Math.floor(amount), 0);
	if (remaining <= 0) {
		return [...gifts];
	}

	const nextGifts: T[] = [];
	for (const gift of gifts) {
		if (remaining <= 0) {
			nextGifts.push(gift);
			continue;
		}

		if (gift.count <= remaining) {
			remaining -= gift.count;
			continue;
		}

		nextGifts.push({
			...gift,
			count: gift.count - remaining
		});
		remaining = 0;
	}

	return nextGifts;
}
