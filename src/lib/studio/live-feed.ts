import {
	giftCatalogStoredId,
	resolveGiftCatalogEntry
} from '$lib/gift-catalog';
import type {
	AllMessageRow,
	ChatRow,
	EventRow,
	GiftRow,
	LiveFeedEvent
} from '$lib/app-types';
import {
	initials,
	normalizeUniqueId,
	resolveLiveUserBadges,
	resolveLiveUserIdentity
} from '$lib/studio/live-user';

export { avatarClassFromName, initials, normalizeUniqueId } from '$lib/studio/live-user';

export type StudioModeId = 'solo-target' | 'group-sticker' | 'group-pk' | 'battle-ladder';

export type LiveGiftAllocation = {
	allocated: boolean;
	castName?: string;
	modeId?: StudioModeId;
	modeLabel?: string;
	allocatedAt?: string;
	reason?: string;
	gameSessionId?: string;
};

type GiftMessage = Extract<LiveFeedEvent, { type: 'gift' }>;

function giftIcon(name: string) {
	const key = name.toLowerCase();
	if (key.includes('rose')) return '🌹';
	if (key.includes('pancake')) return '🥞';
	if (key.includes('universe')) return '🌐';
	if (key.includes('heart')) return '💖';
	return '🎁';
}

export function mappedGiftName(message: GiftMessage) {
	return resolveGiftCatalogEntry(message)?.name ?? message.giftName.trim();
}

export function mappedGiftId(message: GiftMessage) {
	return giftCatalogStoredId({ giftId: message.giftId });
}

export function resolveGiftCoins(message: GiftMessage, count: number) {
	const normalizedCount = Math.max(0, Math.floor(count));
	const catalogPoints = Number(resolveGiftCatalogEntry(message)?.points);
	if (normalizedCount <= 0 || !Number.isFinite(catalogPoints) || catalogPoints <= 0) return 0;
	return Math.floor(catalogPoints) * normalizedCount;
}

export function liveGiftGifterKey(message: GiftMessage) {
	return (
		message.userDetails?.userId?.trim() ||
		normalizeUniqueId(message.userDetails?.uniqueId) ||
		message.user?.trim().toLowerCase() ||
		''
	);
}

export function normalizeGiftCount(count: unknown) {
	const normalizedCount = Number(count);
	return Number.isFinite(normalizedCount) && normalizedCount > 0
		? Math.floor(normalizedCount)
		: 0;
}

export function normalizeEventId(value: unknown) {
	if (typeof value === 'number' && Number.isFinite(value)) return String(value);
	return typeof value === 'string' ? value.trim() : '';
}

export function giftBackendEventId(message: GiftMessage) {
	return (
		normalizeEventId(message.eventID) ||
		normalizeEventId(message.eventId) ||
		normalizeEventId(message.event_id) ||
		normalizeEventId(message.id)
	);
}

export function giftEventKey(message: GiftMessage) {
	return giftBackendEventId(message) || `gift-${Date.now()}-${Math.random()}`;
}

export function liveMessageId(message: { id?: string; eventID?: string | number }) {
	return normalizeEventId(message.eventID) || normalizeEventId(message.id);
}

export function mapGift(
	message: GiftMessage,
	options: { giftKey?: string; countValue?: number } = {}
): GiftRow {
	const premium = /universe|lion|falcon|castle/i.test(message.giftName);
	const catalogEntry = resolveGiftCatalogEntry(message);
	const countValue = normalizeGiftCount(options.countValue ?? message.count);
	const identity = resolveLiveUserIdentity(message.userDetails, message.user ?? '');
	return {
		giftKey: options.giftKey ?? giftEventKey(message),
		countValue,
		user: identity.name,
		handle: identity.handle,
		text: `sent ${catalogEntry?.name ?? message.giftName}`,
		count: `x${countValue}`,
		icon: giftIcon(catalogEntry?.name ?? message.giftName),
		imageUrl: catalogEntry?.giftImageUrl ?? message.giftImageUrl,
		points: catalogEntry?.points,
		avatar: identity.avatar,
		avatarClass: identity.avatarClass,
		avatarUrl: identity.avatarUrl,
		viewer: message.userDetails,
		rowClass: premium
			? 'bg-[linear-gradient(90deg,rgba(109,40,217,0.75),rgba(59,130,246,0.22))] border-violet-400/20'
			: '',
		accent: premium ? 'text-violet-200' : 'text-slate-100'
	};
}

export function mapChat(message: Extract<LiveFeedEvent, { type: 'chat' }>): ChatRow {
	const identity = resolveLiveUserIdentity(message.userDetails, message.user ?? '');
	const badges = resolveLiveUserBadges(message.userDetails);
	return {
		avatar: identity.avatar,
		avatarClass: identity.avatarClass,
		avatarUrl: identity.avatarUrl,
		user: identity.name,
		handle: identity.handle,
		text: message.text,
		emotes: message.emotes,
		badge: badges.badge,
		badgeClass: badges.badgeClass,
		extraBadges: badges.extraBadges,
		viewer: message.userDetails
	};
}

export function mapChatFeedMessage(message: Extract<LiveFeedEvent, { type: 'chat' }>): AllMessageRow {
	const row = mapChat(message);
	return {
		id: liveMessageId(message),
		kind: 'chat',
		avatar: row.avatar,
		avatarClass: row.avatarClass,
		avatarUrl: row.avatarUrl,
		user: row.user,
		handle: row.handle,
		text: row.text,
		emotes: row.emotes,
		badge: row.badge,
		badgeClass: row.badgeClass,
		extraBadges: row.extraBadges,
		viewer: row.viewer
	};
}

export function mapLike(message: Extract<LiveFeedEvent, { type: 'like' }>): EventRow {
	const identity = resolveLiveUserIdentity(message.userDetails, message.user ?? '');
	return {
		text: `${identity.name} sent ${message.count} like${message.count > 1 ? 's' : ''}`,
		badge: 'Like',
		badgeClass: 'bg-pink-500/20 text-pink-100 border border-pink-400/20'
	};
}

export function mapLikeFeedMessage(message: Extract<LiveFeedEvent, { type: 'like' }>): AllMessageRow {
	const identity = resolveLiveUserIdentity(message.userDetails, message.user ?? '');
	const badges = resolveLiveUserBadges(message.userDetails);
	return {
		id: liveMessageId(message),
		kind: 'event',
		avatar: identity.avatar,
		avatarClass: identity.avatarClass,
		avatarUrl: identity.avatarUrl,
		user: identity.name,
		handle: identity.handle,
		text: `sent ${message.count} like${message.count > 1 ? 's' : ''}`,
		badge: 'Like',
		badgeClass: 'bg-pink-500/20 text-pink-100 border border-pink-400/20',
		extraBadges: badges.extraBadges,
		viewer: message.userDetails
	};
}

export function mapGiftEvent(message: GiftMessage): EventRow {
	const catalogEntry = resolveGiftCatalogEntry(message);
	const identity = resolveLiveUserIdentity(message.userDetails, message.user ?? '');
	const countValue = normalizeGiftCount(message.count);
	return {
		text: `${identity.name} sent ${catalogEntry?.name ?? message.giftName} x${countValue}`,
		badge: 'Gift',
		badgeClass: 'bg-violet-500/20 text-violet-100 border border-violet-400/20'
	};
}

export function mapGiftFeedMessage(
	message: GiftMessage,
	options: {
		giftKey?: string;
		countValue?: number;
		giftCoins?: number;
		allocation?: LiveGiftAllocation;
	} = {}
): AllMessageRow {
	const row = mapGift(message, options);
	const badges = resolveLiveUserBadges(message.userDetails);
	const giftId = mappedGiftId(message);
	const giftName = mappedGiftName(message);
	const coins = resolveGiftCoins(message, row.countValue) || row.countValue;
	const giftCoins = Math.max(0, Math.floor(Number(options.giftCoins ?? coins) || 0));
	const allocatedCoins = options.allocation?.allocated ? giftCoins : 0;
	const unallocatedCoins = options.allocation?.allocated ? 0 : giftCoins;
	return {
		id: giftBackendEventId(message) || liveMessageId(message) || row.giftKey,
		capturedAt: new Date().toISOString(),
		kind: 'gift',
		giftKey: row.giftKey,
		giftId,
		giftName,
		coins,
		allocatedCoins,
		unallocatedCoins,
		allocationStatus: options.allocation?.allocated ? 'allocated' : 'unallocated',
		allocatedCastName: options.allocation?.castName,
		allocationModeId: options.allocation?.modeId,
		allocationModeLabel: options.allocation?.modeLabel,
		allocatedAt: options.allocation?.allocatedAt,
		allocationReason: options.allocation?.reason,
		gameSessionId: options.allocation?.gameSessionId,
		countValue: row.countValue,
		avatar: row.avatar,
		avatarClass: row.avatarClass,
		avatarUrl: row.avatarUrl,
		user: row.user,
		handle: row.handle,
		text: row.text,
		badge: badges.badge,
		badgeClass: badges.badgeClass,
		extraBadges: badges.extraBadges,
		imageUrl: row.imageUrl,
		icon: row.icon,
		count: row.count,
		accent: row.accent,
		viewer: message.userDetails
	};
}

export function mapSocial(message: Extract<LiveFeedEvent, { type: 'social' }>): EventRow {
	const identity = resolveLiveUserIdentity(message.userDetails, message.user ?? '');
	return {
		text:
			message.action === 'follow'
				? `${identity.name} followed the host`
				: message.action === 'share'
					? `${identity.name} shared the LIVE`
					: `${identity.name} joined the LIVE`,
		badge: message.action === 'follow' ? 'Follow' : message.action === 'share' ? 'Share' : 'Join',
		badgeClass:
			message.action === 'follow'
				? 'bg-emerald-500/20 text-emerald-100 border border-emerald-400/20'
				: message.action === 'share'
					? 'bg-cyan-500/20 text-cyan-100 border border-cyan-400/20'
					: 'bg-violet-500/20 text-violet-100 border border-violet-400/20'
	};
}

export function mapSocialFeedMessage(
	message: Extract<LiveFeedEvent, { type: 'social' }>
): AllMessageRow {
	const identity = resolveLiveUserIdentity(message.userDetails, message.user ?? '');
	const badges = resolveLiveUserBadges(message.userDetails);
	return {
		id: liveMessageId(message),
		kind: 'event',
		avatar: identity.avatar,
		avatarClass: identity.avatarClass,
		avatarUrl: identity.avatarUrl,
		user: identity.name,
		handle: identity.handle,
		text:
			message.action === 'follow'
				? 'followed the host'
				: message.action === 'share'
					? 'shared the LIVE'
					: 'joined the LIVE',
		badge: message.action === 'follow' ? 'Follow' : message.action === 'share' ? 'Share' : 'Join',
		badgeClass:
			message.action === 'follow'
				? 'bg-emerald-500/20 text-emerald-100 border border-emerald-400/20'
				: message.action === 'share'
					? 'bg-cyan-500/20 text-cyan-100 border border-cyan-400/20'
					: 'bg-violet-500/20 text-violet-100 border border-violet-400/20',
		extraBadges: badges.extraBadges,
		viewer: message.userDetails
	};
}

export function mapStatusEvent(message: Extract<LiveFeedEvent, { type: 'status' }>): EventRow | null {
	if (message.status === 'idle') return null;
	if (message.status === 'connected') {
		return {
			text: `${message.uniqueId} LIVE connected`,
			badge: 'Live',
			badgeClass: 'bg-emerald-500/20 text-emerald-100 border border-emerald-400/20'
		};
	}
	if (message.status === 'connecting') {
		return {
			text: `Connecting to ${message.uniqueId} LIVE`,
			badge: 'Live',
			badgeClass: 'bg-cyan-500/20 text-cyan-100 border border-cyan-400/20'
		};
	}
	if (message.status === 'disconnected') {
		return {
			text: message.message || `${message.uniqueId} LIVE disconnected`,
			badge: 'Live',
			badgeClass: 'bg-slate-500/20 text-slate-200 border border-slate-400/20'
		};
	}
	return {
		text: message.message || `${message.uniqueId} LIVE error`,
		badge: 'Alert',
		badgeClass: 'bg-rose-500/20 text-rose-100 border border-rose-400/20'
	};
}

export function mapStatusFeedMessage(
	message: Extract<LiveFeedEvent, { type: 'status' }>
): AllMessageRow | null {
	const event = mapStatusEvent(message);
	if (!event) return null;
	return {
		id: `${message.status}-${message.uniqueId}-${message.startedAt ?? message.roomId ?? crypto.randomUUID()}`,
		kind: 'event',
		avatar: initials(message.uniqueId || 'LIVE'),
		avatarClass:
			message.status === 'connected'
				? 'bg-[linear-gradient(135deg,#18b07a,#0b4d35)]'
				: message.status === 'error'
					? 'bg-[linear-gradient(135deg,#d54f67,#6b1b28)]'
					: 'bg-[linear-gradient(135deg,#50627c,#1d2530)]',
		user: message.uniqueId || 'LIVE',
		text:
			message.status === 'connected'
				? 'LIVE connected'
				: message.status === 'connecting'
					? 'LIVE connecting'
					: message.message ||
						(message.status === 'disconnected' ? 'LIVE disconnected' : 'LIVE error'),
		badge: event.badge,
		badgeClass: event.badgeClass
	};
}
