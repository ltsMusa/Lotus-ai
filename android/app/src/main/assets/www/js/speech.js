/**
 * ==========================================================
 * Lotus AI - Speech (STT + TTS)
 * ==========================================================
 * Uses the browser's built-in Web Speech API. No external
 * provider, no key needed — but browser support varies
 * (best on Chrome/Edge; Safari/Firefox support is partial or
 * absent), so every entry point degrades gracefully.
 * ==========================================================
 */

import config from "./config.js";
import { plainSpeech } from "./utils.js";
import { showToast } from "./toast.js";

const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;

const Speech = {

    recognition: null,
    listening: false,
    onResult: null,

    // ------------------------------------------------------
    // SPEECH TO TEXT
    // ------------------------------------------------------

    sttSupported() {

        return Boolean(SpeechRecognitionAPI);
    },

    startListening(onResult, onError) {

        if (!this.sttSupported()) {

            onError?.("Bu tarayıcı sesle yazmayı desteklemiyor.");

            return;
        }

        if (this.listening) {

            this.stopListening();

            return;
        }

        this.recognition = new SpeechRecognitionAPI();

        this.recognition.lang = config.voice.language || "tr-TR";
        this.recognition.interimResults = true;
        this.recognition.continuous = false;

        this.recognition.onresult = event => {

            const transcript = Array.from(event.results)
                .map(result => result[0].transcript)
                .join(" ");

            onResult?.(transcript, event.results[event.results.length - 1].isFinal);
        };

        this.recognition.onerror = event => {

            this.listening = false;

            const messages = {
                "not-allowed": "Mikrofon izni reddedildi.",
                "no-speech": "Ses algılanamadı, tekrar deneyin.",
                "audio-capture": "Mikrofon bulunamadı."
            };

            onError?.(messages[event.error] || `Mikrofon hatası: ${event.error}`);
        };

        this.recognition.onend = () => {

            this.listening = false;
        };

        try {

            this.recognition.start();

            this.listening = true;

        } catch (error) {

            onError?.("Mikrofon başlatılamadı.");
        }
    },

    stopListening() {

        if (this.recognition && this.listening) {

            this.recognition.stop();
        }

        this.listening = false;
    },

    // ------------------------------------------------------
    // TEXT TO SPEECH
    // ------------------------------------------------------

    ttsSupported() {

        return "speechSynthesis" in window;
    },

    speak(text) {

        if (!config.voice.ttsEnabled) return;

        const spoken = plainSpeech(text);

        if (!this.ttsSupported() || !spoken) return;

        window.speechSynthesis.cancel();

        const utterance = new SpeechSynthesisUtterance(spoken);

        utterance.lang = config.voice.language || "tr-TR";
        utterance.rate = config.voice.rate || 1;

        window.speechSynthesis.speak(utterance);
    },

    stopSpeaking() {

        if (this.ttsSupported()) window.speechSynthesis.cancel();
    }
};

// ----------------------------------------------------------
// WIRE UP #voice-button (mic dictation into the chat input)
// ----------------------------------------------------------

document.addEventListener("DOMContentLoaded", () => {

    const voiceButton = document.getElementById("voice-button");
    const input = document.getElementById("message-input");

    if (!voiceButton || !input) return;

    voiceButton.addEventListener("click", event => {

        event.preventDefault();

        if (!config.voice.sttEnabled) return;

        // Drive the button's visual state from Speech's actual internal
        // state (not a blind classList.toggle), otherwise the two can
        // desync: e.g. a final transcript result removes the "listening"
        // class while the recognition object hasn't fired onend yet, so
        // the next click's toggle would re-add the class while
        // startListening() sees this.listening still true and just
        // calls stopListening() instead of starting a new session —
        // leaving the button looking "active" with nothing running.
        if (Speech.listening) {

            Speech.stopListening();

            voiceButton.classList.remove("listening");

            return;
        }

        voiceButton.classList.add("listening");

        Speech.startListening(
            (transcript, isFinal) => {

                input.value = transcript;

                // keep the composer's auto-height in sync with dictated text
                input.dispatchEvent(new Event("input", { bubbles: true }));

                if (isFinal) voiceButton.classList.remove("listening");
            },
            errorMessage => {

                voiceButton.classList.remove("listening");

                console.warn("🎙️", errorMessage);

                showToast(errorMessage || "Mikrofon kullanılamıyor.", "error");
            }
        );
    });
});

export default Speech;
