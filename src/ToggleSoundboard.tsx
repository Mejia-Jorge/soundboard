import React, { useEffect, useState } from 'react'
const { myIpcRenderer } = window

const ToggleSoundboard: React.FunctionComponent = () => {
    const [enabled, setEnabled] = useState(true)
    const [shortcut, setShortcut] = useState('')
    const [shortcutText, setShortcutText] = useState('')
    const [buttonFocus, setButtonFocus] = useState(false)

    useEffect(() => {
        myIpcRenderer.send('APP_getSoundboardState')
        const removeStateListener = myIpcRenderer.on('APP_soundboardState', (state: boolean) => {
            setEnabled(state)
        })

        let key = localStorage.getItem('toggle_hotkey')
        if (key) {
            setShortcut(key)
            setShortcutText(key)
            myIpcRenderer.send('APP_setToggleKey', key)
        }

        return () => {
            removeStateListener()
        }
    }, [])

    const toggle = () => {
        myIpcRenderer.send('APP_toggleSoundboard')
    }

    const handleContext = (event: React.MouseEvent<HTMLButtonElement>) => {
        setButtonFocus(true)
        setShortcutText('Recording...')
    }

    const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
        event.preventDefault()
        if (buttonFocus && event.key === 'Escape') {
            setShortcut('')
            setShortcutText('')
            localStorage.removeItem('toggle_hotkey')
            myIpcRenderer.send('APP_setToggleKey', '')
            setButtonFocus(false)
            return
        }

        if (buttonFocus) {
            if (['Control', 'Shift', 'Alt', 'Meta'].includes(event.key)) {
                return;
            }

            let parts = [];
            if (event.ctrlKey) parts.push('Control');
            if (event.shiftKey) parts.push('Shift');
            if (event.altKey) parts.push('Alt');
            if (event.metaKey) parts.push('Meta');

            let key = event.key;
            if (key === ' ') key = 'Space';
            if (key.length === 1) key = key.toUpperCase();

            parts.push(key);

            let shortcutString = parts.join('+');
            myIpcRenderer.send('APP_setToggleKey', shortcutString);
            setShortcutText(shortcutString);
            setShortcut(shortcutString);
            localStorage.setItem('toggle_hotkey', shortcutString);
            setButtonFocus(false);
        }
    }

    const handleButtonHover = (state: string) => {
        if (state === 'in') {
            if (!buttonFocus) setShortcutText('Rightclick to enter hotkey')
        }
        if (state === 'out') {
            setShortcutText(shortcut)
            setButtonFocus(false)
        }
    }

    return (
        <div id="toggle-soundboard">
            <div className="status-header">
                <h2>Soundboard: {enabled ? 'ON' : 'OFF'}</h2>
                <div className={`led-indicator ${enabled ? 'led-on' : 'led-off'}`}></div>
            </div>
            <button
                onClick={toggle}
                className={enabled ? "pad" : "pad btn-important"}
                onContextMenu={handleContext}
                onMouseOut={() => handleButtonHover('out')}
                onMouseEnter={() => handleButtonHover('in')}
                onKeyDown={handleKeyDown}
            >
                Toggle Soundboard <br/>
                {shortcutText}
            </button>
        </div>
    )
}

export default ToggleSoundboard
