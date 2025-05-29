import React, { useRef, useState, useEffect, useCallback } from 'react'
import Pad from './pad'
import Recorder from './Recorder'
const { myIpcRenderer } = window



const Controller : React.FunctionComponent = () => {
    const [paths, setPaths] = useState<string[]>()
    const [padNames, setPadNames] = useState<string[]>()
    const [outputs, setOutputs] = useState<MediaDeviceInfo[]>()
    
    const [selectedPrimaryOutput, setSelectedPrimaryOutput] = useState<string>('default')
    const [selectedSecondaryOutput, setSelectedSecondaryOutput] = useState<string>('default')
    
    const [volume, setVolume] = useState<number>(1.0)
    const [virtualVolume, setVirtualVolume] = useState<number>(1.0)

    const volumeRef = useRef<HTMLInputElement>(null)
    const virtualVolumeRef = useRef<HTMLInputElement>(null)
    const soundPlaybackMapRef = useRef(new Map<string, () => void>());
    
    const primaryRef = useRef<HTMLSelectElement>(null)
    const secondaryRef = useRef<HTMLSelectElement>(null)





    const handlePrimaryOutputChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
        setSelectedPrimaryOutput(event.currentTarget.value)
        localStorage.setItem('primary_output', event.currentTarget.value)
    }

    const handleSecondaryOutputChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
        setSelectedSecondaryOutput(event.currentTarget.value)
        localStorage.setItem('secondary_output', event.currentTarget.value)
    }

    const loadConfig = useCallback(() => {
        // Load primary and secondary output settings
        let output_1 = localStorage.getItem('primary_output');
        if (output_1) setSelectedPrimaryOutput(output_1);

        if (primaryRef.current) { // Check if ref is available
            var optionsPrimary = Array.from(primaryRef.current.options);
            optionsPrimary.forEach((option) => { // Use forEach for iteration without map's return
                if (option.value === output_1) {
                    option.selected = true;
                }
            });
        }
        
        let output_2 = localStorage.getItem('secondary_output');
        if (output_2) setSelectedSecondaryOutput(output_2);

        if (secondaryRef.current) { // Check if ref is available
            var optionsSecondary = Array.from(secondaryRef.current.options);
            optionsSecondary.forEach((option) => { // Use forEach
                if (option.value === output_2) {
                    option.selected = true;
                }
            });
        }

        // Load Pad File Paths and names
        let loaded_paths = localStorage.getItem("paths");
        if (loaded_paths) setPaths(JSON.parse(loaded_paths));

        let loaded_names = localStorage.getItem("names");
        if (loaded_names) setPadNames(JSON.parse(loaded_names));

        // Load Volume Sliders
        let loaded_virtualVolume = localStorage.getItem("virtualVolume");
        if (loaded_virtualVolume && virtualVolumeRef.current) { // Check ref
            const virtualVolumeValue = parseFloat(loaded_virtualVolume);
            setVirtualVolume(virtualVolumeValue);
            setSliderStyle(virtualVolumeRef.current, virtualVolumeValue);
            virtualVolumeRef.current.value = (virtualVolumeValue * 50).toString();
        }
        
        let loaded_volume = localStorage.getItem("volume");
        if (loaded_volume && volumeRef.current) { // Check ref
            const volumeValue = parseFloat(loaded_volume);
            setVolume(volumeValue);
            setSliderStyle(volumeRef.current, volumeValue);
            volumeRef.current.value = (volumeValue * 50).toString();
        }
    }, [setSliderStyle, setSelectedPrimaryOutput, setPaths, setPadNames, setVirtualVolume, setVolume, setSelectedSecondaryOutput, primaryRef, secondaryRef, volumeRef, virtualVolumeRef]);

    useEffect(() => {    
        // -------------------------------
        // Primary Entrypoint: Loads all Devices and the directory selection
        // -------------------------------
        let dir = localStorage.getItem('dir')
        if (dir) myIpcRenderer.send('APP_listFiles', dir)

        navigator.mediaDevices.enumerateDevices()
            .then( devices => {
                devices = devices.filter((output) => output.kind === "audiooutput")
                setOutputs(devices)
                loadConfig() 
            })
        
        const removeListedFilesListener = myIpcRenderer.on('APP_listedFiles', (result) => {
           setPaths(result.paths)
           setPadNames(result.fileNames)
           localStorage.setItem("dir", result.dir)
           localStorage.setItem("paths", JSON.stringify(result.paths))
           localStorage.setItem("names", JSON.stringify(result.fileNames))

        })
        
        // Listener for PLAY_SOUND_FROM_WEB
        const removePlaySoundListener = myIpcRenderer.on('PLAY_SOUND_FROM_WEB', (soundName: string) => {
            console.log("Received request to play sound from web:", soundName);
            const playFunction = soundPlaybackMapRef.current.get(soundName);
            if (playFunction) {
                playFunction();
            } else {
                console.warn(`Sound not found in playback map: ${soundName}`);
            }
        });

        return () => {
            // Cleanup listeners
            if (removeListedFilesListener) {
                removeListedFilesListener();
            }
            if (removePlaySoundListener) {
                removePlaySoundListener();
            }
        };
    }, [loadConfig]);
    
    const handlePathSelection = () => {
        myIpcRenderer.invoke('APP_showDialog')
    }

    const setSliderStyle = useCallback((e: HTMLInputElement, progress: number) => {
        e.style.background = 'linear-gradient(to right, #d08770 0%, #d08770 ' + progress * 100 + '%, #3b4252 ' + progress * 100 + '%, #3b4252 100%)';
    }, []);

    const handleVirtualVolumeChange = (e:React.FormEvent<HTMLInputElement>) => {
        let val = parseFloat(e.currentTarget.value)/50  // Scale Input to 0.0 - 1.0
        setVirtualVolume(val)
        localStorage.setItem("virtualVolume", val.toString())
        setSliderStyle(e.currentTarget, val)
    
    }
    
    const handleVolumeChange = (e:React.FormEvent<HTMLInputElement>) => {
        let val = parseFloat(e.currentTarget.value)/50  // Scale Input to 0.0 - 1.0
        setVolume(val)
        localStorage.setItem("volume", val.toString())
        setSliderStyle(e.currentTarget, val)
    }
    

    return(
    <div id="controller">   
            <div id="settings">


                <div id="config">
                    <button onClick={handlePathSelection}>Select Audio Folder</button>
                    <div id="outputs">
                        <select onChange={ handlePrimaryOutputChange } ref={primaryRef}>
                            {outputs && outputs.map((output, index) => 
                                <option key={index} value={ output.deviceId }>{ output.label }</option>  
                            )}
                        </select>

                        <select onChange={ handleSecondaryOutputChange} ref={secondaryRef}>
                            {outputs && outputs.map((output, index) => 
                                <option key={index} value={ output.deviceId }>{ output.label }</option>  
                            )}
                        </select>
                    </div>
                </div>


                <div id="sliderWrapper">
                    <div>
                        <h2>Your Volume</h2>
                        <input className="slider" type="range" min="0" max="50" onInput={handleVolumeChange} ref={volumeRef}></input>
                    </div>
                    <div>
                        <h2>Virtual Volume</h2>
                        <input className="slider" type="range" min="0" max="50" onInput={handleVirtualVolumeChange} ref={virtualVolumeRef}></input>
                    </div>
                </div>

                <Recorder></Recorder>
            
            
            </div>


            <div id="pads">
                {paths && paths.map((path, index) => 
                    <Pad    key={index} 
                            outputs={ [selectedPrimaryOutput, selectedSecondaryOutput] } 
                            source={path} 
                            name={padNames && padNames[index]}
                            volume={volume}
                            virtualVolume={virtualVolume}
                            registerPlayFunction={(name, playFn) => {
                                soundPlaybackMapRef.current.set(name, playFn);
                            }}>
                    </Pad>
                )}
            </div>
    </div>
    )
}

export default Controller
