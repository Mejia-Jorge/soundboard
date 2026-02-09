import React, {useEffect, useRef, useState} from 'react'

const getIpc = () => (window as any).myIpcRenderer;

interface InstantPadProps {
    outputs: string[];
    volume: number;
    virtualVolume: number;
    audioContext: AudioContext;
    registerPlayFunction?: (name: string, playFn: () => void) => void;
}

// Extended interface for sinkId support
interface ExtendedAudioElement extends HTMLAudioElement {
    setSinkId(sinkId: string): Promise<void>;
}

const InstantPad : React.FunctionComponent<InstantPadProps> = (props : InstantPadProps) => {
    const [source, setSource] = useState<string>('');
    const [searchTerm, setSearchTerm] = useState<string>('');
    const [isSearching, setIsSearching] = useState<boolean>(false);
    const [statusMessage, setStatusMessage] = useState<string>('MyInstants Search');

    const [shortcutText, setShortcutText] = useState<string>()
    const [shortcut, setShortcut] = useState<string>('')
    const [buttonFocus, setButtonFocus] = useState<boolean>(false)

    const NAME = "Instant Search Pad";

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

    const [isPlaying, setIsPlaying] = useState<boolean>(false)
    const [localVolume, setLocalVolume] = useState<number>(1.0)
    const [fadeIn, setFadeIn] = useState<boolean>(false)
    const [fadeOut, setFadeOut] = useState<boolean>(false)
    const [isGraphInitialized, setIsGraphInitialized] = useState<boolean>(false)
    const removeListenerRef = useRef<Function | null>(null)
    const fadeOutTimeoutRef = useRef<NodeJS.Timeout | null>(null)
    const fadeInTimeoutRef = useRef<NodeJS.Timeout | null>(null)

    // Refs to avoid stale closures
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
        if (!source) return;

        // Start AudioContext on user interaction
        if (props.audioContext.state === 'suspended') {
            props.audioContext.resume();
        }

        if (!isGraphInitialized) {
            console.warn("Audio graph not initialized yet");
            return;
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

    const handleSearch = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!searchTerm || isSearching) return;

        setIsSearching(true);
        setStatusMessage('Searching...');

        const myIpcRenderer = getIpc();
        if (myIpcRenderer) {
            const result = await myIpcRenderer.invoke('APP_searchInstant', searchTerm);
            if (result.error) {
                setStatusMessage(result.error);
                setSource('');
            } else {
                setStatusMessage('Found!');
                setSource(result.path);
            }
        }
        setIsSearching(false);
    }

    const handleSave = async (e: React.MouseEvent) => {
        e.stopPropagation();
        const myIpcRenderer = getIpc();
        if (!myIpcRenderer || !source) return;

        const targetDir = localStorage.getItem('dir');
        if (!targetDir) {
            setStatusMessage('Select folder first!');
            return;
        }

        setStatusMessage('Saving...');
        const result = await myIpcRenderer.invoke('APP_saveInstantSound', targetDir);

        if (result.success) {
            setStatusMessage('Saved!');
            myIpcRenderer.send('APP_listFiles', targetDir);
        } else {
            setStatusMessage(result.error || 'Save failed');
        }
    }

    useEffect(() => {
        if (source) {
            const timer = setTimeout(() => {
                play();
            }, 100);
            return () => clearTimeout(timer);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [source]);

    // Hotkey logic
    const handleContext = (event : React.MouseEvent) => {
        event.preventDefault();
        setButtonFocus(true)
        setShortcutText('Recording...')
    }

    const handleKeyDown = (event : React.KeyboardEvent) => {
        if (!buttonFocus) return;

        event.preventDefault()
        const myIpcRenderer = getIpc();
        if (!myIpcRenderer) return;

        if (event.key === 'Escape') {
            setShortcut('')
            setShortcutText('')
            localStorage.removeItem(NAME)
            myIpcRenderer.send('APP_setkey', '', NAME)
            setButtonFocus(false)
            return
        }

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

        myIpcRenderer.send('APP_setkey', shortcutString, NAME)
        setShortcutText(shortcutString)
        setShortcut(shortcutString)
        setButtonFocus(false)
    }

    const loadHotkey = () => {
        const myIpcRenderer = getIpc();
        if (!myIpcRenderer) return;

        let key = localStorage.getItem(NAME)
        if (key) {
            setShortcut(key)
            setShortcutText(key)
            myIpcRenderer.send('APP_setkey', key, NAME)
        }
    }

    // Initialize Web Audio Graph
    useEffect(() => {
        if (props.audioContext && primarySourceRef.current && secondarySourceRef.current && primarySinkRef.current && secondarySinkRef.current) {
            const ctx = props.audioContext;

            if (!pSourceNodeRef.current) {
                pSourceNodeRef.current = ctx.createMediaElementSource(primarySourceRef.current);
            }
            if (!sSourceNodeRef.current) {
                sSourceNodeRef.current = ctx.createMediaElementSource(secondarySourceRef.current);
            }

            const pSource = pSourceNodeRef.current;
            const sSource = sSourceNodeRef.current;

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
    }, [props.audioContext, source])

    useEffect(() => {
        loadHotkey();
        return () => {
            if (removeListenerRef.current) removeListenerRef.current()
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    useEffect(() => {
        const myIpcRenderer = getIpc();
        if (!myIpcRenderer) return;

        if (removeListenerRef.current) removeListenerRef.current()

        removeListenerRef.current = myIpcRenderer.on('APP_keypressed', (args : string) => {
            if(shortcut === args) {
                play()
            }
        })

        shortcut && localStorage.setItem(NAME, shortcut)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [shortcut, source]) // Re-bind when shortcut or source changes

    useEffect(() => {
        if (props.registerPlayFunction) {
            props.registerPlayFunction("Instant Search", play);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [source, props.registerPlayFunction]);

    useEffect(() =>{
        setPrimaryOutput(props.outputs[0])
        setSecondaryOutput(props.outputs[1])
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [props.outputs])

    useEffect(() => {
        if (!isGraphInitialized) return;
        if (fadeOutTimeoutRef.current || fadeInTimeoutRef.current) return;

        const combinedPrimary = props.volume * localVolume;
        const combinedSecondary = props.virtualVolume * localVolume;

        const pGainValue = getTargetGain(combinedPrimary);
        const sGainValue = getTargetGain(combinedSecondary);

        if (primaryGainRef.current) {
            primaryGainRef.current.gain.setTargetAtTime(pGainValue, props.audioContext.currentTime, 0.03);
        }
        if (secondaryGainRef.current) {
            secondaryGainRef.current.gain.setTargetAtTime(sGainValue, props.audioContext.currentTime, 0.03);
        }

    }, [props.volume, props.virtualVolume, localVolume, props.audioContext, isGraphInitialized])

    const handleVolumeChange = (e: React.FormEvent<HTMLInputElement>) => {
        let val = parseFloat(e.currentTarget.value) / 100
        setLocalVolume(val)
    }

    const toggleFadeIn = () => setFadeIn(!fadeIn);
    const toggleFadeOut = () => setFadeOut(!fadeOut);

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
               src={ source }
               preload="auto"
               crossOrigin="anonymous"
               onPlay={() => setIsPlaying(true)}
               onPause={() => setIsPlaying(false)}
               onEnded={() => setIsPlaying(false)} />
        <audio ref={secondarySourceRef}
               src={ source }
               preload="auto"
               crossOrigin="anonymous"
               onPlay={() => setIsPlaying(true)}
               onPause={() => setIsPlaying(false)}
               onEnded={() => setIsPlaying(false)} />

        {/* Sink elements */}
        <audio ref={primarySinkRef} preload="auto" />
        <audio ref={secondarySinkRef} preload="auto" />

        <div className={`pad ${isPlaying ? 'playing' : ''}`}
                onClick={(e) => {
                    // Only play if not clicking on the input
                    if ((e.target as HTMLElement).tagName !== 'INPUT') {
                        play();
                    }
                }}
                onContextMenu={handleContext}
                onMouseOut={() => handleButtonHover('out')}
                onMouseEnter={() => handleButtonHover('in')}
                tabIndex={0}
                onKeyDown={handleKeyDown}
                style={{display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', cursor: 'default', outline: 'none'}}>

            <form onSubmit={handleSearch} style={{display:'flex', flexDirection:'column', width: '100%', padding: '0 5px', boxSizing: 'border-box'}}>
                <input
                    type="text"
                    placeholder="Search..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    onKeyDown={(e) => {
                        // Prevent hotkey logic from triggering when typing in input
                        if (buttonFocus) {
                             // If recording, we might want to prevent typing?
                             // But normally you'd focus the pad, not the input to record.
                        }
                        e.stopPropagation();
                    }}
                    className="instant-search-input"
                />
                <div style={{display:'flex', alignItems:'center', justifyContent:'center', gap:'5px'}}>
                    <span className="status-display" title={statusMessage}>{statusMessage}</span>
                    {source && !isSearching && (
                        <span className="save-link" onClick={handleSave}>Save</span>
                    )}
                </div>
            </form>
            <span className="shortcut-display" style={{marginTop:'2px'}}>{shortcutText}</span>
        </div>
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

export default InstantPad
