
import { GoogleGenAI, Type } from "@google/genai";
import { PIIItem, ProcessingResult } from "../types";

/**
 * Detects PII and generates a transcript with high timestamp precision.
 * Uses gemini-3-flash-preview for faster generation of large transcripts.
 */
export const detectPII = async (audioBase64: string, mimeType: string): Promise<ProcessingResult> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview', // Switched to Flash for much faster high-volume text generation
    contents: {
      parts: [
        {
          inlineData: {
            mimeType,
            data: audioBase64
          }
        },
        {
          text: `Analyze this audio for PII and provide a full transcript.
          
          1. Detect PII: Names, brands (e.g. "Shiprocket"), phone numbers, emails.
          2. Word-by-word Transcript: Every word MUST have start and end timestamps.
          
          OUTPUT JSON FORMAT:
          {
            "detections": [
              { "word": "pii word", "reason": "reason", "start": 0.0, "end": 0.0 }
            ],
            "transcript": [
              { "text": "word", "start": 0.0, "end": 0.0 }
            ]
          }
          
          Be fast, precise, and exhaustive. Return ONLY the JSON.`
        }
      ]
    },
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          detections: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                word: { type: Type.STRING },
                reason: { type: Type.STRING },
                start: { type: Type.NUMBER },
                end: { type: Type.NUMBER }
              },
              required: ["word", "reason", "start", "end"]
            }
          },
          transcript: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                text: { type: Type.STRING },
                start: { type: Type.NUMBER },
                end: { type: Type.NUMBER }
              },
              required: ["text", "start", "end"]
            }
          }
        },
        required: ["detections", "transcript"]
      }
    }
  });

  try {
    const text = response.text || '{"detections": [], "transcript": []}';
    return JSON.parse(text);
  } catch (error) {
    console.error("Failed to parse Gemini response", error);
    return { detections: [], transcript: [] };
  }
};

/**
 * Searches for specific words with exhaustive thoroughness.
 */
export const findSpecificWords = async (audioBase64: string, mimeType: string, wordsToFind: string[]): Promise<PIIItem[]> => {
  if (wordsToFind.length === 0) return [];
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview', // Flash is faster for this as well
    contents: {
      parts: [
        {
          inlineData: {
            mimeType,
            data: audioBase64
          }
        },
        {
          text: `Find every single occurrence of: ${wordsToFind.join(', ')}.
          Return a JSON array of objects with "word", "reason": "User Specified", "start", and "end" (decimal seconds).`
        }
      ]
    },
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            word: { type: Type.STRING },
            reason: { type: Type.STRING },
            start: { type: Type.NUMBER },
            end: { type: Type.NUMBER }
          },
          required: ["word", "reason", "start", "end"]
        }
      }
    }
  });

  try {
    return JSON.parse(response.text || '[]');
  } catch (error) {
    console.error("Failed to parse Gemini response for specific words", error);
    return [];
  }
};
