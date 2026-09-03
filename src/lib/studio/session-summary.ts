export type FinalLiveScoreRow = {
	name: string;
	score: number;
	detail?: string;
};

export type FinalLiveCastScores = {
	rows: FinalLiveScoreRow[];
	totalCoins?: number;
	allocatedCoins?: number;
	unallocatedCoins?: number;
};

export function hasFinalLiveModeScores(
	summary: FinalLiveCastScores | null | undefined
): summary is FinalLiveCastScores {
	return (summary?.rows.length ?? 0) > 0;
}

export function hasFinalLiveScoreSummary(
	summary: FinalLiveCastScores | null | undefined
): summary is FinalLiveCastScores {
	return Boolean(
		(summary?.rows.length ?? 0) > 0 ||
			(summary?.totalCoins ?? 0) > 0 ||
			(summary?.allocatedCoins ?? 0) > 0 ||
			(summary?.unallocatedCoins ?? 0) > 0
	);
}

export function finalLiveTotalCoins(summary: FinalLiveCastScores | null | undefined) {
	return summary?.totalCoins ?? 0;
}

export function finalLiveAllocatedCoins(summary: FinalLiveCastScores | null | undefined) {
	return summary?.allocatedCoins ?? 0;
}

export function finalLiveUnallocatedCoins(summary: FinalLiveCastScores | null | undefined) {
	return summary?.unallocatedCoins ?? 0;
}
