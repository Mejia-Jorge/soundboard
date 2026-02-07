import { contextBridge, ipcRenderer } from 'electron';

function callIpcRenderer(method: string, channel: string, ...args: any[]) {
    if (typeof channel !== 'string' || !channel.startsWith('APP_')) {
        console.log('Error: IPC channel name not allowed');
    }
    if (['invoke', 'send'].includes(method)) {
        return (ipcRenderer as any)[method](channel, ...args);
    }
    if ('on' === method) {
        const listener = args[0];
        if (!listener) console.log('Listener must be provided');

        // Wrap the given listener in a new function to avoid exposing
        // the `event` arg to our renderer.
        const wrappedListener = (_event: any, ...a: any[]) => listener(...a);
        ipcRenderer.on(channel, wrappedListener);

        // The returned function must not return anything (and NOT
        // return the value from `removeListener()`) to avoid exposing ipcRenderer.
        return () => { ipcRenderer.removeListener(channel, wrappedListener); };
    }

}


contextBridge.exposeInMainWorld(
    'myIpcRenderer', {
        invoke: (channel: string, ...args: any[]) => callIpcRenderer('invoke', channel, ...args),
        send: (channel: string, ...args: any[]) => callIpcRenderer('send', channel, ...args),
        on: (channel: string, ...args: any[]) => callIpcRenderer('on', channel, ...args)
    },
);
