import { useRef, useState } from "react";

/** Browser-native speech-to-text (Web Speech API) — feature-detected, no server involved. */
export function useVoiceInput(onResult: (text: string) => void) {
    const [listening, setListening] = useState(false);
    const recognitionRef = useRef<SpeechRecognition | null>(null);
    const Ctor = typeof window !== "undefined" ? (window.SpeechRecognition ?? window.webkitSpeechRecognition) : undefined;

    const toggle = () => {
        if (!Ctor) return;
        if (listening) {
            recognitionRef.current?.stop();
            return;
        }
        const recognition = new Ctor();
        recognition.continuous = false;
        recognition.interimResults = true;
        recognition.lang = "en-US";
        recognition.onresult = (event) => {
            let transcript = "";
            for (let i = event.resultIndex; i < event.results.length; i++) {
                transcript += event.results[i][0].transcript;
            }
            onResult(transcript);
        };
        recognition.onend = () => setListening(false);
        recognition.onerror = () => setListening(false);
        recognitionRef.current = recognition;
        recognition.start();
        setListening(true);
    };

    return { supported: Boolean(Ctor), listening, toggle };
}
