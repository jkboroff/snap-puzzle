import { Capacitor } from '@capacitor/core';
import { QueueStrategy, TextToSpeech } from '@capacitor-community/text-to-speech';

let enabled = false;

/** Turns the talking on or off (a grown-up setting) */
export const setSpeechEnabled = (on: boolean) => {
  enabled = on;
  if (!on) stopSpeaking();
};

export const stopSpeaking = () => {
  if (Capacitor.isNativePlatform()) {
    TextToSpeech.stop().catch(() => {});
  } else if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
};

/**
 * Says a short phrase, cutting off whatever was being said. Android's WebView has no Web Speech
 * voices, so the app uses the phone's own text-to-speech engine there (works offline).
 */
export const speak = (text: string) => {
  if (!enabled || !text.trim()) return;
  if (Capacitor.isNativePlatform()) {
    TextToSpeech.speak({ text, lang: 'en-US', rate: 0.95, pitch: 1.1, queueStrategy: QueueStrategy.Flush }).catch(
      (e) => console.warn('Text-to-speech failed', e)
    );
    return;
  }
  if (!('speechSynthesis' in window)) return;
  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    utterance.rate = 0.9;
    utterance.pitch = 1.1;
    window.speechSynthesis.speak(utterance);
  } catch (e) {
    console.warn('Speech failed', e);
  }
};
