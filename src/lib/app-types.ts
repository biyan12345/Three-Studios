export type RuntimeOverlayModeId =
	| 'solo-target'
	| 'group-sticker'
	| 'group-pk'
	| 'battle-ladder'
	| null;

export type RuntimeOverlayFrame = {
	x: number;
	y: number;
	width: number;
	height: number;
};

export type SceneRankingScore = {
	name: string;
	score: number;
};

export type ScoreHistoryModeId =
	| 'battle-ladder'
	| 'group-sticker'
	| 'group-pk'
	| 'solo-target';

export type ScoreHistoryContestant = {
	name: string;
	score: number;
};

export type ScoreHistoryEntry = {
	id: string;
	modeId: ScoreHistoryModeId;
	modeLabel: string;
	title: string;
	dayKey: string;
	startedAt: string;
	endedAt: string;
	totalScore: number;
	unallocatedScore: number;
	winnerNames: string[];
	contestants: ScoreHistoryContestant[];
};

export type DailyScoreHistory = {
	dayKey: string;
	calculationCount: number;
	liveSessionCount: number;
	totalGiftCount: number;
	totalScore: number;
	unallocatedScore: number;
	modeTotals: Partial<Record<ScoreHistoryModeId, number>>;
	castTotals: ScoreHistoryContestant[];
};

export type LiveSessionGiftHistory = {
	id: string;
	capturedAt: string;
	viewerName: string;
	viewerUsername?: string;
	viewerAvatarUrl?: string;
	giftId?: string;
	giftName: string;
	giftImageUrl?: string;
	count: number;
	coins: number;
	allocatedCoins: number;
	unallocatedCoins: number;
	allocatedTo?: string;
	allocationModeId?: ScoreHistoryModeId;
	allocationModeLabel?: string;
	allocatedAt?: string;
	allocationReason?: string;
	gameSessionId?: string;
};

export type LiveSessionGameSnapshot = {
	id: string;
	modeId: ScoreHistoryModeId;
	modeLabel: string;
	reason: string;
	capturedAt: string;
	totalCoins: number;
	allocatedCoins: number;
	unallocatedCoins: number;
	rows: ScoreHistoryContestant[];
};

export type LiveSessionGameHistory = {
	id: string;
	modeId: ScoreHistoryModeId;
	modeLabel: string;
	startedAt: string;
	endedAt: string;
	totalCoins: number;
	allocatedCoins: number;
	unallocatedCoins: number;
	rows: ScoreHistoryContestant[];
	snapshots: LiveSessionGameSnapshot[];
	gifts: LiveSessionGiftHistory[];
};

export type LiveSessionHistoryEntry = {
	id: string;
	dayKey: string;
	uniqueId: string;
	roomId?: string;
	startedAt: string;
	endedAt: string;
	durationSeconds: number;
	totalGiftCount: number;
	totalCapturedCoins: number;
	allocatedCoins: number;
	unallocatedCoins: number;
	totalViews: number;
	totalLikes: number;
	totalFollows: number;
	peakViewers: number;
	outsideGameScores: ScoreHistoryContestant[];
	gifts: LiveSessionGiftHistory[];
	gameSnapshots: LiveSessionGameSnapshot[];
	gameSessions: LiveSessionGameHistory[];
};

export type NewLiveSessionHistoryEntry = Omit<
	LiveSessionHistoryEntry,
	'id' | 'dayKey' | 'durationSeconds'
> & { id?: string };

export type ScoreHistoryResponse = {
	timeZone: string;
	days: DailyScoreHistory[];
	entries: ScoreHistoryEntry[];
	liveSessions: LiveSessionHistoryEntry[];
};

export type SceneRankingsSettings = {
	enabled: boolean;
	frame: RuntimeOverlayFrame;
	castNames: string[];
	scores?: SceneRankingScore[];
};

export type GifterBindingSettings = {
	enabled: boolean;
};

export type RuntimeOverlayCustomCodeSettings = {
	css: string;
};

export type SceneRandomizerId = 'lucky-wheel';

export type SceneRandomizerSettings = {
	frame: RuntimeOverlayFrame;
	options: string[];
	resultHoldMs: number;
};

export type SceneRandomizerRun = {
	id: string;
	randomizerId: SceneRandomizerId;
	result: string;
	resultIndex: number;
	options: string[];
	startedAt: string;
	durationMs: number;
	resultHoldMs: number;
	seed: number;
};

export type SceneRandomizersState = {
	items: Record<SceneRandomizerId, SceneRandomizerSettings>;
	activeRun: SceneRandomizerRun | null;
};

export type RuntimeOverlayState = {
	activeModeId: RuntimeOverlayModeId;
	visible: boolean;
	frame: RuntimeOverlayFrame;
	rankings: SceneRankingsSettings;
	gifterBinding: GifterBindingSettings;
	sceneRandomizers: SceneRandomizersState;
	customCode: RuntimeOverlayCustomCodeSettings;
	version: number;
	lastUpdatedAt: string;
};

export type RuntimeOverlayCommand =
	| {
			action: 'setMode';
			modeId: RuntimeOverlayModeId;
	  }
	| {
			action: 'setVisible';
			visible: boolean;
	  }
	| {
			action: 'setFrame';
			frame: RuntimeOverlayFrame;
	  }
	| {
			action: 'setRankings';
			rankings: Partial<SceneRankingsSettings>;
	  }
	| {
			action: 'setGifterBinding';
			gifterBinding: Partial<GifterBindingSettings>;
	  }
	| {
			action: 'setSceneRandomizer';
			randomizerId: SceneRandomizerId;
			settings: Partial<SceneRandomizerSettings>;
	  }
	| {
			action: 'setCustomCode';
			customCode: Partial<RuntimeOverlayCustomCodeSettings>;
	  }
	| {
			action: 'playSceneRandomizer';
			randomizerId: SceneRandomizerId;
	  }
	| {
			action: 'clearSceneRandomizer';
	  }
	| {
			action: 'resetFrame';
	  };

export type BattleSide = 'left' | 'right';

export type BattlePhase = 'idle' | 'live' | 'ended';

export type BattleGift = {
	giftId?: string;
	giftName: string;
	giftImageUrl?: string;
};

export type BattleGiftTotal = {
	giftId?: string;
	giftName: string;
	giftImageUrl?: string;
	count: number;
};

export type BattleContestant = {
	id: string;
	side: BattleSide;
	name: string;
	avatar: string;
	gifts: BattleGift[];
	score: number;
	voters: number;
};

export type PkVisualEffect = 'none' | 'freeze' | 'fire' | 'thunder' | 'gold-crown' | 'gift-blast';
export type BattleLineStyle = 'none' | 'white' | 'fire';
export type BattleScoreEffect = PkVisualEffect;

export type BattleSettings = {
	title: string;
	durationSeconds: number;
	castNames: string[];
	leftGifts: string[];
	rightGifts: string[];
	giftsByCast: Record<string, string[]>;
	overlayFrame: RuntimeOverlayFrame;
	lineFrame: RuntimeOverlayFrame;
	lineStyle: BattleLineStyle;
	scoreEffect: BattleScoreEffect;
	/** @deprecated Kept for compatibility with settings saved before lineStyle was added. */
	showBattlePkLineOverlaySurface: boolean;
};

export type BattleState = {
	settings: BattleSettings;
	phase: BattlePhase;
	contestants: BattleContestant[];
	lineupOrder: string[];
	totalVotes: number;
	unallocatedVotes: number;
	unallocatedGifts: BattleGiftTotal[];
	collecting: boolean;
	startedAt: string | null;
	endsAt: string | null;
	lastUpdatedAt: string;
	eventText: string;
};

export type BattleCommand =
	| {
			action: 'replaceSettings';
			settings: Partial<BattleSettings>;
	  }
	| {
			action: 'reorderLineup';
			castNames: string[];
	  }
	| {
			action: 'addScore';
			side: BattleSide;
			amount: number;
	  }
	| {
			action: 'transferScore';
			fromSide: BattleSide | null;
			toSide: BattleSide;
			amount: number;
	  }
	| {
			action: 'start';
			settings?: Partial<BattleSettings>;
	  }
	| {
			action: 'endRound';
	  }
	| {
			action: 'resetScores';
	  }
	| {
			action: 'gift';
			giftId?: string;
			giftName: string;
			count?: number;
			targetCastName?: string;
			gifterId?: string;
	  };

type GroupPkPhase = 'idle' | 'live' | 'ended';

export type GroupPkGift = {
	giftId?: string;
	giftName: string;
	giftImageUrl?: string;
};

export type GroupPkGiftEvent = {
	id: string;
	receivedAt: string;
	giftId?: string;
	giftName: string;
	giftImageUrl?: string;
	count: number;
	targetCastName: string | null;
};

export type GroupPkGiftTotal = {
	giftId?: string;
	giftName: string;
	giftImageUrl?: string;
	count: number;
};

export type GroupPkContestant = {
	id: string;
	name: string;
	avatar: string;
	gifts: GroupPkGift[];
	score: number;
	voters: number;
};

export type GroupPkGiftMap = Record<string, string[]>;

export type GroupPkSettings = {
	title: string;
	durationSeconds: number;
	castNames: string[];
	roundCastNames: string[];
	giftsByCast: GroupPkGiftMap;
	visualEffect: PkVisualEffect;
};

export type GroupPkState = {
	settings: GroupPkSettings;
	phase: GroupPkPhase;
	contestants: GroupPkContestant[];
	totalVotes: number;
	unallocatedVotes: number;
	unallocatedGifts: GroupPkGiftTotal[];
	giftEvents: GroupPkGiftEvent[];
	collecting: boolean;
	startedAt: string | null;
	endsAt: string | null;
	lastUpdatedAt: string;
	eventText: string;
};

export type GroupPkRoundResult = {
	id: string;
	title: string;
	startedAt: string;
	endedAt: string;
	durationSeconds: number;
	totalVotes: number;
	unallocatedVotes: number;
	unallocatedGifts: GroupPkGiftTotal[];
	giftEvents: GroupPkGiftEvent[];
	winnerNames: string[];
	contestants: GroupPkContestant[];
};

export type GroupPkCommand =
	| {
			action: 'replaceSettings';
			settings: Partial<GroupPkSettings>;
	  }
	| {
			action: 'addScore';
			castName: string;
			amount: number;
	  }
	| {
			action: 'transferScore';
			fromCastName: string | null;
			toCastName: string;
			amount: number;
	  }
	| {
			action: 'start';
			settings?: Partial<GroupPkSettings>;
	  }
	| {
			action: 'endRound';
	  }
	| {
			action: 'resetScores';
	  }
	| {
			action: 'gift';
			giftId?: string;
			giftName: string;
			count?: number;
			targetCastName?: string;
			gifterId?: string;
	  };

export type SoloStageContestant = {
	id: string;
	name: string;
	avatar: string;
	giftIcon: string;
	score: number;
	giftSenders: number;
};

export type SoloStageScoreMode = 'target' | 'freedom';

export type SoloStageSettings = {
	title: string;
	scoreMode: SoloStageScoreMode;
	durationSeconds: number;
	castNames: string[];
	roundCastNames: string[];
	targetA: number;
	targetB: number;
	visualEffect: PkVisualEffect;
};

type SoloStagePhase = 'idle' | 'live' | 'ended';

export type SoloStageState = {
	settings: SoloStageSettings;
	phase: SoloStagePhase;
	activeContestantIndex: number;
	contestants: SoloStageContestant[];
	totalAmount: number;
	totalGiftSenders: number;
	collecting: boolean;
	startedAt: string | null;
	endsAt: string | null;
	lastUpdatedAt: string;
	eventText: string;
};

export type SoloStageCommand =
	| {
			action: 'replaceSettings';
			settings: Partial<SoloStageSettings>;
	  }
	| {
			action: 'selectCast';
			index: number;
	  }
	| {
			action: 'reorderCast';
			castNames: string[];
	  }
	| {
			action: 'start';
			settings?: Partial<SoloStageSettings>;
	  }
	| {
			action: 'endRound';
	  }
	| {
			action: 'setCollecting';
			collecting: boolean;
	  }
	| {
			action: 'addScore';
			amount: number;
			countGiftSender?: boolean;
	  }
	| {
			action: 'transferScore';
			fromCastName: string;
			toCastName: string;
			amount: number;
	  }
	| {
			action: 'resetScores';
	  };

type StickerDancePhase = 'idle' | 'live' | 'ended';

export type StickerDanceContestant = {
	id: string;
	name: string;
	avatar: string;
	giftId?: string;
	giftName: string;
	giftImageUrl?: string;
	score: number;
	voters: number;
};

export type StickerDanceStickerMap = Record<string, string>;

export type StickerDanceGiftTotal = {
	giftId?: string;
	giftName: string;
	giftImageUrl?: string;
	count: number;
};

export type StickerDanceSettings = {
	title: string;
	castNames: string[];
	roundCastNames: string[];
	stickerByCast: StickerDanceStickerMap;
	visualEffect: PkVisualEffect;
};

export type StickerDanceState = {
	settings: StickerDanceSettings;
	phase: StickerDancePhase;
	contestants: StickerDanceContestant[];
	totalVotes: number;
	unallocatedVotes: number;
	unallocatedGifts: StickerDanceGiftTotal[];
	collecting: boolean;
	startedAt: string | null;
	lastUpdatedAt: string;
	eventText: string;
};

export type StickerDanceRoundResult = {
	id: string;
	title: string;
	startedAt: string;
	endedAt: string;
	durationSeconds: number;
	totalVotes: number;
	unallocatedVotes: number;
	unallocatedGifts: StickerDanceGiftTotal[];
	winnerNames: string[];
	contestants: StickerDanceContestant[];
};

export type StickerDanceCommand =
	| {
			action: 'replaceSettings';
			settings: Partial<StickerDanceSettings>;
	  }
	| {
			action: 'addScore';
			castName: string;
			amount: number;
	  }
	| {
			action: 'transferScore';
			fromCastName: string | null;
			toCastName: string;
			amount: number;
	  }
	| {
			action: 'start';
			settings?: Partial<StickerDanceSettings>;
	  }
	| {
			action: 'endRound';
	  }
	| {
			action: 'resetScores';
	  }
	| {
			action: 'gift';
			giftId?: string;
			giftName: string;
			count?: number;
			targetCastName?: string;
			gifterId?: string;
	  };

export type StudioProfile = {
	id: string;
	username: string;
	displayName: string;
	createdAt: string;
	lastUsedAt: string;
};

export type StudioCast = {
	id: string;
	username: string;
	nickname: string;
	createdAt: string;
};

export type StudioBootstrap = {
	activeProfile: StudioProfile | null;
};

export type StudioProfileCastsResponse = {
	ok: true;
	casts: StudioCast[];
};

export type ProfileGameSetting = {
	gameKey: string;
	updatedAt: string;
	config: Record<string, unknown>;
};

export type AuthSessionTokens = {
	ok: true;
	userId: string;
	sessionId: string;
	tiktokProfileId: string;
	accessToken: string;
	refreshToken: string;
	tokenType: string;
	accessTokenExpiresAt: number;
	accessTokenExpiresIn: number;
};

export type AuthLoginResponse = AuthSessionTokens;

export type AuthSessionRefreshResponse = AuthSessionTokens;

export type PersistedAuthSession = Pick<
	AuthLoginResponse,
	| 'userId'
	| 'sessionId'
	| 'tiktokProfileId'
	| 'accessToken'
	| 'refreshToken'
	| 'accessTokenExpiresAt'
>;

export type ProfileGameSettingsResponse = {
	ok: true;
	gameSettings: ProfileGameSetting[];
};

export type LiveStatus = 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error';

export type LiveErrorKind =
	| 'offline'
	| 'not_found'
	| 'rate_limited'
	| 'generic'
	| 'disabled'
	| undefined;

export type LiveUserLevels = {
	gifterLevel?: number;
	memberLevel?: number;
};

export type LiveUserFollowInfo = {
	followingCount?: number;
	followerCount?: number;
	followStatus?: number;
};

export type LiveUser = {
	userId?: string;
	uniqueId?: string;
	nickname?: string;
	displayName?: string;
	profilePictureUrl?: string;
	bio?: string;
	bioDescription?: string;
	verified?: boolean;
	isModerator?: boolean;
	isSubscriber?: boolean;
	isNewGifter?: boolean;
	isFollower?: boolean;
	isFollowing?: boolean;
	isMutualFollowing?: boolean;
	followerCount?: number;
	followingCount?: number;
	followInfo?: LiveUserFollowInfo;
	levels?: LiveUserLevels;
};

export type LiveTopViewer = {
	rank: number;
	name: string;
	score: string;
	user?: LiveUser;
};

export type ChatEmote = {
	emoteId: string;
	imageUrl: string;
	placeInComment?: number;
};

export type LiveFeedEvent =
	| {
			type: 'status';
			id?: string;
			eventID?: string | number;
			status: LiveStatus;
			uniqueId: string;
			viewerCount: number;
			roomId?: string;
			startedAt?: string;
			message?: string;
			errorKind?: LiveErrorKind;
	  }
	| {
			type: 'chat';
			id?: string;
			eventID?: string | number;
			user?: string;
			userDetails?: LiveUser;
			text: string;
			emotes?: ChatEmote[];
	  }
	| {
			type: 'gift';
			id?: string;
			eventId?: string | number;
			eventID?: string | number;
			event_id?: string | number;
			user?: string;
			userDetails?: LiveUser;
			giftId: string;
			giftName: string;
			giftImageUrl?: string;
			count: number;
			groupId?: string;
	  }
	| {
			type: 'like';
			id?: string;
			eventID?: string | number;
			user?: string;
			userDetails?: LiveUser;
			count: number;
			totalLikeCount?: number;
	  }
	| {
			type: 'social';
			id?: string;
			eventID?: string | number;
			user?: string;
			userDetails?: LiveUser;
			action: 'follow' | 'share' | 'join';
			followCount?: number;
			shareCount?: number;
	  }
	| {
			type: 'roomUser';
			id?: string;
			eventID?: string | number;
			viewerCount: number;
			totalUserCount?: number;
			topViewers: LiveTopViewer[];
	  };

type LiveMetricKey = 'diamonds' | 'currentViewers' | 'totalViews' | 'follows' | 'likes';

export type UserBadgeRow = {
	label: string;
	class: string;
};

export type LiveMetricRow = {
	key: LiveMetricKey;
	label: string;
	value: string;
};

export type GiftRow = {
	giftKey: string;
	countValue: number;
	user: string;
	handle?: string;
	text: string;
	count: string;
	icon: string;
	imageUrl?: string;
	points?: number;
	avatar: string;
	avatarClass: string;
	avatarUrl?: string;
	rowClass: string;
	accent: string;
	viewer?: LiveUser;
};

export type ChatRow = {
	avatar: string;
	avatarClass: string;
	avatarUrl?: string;
	user: string;
	handle?: string;
	text: string;
	emotes?: ChatEmote[];
	badge?: string;
	badgeClass?: string;
	extraBadges?: UserBadgeRow[];
	viewer?: LiveUser;
};

export type EventRow = {
	text: string;
	badge: string;
	badgeClass: string;
};

export type AllMessageRow = {
	id: string;
	capturedAt?: string;
	kind: 'chat' | 'gift' | 'event';
	giftKey?: string;
	giftId?: string;
	giftName?: string;
	coins?: number;
	allocatedCoins?: number;
	unallocatedCoins?: number;
	allocationStatus?: 'allocated' | 'unallocated' | 'mixed';
	allocatedCastName?: string;
	allocationModeId?: ScoreHistoryModeId;
	allocationModeLabel?: string;
	allocatedAt?: string;
	allocationReason?: string;
	gameSessionId?: string;
	countValue?: number;
	avatar: string;
	avatarClass: string;
	avatarUrl?: string;
	user: string;
	handle?: string;
	text: string;
	emotes?: ChatEmote[];
	badge?: string;
	badgeClass?: string;
	extraBadges?: UserBadgeRow[];
	viewer?: LiveUser;
	imageUrl?: string;
	icon?: string;
	count?: string;
	accent?: string;
};

export type LiveSidebarSnapshot = {
	performance: LiveMetricRow[];
	gifts: GiftRow[];
	chat: ChatRow[];
	allMessages: AllMessageRow[];
	currentEvent: EventRow | null;
	activeLiveUniqueId: string;
};

export function createEmptyLiveSidebarSnapshot(): LiveSidebarSnapshot {
	return {
		performance: [],
		gifts: [],
		chat: [],
		allMessages: [],
		currentEvent: null,
		activeLiveUniqueId: ''
	};
}
