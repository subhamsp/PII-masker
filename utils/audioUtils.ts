
import { AudioSegment } from "../types";

/**
 * Creates a copy of the AudioBuffer and silences the specified segments.
 */
export const maskAudioBuffer = (
  audioContext: AudioContext,
  originalBuffer: AudioBuffer,
  segments: AudioSegment[]
): AudioBuffer => {
  const maskedBuffer = audioContext.createBuffer(
    originalBuffer.numberOfChannels,
    originalBuffer.length,
    originalBuffer.sampleRate
  );

  for (let channel = 0; channel < originalBuffer.numberOfChannels; channel++) {
    const originalData = originalBuffer.getChannelData(channel);
    const maskedData = maskedBuffer.getChannelData(channel);
    
    // Copy all data initially
    maskedData.set(originalData);

    // Apply silencing
    segments.forEach(segment => {
      const startFrame = Math.floor(segment.start * originalBuffer.sampleRate);
      const endFrame = Math.floor(segment.end * originalBuffer.sampleRate);
      
      for (let i = startFrame; i < endFrame; i++) {
        if (i >= 0 && i < maskedData.length) {
          maskedData[i] = 0; // Mute
        }
      }
    });
  }

  return maskedBuffer;
};

/**
 * Encodes an AudioBuffer to a WAV Blob.
 */
export const bufferToWav = (buffer: AudioBuffer): Blob => {
  const numOfChan = buffer.numberOfChannels;
  const length = buffer.length * numOfChan * 2 + 44;
  const bufferArr = new ArrayBuffer(length);
  const view = new DataView(bufferArr);
  const channels = [];
  let offset = 0;
  let pos = 0;

  // Write WAV header
  const setUint32 = (data: number) => { view.setUint32(pos, data, true); pos += 4; };
  const setUint16 = (data: number) => { view.setUint16(pos, data, true); pos += 2; };

  setUint32(0x46464952); // "RIFF"
  setUint32(length - 8); // file length - 8
  setUint32(0x45564157); // "WAVE"
  setUint32(0x20746d66); // "fmt " chunk
  setUint32(16); // length = 16
  setUint16(1); // PCM (uncompressed)
  setUint16(numOfChan);
  setUint32(buffer.sampleRate);
  setUint32(buffer.sampleRate * 2 * numOfChan); // avg. bytes/sec
  setUint16(numOfChan * 2); // block-align
  setUint16(16); // 16nd-bit
  setUint32(0x61746164); // "data" - chunk
  setUint32(length - pos - 4); // chunk length

  for (let i = 0; i < buffer.numberOfChannels; i++) {
    channels.push(buffer.getChannelData(i));
  }

  while (pos < length) {
    for (let i = 0; i < numOfChan; i++) {
      let sample = Math.max(-1, Math.min(1, channels[i][offset]));
      sample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
      view.setInt16(pos, sample, true);
      pos += 2;
    }
    offset++;
  }

  return new Blob([bufferArr], { type: "audio/wav" });
};

export const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const base64 = (reader.result as string).split(',')[1];
      resolve(base64);
    };
    reader.onerror = (error) => reject(error);
  });
};
