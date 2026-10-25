// preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld("athena", {
    registerListenerForTimerTickFromMain: (callback) => {
        // callback is setTimer
        const fn = (event, message) => {
            callback(message);
        }

        ipcRenderer.on('timer', fn);

        return () => {
            ipcRenderer.removeListener('timer', fn);
        }
    },
    startTimerOnMain: (studentInfo) => {
        try {
            return ipcRenderer.invoke('start-timer', studentInfo);
        } catch (error) {
            throw "error";
        }
    },
    setStudentInfo: (studentInfo) => {
        return ipcRenderer.invoke('set-student-info', studentInfo);
    },

    // New Preload Functions

    // Functions related to capturing camera snaps of user
    registerListenerForCameraSnapFromMain: (callback) => {
        ipcRenderer.on('camera-shot', callback);

        return () => {
            ipcRenderer.removeListener('camera-shot', callback);
        }
    },

    storeCameraSnapImageOnDisk: (data) => {
        return ipcRenderer.invoke('store-camera-snap-image-on-disk', data);
    },
    deleteQuizCaptures: (quizId) => {
        return ipcRenderer.invoke('delete-quiz-captures', quizId);
    },

    // Functions related to showing Contest Rules in a new Dialog
    showRules: () => {
        ipcRenderer.send("show-rules");
    },
    showMessageBox: () => {
        return ipcRenderer.invoke("showMessageBox");
    },
    selectFile: () => {
        return ipcRenderer.invoke("selectFile");
    },
    selectFolder: () => {
        return ipcRenderer.invoke("selectFolder");
    },
    showSaveDialogBox: () => {
        return ipcRenderer.invoke("showSaveDialogBox");
    },
    quitQuiz: () => {
        ipcRenderer.send("quit-quiz");
    },
    stopTimerOnMain: () => {
        try {
            return ipcRenderer.invoke('stop-timer');
        } catch (error) {
            console.error("Error stopping timer:", error);
        }
    },



    registerListenerForFullscreenExit: (callback) => {
        const fn = (event, ...args) => callback(...args);
        ipcRenderer.on('window-fullscreen-exit', fn);
        return () => ipcRenderer.removeListener('window-fullscreen-exit', fn);
    },

    registerListenerForWindowBlur: (callback) => {
        const fn = (event, ...args) => callback(...args);
        ipcRenderer.on('window-blur', fn);
        return () => ipcRenderer.removeListener('window-blur', fn);
    },

    registerListenerForWindowFocus: (callback) => {
        const fn = (event, ...args) => callback(...args);
        ipcRenderer.on('window-focus', fn);
        return () => ipcRenderer.removeListener('window-focus', fn);
    },

    registerListenerForWindowMinimize: (callback) => {
        const fn = (event, ...args) => callback(...args);
        ipcRenderer.on('window-minimize', fn);
        return () => ipcRenderer.removeListener('window-minimize', fn);
    },

    registerListenerForFullscreenEnter: (callback) => {
        const fn = (event, ...args) => callback(...args);
        ipcRenderer.on('window-fullscreen-enter', fn);
        return () => ipcRenderer.removeListener('window-fullscreen-enter', fn);
    },

    // Screen capture utilities
    getScreenSources: () => {
        return ipcRenderer.invoke('get-screen-sources');
    },
    getMediaAccessStatus: (mediaType) => {
        return ipcRenderer.invoke('get-media-access-status', mediaType);
    },
    enterFullscreen: () => {
        return ipcRenderer.invoke('enter-fullscreen');
    },
    exitFullscreen: () => {
        return ipcRenderer.invoke('exit-fullscreen');
    },
    isFullscreen: () => {
        return ipcRenderer.invoke('is-fullscreen');
    },
    lockQuizScreen: () => {
        return ipcRenderer.invoke('lock-quiz-screen');
    },
    unlockQuizScreen: () => {
        return ipcRenderer.invoke('unlock-quiz-screen');
    }
})
