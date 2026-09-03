// See https://svelte.dev/docs/kit/types#app.d.ts
import type { PersistedAuthSession } from '$lib/app-types';
import type { StudioProfile } from '$lib/app-types';

declare global {
	namespace App {
		interface Locals {
			authSession: PersistedAuthSession | null;
			authorizedStudioProfiles: StudioProfile[];
		}
	}

	type DesktopUpdateStatus =
		| 'idle'
		| 'unavailable'
		| 'checking'
		| 'available'
		| 'downloading'
		| 'downloaded'
		| 'not-available'
		| 'error';

	type DesktopUpdateState = {
		status: DesktopUpdateStatus;
		message: string;
		currentVersion: string;
		availableVersion: string | null;
		downloadPercent: number | null;
		canCheck: boolean;
		canInstall: boolean;
	};

	type DesktopAppInfo = {
		name: string;
		version: string;
		isPackaged: boolean;
		updateState: DesktopUpdateState;
	};

	type DesktopNetworkInterface = {
		name: string;
		address: string;
		family: string;
		internal: boolean;
		mac: string;
	};

	type DesktopSystemStatus = {
		ok: boolean;
		capturedAt: string;
		platform: string;
		arch: string;
		cpu: {
			model: string;
			cores: number;
			usagePercent: number | null;
		};
		memory: {
			totalBytes: number;
			freeBytes: number;
			usedBytes: number;
			usedPercent: number;
		};
		process: {
			rssBytes: number;
			heapUsedBytes: number;
			heapTotalBytes: number;
			externalBytes: number;
			uptimeSeconds: number;
		};
		network: {
			interfaces: DesktopNetworkInterface[];
		};
	};

	type DesktopNetworkTestResult = {
		ok: boolean;
		startedAt: string;
		completedAt: string;
		provider: string;
		latencyMs: number | null;
		jitterMs: number | null;
		latencyMinMs: number | null;
		latencyMaxMs: number | null;
		latencySamplesMs: number[];
		latencySampleCount: number;
		latencyFailedSamples: number;
		packetLossPercent: number | null;
		loadedLatencyMs: number | null;
		loadedJitterMs: number | null;
		bufferbloatMs: number | null;
		downloadMbps: number | null;
		uploadMbps: number | null;
		uploadMinMbps: number | null;
		uploadMaxMbps: number | null;
		uploadJitterMbps: number | null;
		uploadConsistencyPercent: number | null;
		uploadSamplesMbps: number[];
		downloadedBytes: number;
		uploadedBytes: number;
		streaming: {
			targetLabel: string;
			minUploadMbps: number;
			targetUploadMbps: number;
			uploadHeadroomPercent: number | null;
			stabilityScore: number | null;
			rating: string;
			scoreBreakdown: {
				upload: number | null;
				uploadConsistency: number | null;
				latency: number | null;
				jitter: number | null;
				bufferbloat: number | null;
				probeLoss: number | null;
				download: number | null;
			};
			notes: string[];
		};
		error: string | null;
	};

	interface Window {
		threeStudioDesktop?: {
			isDesktop: boolean;
			platform: string;
			openCommentsWindow: () => Promise<boolean>;
			closeCommentsWindow: () => Promise<boolean>;
			getCommentsSnapshot: () => Promise<unknown>;
			getCameraAccessStatus: () => Promise<string>;
			requestCameraAccess: () => Promise<boolean>;
			openCameraSettings: () => Promise<boolean>;
			getAppInfo: () => Promise<DesktopAppInfo>;
			getUpdateState: () => Promise<DesktopUpdateState>;
			getSystemStatus: () => Promise<DesktopSystemStatus>;
			runNetworkTest: () => Promise<DesktopNetworkTestResult>;
			checkForUpdates: () => Promise<DesktopUpdateState>;
			installUpdate: () => Promise<boolean>;
			setCommentsWindowOpacity: (opacity: number) => Promise<boolean>;
			pushCommentsSnapshot: (snapshot: unknown) => void;
			onCommentsSnapshot: (listener: (snapshot: unknown) => void) => () => void;
		};
	}
}

export {};
