
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { AppMode, AudioSegment, PIIItem, TranscriptWord } from './types';
import WaveformView from './components/WaveformView';
import { detectPII, findSpecificWords } from './services/geminiService';
import { maskAudioBuffer, bufferToWav, fileToBase64 } from './utils/audioUtils';

const App: React.FC = () => {
  const [mode, setMode] = useState<AppMode>(AppMode.IDLE);
  const [activeTab, setActiveTab] = useState<'logs' | 'transcript'>('logs');
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isShowingPreview, setIsShowingPreview] = useState(false);
  const [segments, setSegments] = useState<AudioSegment[]>([]);
  const [transcript, setTranscript] = useState<TranscriptWord[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [manualWord, setManualWord] = useState('');
  const [omittedWordList, setOmittedWordList] = useState<string[]>([]);
  const [showConfirmReset, setShowConfirmReset] = useState(false);

  const audioContext = useRef<AudioContext | null>(null);
  const originalBuffer = useRef<AudioBuffer | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setMode(AppMode.LOADING);
    setStatusMessage('Reading audio file...');
    setAudioFile(file);
    
    if (originalUrl) URL.revokeObjectURL(originalUrl);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    
    const newUrl = URL.createObjectURL(file);
    setOriginalUrl(newUrl);
    setAudioUrl(newUrl);
    setPreviewUrl(null);
    setIsShowingPreview(false);
    setSegments([]);
    setTranscript([]);
    setOmittedWordList([]);

    if (!audioContext.current) {
      audioContext.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    
    try {
      const arrayBuffer = await file.arrayBuffer();
      originalBuffer.current = await audioContext.current.decodeAudioData(arrayBuffer);
      setMode(AppMode.EDITING);
      setStatusMessage('Audio loaded. Run AI Analysis for best results.');
    } catch (error) {
      console.error("Audio decoding failed", error);
      setStatusMessage('Error loading audio file. Please try a different format.');
      setMode(AppMode.IDLE);
    }
  };

  const handleNewRecordingClick = () => {
    if (segments.length > 0) {
      setShowConfirmReset(true);
    } else {
      fileInputRef.current?.click();
    }
  };

  const confirmReset = () => {
    setShowConfirmReset(false);
    fileInputRef.current?.click();
  };

  const handleAutomatedAnalysis = async () => {
    if (!audioFile) return;
    
    setMode(AppMode.PROCESSING);
    setStatusMessage('AI engine starting forensic scan...');
    
    try {
      const base64 = await fileToBase64(audioFile);
      const result = await detectPII(base64, audioFile.type);
      
      if (!result.transcript.length && !result.detections.length) {
        throw new Error("AI returned empty results. This could be due to a complex recording.");
      }

      setStatusMessage('Syncing visual transcript...');
      await new Promise(r => setTimeout(r, 100)); // Small yield for UI responsiveness
      
      const timestamp = Date.now();
      const newSegments: AudioSegment[] = result.detections.map((d, i) => ({
        id: `ai-auto-${timestamp}-${i}`,
        start: d.start,
        end: d.end,
        label: `${d.word} (${d.reason})`,
        type: 'AI'
      }));

      setSegments(prev => {
        const filtered = prev.filter(p => p.type !== 'AI');
        return [...filtered, ...newSegments];
      });
      
      setTranscript(result.transcript);
      setMode(AppMode.EDITING);
      setActiveTab('transcript');
      setStatusMessage(`Found ${result.detections.length} redactions. Visual transcript ready.`);
    } catch (error: any) {
      console.error("Analysis Error:", error);
      setStatusMessage(`Analysis failed: ${error.message || 'Unknown error'}. Please try again.`);
      setMode(AppMode.EDITING);
    }
  };

  const addManualWordMask = async () => {
    if (!manualWord.trim() || !audioFile) return;
    const word = manualWord.trim();
    
    if (omittedWordList.includes(word)) {
      setManualWord('');
      return;
    }

    setMode(AppMode.PROCESSING);
    setStatusMessage(`Scanning for instances of "${word}"...`);
    
    try {
      const base64 = await fileToBase64(audioFile);
      const detections = await findSpecificWords(base64, audioFile.type, [word]);
      
      if (detections.length === 0) {
        setStatusMessage(`Word "${word}" not found.`);
      } else {
        const timestamp = Date.now();
        const newSegments: AudioSegment[] = detections.map((d, i) => ({
          id: `ai-word-${timestamp}-${i}`,
          start: d.start,
          end: d.end,
          label: `Omit: ${word}`,
          type: 'AI'
        }));
        
        setSegments(prev => [...prev, ...newSegments]);
        setOmittedWordList(prev => [...prev, word]);
        setStatusMessage(`Masked ${detections.length} instances of "${word}".`);
        setActiveTab('logs');
      }
    } catch (error) {
      console.error(error);
      setStatusMessage(`Search failed.`);
    } finally {
      setManualWord('');
      setMode(AppMode.EDITING);
    }
  };

  const removeOmittedWord = (word: string) => {
    setOmittedWordList(prev => prev.filter(w => w !== word));
    setSegments(prev => prev.filter(s => !s.label.includes(`Omit: ${word}`)));
  };

  const handlePreviewMasked = async () => {
    if (!originalBuffer.current || !audioContext.current) return;
    
    if (isShowingPreview) {
      setAudioUrl(originalUrl);
      setIsShowingPreview(false);
      setStatusMessage('Original audio restored.');
      return;
    }

    setMode(AppMode.PROCESSING);
    setStatusMessage('Generating redacted stream...');
    
    await new Promise(r => setTimeout(r, 400));

    const masked = maskAudioBuffer(audioContext.current, originalBuffer.current, segments);
    const wavBlob = bufferToWav(masked);
    
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    const newPreviewUrl = URL.createObjectURL(wavBlob);
    
    setPreviewUrl(newPreviewUrl);
    setAudioUrl(newPreviewUrl);
    setIsShowingPreview(true);
    setMode(AppMode.EDITING);
    setStatusMessage('Redacted preview ready.');
  };

  const handleExport = async () => {
    if (!originalBuffer.current || !audioContext.current) return;
    
    setMode(AppMode.PROCESSING);
    setStatusMessage('Finalizing redacted file...');
    
    await new Promise(r => setTimeout(r, 500));

    const masked = maskAudioBuffer(audioContext.current, originalBuffer.current, segments);
    const wavBlob = bufferToWav(masked);
    
    const url = URL.createObjectURL(wavBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `redacted_${audioFile?.name || 'recording.wav'}`;
    a.click();
    
    setMode(AppMode.EDITING);
    setStatusMessage('Export complete.');
  };

  const removeSegment = (id: string) => {
    setSegments(prev => prev.filter(s => s.id !== id));
  };

  const isWordRedacted = useCallback((start: number, end: number) => {
    return segments.some(seg => {
      const overlapStart = Math.max(start, seg.start);
      const overlapEnd = Math.min(end, seg.end);
      return (overlapEnd - overlapStart) > 0.02;
    });
  }, [segments]);

  const handleTranscriptWordClick = (word: TranscriptWord) => {
    // Check if this specific word is already manually redacted (exact start/end match or close enough)
    const existingManualSegment = segments.find(s => 
      s.type === 'manual' && 
      Math.abs(s.start - word.start) < 0.05 && 
      Math.abs(s.end - word.end) < 0.05
    );

    if (existingManualSegment) {
      // Remove it if it exists
      removeSegment(existingManualSegment.id);
      setStatusMessage(`Restored word: "${word.text}"`);
    } else {
      // Otherwise add a new manual segment for this word
      const newSegment: AudioSegment = {
        id: `manual-word-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        start: word.start,
        end: word.end,
        label: `Redacted: ${word.text}`,
        type: 'manual'
      };
      setSegments(prev => [...prev, newSegment]);
      setStatusMessage(`Redacted word: "${word.text}"`);
    }
  };

  return (
    <div className="min-h-screen p-4 md:p-8 flex flex-col items-center">
      <header className="w-full max-w-6xl mb-8 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-indigo-600 p-3 rounded-lg shadow-lg shadow-indigo-500/20">
            <i className="fas fa-shield-halved text-2xl"></i>
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">PII Masker <span className="text-indigo-500">Pro</span></h1>
            {isShowingPreview && (
              <span className="text-amber-500 text-xs font-bold uppercase tracking-widest flex items-center gap-1">
                <i className="fas fa-eye"></i> Redacted Preview
              </span>
            )}
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          {audioFile && (
            <div className="hidden sm:flex items-center bg-slate-800 px-4 py-2 rounded-full border border-slate-700 text-sm max-w-[200px] overflow-hidden whitespace-nowrap overflow-ellipsis">
              <span className="text-slate-400 mr-2">File:</span> {audioFile.name}
            </div>
          )}
          {audioFile && (
            <button onClick={handleNewRecordingClick} className="bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 border border-slate-600">
              <i className="fas fa-plus"></i> New
            </button>
          )}
        </div>
      </header>

      <main className="w-full max-w-6xl space-y-8">
        <input type="file" accept="audio/*" onChange={handleFileUpload} className="hidden" ref={fileInputRef} id="file-upload" />

        {mode === AppMode.IDLE && (
          <div className="flex flex-col items-center justify-center h-96 bg-slate-800/50 border-2 border-dashed border-slate-700 rounded-3xl group hover:border-indigo-500/50 transition-all">
            <i className="fas fa-bolt-lightning text-6xl text-slate-600 mb-6 group-hover:text-indigo-400 transition-colors"></i>
            <h2 className="text-2xl font-semibold mb-2 text-white">Advanced PII Redactor</h2>
            <p className="text-slate-400 mb-8 max-w-md text-center">Using Gemini Flash 3 for lightning-fast forensic analysis and word-level redaction.</p>
            <label htmlFor="file-upload" className="bg-indigo-600 hover:bg-indigo-500 text-white font-medium px-8 py-4 rounded-xl cursor-pointer transition-all shadow-lg active:scale-95 hover:shadow-indigo-500/40">
              Upload Audio File
            </label>
          </div>
        )}

        {(mode === AppMode.EDITING || mode === AppMode.PROCESSING || mode === AppMode.LOADING) && (
          <div className="space-y-6">
            <WaveformView audioUrl={audioUrl} segments={segments} isPlaying={isPlaying} onSegmentsChange={setSegments} onPlayStateChange={setIsPlaying} />

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-1 space-y-6">
                <div className="bg-slate-800 p-6 rounded-2xl border border-slate-700 shadow-xl">
                  <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <i className="fas fa-microchip text-indigo-400"></i>
                    AI Processing
                  </h3>
                  <button 
                    disabled={mode === AppMode.PROCESSING} 
                    onClick={handleAutomatedAnalysis} 
                    className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 text-white font-bold py-4 rounded-xl flex items-center justify-center gap-3 transition-all shadow-lg shadow-indigo-500/20"
                  >
                    {mode === AppMode.PROCESSING && statusMessage.includes('scan') ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-wand-magic-sparkles"></i>}
                    Analyze Recording
                  </button>
                  
                  <div className="mt-8 pt-6 border-t border-slate-700">
                    <label className="text-sm font-medium text-slate-400 mb-3 block">Quick Word Removal</label>
                    <div className="flex gap-2 mb-4">
                      <input type="text" value={manualWord} onChange={(e) => setManualWord(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addManualWordMask()} placeholder="Search brand or name..." className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all" />
                      <button onClick={addManualWordMask} disabled={mode === AppMode.PROCESSING} className="bg-indigo-600 hover:bg-indigo-500 p-3 rounded-xl transition-colors disabled:opacity-50 min-w-[48px] flex items-center justify-center">
                        {mode === AppMode.PROCESSING && statusMessage.includes('Scanning') ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-search"></i>}
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {omittedWordList.map(word => (
                        <div key={word} className="bg-slate-700/50 text-slate-200 text-xs px-3 py-1.5 rounded-lg flex items-center gap-2 border border-slate-600">
                          {word}
                          <button onClick={() => removeOmittedWord(word)} className="text-slate-400 hover:text-red-400 transition-colors">
                            <i className="fas fa-times"></i>
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="bg-slate-800 p-6 rounded-2xl border border-slate-700 shadow-xl">
                  <h3 className="text-lg font-semibold mb-4 flex items-center gap-2"><i className="fas fa-headphones text-amber-400"></i> Verification</h3>
                  <button disabled={segments.length === 0 || mode === AppMode.PROCESSING} onClick={handlePreviewMasked} className={`w-full ${isShowingPreview ? 'bg-amber-600 hover:bg-amber-500' : 'bg-slate-700 hover:bg-slate-600'} disabled:opacity-50 text-white font-medium py-3 rounded-xl flex items-center justify-center gap-2 shadow-lg`}>
                    {isShowingPreview ? <><i className="fas fa-undo"></i> Original Audio</> : <><i className="fas fa-volume-low"></i> Preview Redacted</>}
                  </button>
                </div>

                <div className="bg-slate-800 p-6 rounded-2xl border border-slate-700 shadow-xl">
                  <h3 className="text-lg font-semibold mb-4 flex items-center gap-2"><i className="fas fa-download text-emerald-400"></i> Finalize</h3>
                  <button disabled={segments.length === 0 || mode === AppMode.PROCESSING} onClick={handleExport} className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-600 text-white font-bold py-4 rounded-xl shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2">
                    <i className="fas fa-file-audio"></i> Export Redacted File
                  </button>
                </div>
              </div>

              <div className="lg:col-span-2 bg-slate-800 rounded-2xl border border-slate-700 shadow-xl overflow-hidden flex flex-col h-full min-h-[500px]">
                <div className="bg-slate-700/50 flex border-b border-slate-700">
                  <button 
                    onClick={() => setActiveTab('transcript')}
                    className={`flex-1 py-4 px-6 font-semibold transition-colors flex items-center justify-center gap-2 ${activeTab === 'transcript' ? 'bg-slate-800 text-indigo-400 border-b-2 border-indigo-400' : 'text-slate-400 hover:text-slate-200'}`}
                  >
                    <i className="fas fa-align-left"></i> Transcript Panel
                  </button>
                  <button 
                    onClick={() => setActiveTab('logs')}
                    className={`flex-1 py-4 px-6 font-semibold transition-colors flex items-center justify-center gap-2 ${activeTab === 'logs' ? 'bg-slate-800 text-indigo-400 border-b-2 border-indigo-400' : 'text-slate-400 hover:text-slate-200'}`}
                  >
                    <i className="fas fa-clipboard-list"></i> Redaction Logs
                  </button>
                </div>

                <div className="p-6 flex-1 overflow-y-auto max-h-[600px] bg-slate-900/40">
                  {activeTab === 'transcript' ? (
                    transcript.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-full py-12 text-slate-500">
                        <i className="fas fa-quote-left text-5xl mb-4 opacity-20"></i>
                        <p className="text-center text-sm">Transcript will appear here after AI Analysis. <br/> Click any word to toggle redaction.</p>
                      </div>
                    ) : (
                      <div className="leading-relaxed text-xl text-slate-300 p-2 font-serif selection:bg-indigo-500/30">
                        {transcript.map((word, idx) => (
                          <span 
                            key={idx} 
                            onClick={() => handleTranscriptWordClick(word)}
                            className={`inline-block mx-0.5 px-1 rounded transition-all cursor-pointer ${isWordRedacted(word.start, word.end) ? 'bg-red-500/20 text-red-500 line-through' : 'hover:bg-slate-700/50'}`}
                            title={`Time: ${word.start.toFixed(2)}s - Click to redact`}
                          >
                            {word.text}
                          </span>
                        ))}
                      </div>
                    )
                  ) : (
                    segments.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-full py-12 text-slate-500">
                        <i className="fas fa-shield-halved text-5xl mb-4 opacity-20"></i>
                        <p>No redactions added.</p>
                      </div>
                    ) : (
                      <table className="w-full text-left text-sm border-separate border-spacing-y-2">
                        <thead className="text-slate-500 uppercase text-[10px] tracking-widest font-bold">
                          <tr>
                            <th className="pb-3 px-4">From</th>
                            <th className="pb-3 px-4">To</th>
                            <th className="pb-3 px-4">Reason</th>
                            <th className="pb-3 px-4">Type</th>
                            <th className="pb-3 px-4 text-right">Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {[...segments].sort((a,b) => a.start - b.start).map((seg) => (
                            <tr key={seg.id} className="bg-slate-800 hover:bg-slate-700/50 transition-colors rounded-xl border border-slate-700 group">
                              <td className="py-4 px-4 font-mono text-indigo-400">{seg.start.toFixed(2)}s</td>
                              <td className="py-4 px-4 font-mono text-indigo-400">{seg.end.toFixed(2)}s</td>
                              <td className="py-4 px-4 text-slate-200">{seg.label}</td>
                              <td className="py-4 px-4">
                                <span className={`text-[10px] font-black px-2 py-1 rounded-md uppercase ${
                                  seg.type === 'AI' ? 'bg-amber-500/10 text-amber-500 border border-amber-500/30' : 'bg-red-500/10 text-red-500 border border-red-500/30'
                                }`}>
                                  {seg.type}
                                </span>
                              </td>
                              <td className="py-4 px-4 text-right">
                                <button className="text-slate-500 hover:text-red-400 transition-colors p-2" onClick={() => removeSegment(seg.id)}>
                                  <i className="fas fa-trash-alt"></i>
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {showConfirmReset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
          <div className="bg-slate-800 border border-slate-700 p-8 rounded-3xl shadow-2xl max-w-sm w-full transform animate-in zoom-in-95">
            <h3 className="text-xl font-bold mb-3 text-white">Reset Workspace?</h3>
            <p className="text-slate-400 mb-8 leading-relaxed">This will discard all analysis and redactions for the current file.</p>
            <div className="flex flex-col gap-3">
              <button onClick={confirmReset} className="w-full bg-red-600 hover:bg-red-500 text-white font-bold py-4 rounded-2xl transition-all">Yes, Start New</button>
              <button onClick={() => setShowConfirmReset(false)} className="w-full bg-slate-700 hover:bg-slate-600 text-white font-medium py-3 rounded-2xl transition-all">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {statusMessage && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-indigo-600 text-white px-8 py-4 rounded-2xl shadow-2xl flex items-center gap-4 border border-indigo-400 z-50 animate-in fade-in slide-in-from-bottom-8 duration-300">
          {mode === AppMode.PROCESSING || mode === AppMode.LOADING ? (
            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <i className="fas fa-info-circle text-xl"></i>
          )}
          <span className="font-semibold text-sm">{statusMessage}</span>
          <button onClick={() => setStatusMessage('')} className="bg-white/10 hover:bg-white/20 p-1 rounded-lg transition-colors">
            <i className="fas fa-times"></i>
          </button>
        </div>
      )}
    </div>
  );
};

export default App;
