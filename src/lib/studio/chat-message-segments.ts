import type { ChatEmote } from '$lib/app-types';

type ChatSegment =
	| { type: 'text'; value: string }
	| { type: 'emote'; token: string; imageUrl?: string; fallback?: string };

const BRACKET_EMOTE_RE = /\[[^[\]]+\]/g;

const EMOTE_FALLBACKS: Record<string, string> = {
	wow: '😮',
	jolliekissingface: '🥰',
	laugh: '😂',
	laughing: '😂',
	laughwithtears: '😂',
	smirk: '😏',
	smile: '😊',
	happy: '😊',
	pride: '🥹',
	loveface: '😍',
	lovely: '🥰',
	cute: '🥰',
	cry: '😢',
	tears: '😭',
	angry: '😠',
	rage: '😡',
	shout: '😲',
	shocked: '😲',
	surprised: '😲',
	scream: '😱',
	thumb: '👍',
	ok: '👌',
	thinking: '🤔',
	cool: '😎'
};

function normalizeEmoteToken(token: string) {
	return token.slice(1, -1).trim().toLowerCase().replace(/\s+/g, '');
}

function emoteFallback(token: string) {
	const normalized = normalizeEmoteToken(token);
	const exactMatch = EMOTE_FALLBACKS[normalized];
	if (exactMatch) {
		return exactMatch;
	}

	if (normalized.includes('heart') || normalized.includes('love')) return '❤️';
	if (normalized.includes('kiss')) return '🥰';
	if (normalized.includes('laugh') || normalized.includes('lol') || normalized.includes('haha'))
		return '😂';
	if (
		normalized.includes('wow') ||
		normalized.includes('surpris') ||
		normalized.includes('shock')
	)
		return '😮';
	if (normalized.includes('cry') || normalized.includes('tear') || normalized.includes('sad'))
		return '😭';
	if (normalized.includes('angry') || normalized.includes('mad') || normalized.includes('rage'))
		return '😠';
	if (normalized.includes('thumb') || normalized.includes('like')) return '👍';
	if (normalized.includes('pray') || normalized.includes('thanks')) return '🙏';
	if (normalized.includes('clap') || normalized.includes('congrat')) return '👏';
	if (normalized.includes('fire') || normalized.includes('lit')) return '🔥';
	if (normalized.includes('rose') || normalized.includes('flower')) return '🌹';
	if (normalized.includes('cool') || normalized.includes('sunglass')) return '😎';
	if (normalized.includes('smile') || normalized.includes('happy') || normalized.includes('grin'))
		return '😊';
	if (normalized.includes('think')) return '🤔';
	if (normalized.includes('sleep')) return '😴';
	if (normalized.includes('wink')) return '😉';
	if (normalized.includes('blush') || normalized.includes('shy')) return '☺️';
	if (normalized.includes('ok')) return '👌';

	return undefined;
}

function buildSegmentsFromBracketTokens(text: string, emotes: ChatEmote[]) {
	const parts: ChatSegment[] = [];
	let cursor = 0;
	let emoteIndex = 0;

	for (const match of text.matchAll(BRACKET_EMOTE_RE)) {
		const token = match[0];
		const start = match.index ?? 0;

		if (start > cursor) {
			parts.push({ type: 'text', value: text.slice(cursor, start) });
		}

		const fallback = emoteFallback(token);
		const emote = emotes[emoteIndex];
		if (emote?.imageUrl || fallback) {
			parts.push({
				type: 'emote',
				token,
				imageUrl: emote?.imageUrl,
				fallback
			});
		} else {
			parts.push({ type: 'text', value: token });
		}

		emoteIndex += 1;
		cursor = start + token.length;
	}

	if (cursor < text.length) {
		parts.push({ type: 'text', value: text.slice(cursor) });
	}

	return parts;
}

function buildSegmentsFromEmotePositions(text: string, emotes: ChatEmote[]) {
	const parts: ChatSegment[] = [];
	let cursor = 0;

	for (const emote of [...emotes].sort(
		(left, right) => (left.placeInComment ?? 0) - (right.placeInComment ?? 0)
	)) {
		const nextPosition = Math.max(0, Math.min(emote.placeInComment ?? cursor, text.length));

		if (nextPosition > cursor) {
			parts.push({ type: 'text', value: text.slice(cursor, nextPosition) });
		}

		parts.push({
			type: 'emote',
			token: `[${emote.emoteId || 'emote'}]`,
			imageUrl: emote.imageUrl
		});
		cursor = nextPosition;
	}

	if (cursor < text.length) {
		parts.push({ type: 'text', value: text.slice(cursor) });
	}

	return parts;
}

export function messageSegments(text: string, emotes?: ChatEmote[]) {
	const resolvedEmotes = emotes?.filter((emote) => emote.imageUrl) ?? [];
	const hasBracketTokens = /\[[^[\]]+\]/.test(text);

	if (hasBracketTokens) {
		return buildSegmentsFromBracketTokens(text, resolvedEmotes);
	}

	if (resolvedEmotes.length > 0) {
		return buildSegmentsFromEmotePositions(text, resolvedEmotes);
	}

	return [{ type: 'text', value: text }] satisfies ChatSegment[];
}
