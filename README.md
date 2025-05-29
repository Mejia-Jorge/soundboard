# Electron Soundboard

Simple Soundboard with a nice Nord UI

![Image](./img/ui2.png)

## Installation

#### Building from Source (recommended)
Because the release is not signed, its probably better to build from source.
Make sure you have a working `git`, `node` and `yarn` installation.
Clone the source code to your machine: 

```
git clone https://github.com/LoredCast/soundboard.git
cd soundboard
yarn install
yarn build
yarn electron-build
```

Installation files can now be found in the `/dist` folder.

### Development Environment
The following software versions were used for development:
- Node.js: 12.x
- Electron: ^11.2.1
- electron-builder: ^22.9.1
- react: ^17.0.1
- react-dom: ^17.0.1
- react-scripts: 4.0.1
- typescript: ^4.1.3

#### Download the Installer
If you trust my code and just want an `.exe`, there is an installer in the realeses section.

---

Once the installation is finished, you'd probably want to add convenient functionality by adding a virtual input Device.
This is neccessary because you want others to hear your own beautiful voice while blasting nickelback through Discord.

### Virtual Audio for Windows
1. Install Virtual VB Cable either through the release `VBCABLE_Driver_Pack.zip` or via the official site https://vb-audio.com/Cable/.
2. Follow Steps for the Installer, make sure to run the installer as `administor` (`right click` `run as administor`) and reboot.
3. You're now able to select Virtual Input in the Device selection in the soundboard program.
4. Pipe your microphone through the Virtual Cable as well by going into the `sound control panel -> recording -> properties (right click on your mic) -> listen`. Now tick `Listen to this device` and select `CABLE Input`.
5. Done! Now you can use `CABLE Output` in any app as device and others can hear your voice and the soundboard at the same time.


## Web Interface (Remote Control)

This soundboard includes a web interface that allows you to control sound playback remotely from another device on your local network (e.g., a smartphone, tablet, or another computer).

### Accessing the Remote Control

1.  **Find Host IP Address**: You need to determine the IP address of the computer where the Electron Soundboard application is running.
    *   On Windows, you can typically find this by opening Command Prompt and typing `ipconfig`. Look for the "IPv4 Address" under your active network adapter.
    *   On macOS, open System Preferences > Network, select your active connection, and the IP address will be displayed. Or, use `ifconfig` in the Terminal.
    *   On Linux, use the `ip addr` or `ifconfig` command in the Terminal.

2.  **Open in Browser**: On your remote device (e.g., smartphone or another computer connected to the same local network), open a web browser.

3.  **Navigate to URL**: Enter the following URL in the browser's address bar:
    `http://<HOST_IP>:3001/remote.html`
    Replace `<HOST_IP>` with the actual IP address you found in step 1. For example, if the host IP is `192.168.1.10`, you would navigate to `http://192.168.1.10:3001/remote.html`.

    The port number for the remote interface is **3001**.

### Using the Remote Control

The web page will load and attempt to connect to the Electron Soundboard application.
- It provides an input field where you should ensure the `<HOST_IP>` is correctly entered (it defaults to `localhost`, which will only work if you are opening the page on the same machine running the soundboard).
- Buttons for each sound currently loaded in the soundboard application will be displayed.
- Clicking a button on the web page will trigger the corresponding sound to play on the host machine where the Electron Soundboard is running.
- If sounds are not loading, ensure the IP address is correct and try the "Refresh Sounds" button.
