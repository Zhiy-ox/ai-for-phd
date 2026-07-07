"use client";

// Browser speech services for the viva room — no API keys:
// - speech-to-text via the Web Speech API (Chrome uses its speech service,
//   recent Safari transcribes on-device; Firefox is unsupported)
// - text-to-speech via window.speechSynthesis
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

interface SpeechRecognitionAlternativeLike {
  transcript: string;
}

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: SpeechRecognitionResultLike;
  };
}

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  }
}

function recognitionCtor(): (new () => SpeechRecognitionLike) | undefined {
  if (typeof window === "undefined") return undefined;
  return window.SpeechRecognition ?? window.webkitSpeechRecognition;
}

// Push-to-talk speech recognition. `onFinalText` fires once per finalized
// utterance segment; `interim` holds the live not-yet-final tail for display.
const noopSubscribe = () => () => {};

export function useSpeechRecognition(onFinalText: (text: string) => void) {
  // Browser capability: false during SSR, real value once hydrated.
  const supported = useSyncExternalStore(
    noopSubscribe,
    () => Boolean(recognitionCtor()),
    () => false,
  );
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  // True from start() until the user stops — survives Chrome's silence
  // timeouts, which end the recognizer without the user asking.
  const wantedRef = useRef(false);
  const onFinalRef = useRef(onFinalText);
  useEffect(() => {
    onFinalRef.current = onFinalText;
  }, [onFinalText]);

  const stop = useCallback(() => {
    wantedRef.current = false;
    setListening(false);
    setInterim("");
    recRef.current?.stop();
  }, []);

  const start = useCallback(() => {
    const Ctor = recognitionCtor();
    if (!Ctor || wantedRef.current) return;
    cancelSpeech(); // never let the panel's TTS bleed into the mic
    setError(null);
    const rec = new Ctor();
    rec.lang = "en-GB";
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (event) => {
      let interimText = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const transcript = result[0]?.transcript ?? "";
        if (result.isFinal) onFinalRef.current(transcript.trim());
        else interimText += transcript;
      }
      setInterim(interimText.trim());
    };
    rec.onerror = (event) => {
      wantedRef.current = false;
      setListening(false);
      setInterim("");
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        setError("Microphone access was blocked — allow it in the browser and try again.");
      } else if (event.error && event.error !== "no-speech" && event.error !== "aborted") {
        setError(`Voice input failed (${event.error}).`);
      }
    };
    rec.onend = () => {
      // Chrome ends the session after a stretch of silence; keep the mic
      // open until the user explicitly stops.
      if (wantedRef.current) {
        try {
          rec.start();
        } catch {
          wantedRef.current = false;
          setListening(false);
          setInterim("");
        }
      } else {
        setListening(false);
        setInterim("");
      }
    };
    recRef.current = rec;
    wantedRef.current = true;
    try {
      rec.start();
      setListening(true);
    } catch {
      wantedRef.current = false;
      setError("Could not start voice input.");
    }
  }, []);

  useEffect(
    () => () => {
      wantedRef.current = false;
      recRef.current?.abort();
    },
    [],
  );

  return { supported, listening, interim, error, start, stop };
}

// ---------------------------------------------------------------------------
// Text-to-speech for panel questions.

// Strip "[Dr Chen]"-style speaker tags anywhere in the text before speaking.
export function stripSpeakerTags(text: string): string {
  return text.replace(/\[[^\]\n]{1,40}\]:?/g, "").replace(/\n{2,}/g, "\n").trim();
}

export function speakAloud(text: string): void {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(stripSpeakerTags(text));
  utterance.lang = "en-GB";
  const voice = window.speechSynthesis
    .getVoices()
    .find((v) => v.lang.startsWith("en-GB"));
  if (voice) utterance.voice = voice;
  window.speechSynthesis.speak(utterance);
}

export function cancelSpeech(): void {
  if (typeof window !== "undefined") window.speechSynthesis?.cancel();
}
