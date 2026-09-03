const { app, autoUpdater: nativeAutoUpdater, BrowserWindow, ipcMain, session, shell, systemPreferences } = require('electron');
const { fork, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const https = require('node:https');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const dotenv = require('dotenv');

const APP_DISPLAY_NAME = 'Streamplay Studio';
const APP_ID = 'com.streamplay.studio';
const APP_USER_DATA_DIR_NAME = 'streamplay studio';
const LEGACY_USER_DATA_NAMES = ['Streamplay', 'Streamplay Studio'];
const HOST = '127.0.0.1';
const PORT = 38888;
const DEV_URL = process.env.ELECTRON_DEV_SERVER_URL;
const UPDATE_CHECK_DELAY_MS = 15000;
const UPDATE_CHECK_INTERVAL_MS = 30 * 60 * 1000;
const SERVER_STOP_GRACE_PERIOD_MS = 4000;
const SERVER_STOP_FORCE_WAIT_MS = 4000;
const SYSTEM_STATUS_CPU_SAMPLE_MS = 500;
const NETWORK_TEST_PROVIDER = 'Cloudflare';
const NETWORK_TEST_DOWNLOAD_BYTES = 12 * 1024 * 1024;
const NETWORK_TEST_UPLOAD_SAMPLE_BYTES = 8 * 1024 * 1024;
const NETWORK_TEST_UPLOAD_SAMPLES = 3;
const NETWORK_TEST_TIMEOUT_MS = 30000;
const NETWORK_TEST_LATENCY_SAMPLES = 8;
const NETWORK_TEST_LATENCY_SAMPLE_DELAY_MS = 80;
const NETWORK_TEST_LOADED_LATENCY_SAMPLES = 5;
const NETWORK_TEST_LATENCY_URL = 'https://speed.cloudflare.com/cdn-cgi/trace';
const NETWORK_TEST_DOWNLOAD_URL = `https://speed.cloudflare.com/__down?bytes=${NETWORK_TEST_DOWNLOAD_BYTES}`;
const NETWORK_TEST_UPLOAD_URL = 'https://speed.cloudflare.com/__up';
const STREAMING_TARGET_LABEL = '1080p TikTok OBS';
const STREAMING_MIN_UPLOAD_MBPS = 6;
const STREAMING_TARGET_UPLOAD_MBPS = 10;

let mainWindow = null;
let commentsWindow = null;
let serverProcess = null;
let desktopLogPath = null;
let desktopUpdater = null;
let updaterCheckTimer = null;
let updaterCheckInFlight = false;
let electronUpdaterModule = undefined;
let allowImmediateQuit = false;
let quitContinuationScheduled = false;
let quitPreparationPromise = null;
let desktopUpdateState = {
	status: 'idle',
	message: 'Ready to check for updates.',
	currentVersion: app.getVersion(),
	availableVersion: null,
	downloadPercent: null,
	canCheck: false,
	canInstall: false
};
let lastCommentsSnapshot = {
	performance: [],
	topViewers: [],
	gifts: [],
	chat: [],
	allMessages: [],
	currentEvent: null,
	activeLiveUniqueId: ''
};

function resolveDesktopUserDataPath() {
	const appDataPath = app.getPath('appData');
	const preferredPath = path.join(appDataPath, APP_USER_DATA_DIR_NAME);

	if (fs.existsSync(preferredPath)) {
		return preferredPath;
	}

	for (const legacyName of LEGACY_USER_DATA_NAMES) {
		const legacyPath = path.join(appDataPath, legacyName);
		if (fs.existsSync(legacyPath)) {
			try {
				if (path.basename(legacyPath) === APP_USER_DATA_DIR_NAME) {
					return legacyPath;
				}

				const tempPath = path.join(
					appDataPath,
					`${APP_USER_DATA_DIR_NAME}.__migrating__`
				);
				if (fs.existsSync(tempPath)) {
					fs.rmSync(tempPath, { recursive: true, force: true });
				}

				if (legacyPath.toLowerCase() === preferredPath.toLowerCase()) {
					fs.renameSync(legacyPath, tempPath);
					fs.renameSync(tempPath, preferredPath);
				} else {
					fs.renameSync(legacyPath, preferredPath);
				}
				return preferredPath;
			} catch (error) {
				appendDesktopLog(
					`[desktop] userData migration failed from=${legacyPath} to=${preferredPath} ${error?.stack || error}`
				);
				return legacyPath;
			}
		}
	}

	return preferredPath;
}

try {
	app.setPath('userData', resolveDesktopUserDataPath());
} catch {}

try {
	app.setAppUserModelId(APP_ID);
} catch {}

function appendDesktopLog(message) {
	if (!desktopLogPath) {
		return;
	}

	try {
		fs.appendFileSync(desktopLogPath, `${new Date().toISOString()} ${message}\n`);
	} catch {}
}

function wantsVideoCapture(details) {
	const mediaTypes = Array.isArray(details?.mediaTypes) ? details.mediaTypes : [];
	if (mediaTypes.length > 0) {
		return mediaTypes.some((mediaType) => /video|camera|unknown/i.test(String(mediaType)));
	}

	if (typeof details?.mediaType === 'string') {
		return /video|camera|unknown/i.test(details.mediaType);
	}

	return true;
}

function getDesktopCameraAccessStatus() {
	if (typeof systemPreferences?.getMediaAccessStatus !== 'function') {
		return 'unknown';
	}

	try {
		return systemPreferences.getMediaAccessStatus('camera');
	} catch (error) {
		appendDesktopLog(`[desktop][permissions] camera status failed ${error?.stack || error}`);
		return 'unknown';
	}
}

function desktopDelay(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function getCpuTimesSnapshot() {
	const cpus = os.cpus();
	return cpus.reduce(
		(snapshot, cpu) => {
			const times = cpu?.times || {};
			const idle = Number(times.idle) || 0;
			const total =
				(Number(times.user) || 0) +
				(Number(times.nice) || 0) +
				(Number(times.sys) || 0) +
				(Number(times.irq) || 0) +
				idle;

			return {
				idle: snapshot.idle + idle,
				total: snapshot.total + total
			};
		},
		{ idle: 0, total: 0 }
	);
}

function calculateCpuUsagePercent(startSnapshot, endSnapshot) {
	const idleDelta = endSnapshot.idle - startSnapshot.idle;
	const totalDelta = endSnapshot.total - startSnapshot.total;
	if (!Number.isFinite(idleDelta) || !Number.isFinite(totalDelta) || totalDelta <= 0) {
		return null;
	}

	const usage = (1 - idleDelta / totalDelta) * 100;
	return Math.max(0, Math.min(100, Math.round(usage * 10) / 10));
}

async function sampleDesktopCpuUsage() {
	const startSnapshot = getCpuTimesSnapshot();
	await desktopDelay(SYSTEM_STATUS_CPU_SAMPLE_MS);
	return calculateCpuUsagePercent(startSnapshot, getCpuTimesSnapshot());
}

function getDesktopNetworkInterfaces() {
	const interfaces = os.networkInterfaces();
	const rows = [];

	for (const [name, addresses] of Object.entries(interfaces)) {
		for (const address of addresses || []) {
			if (!address?.address) {
				continue;
			}

			rows.push({
				name,
				address: address.address,
				family: String(address.family || ''),
				internal: Boolean(address.internal),
				mac: address.mac || ''
			});
		}
	}

	return rows.sort((left, right) => {
		if (left.internal !== right.internal) {
			return left.internal ? 1 : -1;
		}

		return `${left.name}${left.address}`.localeCompare(`${right.name}${right.address}`);
	});
}

async function getDesktopSystemStatus() {
	const totalBytes = os.totalmem();
	const freeBytes = os.freemem();
	const usedBytes = Math.max(totalBytes - freeBytes, 0);
	const processMemory = process.memoryUsage();
	const cpus = os.cpus();
	const cpuUsagePercent = await sampleDesktopCpuUsage();

	return {
		ok: true,
		capturedAt: new Date().toISOString(),
		platform: process.platform,
		arch: process.arch,
		cpu: {
			model: cpus[0]?.model || 'Unknown CPU',
			cores: cpus.length,
			usagePercent: cpuUsagePercent
		},
		memory: {
			totalBytes,
			freeBytes,
			usedBytes,
			usedPercent:
				totalBytes > 0 ? Math.max(0, Math.min(100, Math.round((usedBytes / totalBytes) * 1000) / 10)) : 0
		},
		process: {
			rssBytes: processMemory.rss,
			heapUsedBytes: processMemory.heapUsed,
			heapTotalBytes: processMemory.heapTotal,
			externalBytes: processMemory.external,
			uptimeSeconds: Math.round(process.uptime())
		},
		network: {
			interfaces: getDesktopNetworkInterfaces()
		}
	};
}

function timedHttpRequest(urlString, options = {}) {
	const {
		method = 'GET',
		body = null,
		headers = {},
		timeoutMs = NETWORK_TEST_TIMEOUT_MS
	} = options;

	return new Promise((resolve, reject) => {
		const target = new URL(urlString);
		const client = target.protocol === 'http:' ? http : https;
		const startedAt = performance.now();
		let firstByteAt = null;
		let responseBytes = 0;
		let settled = false;
		let timeoutId = null;

		const settle = (callback, value) => {
			if (settled) {
				return;
			}

			settled = true;
			if (timeoutId) {
				clearTimeout(timeoutId);
			}
			callback(value);
		};

		const request = client.request(
			target,
			{
				method,
				headers: {
					'cache-control': 'no-cache',
					'user-agent': `${APP_DISPLAY_NAME}/${app.getVersion()}`,
					...headers
				}
			},
			(response) => {
				response.on('data', (chunk) => {
					if (firstByteAt === null) {
						firstByteAt = performance.now();
					}
					responseBytes += Buffer.byteLength(chunk);
				});

				response.on('end', () => {
					const completedAt = performance.now();
					const result = {
						statusCode: response.statusCode || 0,
						responseBytes,
						elapsedMs: Math.max(completedAt - startedAt, 0),
						firstByteMs:
							firstByteAt === null ? null : Math.max(firstByteAt - startedAt, 0)
					};

					if (result.statusCode < 200 || result.statusCode >= 400) {
						const error = new Error(`Network test returned HTTP ${result.statusCode}.`);
						error.result = result;
						settle(reject, error);
						return;
					}

					settle(resolve, result);
				});

				response.on('error', (error) => {
					settle(reject, error);
				});
			}
		);

		timeoutId = setTimeout(() => {
			const error = new Error('Network test timed out.');
			request.destroy(error);
			settle(reject, error);
		}, timeoutMs);

		request.on('error', (error) => {
			settle(reject, error);
		});

		if (body) {
			request.write(body);
		}
		request.end();
	});
}

function mbpsFromBytes(bytes, elapsedMs) {
	if (!Number.isFinite(bytes) || !Number.isFinite(elapsedMs) || bytes <= 0 || elapsedMs <= 0) {
		return null;
	}

	return Math.round(((bytes * 8) / (elapsedMs / 1000) / 1_000_000) * 10) / 10;
}

function averageNumbers(values) {
	if (!values.length) {
		return null;
	}

	return values.reduce((total, value) => total + value, 0) / values.length;
}

function roundOneDecimal(value) {
	if (!Number.isFinite(value)) {
		return null;
	}

	return Math.round(value * 10) / 10;
}

function averageAdjacentDelta(samples) {
	if (samples.length < 2) {
		return null;
	}

	const deltas = [];
	for (let index = 1; index < samples.length; index += 1) {
		deltas.push(Math.abs(samples[index] - samples[index - 1]));
	}

	return roundOneDecimal(averageNumbers(deltas));
}

async function runDesktopLatencyProbe(errors, options = {}) {
	const sampleCount = options.sampleCount ?? NETWORK_TEST_LATENCY_SAMPLES;
	const sampleDelayMs = options.sampleDelayMs ?? NETWORK_TEST_LATENCY_SAMPLE_DELAY_MS;
	const timeoutMs = options.timeoutMs ?? 4000;
	const label = options.label ?? 'latency probes';
	const samples = [];
	let failedSamples = 0;

	for (let index = 0; index < sampleCount; index += 1) {
		try {
			const latencyResult = await timedHttpRequest(NETWORK_TEST_LATENCY_URL, { timeoutMs });
			const sample = Math.round(latencyResult.firstByteMs ?? latencyResult.elapsedMs);
			if (Number.isFinite(sample)) {
				samples.push(sample);
			} else {
				failedSamples += 1;
			}
		} catch {
			failedSamples += 1;
		}

		if (index < sampleCount - 1) {
			await desktopDelay(sampleDelayMs);
		}
	}

	if (failedSamples > 0) {
		errors.push(`${failedSamples} of ${sampleCount} ${label} failed.`);
	}

	const averageLatency = averageNumbers(samples);
	return {
		latencyMs: averageLatency === null ? null : Math.round(averageLatency),
		jitterMs: averageAdjacentDelta(samples),
		latencyMinMs: samples.length ? Math.min(...samples) : null,
		latencyMaxMs: samples.length ? Math.max(...samples) : null,
		latencySamplesMs: samples,
		latencySampleCount: sampleCount,
		latencyFailedSamples: failedSamples,
		packetLossPercent: roundOneDecimal((failedSamples / sampleCount) * 100)
	};
}

async function runDesktopUploadSample(bytes = NETWORK_TEST_UPLOAD_SAMPLE_BYTES) {
	const uploadBody = Buffer.alloc(bytes);
	const uploadResult = await timedHttpRequest(NETWORK_TEST_UPLOAD_URL, {
		method: 'POST',
		body: uploadBody,
		headers: {
			'content-length': String(uploadBody.length),
			'content-type': 'application/octet-stream'
		},
		timeoutMs: NETWORK_TEST_TIMEOUT_MS
	});

	return {
		bytes: uploadBody.length,
		elapsedMs: uploadResult.elapsedMs,
		mbps: mbpsFromBytes(uploadBody.length, uploadResult.elapsedMs)
	};
}

async function runDesktopUploadDiagnostics(errors) {
	const samples = [];
	const loadedLatencyErrors = [];
	let uploadedBytes = 0;
	let loadedLatencyProbe = {
		latencyMs: null,
		jitterMs: null,
		latencyMinMs: null,
		latencyMaxMs: null,
		latencySamplesMs: [],
		latencySampleCount: NETWORK_TEST_LOADED_LATENCY_SAMPLES,
		latencyFailedSamples: NETWORK_TEST_LOADED_LATENCY_SAMPLES,
		packetLossPercent: 100
	};

	for (let index = 0; index < NETWORK_TEST_UPLOAD_SAMPLES; index += 1) {
		try {
			if (index === 0) {
				const loadedLatencyPromise = runDesktopLatencyProbe(loadedLatencyErrors, {
					sampleCount: NETWORK_TEST_LOADED_LATENCY_SAMPLES,
					sampleDelayMs: 120,
					timeoutMs: 5000,
					label: 'loaded latency probes'
				});
				const sample = await runDesktopUploadSample();
				loadedLatencyProbe = await loadedLatencyPromise;
				samples.push(sample);
				uploadedBytes += sample.bytes;
				continue;
			}

			const sample = await runDesktopUploadSample();
			samples.push(sample);
			uploadedBytes += sample.bytes;
		} catch (error) {
			errors.push(error?.message || `Upload sample ${index + 1} failed.`);
		}
	}

	errors.push(...loadedLatencyErrors);

	const uploadSamplesMbps = samples
		.map((sample) => sample.mbps)
		.filter((value) => Number.isFinite(value));
	const uploadAverage = averageNumbers(uploadSamplesMbps);
	const uploadMinMbps = uploadSamplesMbps.length ? Math.min(...uploadSamplesMbps) : null;
	const uploadMaxMbps = uploadSamplesMbps.length ? Math.max(...uploadSamplesMbps) : null;
	const uploadJitterMbps = averageAdjacentDelta(uploadSamplesMbps);
	const uploadConsistencyPercent =
		uploadAverage && uploadMinMbps !== null ? roundOneDecimal((uploadMinMbps / uploadAverage) * 100) : null;

	return {
		uploadedBytes,
		uploadMbps: roundOneDecimal(uploadAverage),
		uploadMinMbps: roundOneDecimal(uploadMinMbps),
		uploadMaxMbps: roundOneDecimal(uploadMaxMbps),
		uploadJitterMbps,
		uploadConsistencyPercent,
		uploadSamplesMbps: uploadSamplesMbps.map(roundOneDecimal),
		loadedLatencyProbe
	};
}

function scoreUploadMbps(value) {
	if (!Number.isFinite(value)) return 0;
	if (value >= 15) return 10;
	if (value >= 12) return 9.2;
	if (value >= STREAMING_TARGET_UPLOAD_MBPS) return 8.5;
	if (value >= 8) return 7.4;
	if (value >= STREAMING_MIN_UPLOAD_MBPS) return 6.2;
	if (value >= 4) return 4;
	if (value >= 2) return 2;
	return 0.8;
}

function scoreLatencyMs(value) {
	if (!Number.isFinite(value)) return 0;
	if (value <= 50) return 10;
	if (value <= 80) return 9;
	if (value <= 120) return 7;
	if (value <= 180) return 5;
	if (value <= 250) return 3;
	if (value <= 400) return 1;
	return 0;
}

function scoreJitterMs(value) {
	if (!Number.isFinite(value)) return 0;
	if (value <= 10) return 10;
	if (value <= 20) return 8.5;
	if (value <= 35) return 6;
	if (value <= 60) return 3;
	if (value <= 100) return 1;
	return 0;
}

function scorePacketLossPercent(value) {
	if (!Number.isFinite(value)) return 0;
	if (value <= 0) return 10;
	if (value <= 1) return 7;
	if (value <= 3) return 4;
	if (value <= 5) return 2;
	return 0;
}

function scoreDownloadMbps(value) {
	if (!Number.isFinite(value)) return 0;
	if (value >= 10) return 10;
	if (value >= 5) return 8;
	if (value >= 2) return 5;
	if (value >= 1) return 2;
	return 0;
}

function scoreUploadConsistencyPercent(value) {
	if (!Number.isFinite(value)) return 0;
	if (value >= 90) return 10;
	if (value >= 80) return 8;
	if (value >= 70) return 6;
	if (value >= 55) return 3;
	return 1;
}

function scoreBufferbloatMs(value) {
	if (!Number.isFinite(value)) return 0;
	if (value <= 25) return 10;
	if (value <= 60) return 8;
	if (value <= 100) return 6;
	if (value <= 200) return 3;
	return 0;
}

function streamingRatingFromScore(score) {
	if (!Number.isFinite(score)) return 'Unavailable';
	if (score >= 8.5) return 'Excellent';
	if (score >= 7) return 'Good';
	if (score >= 5) return 'Marginal';
	return 'Risky';
}

function buildStreamingStability(metrics) {
	const {
		uploadMbps,
		downloadMbps,
		latencyProbe,
		uploadConsistencyPercent,
		bufferbloatMs
	} = metrics;
	const uploadScore = scoreUploadMbps(uploadMbps);
	const uploadConsistencyScore = scoreUploadConsistencyPercent(uploadConsistencyPercent);
	const latencyScore = scoreLatencyMs(latencyProbe.latencyMs);
	const jitterScore = scoreJitterMs(latencyProbe.jitterMs);
	const lossScore = scorePacketLossPercent(latencyProbe.packetLossPercent);
	const bufferbloatScore = scoreBufferbloatMs(bufferbloatMs);
	const downloadScore = scoreDownloadMbps(downloadMbps);
	const stabilityScore = roundOneDecimal(
		uploadScore * 0.42 +
			uploadConsistencyScore * 0.12 +
			jitterScore * 0.14 +
			latencyScore * 0.12 +
			bufferbloatScore * 0.1 +
			lossScore * 0.08 +
			downloadScore * 0.02
	);
	const notes = [];

	if (!Number.isFinite(uploadMbps)) {
		notes.push('Upload test did not complete.');
	} else if (uploadMbps < STREAMING_MIN_UPLOAD_MBPS) {
		notes.push('Upload is below the safe minimum for 1080p streaming.');
	} else if (uploadMbps < STREAMING_TARGET_UPLOAD_MBPS) {
		notes.push('Upload works but has limited 1080p headroom.');
	}

	if (Number.isFinite(latencyProbe.jitterMs) && latencyProbe.jitterMs > 35) {
		notes.push('Jitter is high enough to cause stream instability.');
	}

	if (Number.isFinite(latencyProbe.latencyMs) && latencyProbe.latencyMs > 180) {
		notes.push('Latency is high for a stable live session.');
	}

	if (Number.isFinite(latencyProbe.packetLossPercent) && latencyProbe.packetLossPercent > 0) {
		notes.push('Some latency probes failed, which can indicate packet loss or routing instability.');
	}

	if (Number.isFinite(uploadConsistencyPercent) && uploadConsistencyPercent < 70) {
		notes.push('Upload speed is fluctuating enough to risk dropped frames.');
	}

	if (Number.isFinite(bufferbloatMs) && bufferbloatMs > 100) {
		notes.push('Latency rises under upload load, so OBS may become unstable while streaming.');
	}

	if (notes.length === 0) {
		notes.push('Network conditions look stable for 1080p OBS streaming.');
	}

	return {
		targetLabel: STREAMING_TARGET_LABEL,
		minUploadMbps: STREAMING_MIN_UPLOAD_MBPS,
		targetUploadMbps: STREAMING_TARGET_UPLOAD_MBPS,
		uploadHeadroomPercent: Number.isFinite(uploadMbps)
			? Math.round((uploadMbps / STREAMING_TARGET_UPLOAD_MBPS) * 100)
			: null,
		stabilityScore,
		rating: streamingRatingFromScore(stabilityScore),
		scoreBreakdown: {
			upload: roundOneDecimal(uploadScore),
			uploadConsistency: roundOneDecimal(uploadConsistencyScore),
			latency: roundOneDecimal(latencyScore),
			jitter: roundOneDecimal(jitterScore),
			bufferbloat: roundOneDecimal(bufferbloatScore),
			probeLoss: roundOneDecimal(lossScore),
			download: roundOneDecimal(downloadScore)
		},
		notes
	};
}

async function runDesktopNetworkTest() {
	const startedAt = new Date().toISOString();
	const errors = [];
	let latencyMs = null;
	let jitterMs = null;
	let latencyMinMs = null;
	let latencyMaxMs = null;
	let latencySamplesMs = [];
	let latencySampleCount = NETWORK_TEST_LATENCY_SAMPLES;
	let latencyFailedSamples = 0;
	let packetLossPercent = null;
	let loadedLatencyMs = null;
	let loadedJitterMs = null;
	let bufferbloatMs = null;
	let uploadMinMbps = null;
	let uploadMaxMbps = null;
	let uploadJitterMbps = null;
	let uploadConsistencyPercent = null;
	let uploadSamplesMbps = [];
	let downloadMbps = null;
	let uploadMbps = null;
	let downloadedBytes = 0;
	let uploadedBytes = 0;

	try {
		const latencyProbe = await runDesktopLatencyProbe(errors);
		latencyMs = latencyProbe.latencyMs;
		jitterMs = latencyProbe.jitterMs;
		latencyMinMs = latencyProbe.latencyMinMs;
		latencyMaxMs = latencyProbe.latencyMaxMs;
		latencySamplesMs = latencyProbe.latencySamplesMs;
		latencySampleCount = latencyProbe.latencySampleCount;
		latencyFailedSamples = latencyProbe.latencyFailedSamples;
		packetLossPercent = latencyProbe.packetLossPercent;
	} catch (error) {
		errors.push(error?.message || 'Latency test failed.');
	}

	try {
		const downloadResult = await timedHttpRequest(NETWORK_TEST_DOWNLOAD_URL, {
			timeoutMs: NETWORK_TEST_TIMEOUT_MS
		});
		downloadedBytes = downloadResult.responseBytes;
		downloadMbps = mbpsFromBytes(downloadedBytes, downloadResult.elapsedMs);
	} catch (error) {
		errors.push(error?.message || 'Download test failed.');
	}

	try {
		const uploadDiagnostics = await runDesktopUploadDiagnostics(errors);
		uploadedBytes = uploadDiagnostics.uploadedBytes;
		uploadMbps = uploadDiagnostics.uploadMbps;
		uploadMinMbps = uploadDiagnostics.uploadMinMbps;
		uploadMaxMbps = uploadDiagnostics.uploadMaxMbps;
		uploadJitterMbps = uploadDiagnostics.uploadJitterMbps;
		uploadConsistencyPercent = uploadDiagnostics.uploadConsistencyPercent;
		uploadSamplesMbps = uploadDiagnostics.uploadSamplesMbps;
		loadedLatencyMs = uploadDiagnostics.loadedLatencyProbe.latencyMs;
		loadedJitterMs = uploadDiagnostics.loadedLatencyProbe.jitterMs;
		bufferbloatMs =
			Number.isFinite(loadedLatencyMs) && Number.isFinite(latencyMs)
				? Math.max(0, Math.round(loadedLatencyMs - latencyMs))
				: null;
	} catch (error) {
		errors.push(error?.message || 'Upload test failed.');
	}

	const latencyProbe = {
		latencyMs,
		jitterMs,
		packetLossPercent
	};

	return {
		ok: latencyMs !== null || jitterMs !== null || downloadMbps !== null || uploadMbps !== null,
		startedAt,
		completedAt: new Date().toISOString(),
		provider: NETWORK_TEST_PROVIDER,
		latencyMs,
		jitterMs,
		latencyMinMs,
		latencyMaxMs,
		latencySamplesMs,
		latencySampleCount,
		latencyFailedSamples,
		packetLossPercent,
		loadedLatencyMs,
		loadedJitterMs,
		bufferbloatMs,
		downloadMbps,
		uploadMbps,
		uploadMinMbps,
		uploadMaxMbps,
		uploadJitterMbps,
		uploadConsistencyPercent,
			uploadSamplesMbps,
			downloadedBytes,
			uploadedBytes,
			streaming: buildStreamingStability({
				uploadMbps,
				downloadMbps,
				latencyProbe,
				uploadConsistencyPercent,
				bufferbloatMs
			}),
		error: errors.length ? errors.join(' ') : null
	};
}

function clearDesktopUpdaterTimer() {
	if (updaterCheckTimer) {
		clearInterval(updaterCheckTimer);
		updaterCheckTimer = null;
	}
}

function destroyDesktopWindows() {
	const windows = BrowserWindow.getAllWindows();
	for (const window of windows) {
		if (!window || window.isDestroyed()) {
			continue;
		}

		try {
			window.destroy();
		} catch (error) {
			appendDesktopLog(`[desktop] window destroy failed ${error?.stack || error}`);
		}
	}

	mainWindow = null;
	commentsWindow = null;
}

function waitForChildProcessExit(child, timeoutMs) {
	if (!child || child.exitCode !== null || child.signalCode !== null) {
		return Promise.resolve(true);
	}

	return new Promise((resolve) => {
		let settled = false;
		let timeoutId = null;
		const finish = (result) => {
			if (settled) {
				return;
			}

			settled = true;
			if (timeoutId) {
				clearTimeout(timeoutId);
			}
			child.removeListener('exit', onExit);
			child.removeListener('close', onExit);
			child.removeListener('error', onError);
			resolve(result);
		};
		const onExit = () => {
			finish(true);
		};
		const onError = () => {
			finish(true);
		};

		child.once('exit', onExit);
		child.once('close', onExit);
		child.once('error', onError);
		timeoutId = setTimeout(() => finish(false), timeoutMs);
	});
}

function forceKillProcessTree(pid) {
	if (!Number.isFinite(pid) || pid <= 0) {
		return;
	}

	if (process.platform === 'win32') {
		const result = spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], {
			windowsHide: true,
			stdio: 'ignore'
		});
		appendDesktopLog(
			`[desktop-server] taskkill pid=${pid} status=${result.status ?? 'null'} error=${result.error?.message ?? ''}`
		);
		return;
	}

	try {
		process.kill(pid, 'SIGKILL');
		appendDesktopLog(`[desktop-server] force kill pid=${pid}`);
	} catch (error) {
		appendDesktopLog(`[desktop-server] force kill failed pid=${pid} ${error?.stack || error}`);
	}
}

async function stopLocalServer(reason = 'quit') {
	const child = serverProcess;
	if (!child) {
		return true;
	}

	const pid = child.pid;
	appendDesktopLog(`[desktop-server] stopping reason=${reason} pid=${pid}`);

	try {
		if (child.connected) {
			child.disconnect();
		}
	} catch (error) {
		appendDesktopLog(`[desktop-server] disconnect failed pid=${pid} ${error?.stack || error}`);
	}

	try {
		child.kill('SIGTERM');
	} catch (error) {
		appendDesktopLog(`[desktop-server] SIGTERM failed pid=${pid} ${error?.stack || error}`);
	}

	if (await waitForChildProcessExit(child, SERVER_STOP_GRACE_PERIOD_MS)) {
		appendDesktopLog(`[desktop-server] stopped gracefully reason=${reason} pid=${pid}`);
		return true;
	}

	appendDesktopLog(`[desktop-server] graceful stop timed out reason=${reason} pid=${pid}`);
	forceKillProcessTree(pid);
	const stoppedAfterForce = await waitForChildProcessExit(child, SERVER_STOP_FORCE_WAIT_MS);
	appendDesktopLog(
		`[desktop-server] force stop ${stoppedAfterForce ? 'completed' : 'timed out'} reason=${reason} pid=${pid}`
	);
	return stoppedAfterForce;
}

async function prepareAppForQuit(reason) {
	if (quitPreparationPromise) {
		return quitPreparationPromise;
	}

	quitPreparationPromise = (async () => {
		appendDesktopLog(`[desktop] preparing for quit reason=${reason}`);
		clearDesktopUpdaterTimer();
		destroyDesktopWindows();
		await stopLocalServer(reason);
		appendDesktopLog(`[desktop] quit preparation complete reason=${reason}`);
	})().finally(() => {
		quitPreparationPromise = null;
	});

	return quitPreparationPromise;
}

function continueQuitAfterPreparation(reason) {
	if (allowImmediateQuit) {
		return;
	}

	allowImmediateQuit = true;
	appendDesktopLog(`[desktop] continuing quit reason=${reason}`);
	app.quit();
}

function handleBeforeQuit(event, reason) {
	if (allowImmediateQuit) {
		return;
	}

	event.preventDefault();
	if (quitContinuationScheduled) {
		return;
	}

	quitContinuationScheduled = true;
	void prepareAppForQuit(reason).finally(() => {
		continueQuitAfterPreparation(reason);
	});
}

function configureDesktopMediaPermissions() {
	const defaultSession = session.defaultSession;

	defaultSession.setPermissionCheckHandler((_webContents, permission, _origin, details) => {
		if (permission === 'media') {
			return wantsVideoCapture(details);
		}

		return true;
	});

	defaultSession.setPermissionRequestHandler((_webContents, permission, callback, details) => {
		if (permission === 'media') {
			const allow = wantsVideoCapture(details);
			appendDesktopLog(
				`[desktop][permissions] media allow=${allow} types=${JSON.stringify(details?.mediaTypes ?? [])}`
			);
			callback(allow);
			return;
		}

		callback(true);
	});
}

async function requestDesktopCameraAccess() {
	const status = getDesktopCameraAccessStatus();
	appendDesktopLog(`[desktop][permissions] camera status=${status}`);
	if (status === 'granted') {
		return true;
	}

	if (process.platform === 'win32') {
		return status !== 'denied' && status !== 'restricted';
	}

	if (process.platform !== 'darwin') {
		return status !== 'denied' && status !== 'restricted';
	}

	if (typeof systemPreferences.askForMediaAccess !== 'function') {
		return status === 'granted';
	}

	const granted = await systemPreferences.askForMediaAccess('camera');
	appendDesktopLog(`[desktop][permissions] camera granted=${granted}`);
	return granted;
}

async function openDesktopCameraSettings() {
	if (process.platform === 'win32') {
		await shell.openExternal('ms-settings:privacy-webcam');
		return true;
	}

	if (process.platform === 'darwin') {
		await shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Camera');
		return true;
	}

	return false;
}

function markDesktopLogSession() {
	appendDesktopLog('='.repeat(72));
	appendDesktopLog(
		`[desktop] session start version=${app.getVersion()} platform=${process.platform} packaged=${app.isPackaged}`
	);
}

function loadDesktopEnv() {
	const appPath = app.isPackaged ? process.resourcesPath : app.getAppPath();
	const envPaths = [
		path.join(process.cwd(), '.env'),
		path.join(appPath, '.env'),
		path.join(process.resourcesPath, '.env'),
		path.join(path.dirname(process.execPath), '.env'),
		path.join(app.getPath('userData'), '.env')
	];

	const loadedPaths = new Set();

	for (const envPath of envPaths) {
		if (loadedPaths.has(envPath)) {
			continue;
		}

		loadedPaths.add(envPath);

		if (fs.existsSync(envPath)) {
			dotenv.config({ path: envPath, override: false });
		}
	}
}

function isPortOpen(port, host) {
	return new Promise((resolve) => {
		const socket = new net.Socket();
		socket.setTimeout(500);

		socket.once('connect', () => {
			socket.destroy();
			resolve(true);
		});

		const close = () => {
			socket.destroy();
			resolve(false);
		};

		socket.once('error', close);
		socket.once('timeout', close);
		socket.connect(port, host);
	});
}

async function waitForPort(port, host, timeoutMs = 15000) {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		if (await isPortOpen(port, host)) {
			return;
		}
		await new Promise((resolve) => setTimeout(resolve, 250));
	}

	throw new Error(`Desktop server did not start on ${host}:${port}`);
}

function resolveServerEntry() {
	if (!app.isPackaged) {
		return path.join(app.getAppPath(), 'build', 'index.js');
	}

	return path.join(process.resourcesPath, 'app.asar', 'build', 'index.js');
}

async function startLocalServer() {
	if (DEV_URL) {
		return;
	}

	if (serverProcess) {
		return;
	}

	const serverEntry = resolveServerEntry();
	appendDesktopLog(`[desktop] serverEntry=${serverEntry}`);
	appendDesktopLog(
		`[desktop] TIKTOK_BACKEND_URL=${process.env.TIKTOK_BACKEND_URL ?? '<unset>'}`
	);

	serverProcess = fork(serverEntry, {
		silent: true,
		env: {
			...process.env,
			HOST,
			PORT: String(PORT),
			NODE_ENV: 'production',
			ORIGIN: `http://${HOST}:${PORT}`,
			STREAMPLAY_STUDIO_USER_DATA_DIR: app.getPath('userData'),
			STREAMPLAY_USER_DATA_DIR: app.getPath('userData')
		}
	});

	serverProcess.on('exit', () => {
		appendDesktopLog('[desktop-server] exited');
		serverProcess = null;
	});

	serverProcess.stdout?.on('data', (chunk) => {
		process.stdout.write(`[desktop-server] ${chunk}`);
		appendDesktopLog(`[desktop-server][stdout] ${String(chunk).trimEnd()}`);
	});

	serverProcess.stderr?.on('data', (chunk) => {
		process.stderr.write(`[desktop-server] ${chunk}`);
		appendDesktopLog(`[desktop-server][stderr] ${String(chunk).trimEnd()}`);
	});

	await waitForPort(PORT, HOST);
	appendDesktopLog('[desktop] server ready');
}

function resolveUpdateUrl() {
	return (
		process.env.STREAMPLAY_STUDIO_UPDATE_URL ||
		process.env.STREAMPLAY_UPDATE_URL ||
		''
	).trim();
}

function resolvePackagedUpdateConfigPath() {
	if (!app.isPackaged) {
		return null;
	}

	return path.join(process.resourcesPath, 'app-update.yml');
}

function hasPackagedUpdateConfig() {
	const configPath = resolvePackagedUpdateConfigPath();
	return Boolean(configPath && fs.existsSync(configPath));
}

function setDesktopUpdateState(nextState) {
	desktopUpdateState = {
		...desktopUpdateState,
		...nextState,
		currentVersion: app.getVersion()
	};
}

function markDesktopUpdaterUnavailable(message) {
	setDesktopUpdateState({
		status: 'unavailable',
		message,
		availableVersion: null,
		downloadPercent: null,
		canCheck: false,
		canInstall: false
	});
}

function getDesktopUpdateState() {
	return {
		...desktopUpdateState
	};
}

function syncDesktopUpdaterAvailability() {
	if (!app.isPackaged) {
		markDesktopUpdaterUnavailable('Updates are only available in the packaged desktop app.');
		return false;
	}

	if (!loadElectronUpdater()) {
		markDesktopUpdaterUnavailable('electron-updater is unavailable in this build.');
		return false;
	}

	if (!resolveUpdateUrl() && !hasPackagedUpdateConfig()) {
		markDesktopUpdaterUnavailable(
			'No packaged update configuration was found. Rebuild the desktop app with publish metadata.'
		);
		return false;
	}

	if (desktopUpdateState.status === 'downloaded') {
		setDesktopUpdateState({
			canCheck: false,
			canInstall: true
		});
		return true;
	}

	setDesktopUpdateState({
		status:
			desktopUpdateState.status === 'checking' ||
			desktopUpdateState.status === 'available' ||
			desktopUpdateState.status === 'downloading'
				? desktopUpdateState.status
				: 'idle',
		message:
			desktopUpdateState.status === 'checking' ||
			desktopUpdateState.status === 'available' ||
			desktopUpdateState.status === 'downloading' ||
			desktopUpdateState.status === 'error' ||
			desktopUpdateState.status === 'not-available'
				? desktopUpdateState.message
				: 'Ready to check for updates.',
		canCheck:
			desktopUpdateState.status !== 'checking' &&
			desktopUpdateState.status !== 'available' &&
			desktopUpdateState.status !== 'downloading',
		canInstall: desktopUpdateState.status === 'downloaded'
	});
	return true;
}

function loadElectronUpdater() {
	if (electronUpdaterModule !== undefined) {
		return electronUpdaterModule;
	}

	try {
		electronUpdaterModule = require('electron-updater');
	} catch (error) {
		electronUpdaterModule = null;
		appendDesktopLog(`[updater] electron-updater unavailable ${error?.stack || error}`);
	}

	return electronUpdaterModule;
}

function createDesktopUpdater() {
	const updaterModule = loadElectronUpdater();
	if (!updaterModule) {
		return null;
	}

	const { AppImageUpdater, MacUpdater, NsisUpdater } = updaterModule;
	const updateUrl = resolveUpdateUrl();
	const options = updateUrl
		? {
				provider: 'generic',
				url: updateUrl
			}
		: null;

	if (process.platform === 'win32') {
		return options ? new NsisUpdater(options) : new NsisUpdater();
	}

	if (process.platform === 'darwin') {
		return options ? new MacUpdater(options) : new MacUpdater();
	}

	return options ? new AppImageUpdater(options) : new AppImageUpdater();
}

async function checkForDesktopUpdates(options = {}) {
	const manual = options.manual === true;
	if (!syncDesktopUpdaterAvailability()) {
		return getDesktopUpdateState();
	}

	if (!desktopUpdater) {
		markDesktopUpdaterUnavailable('Desktop updater could not be created for this platform.');
		return getDesktopUpdateState();
	}

	if (updaterCheckInFlight) {
		return getDesktopUpdateState();
	}

	updaterCheckInFlight = true;
	setDesktopUpdateState({
		status: 'checking',
		message: manual ? 'Checking for updates...' : 'Background update check in progress...',
		availableVersion: null,
		downloadPercent: null,
		canCheck: false,
		canInstall: false
	});
	try {
		appendDesktopLog('[updater] checking for updates');
		await desktopUpdater.checkForUpdates();
	} catch (error) {
		appendDesktopLog(`[updater] check failed ${error?.stack || error}`);
		setDesktopUpdateState({
			status: 'error',
			message: error instanceof Error ? error.message : 'Update check failed.',
			downloadPercent: null,
			canCheck: true,
			canInstall: false
		});
	} finally {
		updaterCheckInFlight = false;
	}

	return getDesktopUpdateState();
}

async function installDownloadedDesktopUpdate() {
	if (!desktopUpdater || desktopUpdateState.status !== 'downloaded') {
		return false;
	}

	setDesktopUpdateState({
		message: 'Preparing to install the downloaded update...',
		canCheck: false,
		canInstall: false
	});

	try {
		appendDesktopLog('[updater] preparing update install');
		clearDesktopUpdaterTimer();
		const serverStopped = await stopLocalServer('install-update');
		if (!serverStopped) {
			throw new Error('Background service did not stop cleanly before update install.');
		}
		appendDesktopLog('[updater] launching installer');
		allowImmediateQuit = true;
		desktopUpdater.quitAndInstall(true, true);
		return true;
	} catch (error) {
		allowImmediateQuit = false;
		appendDesktopLog(`[updater] quitAndInstall failed ${error?.stack || error}`);
		setDesktopUpdateState({
			status: 'error',
			message: error instanceof Error ? error.message : 'Failed to install the downloaded update.',
			canCheck: true,
			canInstall: true
		});
		return false;
	}
}

function configureAutoUpdater() {
	if (!syncDesktopUpdaterAvailability()) {
		appendDesktopLog(`[updater] unavailable ${desktopUpdateState.message}`);
		return;
	}

	desktopUpdater = createDesktopUpdater();
	if (!desktopUpdater) {
		markDesktopUpdaterUnavailable('No updater is available for this platform.');
		appendDesktopLog('[updater] no updater available for this platform');
		return;
	}

	desktopUpdater.autoDownload = true;
	desktopUpdater.autoInstallOnAppQuit = false;
	desktopUpdater.allowPrerelease = false;
	if ('disableDifferentialDownload' in desktopUpdater) {
		desktopUpdater.disableDifferentialDownload = true;
	}
	setDesktopUpdateState({
		status: 'idle',
		message: 'Ready to check for updates.',
		canCheck: true,
		canInstall: false
	});

	desktopUpdater.on('checking-for-update', () => {
		appendDesktopLog('[updater] checking-for-update');
		setDesktopUpdateState({
			status: 'checking',
			message: 'Checking for updates...',
			availableVersion: null,
			downloadPercent: null,
			canCheck: false,
			canInstall: false
		});
	});

	desktopUpdater.on('update-available', (info) => {
		appendDesktopLog(`[updater] update available version=${info.version}`);
		setDesktopUpdateState({
			status: 'available',
			message: `Update ${info.version} found. Downloading now...`,
			availableVersion: info.version,
			downloadPercent: 0,
			canCheck: false,
			canInstall: false
		});
	});

	desktopUpdater.on('update-not-available', (info) => {
		appendDesktopLog(`[updater] no update version=${info.version}`);
		setDesktopUpdateState({
			status: 'not-available',
			message: `You're already on the latest version (${app.getVersion()}).`,
			availableVersion: info.version ?? null,
			downloadPercent: null,
			canCheck: true,
			canInstall: false
		});
	});

	desktopUpdater.on('download-progress', (progress) => {
		appendDesktopLog(
			`[updater] download progress percent=${progress.percent.toFixed(2)} transferred=${progress.transferred} total=${progress.total}`
		);
		setDesktopUpdateState({
			status: 'downloading',
			message: `Downloading update${desktopUpdateState.availableVersion ? ` ${desktopUpdateState.availableVersion}` : ''}... ${Math.round(progress.percent)}%`,
			downloadPercent: Number.isFinite(progress.percent) ? progress.percent : null,
			canCheck: false,
			canInstall: false
		});
	});

	desktopUpdater.on('update-downloaded', (info) => {
		appendDesktopLog(
			`[updater] update downloaded version=${info.version} releaseDate=${info.releaseDate}`
		);
		setDesktopUpdateState({
			status: 'downloaded',
			message: `Update ${info.version} is ready. Use Restart And Install to apply it.`,
			availableVersion: info.version,
			downloadPercent: 100,
			canCheck: false,
			canInstall: true
		});
	});

	desktopUpdater.on('error', (error) => {
		appendDesktopLog(`[updater] error ${error?.stack || error}`);
		setDesktopUpdateState({
			status: 'error',
			message: error instanceof Error ? error.message : 'Updater failed.',
			downloadPercent: null,
			canCheck: true,
			canInstall: desktopUpdateState.status === 'downloaded'
		});
	});

	setTimeout(() => {
		void checkForDesktopUpdates();
	}, UPDATE_CHECK_DELAY_MS);

	updaterCheckTimer = setInterval(() => {
		void checkForDesktopUpdates();
	}, UPDATE_CHECK_INTERVAL_MS);
}

function createWindow() {
	mainWindow = new BrowserWindow({
		width: 1560,
		height: 980,
		minWidth: 1200,
		minHeight: 760,
		backgroundColor: '#071015',
		autoHideMenuBar: true,
		webPreferences: {
			preload: path.join(__dirname, 'preload.cjs'),
			contextIsolation: true,
			nodeIntegration: false,
			backgroundThrottling: false
		}
	});

	const targetUrl = DEV_URL || `http://${HOST}:${PORT}`;
	void mainWindow.loadURL(targetUrl);

	mainWindow.on('closed', () => {
		mainWindow = null;
	});
}

function createCommentsWindow() {
	if (commentsWindow && !commentsWindow.isDestroyed()) {
		commentsWindow.focus();
		return commentsWindow;
	}

	const isMac = process.platform === 'darwin';
	const isWindows = process.platform === 'win32';

	commentsWindow = new BrowserWindow({
		width: 620,
		height: 920,
		minWidth: 480,
		minHeight: 520,
		backgroundColor: isWindows ? '#10161c' : '#00000000',
		transparent: !isWindows,
		frame: true,
		titleBarStyle: isMac || isWindows ? 'hidden' : undefined,
		titleBarOverlay: isWindows
			? {
					color: '#10161c66',
					symbolColor: '#e8eef7',
					height: 44
				}
			: undefined,
		trafficLightPosition:
			isMac
				? {
						x: 16,
						y: 16
					}
				: undefined,
		vibrancy: undefined,
		visualEffectState: undefined,
		backgroundMaterial: isWindows ? 'acrylic' : undefined,
		opacity: isWindows ? 1 : undefined,
		resizable: true,
		autoHideMenuBar: true,
		title: `${APP_DISPLAY_NAME} Comments Window`,
		webPreferences: {
			preload: path.join(__dirname, 'preload.cjs'),
			contextIsolation: true,
			nodeIntegration: false,
			backgroundThrottling: false
		}
	});

	const targetUrl = DEV_URL || `http://${HOST}:${PORT}`;
	void commentsWindow.loadURL(`${targetUrl}/comments-window`);

	if (isMac) {
		commentsWindow.setWindowButtonVisibility(true);
	}

	commentsWindow.webContents.on('did-finish-load', () => {
		commentsWindow?.webContents.send('comments-window:snapshot', lastCommentsSnapshot);
	});

	commentsWindow.on('closed', () => {
		commentsWindow = null;
	});

	return commentsWindow;
}

app.whenReady().then(async () => {
	desktopLogPath = path.join(app.getPath('userData'), 'desktop.log');
	markDesktopLogSession();
	appendDesktopLog('[desktop] app starting');
	appendDesktopLog(`[desktop] userData=${app.getPath('userData')}`);
	loadDesktopEnv();
	configureDesktopMediaPermissions();
	await startLocalServer();
	createWindow();
	configureAutoUpdater();

	app.on('activate', () => {
		if (BrowserWindow.getAllWindows().length === 0) {
			createWindow();
		}
	});
});

nativeAutoUpdater.on('before-quit-for-update', () => {
	appendDesktopLog('[updater] before-quit-for-update');
	void prepareAppForQuit('before-quit-for-update');
});

ipcMain.handle('comments-window:open', () => {
	createCommentsWindow();
	return true;
});

ipcMain.handle('comments-window:close', () => {
	if (commentsWindow && !commentsWindow.isDestroyed()) {
		commentsWindow.close();
	}

	return true;
});

ipcMain.handle('comments-window:get-snapshot', () => {
	return lastCommentsSnapshot;
});

ipcMain.handle('desktop:request-camera-access', async () => {
	try {
		return await requestDesktopCameraAccess();
	} catch (error) {
		appendDesktopLog(`[desktop][permissions] camera request failed ${error?.stack || error}`);
		return false;
	}
});

ipcMain.handle('desktop:get-camera-access-status', () => {
	return getDesktopCameraAccessStatus();
});

ipcMain.handle('desktop:open-camera-settings', async () => {
	try {
		return await openDesktopCameraSettings();
	} catch (error) {
		appendDesktopLog(`[desktop][permissions] open camera settings failed ${error?.stack || error}`);
		return false;
	}
});

ipcMain.handle('desktop:get-app-info', () => {
	return {
		name: APP_DISPLAY_NAME,
		version: app.getVersion(),
		isPackaged: app.isPackaged,
		updateState: getDesktopUpdateState()
	};
});

ipcMain.handle('desktop:get-update-state', () => {
	syncDesktopUpdaterAvailability();
	return getDesktopUpdateState();
});

ipcMain.handle('desktop:get-system-status', async () => {
	return await getDesktopSystemStatus();
});

ipcMain.handle('desktop:run-network-test', async () => {
	return await runDesktopNetworkTest();
});

ipcMain.handle('desktop:check-for-updates', async () => {
	return await checkForDesktopUpdates({ manual: true });
});

ipcMain.handle('desktop:install-update', async () => {
	return await installDownloadedDesktopUpdate();
});

ipcMain.handle('comments-window:set-opacity', (_event, value) => {
	if (!commentsWindow || commentsWindow.isDestroyed()) {
		return false;
	}

	const nextOpacity = Number(value);
	if (!Number.isFinite(nextOpacity)) {
		return false;
	}

	commentsWindow.setOpacity(Math.min(1, Math.max(0.1, nextOpacity)));
	return true;
});

ipcMain.on('comments-window:snapshot', (_event, snapshot) => {
	lastCommentsSnapshot = snapshot;
	if (commentsWindow && !commentsWindow.isDestroyed()) {
		commentsWindow.webContents.send('comments-window:snapshot', snapshot);
	}
});

process.on('uncaughtException', (error) => {
	appendDesktopLog(`[desktop][uncaughtException] ${error?.stack || error}`);
});

process.on('unhandledRejection', (reason) => {
	appendDesktopLog(`[desktop][unhandledRejection] ${reason?.stack || reason}`);
});

app.on('window-all-closed', () => {
	if (process.platform !== 'darwin') {
		app.quit();
	}
});

app.on('before-quit', (event) => {
	handleBeforeQuit(event, 'before-quit');
});
