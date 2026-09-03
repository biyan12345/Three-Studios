const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('threeStudioDesktop', {
	isDesktop: true,
	platform: process.platform,
	openCommentsWindow: () => ipcRenderer.invoke('comments-window:open'),
	closeCommentsWindow: () => ipcRenderer.invoke('comments-window:close'),
	getCommentsSnapshot: () => ipcRenderer.invoke('comments-window:get-snapshot'),
	getCameraAccessStatus: () => ipcRenderer.invoke('desktop:get-camera-access-status'),
	requestCameraAccess: () => ipcRenderer.invoke('desktop:request-camera-access'),
	openCameraSettings: () => ipcRenderer.invoke('desktop:open-camera-settings'),
	getAppInfo: () => ipcRenderer.invoke('desktop:get-app-info'),
	getUpdateState: () => ipcRenderer.invoke('desktop:get-update-state'),
	getSystemStatus: () => ipcRenderer.invoke('desktop:get-system-status'),
	runNetworkTest: () => ipcRenderer.invoke('desktop:run-network-test'),
	checkForUpdates: () => ipcRenderer.invoke('desktop:check-for-updates'),
	installUpdate: () => ipcRenderer.invoke('desktop:install-update'),
	setCommentsWindowOpacity: (opacity) => ipcRenderer.invoke('comments-window:set-opacity', opacity),
	pushCommentsSnapshot: (snapshot) => ipcRenderer.send('comments-window:snapshot', snapshot),
	onCommentsSnapshot: (listener) => {
		const handler = (_event, snapshot) => listener(snapshot);
		ipcRenderer.on('comments-window:snapshot', handler);
		return () => {
			ipcRenderer.removeListener('comments-window:snapshot', handler);
		};
	}
});
