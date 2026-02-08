import React, {useEffect, useRef, useState} from 'react'

const getIpc = () => (window as any).myIpcRenderer;

interface InstantPadProps {
    outputs: string[];
    volume: number;
    virtualVolume: number;
    audioContext: AudioContext;
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
                // We add a timestamp to the path to force the audio element to reload
                // if the same filename is used (though our backend uses unique filenames now)
                setSource(result.path);
            }
        }
        setIsSearching(false);
    }

    useEffect(() => {
        if (source) {
            // Give a small delay for the audio element to load the new src
            const timer = setTimeout(() => {
                play();
            }, 100);
            return () => clearTimeout(timer);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [source]);

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

    return (
    <div className="pad-container instant-pad">
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

        <div className={`pad ${isPlaying ? 'playing' : ''}`} style={{display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center'}}>
            <form onSubmit={handleSearch} style={{display:'flex', flexDirection:'column', width: '100%', padding: '5px', boxSizing: 'border-box'}}>
                <input
                    type="text"
                    placeholder="Search MyInstants..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="instant-search-input"
                />
                <span className="status-display" title={statusMessage}>{statusMessage}</span>
                {source && <button type="button" onClick={play} className="instant-play-btn">Play</button>}
            </form>
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
