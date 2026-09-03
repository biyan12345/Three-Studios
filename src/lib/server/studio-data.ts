import { normalizeTikTokUsername, trimValue } from '$lib/helpers';
import type { StudioBootstrap, StudioProfile } from '$lib/app-types';

function authorizedProfiles(profiles: StudioProfile[]) {
	const timestamp = new Date().toISOString();
	const seen = new Set<string>();

	return profiles
		.map((profile) => {
			const username = normalizeTikTokUsername(profile.username);
			const id = trimValue(profile.id);

			return {
				id,
				username,
				displayName: trimValue(profile.displayName) || username,
				createdAt: trimValue(profile.createdAt) || timestamp,
				lastUsedAt: trimValue(profile.lastUsedAt) || trimValue(profile.createdAt) || timestamp
			} satisfies StudioProfile;
		})
		.filter((profile) => {
			if (!profile.id || !profile.username || seen.has(profile.id)) {
				return false;
			}

			seen.add(profile.id);
			return true;
		})
		.sort(
			(left, right) =>
				right.lastUsedAt.localeCompare(left.lastUsedAt) ||
				right.createdAt.localeCompare(left.createdAt)
		);
}

export function getStudioBootstrap(authorized: StudioProfile[]): StudioBootstrap {
	const profiles = authorizedProfiles(authorized);

	return {
		activeProfile: profiles[0] ?? null
	};
}
