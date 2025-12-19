
import React, { useEffect, useRef, useState } from 'react';
import WaveSurfer from 'wavesurfer.js';
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.js';
import { AudioSegment } from '../types';

interface WaveformViewProps {
  audioUrl: string | null;
  segments: AudioSegment[];
  isPlaying: boolean;
  onSegmentsChange: (segments: AudioSegment[]) => void;
  onPlayStateChange: (isPlaying: boolean) => void;
}

const WaveformView: React.FC<WaveformViewProps> = ({ 
  audioUrl, 
  segments, 
  isPlaying,
  onSegmentsChange,
  onPlayStateChange
}) => {
  const waveformRef = useRef<HTMLDivElement>(null);
  const wavesurfer = useRef<WaveSurfer | null>(null);
  const regionsPlugin = useRef<any>(null);
  const [isReady, setIsReady] = useState(false);
  
  // Use a ref to store the latest segments to avoid stale closures in event listeners
  const segmentsRef = useRef<AudioSegment[]>(segments);
  useEffect(() => {
    segmentsRef.current = segments;
  }, [segments]);

  useEffect(() => {
    if (!waveformRef.current || !audioUrl) return;

    regionsPlugin.current = RegionsPlugin.create();

    wavesurfer.current = WaveSurfer.create({
      container: waveformRef.current,
      waveColor: '#4f46e5',
      progressColor: '#818cf8',
      cursorColor: '#f8fafc',
      barWidth: 2,
      barGap: 3,
      height: 128,
      plugins: [regionsPlugin.current],
    });

    wavesurfer.current.load(audioUrl);

    wavesurfer.current.on('ready', () => {
      setIsReady(true);
      // Synchronize existing segments when wavesurfer is ready
      onSegmentsChange([...segmentsRef.current]);
    });
    
    wavesurfer.current.on('play', () => onPlayStateChange(true));
    wavesurfer.current.on('pause', () => onPlayStateChange(false));
    wavesurfer.current.on('finish', () => onPlayStateChange(false));

    // Enable region creation on drag
    regionsPlugin.current.enableDragSelection({
      color: 'rgba(239, 68, 68, 0.4)',
    });

    regionsPlugin.current.on('region-created', (region: any) => {
      // Check if this region already exists in our state (by ID) to avoid duplicates
      if (segmentsRef.current.some(s => s.id === region.id)) return;
      
      const newSegment: AudioSegment = {
        id: region.id,
        start: region.start,
        end: region.end,
        label: 'Manual Segment',
        type: 'manual'
      };
      
      if (region.element) {
        region.element.setAttribute('data-region-type', 'manual');
      }
      
      // Update with latest known segments
      onSegmentsChange([...segmentsRef.current, newSegment]);
    });

    regionsPlugin.current.on('region-updated', (region: any) => {
      const updated = segmentsRef.current.map(s => 
        s.id === region.id ? { ...s, start: region.start, end: region.end } : s
      );
      onSegmentsChange(updated);
    });

    return () => {
      wavesurfer.current?.destroy();
    };
  }, [audioUrl]);

  // Sync segments from props to wavesurfer regions
  useEffect(() => {
    if (!regionsPlugin.current || !isReady) return;

    // Remove regions that are no longer in the segments array
    const currentRegions = regionsPlugin.current.getRegions();
    currentRegions.forEach((r: any) => {
      if (!segments.some(s => s.id === r.id)) {
        r.remove();
      }
    });

    // Add or update regions from segments array
    segments.forEach(seg => {
      let region = regionsPlugin.current.getRegions().find((r: any) => r.id === seg.id);
      
      if (!region) {
        region = regionsPlugin.current.addRegion({
          id: seg.id,
          start: seg.start,
          end: seg.end,
          color: seg.type === 'AI' ? 'rgba(245, 158, 11, 0.5)' : 'rgba(239, 68, 68, 0.5)',
          drag: true,
          resize: true
        });
      } else {
        region.setOptions({
          start: seg.start,
          end: seg.end,
          color: seg.type === 'AI' ? 'rgba(245, 158, 11, 0.5)' : 'rgba(239, 68, 68, 0.5)',
        });
      }
      
      if (region.element) {
        region.element.setAttribute('data-region-type', seg.type);
      }
    });
  }, [segments, isReady]);

  const togglePlay = () => wavesurfer.current?.playPause();
  const skipForward = () => wavesurfer.current?.setTime(wavesurfer.current.getCurrentTime() + 5);
  const skipBackward = () => wavesurfer.current?.setTime(wavesurfer.current.getCurrentTime() - 5);
  const restart = () => wavesurfer.current?.setTime(0);

  return (
    <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 shadow-2xl">
      <div ref={waveformRef} className="mb-4" />
      <div className="flex flex-col sm:flex-row justify-between items-center gap-6">
        <div className="flex items-center gap-2">
          <button onClick={restart} title="Start Over" className="bg-slate-700 hover:bg-slate-600 text-slate-200 p-3 rounded-full transition-all active:scale-90">
            <i className="fas fa-rotate-left"></i>
          </button>
          <button onClick={skipBackward} title="Back 5s" className="bg-slate-700 hover:bg-slate-600 text-slate-200 p-3 rounded-full transition-all active:scale-90">
            <i className="fas fa-backward"></i>
          </button>
          <button onClick={togglePlay} className="bg-indigo-600 hover:bg-indigo-500 text-white px-8 py-3 rounded-full flex items-center gap-2 transition-all active:scale-95 shadow-lg shadow-indigo-500/20">
            <i className={`fas ${isPlaying ? 'fa-pause' : 'fa-play'}`}></i>
            {isPlaying ? 'Pause' : 'Play'}
          </button>
          <button onClick={skipForward} title="Forward 5s" className="bg-slate-700 hover:bg-slate-600 text-slate-200 p-3 rounded-full transition-all active:scale-90">
            <i className="fas fa-forward"></i>
          </button>
        </div>
        <div className="text-slate-400 text-sm italic">Tip: Click and drag on the waveform to manually redact regions.</div>
      </div>
    </div>
  );
};

export default WaveformView;
