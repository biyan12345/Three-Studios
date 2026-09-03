import { normalizeTikTokUsername } from '$lib/helpers';
import type { LiveUser, UserBadgeRow } from '$lib/app-types';

export function initials(user: string) {
	return user
		.split(/\s+/)
		.map((part) => part[0])
		.join('')
		.slice(0, 2)
		.toUpperCase();
}

export function avatarClassFromName(user: string) {
	const palette = [
		'bg-[linear-gradient(135deg,#4b87c8,#203d63)]',
		'bg-[linear-gradient(135deg,#7b61ff,#4532a9)]',
		'bg-[linear-gradient(135deg,#d49a7f,#7a3f39)]',
		'bg-[linear-gradient(135deg,#f59e0b,#8a4b00)]',
		'bg-[linear-gradient(135deg,#9a7658,#47352a)]'
	];
	const seed = user.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
	return palette[seed % palette.length];
}

export function normalizeUniqueId(value?: string) {
	return normalizeTikTokUsername(value);
}

export function resolveLiveUserIdentity(userDetails: LiveUser | undefined, fallbackUser = '') {
	const uniqueId = normalizeUniqueId(userDetails?.uniqueId);
	const nickname = userDetails?.nickname?.trim() ?? '';
	const displayName = userDetails?.displayName?.trim() ?? '';
	const fallback = fallbackUser.trim();
	const primaryName = displayName || nickname || fallback || uniqueId || 'User';
	const avatarSeed = uniqueId || primaryName || fallback || 'User';

	return {
		name: primaryName,
		handle: uniqueId ? `@${uniqueId}` : '',
		avatar: initials(primaryName),
		avatarClass: avatarClassFromName(avatarSeed),
		avatarUrl: userDetails?.profilePictureUrl?.trim() || undefined,
		uniqueId,
		userId: userDetails?.userId?.trim() ?? ''
	};
}

function pushBadge(badges: UserBadgeRow[], label: string | undefined, className: string) {
	const trimmed = label?.trim();
	if (!trimmed || badges.some((badge) => badge.label === trimmed)) return;
	badges.push({ label: trimmed, class: className });
}

export function resolveLiveUserBadges(userDetails?: LiveUser) {
	if (!userDetails) {
		return { badge: undefined, badgeClass: undefined, extraBadges: undefined };
	}

	const extraBadges: UserBadgeRow[] = [];
	let badge: string | undefined;
	let badgeClass: string | undefined;
	const gifterLevel =
		typeof userDetails.levels?.gifterLevel === 'number' && userDetails.levels.gifterLevel > 0
			? userDetails.levels.gifterLevel
			: null;
	const memberLevel =
		typeof userDetails.levels?.memberLevel === 'number' && userDetails.levels.memberLevel > 0
			? userDetails.levels.memberLevel
			: null;
	const levelBadgeClass =
		'bg-[linear-gradient(180deg,#7ca8ff,#5f84ef)] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]';
	const memberBadgeClass =
		'bg-[linear-gradient(180deg,#f6b27c,#eb8e66)] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.16)]';

	if (gifterLevel !== null) {
		badge = `◈ ${gifterLevel}`;
		badgeClass = levelBadgeClass;
	} else if (memberLevel !== null) {
		badge = `♥ ${memberLevel}`;
		badgeClass = memberBadgeClass;
	} else if (userDetails.verified) {
		badge = 'Verified';
		badgeClass = 'bg-cyan-500/20 text-cyan-100 border border-cyan-400/20';
	}

	if (memberLevel !== null && badge !== `♥ ${memberLevel}`) {
		pushBadge(extraBadges, `♥ ${memberLevel}`, memberBadgeClass);
	}
	if (userDetails.verified && badge !== 'Verified') {
		pushBadge(extraBadges, 'Verified', 'bg-cyan-500/20 text-cyan-100 border border-cyan-400/20');
	}
	if (userDetails.isModerator) {
		pushBadge(extraBadges, 'Mod', 'bg-rose-500/20 text-rose-100 border border-rose-400/20');
	}
	if (userDetails.isSubscriber) {
		pushBadge(extraBadges, 'Sub', 'bg-fuchsia-500/20 text-fuchsia-100 border border-fuchsia-400/20');
	}
	if (userDetails.isNewGifter) {
		pushBadge(extraBadges, 'New Gifter', 'bg-orange-500/20 text-orange-100 border border-orange-400/20');
	}
	if (gifterLevel !== null && badge !== `◈ ${gifterLevel}`) {
		pushBadge(extraBadges, `◈ ${gifterLevel}`, levelBadgeClass);
	}

	return {
		badge,
		badgeClass,
		extraBadges: extraBadges.length > 0 ? extraBadges : undefined
	};
}
