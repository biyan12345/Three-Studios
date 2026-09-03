export type GifterRankingCandidate = {
	id: string;
	name: string;
	handle?: string;
	avatar: string;
	avatarClass: string;
	avatarUrl?: string;
	totalScore: number;
	allocatedScore?: number;
	castName?: string;
};

export type GifterRankingRow = Omit<GifterRankingCandidate, 'totalScore' | 'allocatedScore' | 'castName'> & {
	score: number;
};

export type GifterRankingGroup = {
	castName: string;
	gifters: GifterRankingRow[];
};

function normalizedScore(value: unknown) {
	const score = Math.floor(Number(value));
	return Number.isFinite(score) ? Math.max(score, 0) : 0;
}

export function rankGifters(
	candidates: GifterRankingCandidate[],
	options: { castName?: string; limit?: number } = {}
) {
	const scores = new Map<string, GifterRankingRow>();
	for (const candidate of candidates) {
		if (options.castName && candidate.castName !== options.castName) continue;
		const score = normalizedScore(
			options.castName ? candidate.allocatedScore : candidate.totalScore
		);
		if (!candidate.id || score <= 0) continue;
		const current = scores.get(candidate.id);
		scores.set(candidate.id, {
			id: candidate.id,
			name: current?.name ?? candidate.name,
			handle: current?.handle ?? candidate.handle,
			avatar: current?.avatar ?? candidate.avatar,
			avatarClass: current?.avatarClass ?? candidate.avatarClass,
			avatarUrl: current?.avatarUrl ?? candidate.avatarUrl,
			score: (current?.score ?? 0) + score
		});
	}
	const ranked = [...scores.values()].sort(
		(left, right) => right.score - left.score || left.name.localeCompare(right.name)
	);
	return options.limit ? ranked.slice(0, options.limit) : ranked;
}

export function rankGiftersByCast(
	candidates: GifterRankingCandidate[],
	castNames: string[],
	limit = 10
): GifterRankingGroup[] {
	return castNames.map((castName) => ({
		castName,
		gifters: rankGifters(candidates, { castName, limit })
	}));
}
