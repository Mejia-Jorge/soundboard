import './App.css';
import React, { useEffect, useState } from 'react'
import Controller from './controller'

const getIpc = () => (window as any).myIpcRenderer;

const Menu : React.FunctionComponent = () => {


    const handleClose = () => {
        const myIpcRenderer = getIpc();
        if (myIpcRenderer) myIpcRenderer.invoke('APP_close')
    }

    const handleMin = () => {
        const myIpcRenderer = getIpc();
        if (myIpcRenderer) myIpcRenderer.invoke('APP_min')
    }

    return(<header>
        
        <div className="option" onClick={handleClose}>X</div>
        <div className="option" onClick={handleMin}>-</div>
    </header>)
}

const Version : React.FunctionComponent = () => {
    const [versionText, setVersionText] = useState<string>('pending')

    useEffect(() => {
        const myIpcRenderer = getIpc();
        if (!myIpcRenderer) {
            console.error("myIpcRenderer not found. Are you running in Electron?");
            setVersionText("BROWSER/ERROR");
            return;
        }

        myIpcRenderer.send('APP_getVersion')

        myIpcRenderer.on('APP_currentVersion', (info: any) => {
            setVersionText(info)
        })
    }, [])

    return(
        <div id="version"><h1>version {versionText}</h1></div>
    )
}

const WebUILink : React.FunctionComponent = () => {
    const [webUIUrl, setWebUIUrl] = useState<string>('')

    useEffect(() => {
        const myIpcRenderer = getIpc();
        if (myIpcRenderer) {
            myIpcRenderer.invoke('APP_getWebUIUrl').then((url: string) => {
                setWebUIUrl(url)
            })
        }
    }, [])

    if (!webUIUrl) return null;

    return (
        <div id="web-ui-container">
            <a href={webUIUrl} target="_blank" rel="noreferrer" className="web-ui-link">
                Open Web UI ({webUIUrl})
            </a>
        </div>
    )
}

const App : React.FunctionComponent = () => {
    

    return(
        <div>
            
            <Menu/>
            <Controller/>
            <WebUILink/>
            <Version/>
        </div>
    )
}

export default App;

