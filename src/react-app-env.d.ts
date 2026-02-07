/// <reference types="react-scripts" />
/// <reference types="jest" />

interface Window {
    myIpcRenderer: {
        invoke(channel: string, ...args: any[]): Promise<any>;
        send(channel: string, ...args: any[]): void;
        on(channel: string, listener: (...args: any[]) => void): () => void;
    };
}
