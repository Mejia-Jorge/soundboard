import React, {useEffect, useRef, useState} from 'react'
import Colorselect from './Colorselect'
const { myIpcRenderer } = window



interface PadProps {
    outputs: string[];
    source: string;
    name: string | undefined;
    volume: number;
    virtualVolume: number;
    registerPlayFunction?: (name: string, playFn: () => void) => void;
}

let keys : string[] = [] // Could also be converted to variable ref inside component

const Pad : React.FunctionComponent<PadProps> = (props : PadProps) => {
    const primaryAudioRef = useRef<ExtendedAudioElement>(null) 
    const secondaryAudioRef = useRef<ExtendedAudioElement>(null)

    const [shortcutText, setShortcutText] = useState<string>()
    const [shortcut, setShortcut] = useState<string>('')

    const [buttonFocus, setButtonFocus] = useState<boolean>(false)
    const [localVolume, setLocalVolume] = useState<number>(1.0)
    const removeListenerRef = useRef<Function>()

    
    const setPrimaryOutput = (output : string) => {
        primaryAudioRef.current?.setSinkId(output)
    }

    const setSecondaryOutput = (output : string) => {
        secondaryAudioRef.current?.setSinkId(output)
    }

    const play = () => {
        if (primaryAudioRef.current) {
            // Check if the audio is currently playing
            if (!primaryAudioRef.current.paused && primaryAudioRef.current.currentTime > 0) {
                primaryAudioRef.current.pause();
                primaryAudioRef.current.currentTime = 0;
                if (secondaryAudioRef.current) {
                    secondaryAudioRef.current.pause();
                    secondaryAudioRef.current.currentTime = 0;
                }
            } else {
                // If not playing, reset and play
                primaryAudioRef.current.currentTime = 0;
                if (secondaryAudioRef.current) {
                    secondaryAudioRef.current.currentTime = 0;
                }
                primaryAudioRef.current.play().catch(error => console.error("Error playing primary audio:", error));
                if (secondaryAudioRef.current) {
                    secondaryAudioRef.current.play().catch(error => console.error("Error playing secondary audio:", error));
                }
            }
        }
    }

    const handleContext = (event : React.MouseEvent<HTMLButtonElement>) => {
        setButtonFocus(true)
        keys = []
        setShortcutText('Recording...')

    }

    const handleKeyDown = (event : React.KeyboardEvent<HTMLButtonElement>) => {
        // -------
        // Main Method to record Shortcuts
        // -------
        event.preventDefault()

        if (buttonFocus && event.key === 'Escape') {
            setShortcut('')
            setShortcutText('')
            props.name && localStorage.removeItem(props.name)
            myIpcRenderer.send('APP_setkey', '', props.name)
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

            myIpcRenderer.send('APP_setkey', shortcutString, props.name)
            setShortcutText(shortcutString)
            setShortcut(shortcutString)
            setButtonFocus(false)
        }
        
    }
    
    const loadHotkey = () => {
        let key
        if (props.name) key = localStorage.getItem(props.name)
        if (key) {
            setShortcut(key)
            setShortcutText(key)
            myIpcRenderer.send('APP_setkey', key, props.name)
        }
    }

    useEffect(() => {
        setShortcut('')
        setShortcutText('')
        loadHotkey()

        if (props.name) {
            let savedVol = localStorage.getItem(`vol_${props.name}`)
            if (savedVol) setLocalVolume(parseFloat(savedVol))
        }
    }, [props.name]) 
    
    useEffect(() =>{
        setPrimaryOutput(props.outputs[0])
        setSecondaryOutput(props.outputs[1])
    }, [props.outputs, props.name])
    
    
    useEffect(() => {
        if (removeListenerRef.current) removeListenerRef.current() // Remove old listener

        removeListenerRef.current = myIpcRenderer.on('APP_keypressed', (args : string) => {
            if(shortcut === args) {
                play()
            }
        })

        props.name && shortcut && localStorage.setItem(props.name, shortcut)
    }, [shortcut])
    
    useEffect(() => {

        // Apply logarithmic scaling of linear 0 ... 1 scale to 0 ... 1 logarithmic (not perfectly accurate decibel scale)
        // Combine with individual localVolume
        primaryAudioRef.current!.volume = Math.exp((Math.log(props.volume * localVolume) / Math.log(10)) * 4)
        secondaryAudioRef.current!.volume = Math.exp((Math.log(props.virtualVolume * localVolume) / Math.log(10)) * 4)
        
    }, [props.volume, props.virtualVolume, localVolume])

    useEffect(() => {
        if (props.name && props.registerPlayFunction) {
            props.registerPlayFunction(props.name, play);
        }
    }, [props.name, props.source, props.registerPlayFunction]); // play is stable, props.source ensures re-registration if source changes



    const handleVolumeChange = (e: React.FormEvent<HTMLInputElement>) => {
        let val = parseFloat(e.currentTarget.value) / 100
        setLocalVolume(val)
        if (props.name) localStorage.setItem(`vol_${props.name}`, val.toString())
    }

    const handleButtonHover = (state: string) => {
        if (state === 'in') {
            if (!buttonFocus) setShortcutText('Rightclick to enter hotkey / Esc to clear')
        }
        
        if (state === 'out') {
            setShortcutText(shortcut)
            if (!buttonFocus) setButtonFocus(false)
        }
    }


    return (
    <div className="pad-container">
        <audio ref={primaryAudioRef} src={ props.source } preload="auto"/>
        <audio ref={secondaryAudioRef} src={ props.source } preload="auto"/>
        <button onClick={play} 
                className="pad"
                onContextMenu={handleContext}
                onMouseOut={() => handleButtonHover('out')}
                onMouseEnter={() => handleButtonHover('in')}
                onKeyDown={handleKeyDown}>
            {props.name && props.name.slice(0, props.name.indexOf('.'))} <br/>
            <span className="shortcut-display">{shortcutText}</span>
        </button>
        <input
            type="range"
            min="0"
            max="100"
            value={localVolume * 100}
            onInput={handleVolumeChange}
            className="pad-volume"
            title="Individual Volume"
        />
    </div>
    )
}

export default Pad
