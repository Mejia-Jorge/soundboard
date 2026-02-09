import path from 'path'
import { pathToFileURL } from 'url'
import { app, BrowserWindow, ipcMain, dialog, globalShortcut, Tray, Menu, nativeImage } from 'electron'
import fs from 'fs'
import os from 'os'

import mime from 'mime'
import express from 'express'
import cors from 'cors'
import { IpcMainEvent } from 'electron/main'
import { autoUpdater } from "electron-updater"
import log from 'electron-log'

const fspromise = fs.promises

interface Bind {
    key:string,
    name:string
}


export default class Main {
    static mainWindow: BrowserWindow;
    static application: Electron.App;
    static BrowserWindow: typeof BrowserWindow;
    static HotkeyEvent : IpcMainEvent
    static tray : Tray
    static Menu : Menu
    static currentSounds: { name: string, path: string, imagePath?: string }[] = [];
    static soundboardEnabled: boolean = true;
    static bindings: Bind[] = [];
    static toggleHotkey: string = '';
    static instantSoundPath: string = '';
    static instantSearchTerm: string = '';
    static currentDir: string = '';

    private static registerAllShortcuts() {
        for (let bind of Main.bindings) {
            if (bind.key) {
                try {
                    globalShortcut.register(bind.key, () => {
                        if (Main.mainWindow && !Main.mainWindow.isDestroyed()) {
                            Main.mainWindow.webContents.send('APP_keypressed', bind.key);
                        }
                    });
                } catch (e) {
                    console.log(`Failed to register ${bind.key}:`, e);
                }
            }
        }
    }

    private static setToggleHotkey(key: string) {
        if (Main.toggleHotkey) {
            try {
                globalShortcut.unregister(Main.toggleHotkey);
            } catch (e) {}
        }
        Main.toggleHotkey = key;
        if (key) {
            try {
                globalShortcut.register(key, () => {
                    Main.toggleSoundboard();
                });
            } catch (e) {
                console.log(`Failed to register toggle hotkey ${key}:`, e);
            }
        }
    }

    private static toggleSoundboard() {
        Main.soundboardEnabled = !Main.soundboardEnabled;
        if (Main.soundboardEnabled) {
            Main.registerAllShortcuts();
        } else {
            Main.unregisterAllShortcuts();
        }
        if (Main.mainWindow && !Main.mainWindow.isDestroyed()) {
            Main.mainWindow.webContents.send('APP_soundboardState', Main.soundboardEnabled);
        }
    }

    private static unregisterAllShortcuts() {
        for (let bind of Main.bindings) {
            if (bind.key) {
                try {
                    globalShortcut.unregister(bind.key);
                } catch (e) {}
            }
        }
    }

    private static onWindowAllClosed() {
        if (process.platform !== 'darwin') {
            Main.application.quit();
        }
    }

    private static onClose() {
        // Dereference the window object. 
        // Main.mainWindow = null;
        console.log("closed")
    }

    private static onReady() {
        const isDev = !app.isPackaged;
        Main.mainWindow = new Main.BrowserWindow({ 
            width: 1460, 
            height: 1000,
            minWidth: 760,
            minHeight: 50,
            frame: isDev ? true : false,
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                preload: path.join(__dirname, 'preload.cjs')
            }
        });
        Main.mainWindow.loadURL(isDev ? 'http://localhost:3000' : `file://${path.join(__dirname, '../build/index.html')}`);
        if (isDev) Main.mainWindow.webContents.openDevTools();
        Main.mainWindow.on('closed', Main.onClose);

        Main.mainWindow.webContents.on('did-fail-load' as any, (event: any, errorCode: any, errorDescription: any) => {
            console.error('Failed to load:', errorCode, errorDescription);
        });

        Main.mainWindow.webContents.on('render-process-gone' as any, (event: any, details: any) => {
            console.error('Render process gone:', details);
        });

        Main.mainWindow.on("minimize" as any, (e: any) => {
            e.preventDefault();
        })

        log.transports.file.level = "debug"
        autoUpdater.logger = log

        autoUpdater.on('error', (error: any) => {
            console.error('AutoUpdater Error: ', error == null ? "unknown" : (error.stack || error).toString())
        })
        if (!isDev) {
            autoUpdater.checkForUpdatesAndNotify()
            console.log("Checking for updates!")
        }
        
        

        var contextMenu = Menu.buildFromTemplate([
            {
                label: 'Show SoundBoard', click: function () {
                    Main.mainWindow.show();
                }
            },

            {
                label: 'Quit', click: function () {
                    Main.application.quit();
                }
            },
            {type: 'separator'},
            {
                label: app.getVersion()
            }
        ]);

        Main.tray = new Tray(path.join(__dirname, '../build/icon.png'))
        Main.tray.setContextMenu(contextMenu)
        Main.tray.setToolTip('Soundboard')
        Main.tray.addListener('click', (e) => {
            Main.mainWindow.show()
        })

        Main.initExpressServer();
    }

    private static initExpressServer() {
        // Cleanup old instant search sounds
        try {
            const tempDir = path.join(app.getPath('temp'), 'soundboard-instant');
            if (fs.existsSync(tempDir)) {
                const files = fs.readdirSync(tempDir);
                for (const file of files) {
                    fs.unlinkSync(path.join(tempDir, file));
                }
            }
        } catch (e) {
            console.error("Error cleaning up temp directory:", e);
        }

        const expressApp = express();
        const port = 3001;

        // Serve remote.html at the root path
        expressApp.get('/', (req: any, res: any) => {
            // This assumes remote.html is directly in the build output directory (e.g., build/remote.html)
            // This is consistent with the existing log message that suggests /remote.html
            res.sendFile(path.join(__dirname, 'remote.html'));
        });

        // Serve static files from the 'build' directory (where electron.js is located)
        // This should make remote.html accessible if it's in 'build/remote.html' or 'build/public/remote.html'
        // depending on the build process.
        expressApp.use(express.static(__dirname)); 
        // If remote.html is in build/public/remote.html, use:
        // expressApp.use('/public', express.static(path.join(__dirname, 'public')));
        // or adjust remote.html path to be /public/remote.html

        expressApp.use(cors());

        expressApp.get('/hello', (req: any, res: any) => {
            res.json({ message: "Hello from Electron Express server!" });
        });

        expressApp.get('/play-sound/:soundName', (req: any, res: any) => {
            const soundName = req.params.soundName;
            if (Main.mainWindow && Main.mainWindow.webContents) {
                Main.mainWindow.webContents.send('PLAY_SOUND_FROM_WEB', soundName);
                res.json({ message: `Request to play ${soundName} received` });
            } else {
                res.status(500).json({ message: "Main window not available" });
            }
        });

        expressApp.get('/get-sounds', (req: any, res: any) => {
            const soundsWithDataUrls = Main.currentSounds.map(sound => {
                const responseSound: { name: string, path?: string, imagePath?: string, imageDataUrl?: string } = { 
                    name: sound.name,
                    // Optionally include path and imagePath if needed by client, for now, focusing on name and imageDataUrl
                    // path: sound.path, 
                    // imagePath: sound.imagePath 
                };
                if (sound.imagePath) {
                    try {
                        const imageBuffer = fs.readFileSync(sound.imagePath);
                        const mimeType = mime.getType(sound.imagePath);
                        if (mimeType) {
                            const base64String = imageBuffer.toString('base64');
                            responseSound.imageDataUrl = `data:${mimeType};base64,${base64String}`;
                        } else {
                            console.warn(`Could not determine MIME type for image: ${sound.imagePath}`);
                        }
                    } catch (error) {
                        console.error(`Error reading image file ${sound.imagePath}:`, error);
                        // imageDataUrl remains undefined
                    }
                }
                return responseSound;
            });
            res.json(soundsWithDataUrls);
        });

        expressApp.listen(port, '0.0.0.0', () => {
            console.log(`Express server listening on port ${port}. Accessible on your local network.`);
            console.log(`Try: http://<YOUR_MACHINE_IP>:${port}/remote.html`);
        });
    }



    private static getLocalIP() {
        const interfaces = os.networkInterfaces();
        for (const name of Object.keys(interfaces)) {
            for (const iface of interfaces[name]!) {
                if (iface.family === 'IPv4' && !iface.internal) {
                    return iface.address;
                }
            }
        }
        return 'localhost';
    }

    private static listenerWebUI() {
        ipcMain.handle('APP_getWebUIUrl', (event) => {
            const port = 3001;
            const ip = Main.getLocalIP();
            return `http://${ip}:${port}/remote.html`;
        });
    }

    private static listenerInstantSearch() {
        ipcMain.handle('APP_saveInstantSound', async (event, targetDir: string) => {
            if (!Main.instantSoundPath || !fs.existsSync(Main.instantSoundPath)) {
                return { error: 'No sound in cache to save' };
            }
            if (!targetDir || !fs.existsSync(targetDir)) {
                return { error: 'Invalid target directory' };
            }

            try {
                const ext = path.extname(Main.instantSoundPath) || '.mp3';
                const sanitizedTerm = Main.instantSearchTerm.replace(/[^a-z0-9]/gi, '_').toLowerCase();
                let filename = `${sanitizedTerm}${ext}`;
                let destPath = path.join(targetDir, filename);

                // Handle duplicate filenames
                let counter = 1;
                while (fs.existsSync(destPath)) {
                    filename = `${sanitizedTerm}-${counter}${ext}`;
                    destPath = path.join(targetDir, filename);
                    counter++;
                }

                fs.copyFileSync(Main.instantSoundPath, destPath);
                return { success: true, path: destPath };
            } catch (error) {
                console.error("Error saving instant sound:", error);
                return { error: 'Failed to save sound to directory' };
            }
        });

        ipcMain.handle('APP_searchInstant', async (event, term: string) => {
            if (!term) return { error: 'No search term provided' };

            // If term is same, return current path
            if (term === Main.instantSearchTerm && Main.instantSoundPath && fs.existsSync(Main.instantSoundPath)) {
                return { path: pathToFileURL(Main.instantSoundPath).href };
            }

            try {
                const searchUrl = `https://www.myinstants.com/en/search/?name=${encodeURIComponent(term)}`;
                const response = await fetch(searchUrl);
                const html = await response.text();

                // Regex to find the first sound URL
                // Look for play('/media/sounds/filename.mp3'
                const match = html.match(/play\('(\/media\/sounds\/[^']+)'/);

                if (!match) {
                    return { error: 'No results found' };
                }

                const soundUrl = `https://www.myinstants.com${match[1]}`;
                const tempDir = path.join(app.getPath('temp'), 'soundboard-instant');
                if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

                // Delete old sound if it exists
                if (Main.instantSoundPath && fs.existsSync(Main.instantSoundPath)) {
                    try {
                        fs.unlinkSync(Main.instantSoundPath);
                    } catch (e) {
                        console.error("Error deleting old instant sound:", e);
                    }
                }

                const ext = path.extname(soundUrl) || '.mp3';
                const filename = `instant-${Date.now()}${ext}`;
                const localPath = path.join(tempDir, filename);

                const soundResponse = await fetch(soundUrl);
                const buffer = await soundResponse.arrayBuffer();
                fs.writeFileSync(localPath, Buffer.from(buffer));

                Main.instantSoundPath = localPath;
                Main.instantSearchTerm = term;

                return { path: pathToFileURL(localPath).href };

            } catch (error) {
                console.error("Error in instant search:", error);
                return { error: 'Failed to fetch or download sound' };
            }
        });
    }

    private static listenerVersion() {
        ipcMain.on('APP_getVersion', (event) => {
            const isDev = !app.isPackaged;
            if (!isDev) {
                autoUpdater.on('update-available', (info) => {
                    event.reply('APP_currentVersion', info)
                    console.log(info)
                })
                autoUpdater.checkForUpdates()
                event.reply('APP_currentVersion', app.getVersion())
            } else {
                event.reply('APP_currentVersion', "DEV")
            }
        })
    }

    private static async listAudioFiles(dir: string): Promise<{ audioName: string, audioPath: string, imagePath?: string }[]> {
        const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp'];
        let soundObjectsList: { audioName: string, audioPath: string, imagePath?: string }[] = [];

        try {
            const filesInDirectory = await fspromise.readdir(dir);
            for (const file of filesInDirectory) {
                const filePath = path.join(dir, file);
                const mimeType = mime.getType(filePath);

                if (mimeType === 'audio/mpeg' || mimeType === 'audio/wav' || mimeType === 'audio/ogg') {
                    const baseName = path.parse(file).name;
                    let imagePath: string | undefined = undefined;

                    for (const imageExt of imageExtensions) {
                        const potentialImageFileName = baseName + imageExt;
                        const potentialImagePath = path.join(dir, potentialImageFileName);
                        if (fs.existsSync(potentialImagePath)) {
                            imagePath = potentialImagePath;
                            break; 
                        }
                    }
                    soundObjectsList.push({
                        audioName: file,
                        audioPath: filePath,
                        imagePath: imagePath
                    });
                }
            }
        } catch (error) {
            console.error(`Error reading directory ${dir}:`, error);
            // In case of error reading directory, return empty list or rethrow
            // For now, returning empty list to avoid breaking promise chains expecting an array
            return []; 
        }
        return soundObjectsList;
    }

    private static listenerListFiles() {
        ipcMain.on('APP_listFiles', (event, dir) => {
            Main.currentDir = dir;
            this.listAudioFiles(dir).then(soundObjectsList => {
                Main.currentSounds = soundObjectsList.map(soundObject => ({
                    name: soundObject.audioName,
                    path: soundObject.audioPath,
                    imagePath: soundObject.imagePath
                }));

                // Adapt for existing IPC structure if renderer expects paths and fileNames separately
                const paths = soundObjectsList.map(s => s.audioPath);
                const fileNames = soundObjectsList.map(s => s.audioName);
                // If renderer needs imagePaths, this 'load' object should be updated.
                // For now, keeping it compatible with potential existing renderer expectations.
                let load = {
                    dir: dir, 
                    paths: paths,
                    fileNames: fileNames 
                };
                event.sender.send('APP_listedFiles', load);
            }).catch(error => {
                console.error("Error processing listed audio files:", error);
                Main.currentSounds = []; 
                event.sender.send('APP_listedFiles', { dir: dir, paths: [], fileNames: [] });
            });
        })
    }

    private static listenerFileSelection() {
        // -------------------------------------
        // Important handler for selecting the directory containing the audio files
        // Response Object contains the Selection path and all the audio files in the dir
        // -------------------------------------

        ipcMain.handle('APP_showDialog', (event, ...args) => {  
            let dir : string = '';

            dialog.showOpenDialog({properties: ['openDirectory']})
            .then((result) => {
                dir = result.filePaths[0];
                if (dir) {
                    Main.currentDir = dir;
                    this.listAudioFiles(dir).then(soundObjectsList => {
                        Main.currentSounds = soundObjectsList.map(soundObject => ({
                            name: soundObject.audioName,
                            path: soundObject.audioPath,
                            imagePath: soundObject.imagePath
                        }));
                        
                        const paths = soundObjectsList.map(s => s.audioPath);
                        const fileNames = soundObjectsList.map(s => s.audioName);
                        // See note in listenerListFiles about adapting this payload if renderer needs more info
                        let load = {
                            dir: dir,
                            paths: paths,
                            fileNames: fileNames
                        };
                        event.sender.send('APP_listedFiles', load);
                    }).catch(error => {
                        console.error("Error processing listed audio files from dialog:", error);
                        Main.currentSounds = []; 
                        event.sender.send('APP_listedFiles', { dir: dir, paths: [], fileNames: [] });
                    });
                }
            }).catch((err) => {
                console.log(err);
            });
        });
    }


    private static listenerClose() {
        ipcMain.handle('APP_close', (event, ...args) => {
            Main.mainWindow.close()
        })
    }


    private static listenerMin() {
        ipcMain.handle('APP_min', (event, ...args) => {
            Main.mainWindow.hide()
        })
    }

    

    

    private static listenerHotkey() {
        ipcMain.on('APP_setkey', (event, key : string, title : string, ...args) => {
            let exists = false

            for (let bind of Main.bindings) {
                if (bind.name === title) {
                    exists = true
                    if (Main.soundboardEnabled && bind.key) {
                        try {
                            globalShortcut.unregister(bind.key) // delete old Hotkey
                        } catch {
                            console.log("Failed to unregister old hotkey")
                        }
                    }
                    bind.key = key
                }
            }

            if (!exists) {
                Main.bindings.push({
                    key: key,
                    name: title
                })
            }

            if (Main.soundboardEnabled && key) {
                try {
                    globalShortcut.register(key, () => {
                        if (Main.mainWindow && !Main.mainWindow.isDestroyed()) {
                            Main.mainWindow.webContents.send('APP_keypressed', key)
                        }
                    })
                } catch (error) {
                    console.log(error)
                }
            }
        })

        ipcMain.on('APP_setToggleKey', (event, key: string) => {
            Main.setToggleHotkey(key)
        })

        ipcMain.on('APP_toggleSoundboard', (event) => {
            Main.toggleSoundboard()
        })

        ipcMain.on('APP_getSoundboardState', (event) => {
            event.reply('APP_soundboardState', Main.soundboardEnabled)
        })

        ipcMain.on('APP_setSoundboardEnabled', (event, enabled: boolean) => {
            if (Main.soundboardEnabled !== enabled) {
                Main.soundboardEnabled = enabled
                if (Main.soundboardEnabled) {
                    Main.registerAllShortcuts()
                } else {
                    Main.unregisterAllShortcuts()
                }
                if (Main.mainWindow && !Main.mainWindow.isDestroyed()) {
                    Main.mainWindow.webContents.send('APP_soundboardState', Main.soundboardEnabled)
                }
            }
        })

        ipcMain.on('APP_updateIcon', (event, dataUrl: string, overlayUrl?: string) => {
            const image = nativeImage.createFromDataURL(dataUrl);
            if (Main.tray) Main.tray.setImage(image);
            if (Main.mainWindow) {
                Main.mainWindow.setIcon(image);
                if (overlayUrl && process.platform === 'win32') {
                    const overlay = nativeImage.createFromDataURL(overlayUrl);
                    Main.mainWindow.setOverlayIcon(overlay, Main.soundboardEnabled ? 'Soundboard Enabled' : 'Soundboard Disabled');
                }
            }
        });
    }


    private static listenerRecording() {
        ipcMain.on('APP_saveRecording', async (event, data) => {
            const { filePath } = await dialog.showSaveDialog({
                buttonLabel: 'Save Audio',
                defaultPath: `audio-${Date.now()}`,
                filters: [{ name: 'Audio', extensions: ['wav'] },]
            })

            if (filePath) fspromise.writeFile(filePath, data)
                .then(() => event.reply('APP_saveSuccess', true))
                .catch((e) => console.log(e))
        } )
    }

    private static listenerDeleteSound() {
        ipcMain.handle('APP_deleteSound', async (event, audioPath: string) => {
            const sound = Main.currentSounds.find(s => s.path === audioPath);
            if (!sound) {
                return { error: 'Sound not found' };
            }

            const filesToDelete = [sound.path];
            if (sound.imagePath) {
                filesToDelete.push(sound.imagePath);
            }

            const result = await dialog.showMessageBox(Main.mainWindow, {
                type: 'warning',
                buttons: ['Cancel', 'Delete'],
                defaultId: 0,
                title: 'Confirm Deletion',
                message: `Are you sure you want to delete this sound?`,
                detail: `The following files will be permanently deleted:\n\n${filesToDelete.join('\n')}`,
                cancelId: 0
            });

            if (result.response === 1) { // Delete
                try {
                    for (const file of filesToDelete) {
                        if (fs.existsSync(file)) {
                            await fspromise.unlink(file);
                        }
                    }

                    // Remove binding and unregister hotkey
                    const bindIndex = Main.bindings.findIndex(b => b.name === sound.name);
                    if (bindIndex !== -1) {
                        const bind = Main.bindings[bindIndex];
                        if (Main.soundboardEnabled && bind.key) {
                            try {
                                globalShortcut.unregister(bind.key);
                            } catch (e) {
                                console.error(`Failed to unregister hotkey ${bind.key}:`, e);
                            }
                        }
                        Main.bindings.splice(bindIndex, 1);
                    }

                    // Re-list files
                    if (Main.currentDir) {
                        const soundObjectsList = await this.listAudioFiles(Main.currentDir);
                        Main.currentSounds = soundObjectsList.map(soundObject => ({
                            name: soundObject.audioName,
                            path: soundObject.audioPath,
                            imagePath: soundObject.imagePath
                        }));

                        const paths = soundObjectsList.map(s => s.audioPath);
                        const fileNames = soundObjectsList.map(s => s.audioName);
                        let load = {
                            dir: Main.currentDir,
                            paths: paths,
                            fileNames: fileNames
                        };
                        event.sender.send('APP_listedFiles', load);
                    }

                    return { success: true };
                } catch (error) {
                    console.error("Error deleting sound:", error);
                    return { error: 'Failed to delete files' };
                }
            }
            return { success: false, cancelled: true };
        });
    }

        

    static main(app: Electron.App, browserWindow: typeof BrowserWindow) {
        // we pass the Electron.App object and the  
        // Electron.BrowserWindow into this function 
        // so this class has no dependencies. This 
        // makes the code easier to write tests for 
        Main.BrowserWindow = browserWindow;
        
        Main.application = app;
        Main.application.on('window-all-closed', Main.onWindowAllClosed);
        Main.application.on('ready', Main.onReady);
        
        
        
        

        this.listenerFileSelection()
        this.listenerHotkey()
        this.listenerClose()
        this.listenerMin()
        this.listenerRecording()
        this.listenerDeleteSound()
        this.listenerListFiles()
        this.listenerVersion()
        this.listenerWebUI()
        this.listenerInstantSearch()
    }
}



Main.main(app, BrowserWindow)
