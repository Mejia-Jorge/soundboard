import React, {useEffect, useRef, useState, useCallback} from 'react'
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
    const removeListenerRef = useRef<Function>()

    
    const setPrimaryOutput = (output : string) => {
        primaryAudioRef.current?.setSinkId(output)
    }

    const setSecondaryOutput = (output : string) => {
        secondaryAudioRef.current?.setSinkId(output)
    }

    const play = useCallback(() => {
        if (primaryAudioRef.current) {
            primaryAudioRef.current.pause();
            primaryAudioRef.current.currentTime = 0;
        }
        if (secondaryAudioRef.current) {
            secondaryAudioRef.current.pause();
            secondaryAudioRef.current.currentTime = 0;
        }

        // Start playback
        if (primaryAudioRef.current) {
            primaryAudioRef.current.play().catch(error => console.error("Error playing primary audio:", error));
        }
        if (secondaryAudioRef.current) {
            secondaryAudioRef.current.play().catch(error => console.error("Error playing secondary audio:", error));
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

        if (buttonFocus && event.key === 'Escape') {
            keys = []
            setShortcut('')
            setShortcutText('')
            props.name && localStorage.removeItem(props.name)
            myIpcRenderer.send('APP_setkey', '', props.name)
            return
        }

        if (buttonFocus && keys.length < 4) {
            // Max Keybinding length is set to 4 in this case
            keys.push(event.key)
            let shortcutString = keys.join('+')

            myIpcRenderer.send('APP_setkey', shortcutString, props.name)
            setShortcutText(shortcutString)
            setShortcut(shortcutString)
        }
        
    }, []); // primaryAudioRef and secondaryAudioRef are stable refs
    
    const loadHotkey = useCallback(() => {
        let key;
        if (props.name) key = localStorage.getItem(props.name);
        if (key) {
            setShortcut(key)
            setShortcutText(key)
            myIpcRenderer.send('APP_setkey', key, props.name)
        }
    }

    }, [props.name, setShortcut, setShortcutText]);

    useEffect(() => {
        setShortcut('')
        setShortcutText('')
        loadHotkey()
    }, [loadHotkey]); 
    
    useEffect(() =>{
        setPrimaryOutput(props.outputs[0])
        setSecondaryOutput(props.outputs[1])
    }, [props.outputs, props.name])
    
    
    useEffect(() => {
        if (removeListenerRef.current) removeListenerRef.current() // Remove old listener

        removeListenerRef.current = myIpcRenderer.on('APP_keypressed', (args : string) => {
            if(shortcut === args) {
                play(); // play is now memoized
            }
        })

        props.name && shortcut && localStorage.setItem(props.name, shortcut)
    }, [shortcut, play]); // Added play to dependency array
    
    useEffect(() => {

        // Apply logarithmic scaling of linear 0 ... 1 scale to 0 ... 1 logarithmic (not perfectly accurate decibel scale)
        primaryAudioRef.current!.volume = Math.exp((Math.log(props.volume) / Math.log(10)) * 4)
        secondaryAudioRef.current!.volume = Math.exp((Math.log(props.virtualVolume) / Math.log(10)) * 4)
        
    }, [props.volume, props.virtualVolume])

    useEffect(() => {
        if (props.name && props.registerPlayFunction) {
            props.registerPlayFunction(props.name, play); // play is now memoized
        }
    }, [props.name, props.source, props.registerPlayFunction, play]); // Added play to dependency array



    const handleButtonHover = (state: string) => {
        if (state === 'in') {
            setShortcutText('Rightclick to enter hotkey') 
        }
        
        if (state === 'out') {
            setShortcutText(shortcut)
            setButtonFocus(false)
        }
    }


    return (
    <div>
        <audio ref={primaryAudioRef} src={ props.source } preload="auto"/>
        <audio ref={secondaryAudioRef} src={ props.source } preload="auto"/>
        <button onClick={play} 
                className="pad"
                onContextMenu={handleContext}
                onMouseOut={() => handleButtonHover('out')}
                onMouseEnter={() => handleButtonHover('in')}
                onKeyDown={handleKeyDown}>
            {props.name && props.name.slice(0, props.name.indexOf('.'))} <br/>
            {shortcutText}
        </button>
    </div>
    )
}

export default Pad
