import React, {useEffect, useRef, useState} from 'react'

const getIpc = () => (window as any).myIpcRenderer;

interface PadProps {
    outputs: string[];
    source: string;
    name: string | undefined;
    volume: number;
    virtualVolume: number;
    audioContext: AudioContext;
    registerPlayFunction?: (name: string, playFn: () => void) => void;
}

// Extended interface for sinkId support
interface ExtendedAudioElement extends HTMLAudioElement {
    setSinkId(sinkId: string): Promise<void>;
}

const Pad : React.FunctionComponent<PadProps> = (props : PadProps) => {
    // Hidden sources
    const primarySourceRef = useRef<ExtendedAudioElement>(null)
    const secondarySourceRef = useRef<ExtendedAudioElement>(null)

    // Sink elements (those that actually output sound to devices)
    const primarySinkRef = useRef<ExtendedAudioElement>(null)
    const secondarySinkRef = useRef<ExtendedAudioElement>(null)

    // Web Audio nodes
    const primaryGainRef = useRef<GainNode | null>(null)
    const secondaryGainRef = useRef<GainNode | null>(null)
    const pSourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null)
    const sSourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null)
    const pDestRef = useRef<MediaStreamAudioDestinationNode | null>(null)
    const sDestRef = useRef<MediaStreamAudioDestinationNode | null>(null)

    const [shortcutText, setShortcutText] = useState<string>()
    const [shortcut, setShortcut] = useState<string>('')

    const [buttonFocus, setButtonFocus] = useState<boolean>(false)
    const [isPlaying, setIsPlaying] = useState<boolean>(false)
    const [localVolume, setLocalVolume] = useState<number>(1.0)
    const [fadeIn, setFadeIn] = useState<boolean>(false)
    const [fadeOut, setFadeOut] = useState<boolean>(false)
    const [isGraphInitialized, setIsGraphInitialized] = useState<boolean>(false)
    const removeListenerRef = useRef<Function | null>(null)
    const fadeOutTimeoutRef = useRef<NodeJS.Timeout | null>(null)
    const fadeInTimeoutRef = useRef<NodeJS.Timeout | null>(null)

    // Refs to avoid stale closures in the registered play function
    const fadeInRef = useRef(fadeIn)
    const fadeOutRef = useRef(fadeOut)
    const localVolumeRef = useRef(localVolume)
    const volumeRef = useRef(props.volume)
    const virtualVolumeRef = useRef(props.virtualVolume)

    useEffect(() => {
        fadeInRef.current = fadeIn
        fadeOutRef.current = fadeOut
        localVolumeRef.current = localVolume
        volumeRef.current = props.volume
        virtualVolumeRef.current = props.virtualVolume
    }, [fadeIn, fadeOut, localVolume, props.volume, props.virtualVolume])

    
    const setPrimaryOutput = (output : string) => {
        primarySinkRef.current?.setSinkId(output)
    }

    const setSecondaryOutput = (output : string) => {
        secondarySinkRef.current?.setSinkId(output)
    }

    const FADE_DURATION = 0.5;

    const getTargetGain = (linearVolume: number) => {
        return linearVolume > 0 ? Math.exp((Math.log(linearVolume) / Math.log(10)) * 4) : 0;
    }

    const play = () => {
        // Start AudioContext on user interaction
        if (props.audioContext.state === 'suspended') {
            props.audioContext.resume();
        }

        if (!isGraphInitialized) {
            console.warn("Audio graph not initialized yet, attempting to play anyway...");
        }

        const ctx = props.audioContext;
        const now = ctx.currentTime;

        if (primarySourceRef.current) {
            // Check if the audio is currently playing
            if (!primarySourceRef.current.paused && primarySourceRef.current.currentTime > 0) {
                if (fadeOutRef.current) {
                    // Start fade out
                    primaryGainRef.current?.gain.cancelScheduledValues(now);
                    primaryGainRef.current?.gain.setValueAtTime(primaryGainRef.current.gain.value, now);
                    primaryGainRef.current?.gain.linearRampToValueAtTime(0, now + FADE_DURATION);

                    secondaryGainRef.current?.gain.cancelScheduledValues(now);
                    secondaryGainRef.current?.gain.setValueAtTime(secondaryGainRef.current.gain.value, now);
                    secondaryGainRef.current?.gain.linearRampToValueAtTime(0, now + FADE_DURATION);

                    if (fadeOutTimeoutRef.current) clearTimeout(fadeOutTimeoutRef.current);
                    fadeOutTimeoutRef.current = setTimeout(() => {
                        primarySourceRef.current?.pause();
                        if (primarySourceRef.current) primarySourceRef.current.currentTime = 0;
                        secondarySourceRef.current?.pause();
                        if (secondarySourceRef.current) secondarySourceRef.current.currentTime = 0;

                        // Reset gain for next play
                        const combinedPrimary = volumeRef.current * localVolumeRef.current;
                        const combinedSecondary = virtualVolumeRef.current * localVolumeRef.current;
                        primaryGainRef.current?.gain.setValueAtTime(getTargetGain(combinedPrimary), ctx.currentTime);
                        secondaryGainRef.current?.gain.setValueAtTime(getTargetGain(combinedSecondary), ctx.currentTime);
                        fadeOutTimeoutRef.current = null;
                    }, FADE_DURATION * 1000);
                } else {
                    primarySourceRef.current.pause();
                    primarySourceRef.current.currentTime = 0;
                    if (secondarySourceRef.current) {
                        secondarySourceRef.current.pause();
                        secondarySourceRef.current.currentTime = 0;
                    }
                }
            } else {
                // If not playing, reset and play
                if (fadeOutTimeoutRef.current) {
                    clearTimeout(fadeOutTimeoutRef.current);
                    fadeOutTimeoutRef.current = null;
                }

                primarySourceRef.current.currentTime = 0;
                if (secondarySourceRef.current) {
                    secondarySourceRef.current.currentTime = 0;
                }

                if (fadeInRef.current) {
                    primaryGainRef.current?.gain.cancelScheduledValues(now);
                    primaryGainRef.current?.gain.setValueAtTime(0, now);

                    secondaryGainRef.current?.gain.cancelScheduledValues(now);
                    secondaryGainRef.current?.gain.setValueAtTime(0, now);

                    primarySourceRef.current.play().catch(error => console.error("Error playing primary audio:", error));
                    if (secondarySourceRef.current) {
                        secondarySourceRef.current.play().catch(error => console.error("Error playing secondary audio:", error));
                    }

                    const targetPrimary = getTargetGain(volumeRef.current * localVolumeRef.current);
                    const targetSecondary = getTargetGain(virtualVolumeRef.current * localVolumeRef.current);

                    primaryGainRef.current?.gain.linearRampToValueAtTime(targetPrimary, now + FADE_DURATION);
                    secondaryGainRef.current?.gain.linearRampToValueAtTime(targetSecondary, now + FADE_DURATION);

                    if (fadeInTimeoutRef.current) clearTimeout(fadeInTimeoutRef.current);
                    fadeInTimeoutRef.current = setTimeout(() => {
                        fadeInTimeoutRef.current = null;
                    }, FADE_DURATION * 1000);
                } else {
                    // Ensure gain is correct before playing
                    const targetPrimary = getTargetGain(volumeRef.current * localVolumeRef.current);
                    const targetSecondary = getTargetGain(virtualVolumeRef.current * localVolumeRef.current);
                    primaryGainRef.current?.gain.cancelScheduledValues(now);
                    primaryGainRef.current?.gain.setValueAtTime(targetPrimary, now);
                    secondaryGainRef.current?.gain.cancelScheduledValues(now);
                    secondaryGainRef.current?.gain.setValueAtTime(targetSecondary, now);

                    primarySourceRef.current.play().catch(error => console.error("Error playing primary audio:", error));
                    if (secondarySourceRef.current) {
                        secondarySourceRef.current.play().catch(error => console.error("Error playing secondary audio:", error));
                    }
                }

                // Ensure sink elements are also "playing" (they play the stream)
                // We ensure srcObject is set and play() is called.
                if (primarySinkRef.current && pDestRef.current) {
                    if (primarySinkRef.current.srcObject !== pDestRef.current.stream) {
                        primarySinkRef.current.srcObject = pDestRef.current.stream;
                    }
                    primarySinkRef.current.play().catch(() => {});
                }
                if (secondarySinkRef.current && sDestRef.current) {
                    if (secondarySinkRef.current.srcObject !== sDestRef.current.stream) {
                        secondarySinkRef.current.srcObject = sDestRef.current.stream;
                    }
                    secondarySinkRef.current.play().catch(() => {});
                }
            }
        }
    }

    const handleContext = (event : React.MouseEvent<HTMLButtonElement>) => {
        setButtonFocus(true)
        setShortcutText('Recording...')
    }

    const handleKeyDown = (event : React.KeyboardEvent<HTMLButtonElement>) => {
        event.preventDefault()
        const myIpcRenderer = getIpc();
        if (!myIpcRenderer) return;

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
        const myIpcRenderer = getIpc();
        if (!myIpcRenderer) return;

        let key
        if (props.name) key = localStorage.getItem(props.name)
        if (key) {
            setShortcut(key)
            setShortcutText(key)
            myIpcRenderer.send('APP_setkey', key, props.name)
        }
    }

    // Initialize Web Audio Graph
    useEffect(() => {
        if (props.audioContext && primarySourceRef.current && secondarySourceRef.current && primarySinkRef.current && secondarySinkRef.current) {
            const ctx = props.audioContext;

            // Create source nodes if first time
            if (!pSourceNodeRef.current) {
                pSourceNodeRef.current = ctx.createMediaElementSource(primarySourceRef.current);
            }
            if (!sSourceNodeRef.current) {
                sSourceNodeRef.current = ctx.createMediaElementSource(secondarySourceRef.current);
            }

            const pSource = pSourceNodeRef.current;
            const sSource = sSourceNodeRef.current;

            // Clean up existing gain nodes if any
            if (primaryGainRef.current) {
                try { primaryGainRef.current.disconnect(); } catch(e) {}
            }
            if (secondaryGainRef.current) {
                try { secondaryGainRef.current.disconnect(); } catch(e) {}
            }

            const pGain = ctx.createGain();
            const sGain = ctx.createGain();

            primaryGainRef.current = pGain;
            secondaryGainRef.current = sGain;

            const pDest = ctx.createMediaStreamDestination();
            const sDest = ctx.createMediaStreamDestination();

            pDestRef.current = pDest;
            sDestRef.current = sDest;

            try { pSource.disconnect(); } catch(e) {}
            pSource.connect(pGain);
            pGain.connect(pDest);

            try { sSource.disconnect(); } catch(e) {}
            sSource.connect(sGain);
            sGain.connect(sDest);

            primarySinkRef.current.srcObject = pDest.stream;
            secondarySinkRef.current.srcObject = sDest.stream;

            primarySourceRef.current.volume = 1.0;
            secondarySourceRef.current.volume = 1.0;

            setIsGraphInitialized(true);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [props.audioContext, props.source])

    useEffect(() => {
        setShortcut('')
        setShortcutText('')
        loadHotkey()

        if (props.name) {
            let savedVol = localStorage.getItem(`vol_${props.name}`)
            if (savedVol) setLocalVolume(parseFloat(savedVol))

            let savedFI = localStorage.getItem(`fi_${props.name}`)
            if (savedFI) setFadeIn(savedFI === 'true')

            let savedFO = localStorage.getItem(`fo_${props.name}`)
            if (savedFO) setFadeOut(savedFO === 'true')
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [props.name]) 
    
    useEffect(() =>{
        setPrimaryOutput(props.outputs[0])
        setSecondaryOutput(props.outputs[1])
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [props.outputs, props.name])
    
    
    useEffect(() => {
        const myIpcRenderer = getIpc();
        if (!myIpcRenderer) return;

        if (removeListenerRef.current) removeListenerRef.current() // Remove old listener

        removeListenerRef.current = myIpcRenderer.on('APP_keypressed', (args : string) => {
            if(shortcut === args) {
                play()
            }
        })

        props.name && shortcut && localStorage.setItem(props.name, shortcut)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [shortcut])
    
    useEffect(() => {
        // Apply volume logic
        // For standard volume property, we still apply the scaling
        // For GainNode, we apply it directly.

        // If graph is not initialized, wait
        if (!isGraphInitialized) return;

        // If we are currently fading out or in, don't let the volume slider override it
        if (fadeOutTimeoutRef.current || fadeInTimeoutRef.current) return;

        // Final combined volume (linear scale)
        const combinedPrimary = props.volume * localVolume;
        const combinedSecondary = props.virtualVolume * localVolume;

        // Use the same exponential scaling for the gain value
        const pGainValue = getTargetGain(combinedPrimary);
        const sGainValue = getTargetGain(combinedSecondary);

        if (primaryGainRef.current) {
            primaryGainRef.current.gain.setTargetAtTime(pGainValue, props.audioContext.currentTime, 0.03);
        }
        if (secondaryGainRef.current) {
            secondaryGainRef.current.gain.setTargetAtTime(sGainValue, props.audioContext.currentTime, 0.03);
        }
        
    }, [props.volume, props.virtualVolume, localVolume, props.audioContext, isGraphInitialized])

    useEffect(() => {
        if (props.name && props.registerPlayFunction) {
            props.registerPlayFunction(props.name, play);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [props.name, props.source, props.registerPlayFunction]);

    useEffect(() => {
        return () => {
            if (fadeOutTimeoutRef.current) clearTimeout(fadeOutTimeoutRef.current);
            if (fadeInTimeoutRef.current) clearTimeout(fadeInTimeoutRef.current);
        }
    }, []);



    const handleVolumeChange = (e: React.FormEvent<HTMLInputElement>) => {
        let val = parseFloat(e.currentTarget.value) / 100
        setLocalVolume(val)
        if (props.name) localStorage.setItem(`vol_${props.name}`, val.toString())
    }

    const toggleFadeIn = () => {
        const newVal = !fadeIn;
        setFadeIn(newVal);
        if (props.name) localStorage.setItem(`fi_${props.name}`, newVal.toString());
    }

    const toggleFadeOut = () => {
        const newVal = !fadeOut;
        setFadeOut(newVal);
        if (props.name) localStorage.setItem(`fo_${props.name}`, newVal.toString());
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
        {/* Source elements */}
        <audio ref={primarySourceRef}
               src={ props.source }
               preload="auto"
               crossOrigin="anonymous"
               onPlay={() => setIsPlaying(true)}
               onPause={() => setIsPlaying(false)}
               onEnded={() => setIsPlaying(false)} />
        <audio ref={secondarySourceRef}
               src={ props.source }
               preload="auto"
               crossOrigin="anonymous"
               onPlay={() => setIsPlaying(true)}
               onPause={() => setIsPlaying(false)}
               onEnded={() => setIsPlaying(false)} />

        {/* Sink elements */}
        <audio ref={primarySinkRef} preload="auto" />
        <audio ref={secondarySinkRef} preload="auto" />

        <button onClick={play} 
                className={`pad ${isPlaying ? 'playing' : ''}`}
                onContextMenu={handleContext}
                onMouseOut={() => handleButtonHover('out')}
                onMouseEnter={() => handleButtonHover('in')}
                onKeyDown={handleKeyDown}>
            {props.name && props.name.slice(0, props.name.indexOf('.'))} <br/>
            <span className="shortcut-display">{shortcutText}</span>
        </button>
        <div className="pad-volume-row">
            <button
                className={`fade-toggle ${fadeIn ? 'active' : ''}`}
                onClick={toggleFadeIn}
                title="Fade In">
                FI
            </button>
            <input
                type="range"
                min="0"
                max="200"
                value={localVolume * 100}
                onInput={handleVolumeChange}
                className="pad-volume"
                title={`Individual Volume: ${Math.round(localVolume * 100)}%`}
            />
            <button
                className={`fade-toggle ${fadeOut ? 'active' : ''}`}
                onClick={toggleFadeOut}
                title="Fade Out">
                FO
            </button>
        </div>
    </div>
    )
}

export default Pad
