import path from 'path'
import isDev from'electron-is-dev'
import { app, BrowserWindow, ipcMain, dialog, globalShortcut, Tray, Menu } from 'electron'
import fs from 'fs'
import mime from 'mime'
import express from 'express'
import cors from 'cors'
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
    static currentSounds: { name: string, path: string }[] = [];

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
            res.json(Main.currentSounds);
        });

        expressApp.listen(port, () => {
            console.log(`Express server listening on port ${port}`);
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

    private static async listAudioFiles(dir : string) {
        let paths : string[] = []
        let fileNames : string[] = []

        await fspromise.readdir(dir).then((files)  => {
            for (const file of files) {
                let filePath = path.join(dir, file)
                if (mime.getType(filePath) === 'audio/mpeg' || mime.getType(filePath) === 'audio/wav' || mime.getType(filePath) === 'audio/ogg') {
                    paths.push(path.join(dir, file))
                    fileNames.push(file)
                }
            }
            
        })

        return [paths, fileNames]
    
    }

    private static listenerListFiles() {
        ipcMain.on('APP_listFiles', (event, dir) => {
            this.listAudioFiles(dir).then(([paths, fileNames]) => { // Renamed 'files' to 'fileNames' for clarity
                Main.currentSounds = fileNames.map((fileName, index) => ({
                    name: fileName,
                    path: paths[index]
                }));

                let load = {
                    dir: dir, 
                    paths: paths,
                    fileNames: fileNames 
                }
                event.sender.send('APP_listedFiles', load)
            }).catch(error => {
                console.error("Error listing audio files:", error);
                Main.currentSounds = []; // Clear current sounds on error
                event.sender.send('APP_listedFiles', { dir: dir, paths: [], fileNames: [] }); // Send empty list
            });
        })
    }

    private static listenerFileSelection() {
        // -------------------------------------
        // Important handler for selecting the directory containing the audio files
        // Response Object contains the Selection path and all the audio files in the dir
        // -------------------------------------

        ipcMain.handle('APP_showDialog', (event, ...args) => {  
            let dir : string = ''

            dialog.showOpenDialog({properties: ['openDirectory']})
            .then((result) => {
                dir = result.filePaths[0]
                if (dir) {
                    this.listAudioFiles(dir).then(([paths, fileNames]) => { // Renamed 'files' to 'fileNames'
                        Main.currentSounds = fileNames.map((fileName, index) => ({
                            name: fileName,
                            path: paths[index]
                        }));
                        
                        let load = {
                            dir: dir,
                            paths: paths,
                            fileNames: fileNames
                        }
                        event.sender.send('APP_listedFiles', load)
                    }).catch(error => {
                        console.error("Error listing audio files from dialog:", error);
                        Main.currentSounds = []; // Clear current sounds on error
                        // Optionally send an error or empty list back to renderer via APP_listedFiles
                        event.sender.send('APP_listedFiles', { dir: dir, paths: [], fileNames: [] });
                    });
                }
            }).catch((err) => {
                console.log(err)
            })
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

