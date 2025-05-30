import path from 'path'
import isDev from'electron-is-dev'
import { app, BrowserWindow, ipcMain, dialog, globalShortcut, Tray, Menu } from 'electron'
import fs from 'fs'
import mime from 'mime'
import express from 'express'
import cors from 'cors'
import https from 'https';
import { IpcMainEvent } from 'electron/main'
import { autoUpdater } from "electron-updater" 

const fspromise = fs.promises

interface Bind {
    key:string,
    name:string
}


export default class Main {
    static mainWindow: Electron.BrowserWindow;
    static application: Electron.App;
    static BrowserWindow;
    static HotkeyEvent : IpcMainEvent
    static tray : Tray
    static Menu : Menu
    static currentSounds: { name: string, path: string, imagePath?: string }[] = [];

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
        Main.mainWindow = new Main.BrowserWindow({ 
            width: 1460, 
            height: 1000,
            minWidth: 760,
            minHeight: 50,
            frame: isDev ? true : false,
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                enableRemoteModule: false,
                preload: path.join(__dirname, 'preload.js')
    } 
        });
        Main.mainWindow.loadURL(isDev ? 'http://localhost:3000' : `file://${path.join(__dirname, '../build/index.html')}`);
        Main.mainWindow.on('closed', Main.onClose);

        

        

        Main.mainWindow.on("minimize", (e) => {
            e.preventDefault();
        })

        const log = require("electron-log")
        log.transports.file.level = "debug"
        autoUpdater.logger = log

        autoUpdater.on('error', (error) => {
            dialog.showErrorBox('Error: ', error == null ? "unknown" : (error.stack || error).toString())
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
        const expressApp = express();
        const port = 3001;

        // Serve remote.html at the root path
        expressApp.get('/', (req, res) => {
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

        expressApp.get('/hello', (req, res) => {
            res.json({ message: "Hello from Electron Express server!" });
        });

        expressApp.get('/play-sound/:soundName', (req, res) => {
            const soundName = req.params.soundName;
            if (Main.mainWindow && Main.mainWindow.webContents) {
                Main.mainWindow.webContents.send('PLAY_SOUND_FROM_WEB', soundName);
                res.json({ message: `Request to play ${soundName} received` });
            } else {
                res.status(500).json({ message: "Main window not available" });
            }
        });

        expressApp.get('/get-sounds', (req, res) => {
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

        const httpsOptions = {
            key: fs.readFileSync(path.join(__dirname, 'key.pem')), // Placeholder
            cert: fs.readFileSync(path.join(__dirname, 'cert.pem')) // Placeholder
        };

        https.createServer(httpsOptions, expressApp).listen(port, '0.0.0.0', () => {
            console.log(`HTTPS Express server listening on port ${port}. Accessible on your local network.`);
            console.log(`Try: https://<YOUR_MACHINE_IP>:${port}/remote.html`); // Updated to https
        });
    }



    private static listenerVersion() {
        ipcMain.on('APP_getVersion', (event) => {
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
        let keys : string[] = [] // Keep track of keys 
        let names : string[] = [] // Corrosponding File Names for Shortcuts

        let bindings : Bind[] = []

        ipcMain.on('APP_setkey', (event, key : string, title : string, ...args) => {
            
            let keyIndex = names.indexOf(title) // Check if a Shortcut is already registered 
            let exists = false

            for (let bind of bindings) {
                if (bind.name === title) {
                    exists = true
                    try {
                        globalShortcut.unregister(bind.key) // delete old Hotkey
                    } catch {
                        console.log("Failed")
                    }
                    bind.key = key
                }
            }

            if (!exists) {
                bindings.push({
                    key: key,
                    name: title
                })
            }


            try {
                globalShortcut.register(key, () => {
                    event.reply('APP_keypressed', key)
                })
            } catch (error) {
                console.log(error)
            }

            console.log(bindings)
        })
    }


    private static listenerRecording() {
        ipcMain.on('APP_saveRecording', async (event, data) => {
            const { filePath } = await dialog.showSaveDialog({
                buttonLabel: 'Save Audio',
                defaultPath: `audio-${Date.now()}`,
                filters: [{ name: 'Audio', extensions: ['wav'] },]
            })

            if (filePath) fspromise.writeFile(filePath, data)
                .then(event.reply('APP_saveSuccess', true))
                .catch((e) => console.log(e))
        } )
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
        this.listenerListFiles()
        this.listenerVersion()
    }
}



Main.main(app, BrowserWindow)

