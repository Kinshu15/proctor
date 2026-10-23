import { app, BrowserWindow, ipcMain, dialog, Notification, session, desktopCapturer, systemPreferences, globalShortcut } from "electron";
import path from "path";
import fs from "fs";
import { exec } from "child_process";

let electronWindow = null;
let startTimestamp = null;
let cameraShotPath = null;
let timerInterval = null;
let cameraInterval = null;



// Prevent write EIO errors on stdout/stderr when terminal detaches
process.stdout?.on?.('error', (err) => {
    if (err?.code === 'EIO') return;
});
process.stderr?.on?.('error', (err) => {
    if (err?.code === 'EIO') return;
});
process.on('uncaughtException', (err) => {
    if (err?.code === 'EIO' || err?.message?.includes('EIO')) return;
    try {
        console.error('Handled uncaughtException:', err?.message || err);
    } catch (_) {}
});

function safeLog(...args) {
    try {
        console.log(...args);
    } catch (_) {}
}

function safeLogError(...args) {
    try {
        console.error(...args);
    } catch (_) {}
}

function safeSend(channel, ...args) {
    if (electronWindow && !electronWindow.isDestroyed()) {
        try {
            if (!electronWindow.webContents.isDestroyed() && !electronWindow.webContents.isCrashed()) {
                electronWindow.webContents.send(channel, ...args);
            }
        } catch (_) {}
    }
}

let isQuizLocked = false;
let forceQuitAllowed = false;

function lockQuizScreen() {
    isQuizLocked = true;
    forceQuitAllowed = false;
    return { locked: true };
}

function unlockQuizScreen() {
    isQuizLocked = false;
    if (electronWindow && !electronWindow.isDestroyed()) {
        try {
            if (electronWindow.isFullScreen()) {
                electronWindow.setFullScreen(false);
            }
        } catch (err) {
            safeLogError('Error unlocking quiz screen:', err);
        }
    }
    return { unlocked: true };
}

function stopAllProctoring() {
    isQuizLocked = false;
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
    if (cameraInterval) {
        clearInterval(cameraInterval);
        cameraInterval = null;
    }
    unlockQuizScreen();
}

function createWindow() {
    electronWindow = new BrowserWindow({
        height: 850,
        width: 1250,
        fullscreen: false,
        fullscreenable: true,
        frame: true,
        kiosk: false,
        webPreferences: {
            devTools: true,
            preload: path.join(import.meta.dirname, 'preload.js')
        }
    });

    // Window focus & proctoring event dispatchers (used by the flag system)
    electronWindow.on('enter-full-screen', () => {
        safeSend('window-fullscreen-enter');
    });

    electronWindow.on('leave-full-screen', () => {
        safeSend('window-fullscreen-exit');
    });

    electronWindow.on('enter-html-full-screen', () => {
        safeSend('window-fullscreen-enter');
    });

    electronWindow.on('leave-html-full-screen', () => {
        safeSend('window-fullscreen-exit');
    });

    electronWindow.on('blur', () => {
        safeSend('window-blur');
    });

    electronWindow.on('focus', () => {
        safeSend('window-focus');
    });

    electronWindow.on('minimize', () => {
        safeSend('window-minimize');
    });

    electronWindow.on('close', (event) => {
        if (isQuizLocked && !forceQuitAllowed) {
            event?.preventDefault?.();
            safeSend('attempted-window-close');
        }
    });

    // Emergency quit listener
    electronWindow.webContents.on('before-input-event', (event, input) => {
        const key = input.key?.toLowerCase();
        const code = input.code?.toLowerCase();
        const isCtrlOrCmd = input.control || input.meta;

        // Emergency quit bypass: Cmd+Shift+Q or Ctrl+Shift+Q immediately quits
        if (isCtrlOrCmd && input.shift && (key === 'q' || code === 'keyq')) {
            forceQuitAllowed = true;
            stopAllProctoring();
            if (electronWindow && !electronWindow.isDestroyed()) {
                electronWindow.close();
            }
            app.quit();
        }
    });

    const devUrl = 'http://localhost:5173';
    const distPath = path.join(import.meta.dirname, '..', 'dist', 'index.html');

    electronWindow.loadURL(devUrl).catch(() => {
        if (fs.existsSync(distPath)) {
            electronWindow.loadFile(distPath);
        }
    });

    electronWindow.webContents.on('did-fail-load', () => {
        if (fs.existsSync(distPath)) {
            electronWindow.loadFile(distPath);
        }
    });
}



ipcMain.handle('lock-quiz-screen', () => {
    return lockQuizScreen();
});

ipcMain.handle('unlock-quiz-screen', () => {
    return unlockQuizScreen();
});

ipcMain.handle('enter-fullscreen', () => {
    if (electronWindow && !electronWindow.isDestroyed()) {
        try {
            electronWindow.focus();
            if (!electronWindow.isFullScreen()) {
                electronWindow.setFullScreen(true);
            }
            return true;
        } catch (e) {
            safeLogError('Failed to setFullScreen:', e);
            try {
                if (process.platform === 'darwin' && typeof electronWindow.setSimpleFullScreen === 'function') {
                    electronWindow.setSimpleFullScreen(true);
                    return true;
                }
            } catch (e2) {
                safeLogError('Failed simple fullscreen:', e2);
            }
            return false;
        }
    }
    return false;
});

ipcMain.handle('exit-fullscreen', () => {
    if (electronWindow && !electronWindow.isDestroyed()) {
        try {
            if (electronWindow.isFullScreen()) {
                electronWindow.setFullScreen(false);
            }
            if (process.platform === 'darwin' && typeof electronWindow.setSimpleFullScreen === 'function' && electronWindow.isSimpleFullScreen()) {
                electronWindow.setSimpleFullScreen(false);
            }
            return true;
        } catch (e) {
            safeLogError('Failed to exit fullscreen:', e);
            return false;
        }
    }
    return false;
});

ipcMain.handle('is-fullscreen', () => {
    if (electronWindow && !electronWindow.isDestroyed()) {
        const isNative = electronWindow.isFullScreen();
        const isSimple = (process.platform === 'darwin' && typeof electronWindow.setSimpleFullScreen === 'function')
            ? electronWindow.isSimpleFullScreen()
            : false;
        return isNative || isSimple;
    }
    return false;
});

let currentStudentInfo = { studentName: "Student", studentId: "101" };

function getStudentDirs() {
    const baseDir = cameraShotPath || path.join(import.meta.dirname, "user-camera-snap");
    const rawName = currentStudentInfo?.studentName || "Student";
    const cleanName = rawName.trim().replace(/[^a-zA-Z0-9_\-\s]/g, "").replace(/\s+/g, "_") || "Student";
    const studentDir = path.join(baseDir, cleanName);
    const screenCapturesDir = path.join(studentDir, "screen-captures");
    const cameraCapturesDir = path.join(studentDir, "camera-captures");

    if (!fs.existsSync(screenCapturesDir)) {
        fs.mkdirSync(screenCapturesDir, { recursive: true });
    }
    if (!fs.existsSync(cameraCapturesDir)) {
        fs.mkdirSync(cameraCapturesDir, { recursive: true });
    }

    return { studentDir, screenCapturesDir, cameraCapturesDir };
}

ipcMain.handle('set-student-info', (_event, studentInfo) => {
    if (studentInfo) {
        currentStudentInfo = {
            studentName: studentInfo.studentName || studentInfo.name || "Student",
            studentId: studentInfo.studentId || studentInfo.id || "101"
        };
    }
    return { success: true, studentInfo: currentStudentInfo };
});

async function takeScreenShot() {
    if (!isQuizLocked || !cameraInterval) return;
    try {
        if (!electronWindow || electronWindow.isDestroyed()) return;
        const image = await electronWindow.webContents.capturePage();
        const { screenCapturesDir } = getStudentDirs();
        const filePath = path.join(screenCapturesDir, `screen_${Date.now()}.png`);
        fs.writeFileSync(filePath, image.toPNG());
        safeLog("Screen snapshot saved to:", filePath);
        return filePath;
    } catch (err) {
        safeLogError("Error taking screenshot:", err);
    }
}

ipcMain.handle('start-timer', (event, studentInfo) => {
    if (studentInfo) {
        currentStudentInfo = {
            studentName: studentInfo.studentName || studentInfo.name || currentStudentInfo.studentName,
            studentId: studentInfo.studentId || studentInfo.id || currentStudentInfo.studentId
        };
    }
    startTimestamp = Date.now();

    // Lock screen strictly to quiz
    lockQuizScreen();

    if (timerInterval) clearInterval(timerInterval);
    if (cameraInterval) clearInterval(cameraInterval);

    // Send Timer Tick every 1s
    timerInterval = setInterval(() => {
        safeSend('timer', Math.floor((Date.now() - startTimestamp) / 1000));
    }, 1000);

    // Capture user's camera snap & screen screenshot every 5s
    cameraInterval = setInterval(() => {
        safeSend('camera-shot');
        takeScreenShot();
    }, 5000);

    return { started: true };
});

ipcMain.handle('stop-timer', () => {
    stopAllProctoring();
    return { stopped: true };
});

ipcMain.handle('store-camera-snap-image-on-disk', (_event, data) => {
    if (!isQuizLocked || !cameraInterval) {
        return { success: false, error: "Quiz proctoring is not active" };
    }
    try {
        const { cameraCapturesDir } = getStudentDirs();
        const filePath = path.join(cameraCapturesDir, `camera_${Date.now()}.jpg`);
        fs.writeFileSync(filePath, Buffer.from(data));
        safeLog("Camera snapshot saved to:", filePath);
        return { success: true, filePath };
    } catch (err) {
        safeLogError("Error saving camera snapshot:", err);
        return { success: false, error: err.message };
    }
});


ipcMain.on("show-rules", () => {
    dialog.showMessageBox(electronWindow, {
        type: "info",
        title: "Athena Exam Rules",
        message: "Exam Rules",
        detail:
            "1. Stay on the exam screen.\n" +
            "2. Camera must remain enabled.\n" +
            "3. Do not leave the exam.\n" +
            "4. Do not use external assistance.\n" +
            "5. Click Exit Exam when finished."
    });
});

ipcMain.on("quit-quiz", () => {
    forceQuitAllowed = true;
    stopAllProctoring();
    if (electronWindow && !electronWindow.isDestroyed()) {
        electronWindow.close();
    }
    app.quit();
});

app.on("will-quit", () => {
    stopAllProctoring();
});


// Screen capture sources & permissions IPC
ipcMain.handle('get-screen-sources', async () => {
    try {
        const sources = await desktopCapturer.getSources({
            types: ['screen', 'window'],
            thumbnailSize: { width: 320, height: 180 }
        });
        return sources.map((s) => ({
            id: s.id,
            name: s.name,
            thumbnail: s.thumbnail.toDataURL()
        }));
    } catch (err) {
        safeLogError("Error fetching screen sources via desktopCapturer:", err);
        return [];
    }
});

ipcMain.handle('get-media-access-status', (_event, mediaType) => {
    if (process.platform === 'darwin' && systemPreferences?.getMediaAccessStatus) {
        try {
            return systemPreferences.getMediaAccessStatus(mediaType);
        } catch (e) {
            return 'unknown';
        }
    }
    return 'granted';
});

app.whenReady().then(() => {
    // Enable Screen Capture in Electron for navigator.mediaDevices.getDisplayMedia
    if (session.defaultSession?.setDisplayMediaRequestHandler) {
        session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
            desktopCapturer.getSources({ types: ['screen'] }).then((sources) => {
                if (sources && sources.length > 0) {
                    callback({ video: sources[0] });
                } else {
                    callback({});
                }
            }).catch((err) => {
                safeLogError("setDisplayMediaRequestHandler desktopCapturer error:", err);
                callback({});
            });
        });
    }

    createWindow();
});


async function showMessageBox() {
    const data = await dialog.showMessageBox({
        type: 'info',
        title: 'GuideLines for the exam',
        message: 'We store your data \n We take your capture shots after every 5 seconds \n If you caught cheating your marks will be zero',
        buttons: ['What Next', 'Go previous'],
        checkboxChecked: true,
        checkboxLabel: "Your are Ok with above guidelines"
    })

    const { response, checkboxChecked } = data;
    safeLog(data);
    // response -> contains the index of the button
    // checkboxChecked -> contains user clicks the button
}


ipcMain.handle("showMessageBox", async () => {
    await showMessageBox();
})

// showOpenDialog box api can do lot of things can select files and folders
async function selectFile() {
    const response = await dialog.showOpenDialog({
        properties: ['openFile'],
        filters: [{
            name: 'ALl files',
            extensions: ['*']
        }],
    })

    // check what does response have
    const { filePaths, canceled } = response;
    safeLog(response);
}

async function selectFolder() {
    const response = await dialog.showOpenDialog({
        title: 'Select Folder for Camera Snaps',
        buttonLabel: 'Select Folder',
        properties: ['openDirectory'],
        defaultPath: '/'
    });

    if (!response.canceled && response.filePaths && response.filePaths.length > 0) {
        cameraShotPath = response.filePaths[0];
        safeLog("Camera snapshot directory set to:", cameraShotPath);
        return cameraShotPath;
    }
    return null;
}

ipcMain.handle("selectFile", async () => {
    return await selectFile();
})

ipcMain.handle("selectFolder", async () => {
    return await selectFolder();
})


async function showSaveDialogBox() {
    const response = await dialog.showSaveDialog({
        title: 'Where to save file',
        message: 'Select the folder to save the file',
        buttonLabel: 'Save as',
        defaultPath: '/'
    })

    safeLog(response);
}


ipcMain.handle("showSaveDialogBox", async () => {
    await showSaveDialogBox();
})





// TASKS
// Task 1
// Add a Button to trigger a folder selection using the Dialog Box element.
// All the Camera Snaps captured should be stored in this folder.

// Task 2
// Add Buttons and a Checkbox to the existing Rules Dialog Box.
// console.log the Checkbox selection and Clicked Button.
