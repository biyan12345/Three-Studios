import type {
	BattleState,
	GroupPkState,
	RuntimeOverlayModeId,
	SceneRankingScore,
	SoloStageState,
	StickerDanceState
} from '$lib/app-types';
import { sanitizeCastNameList } from '$lib/helpers';

export type SceneRankingRow = {
	rank: number;
	name: string;
	score: number;
};

type SceneRankingStateInput = {
	battleState: BattleState;
	stickerDanceState: StickerDanceState;
	groupPkState: GroupPkState;
	soloStageState: SoloStageState;
	castNames?: string[];
	scores?: SceneRankingScore[];
};

type ScoredContestant = {
	name: string;
	score: number;
};

function scoreByName(contestants: ScoredContestant[]) {
	const scores = new Map<string, number>();

	for (const contestant of contestants) {
		const name = contestant.name.trim();
		if (!name) {
			continue;
		}

		scores.set(name, (scores.get(name) ?? 0) + Math.max(Math.floor(Number(contestant.score) || 0), 0));
	}

	return scores;
}

function rankedRows(names: string[], contestants: ScoredContestant[]) {
	const scores = scoreByName(contestants);
	const normalizedNames = sanitizeCastNameList([
		...names,
		...contestants.map((contestant) => contestant.name)
	]);

	return normalizedNames
		.map((name) => ({
			name,
			score: scores.get(name) ?? 0
		}))
		.sort((left, right) => right.score - left.score || left.name.localeCompare(right.name))
		.map((row, index) => ({
			...row,
			rank: index + 1
		}));
}

function rankedRowsFromScores(scores: SceneRankingScore[], castNames: string[] = []) {
	const rosterNames = sanitizeCastNameList(castNames);
	const restrictToRoster = rosterNames.length > 0;
	const allowedNames = new Set(rosterNames);
	const totals = new Map<string, number>();
	const discoveredNames: string[] = [];

	for (const row of scores) {
		const name = row.name.trim();
		if (!name || (restrictToRoster && !allowedNames.has(name))) {
			continue;
		}

		if (!totals.has(name)) {
			discoveredNames.push(name);
		}

		totals.set(name, (totals.get(name) ?? 0) + Math.max(Math.floor(Number(row.score) || 0), 0));
	}

	const names = restrictToRoster ? rosterNames : sanitizeCastNameList(discoveredNames);

	return names
		.map((name) => ({
			name,
			score: totals.get(name) ?? 0
		}))
		.sort((left, right) => right.score - left.score || left.name.localeCompare(right.name))
		.map((row, index) => ({
			...row,
			rank: index + 1
		}));
}

function sceneRankingRowsForSingleMode(
	modeId: RuntimeOverlayModeId,
	state: SceneRankingStateInput
) {
	switch (modeId) {
		case 'battle-ladder':
			return rankedRows(
				state.battleState.lineupOrder.length > 0
					? state.battleState.lineupOrder
					: state.battleState.settings.castNames,
				state.battleState.contestants
			);
		case 'group-sticker':
			return rankedRows(
				state.stickerDanceState.settings.roundCastNames.length > 0
					? state.stickerDanceState.settings.roundCastNames
					: state.stickerDanceState.settings.castNames,
				state.stickerDanceState.contestants
			);
		case 'group-pk':
			return rankedRows(
				state.groupPkState.settings.roundCastNames.length > 0
					? state.groupPkState.settings.roundCastNames
					: state.groupPkState.settings.castNames,
				state.groupPkState.contestants
			);
		case 'solo-target':
			return rankedRows(
				state.soloStageState.settings.roundCastNames.length > 0
					? state.soloStageState.settings.roundCastNames
					: state.soloStageState.settings.castNames,
				state.soloStageState.contestants
			);
		default:
			return [];
	}
}

export function sceneRankingRowsForMode(
	modeId: RuntimeOverlayModeId,
	state: SceneRankingStateInput
): SceneRankingRow[] {
	const rows = sceneRankingRowsForSingleMode(modeId, state);
	return (state.castNames?.length ?? 0) > 0 ? rankedRowsFromScores(rows, state.castNames) : rows;
}

export function sceneRankingRowsForScene(state: SceneRankingStateInput): SceneRankingRow[] {
	if (Array.isArray(state.scores)) {
		return rankedRowsFromScores(state.scores, state.castNames);
	}

	const totals = new Map<string, number>();
	const rosterNames = sanitizeCastNameList(state.castNames ?? []);
	const restrictToRoster = rosterNames.length > 0;
	const names = new Set<string>(rosterNames);

	for (const modeId of ['battle-ladder', 'group-sticker', 'group-pk', 'solo-target'] as const) {
		for (const row of sceneRankingRowsForSingleMode(modeId, state)) {
			if (restrictToRoster && !names.has(row.name)) {
				continue;
			}

			names.add(row.name);
			totals.set(row.name, (totals.get(row.name) ?? 0) + row.score);
		}
	}

	return Array.from(names)
		.map((name) => ({
			name,
			score: totals.get(name) ?? 0
		}))
		.sort((left, right) => right.score - left.score || left.name.localeCompare(right.name))
		.map((row, index) => ({
			...row,
			rank: index + 1
		}));
}
