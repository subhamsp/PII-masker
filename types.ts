
export interface AudioSegment {
  id: string;
  start: number;
  end: number;
  label: string;
  type: 'AI' | 'manual';
}

export interface TranscriptWord {
  text: string;
  start: number;
  end: number;
}

export interface PIIItem {
  word: string;
  reason: string;
  start: number;
  end: number;
}

export interface ProcessingResult {
  detections: PIIItem[];
  transcript: TranscriptWord[];
}

export enum AppMode {
  IDLE = 'IDLE',
  LOADING = 'LOADING',
  EDITING = 'EDITING',
  PROCESSING = 'PROCESSING'
}
