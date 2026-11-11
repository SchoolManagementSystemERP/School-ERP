/**
 * Jarvis's speaking voice. Browsers ship many voices; the first Hindi one is often an old robotic desktop
 * voice (Microsoft Kalpana / Hemant), while the same computer usually also has natural ones — Edge's
 * "Microsoft Swara Online (Natural)", Chrome's "Google हिन्दी". This picks the most natural voice, lets the
 * person choose another, turns ERP text (₹16,004 · 2026-12-01 · P1 08:00-08:45) into speakable words, and
 * speaks long replies sentence by sentence (Chrome cuts one long utterance off after ~15 seconds).
 */

const VOICE_KEY = "jarvis.voice";

/** Higher is better: Hindi / Indian English first, natural (neural / online / Google) over desktop voices. */
export function voiceScore(voice: SpeechSynthesisVoice): number {
  const lang = voice.lang.toLowerCase().replace("_", "-");
  let score = lang === "hi-in" ? 40 : lang.startsWith("hi") ? 35 : lang === "en-in" ? 30 : lang.startsWith("en") ? 5 : -100;
  if (/natural|neural/i.test(voice.name)) score += 30;
  if (/online/i.test(voice.name)) score += 15;
  if (/google/i.test(voice.name)) score += 20;
  if (/swara|madhur|neerja|prabhat|aarohi|ananya|kavya|arjun/i.test(voice.name)) score += 10;
  if (/kalpana|hemant|heera|ravi|zira|david|mark/i.test(voice.name)) score -= 15;
  if (!voice.localService) score += 5;
  return score;
}

/** Voices worth offering (Hindi and English), best first. */
export function rankedVoices(): SpeechSynthesisVoice[] {
  if (!("speechSynthesis" in window)) return [];
  return window.speechSynthesis.getVoices()
    .filter((voice) => /^(hi|en)/i.test(voice.lang))
    .sort((a, b) => voiceScore(b) - voiceScore(a));
}

export function savedVoiceUri(): string {
  try { return localStorage.getItem(VOICE_KEY) ?? ""; } catch { return ""; }
}
export function saveVoiceUri(uri: string) {
  try { if (uri) localStorage.setItem(VOICE_KEY, uri); else localStorage.removeItem(VOICE_KEY); } catch { /* not saved — fine */ }
}

/** The person's chosen voice, else the most natural one available. */
export function currentVoice(): SpeechSynthesisVoice | null {
  const voices = rankedVoices();
  const saved = savedVoiceUri();
  return voices.find((voice) => voice.voiceURI === saved) ?? voices[0] ?? null;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** ERP text → words a voice reads naturally. */
export function toSpeech(text: string): string {
  const year = new Date().getFullYear();
  return text
    // "Ms. Priya" is not the end of a sentence (replies are spoken sentence by sentence)
    .replace(/\b(Mr|Mrs|Ms|Dr|Smt|Shri)\.\s/g, "$1 ")
    // the amount ends with a digit — "₹48,000, jama" must not take the comma after it
    .replace(/₹\s?(\d(?:[\d,]*\d)?(?:\.\d+)?)/g, "$1 rupaye")
    .replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, (_, y: string, m: string, d: string) => `${Number(d)} ${MONTHS[Number(m) - 1] ?? m}${Number(y) === year ? "" : ` ${y}`}`)
    .replace(/\b(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})\b/g, "$1 se $2")
    .replace(/\bP(\d{1,2})\b/g, "period $1")
    .replace(/(\d+(?:\.\d+)?)\s?%/g, "$1 percent")
    .replace(/(^|\s)(\d{1,3})\/(\d{1,3})(?=\s|$)/g, "$1$2 mein se $3")
    .replace(/[“”"]/g, "")
    .replace(/[✓•·|]/g, ", ")
    .replace(/\s+[—–-]\s+/g, ", ")
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s,]+/, "")
    .trim();
}

/** Sentences of at most ~180 characters, so no single utterance runs long. */
function chunks(text: string): string[] {
  const sentences = text.match(/[^.!?;]+[.!?;]?/g) ?? [text];
  const out: string[] = [];
  for (const sentence of sentences.map((s) => s.trim()).filter(Boolean)) {
    if (sentence.length <= 180) { out.push(sentence); continue; }
    let rest = sentence;
    while (rest.length > 180) {
      const cut = rest.lastIndexOf(",", 180) > 60 ? rest.lastIndexOf(",", 180) + 1 : rest.lastIndexOf(" ", 180);
      out.push(rest.slice(0, cut > 0 ? cut : 180).trim());
      rest = rest.slice(cut > 0 ? cut : 180).trim();
    }
    if (rest) out.push(rest);
  }
  return out;
}

/** Speaks text in the chosen voice; `onDone` runs when everything has been said (or speaking failed). */
export function speak(text: string, onDone?: () => void) {
  if (!("speechSynthesis" in window)) { onDone?.(); return; }
  const synth = window.speechSynthesis;
  synth.cancel();
  const voice = currentVoice();
  const natural = voice ? /natural|neural|online|google/i.test(voice.name) : false;
  const parts = chunks(toSpeech(text));
  if (!parts.length) { onDone?.(); return; }
  parts.forEach((part, index) => {
    const utterance = new SpeechSynthesisUtterance(part);
    if (voice) { utterance.voice = voice; utterance.lang = voice.lang; } else utterance.lang = "hi-IN";
    utterance.rate = natural ? 1 : 0.95;
    if (index === parts.length - 1 && onDone) {
      utterance.onend = onDone;
      utterance.onerror = onDone;
    }
    synth.speak(utterance);
  });
}
