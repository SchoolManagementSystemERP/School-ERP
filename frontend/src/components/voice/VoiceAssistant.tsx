import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { Check, LoaderCircle, Mic, MicOff, Navigation, Send, Volume2, VolumeX, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/components/ui/utils";
import { api, errorMessage } from "@/api/client";
import type { AttendanceStatus } from "@/types/attendance";
import { authStore, can } from "@/store/auth";
import { attendanceStore, recordVoiceAttendance } from "@/store/attendance";
import { useClassRoster } from "@/store/students";
import { useSubjects } from "@/store/timetable";

/** The browser's own speech recognition (Chrome/Edge/Safari). Not in every TS DOM lib, so typed here. */
interface BrowserRecognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type RecognitionConstructor = new () => BrowserRecognition;
type SpeechEngine = "browser" | "local";

function browserRecognition(): RecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const speechWindow = window as unknown as { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor };
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition ?? null;
}

const ENGINE_KEY = "jarvis.speechEngine";
const WAKE_KEY = "jarvis.wakeWord";
/** "Hey Jarvis" and the ways speech services commonly mishear it. */
const WAKE_PATTERN = /(?:\b(?:hey|hi|hay|he|hello|ok|okay|a)\s+)?\b(?:jarvis|jarvish|jervis|jarwis|javis|jarviz)\b|(?:\b(?:hey|hi|hay|ok|okay)\s+)travis\b|जार्विस|जारविस/iu;

function savedWakeWord() {
  try { return localStorage.getItem(WAKE_KEY) === "on"; } catch { return false; }
}
function initialEngine(): SpeechEngine {
  const supported = !!browserRecognition();
  try {
    const saved = localStorage.getItem(ENGINE_KEY);
    if (saved === "local" || (saved === "browser" && supported)) return saved;
  } catch { /* storage blocked — use the default */ }
  return supported ? "browser" : "local";
}

const RECOGNITION_ERRORS: Record<string, string> = {
  "not-allowed": "Microphone permission allow karein (browser ki site settings → Microphone → Allow).",
  "service-not-allowed": "Browser speech service band hai. Speech engine mein “Private — on-device” chunein.",
  network: "Fast speech ke liye internet chahiye. Internet check karein, ya speech engine mein “Private — on-device” chunein.",
  "no-speech": "Kuch sunai nahi diya. Mic ke paas saaf boliye aur dobara try karein.",
  "audio-capture": "Microphone nahi mila. Mic/headset connect karke dobara try karein.",
  "language-not-supported": "Is browser mein yeh language support nahi hai. Speech language badal kar try karein.",
};

type PageLink = { href: string; label: string };
/** A change Jarvis prepared (approve a leave, post a notice, record a fee); it runs only after "Haan". */
type JarvisAction = { method: "POST" | "PATCH" | "PUT"; path: string; body: unknown; title: string; summary: string; confirm: string; done: string };
type ChatMessage = { role: "user" | "assistant"; content: string; fromData?: boolean };
type ModelStatus = { available: boolean; model: string; message: string };
type SpeechWorkerMessage =
  | { type: "progress"; progress: number | null; file: string }
  | { type: "result"; text: string }
  | { type: "error"; message: string };
type AttendanceDraft = {
  className: string;
  subject: string;
  date: string;
  statuses: Record<string, AttendanceStatus>;
  present: number;
  absent: number;
  leave: number;
  absentNames: string[];
  leaveNames: string[];
  replacesExisting: boolean;
};

const REMOVE_WORDS = new Set([
  "please", "open", "show", "go", "to", "page", "screen", "khol", "kholo", "khul", "dikha", "dikhao", "dikhaiye",
  "bata", "batao", "par", "pe", "ja", "jao", "mujhe", "mera", "meri", "mere", "the", "me", "mein",
  "पेज", "खोलो", "खोल", "दिखाओ", "दिखाइए", "बताओ", "बताइए", "पर", "में", "मुझे", "मेरा", "मेरी",
]);

const ALIASES: Record<string, string[]> = {
  "/": ["home", "dashboard", "डैशबोर्ड"],
  "/admin": ["settings", "users", "roles", "प्रशासन"],
  "/teacher/students": ["student list", "बच्चे", "विद्यार्थी"],
  "/student": ["home", "dashboard", "डैशबोर्ड"],
  "/student/fees": ["fee", "fees", "payment", "फीस"],
  "/student/attendance": ["attendance", "हाजिरी", "उपस्थिति"],
  "/student/timetable": ["timetable", "schedule", "समय सारणी"],
  "/teacher/attendance": ["attendance", "अटेंडेंस", "हाजिरी", "उपस्थिति"],
  "/teacher/marks": ["marks", "मार्क्स", "results", "अंक", "रिजल्ट"],
  "/teacher/assignments": ["homework", "होमवर्क", "assignment", "असाइनमेंट", "कार्य"],
  "/teacher/notes": ["study material", "notes", "नोट्स"],
  "/teacher/timetable": ["schedule", "timetable", "टाइमटेबल", "समय सारणी"],
  "/librarian/books": ["library", "लाइब्रेरी", "book", "books", "किताब", "पुस्तक"],
  "/librarian/issue-return": ["issue", "return", "जारी", "वापस"],
  "/hr/staff": ["employee", "employees", "कर्मचारी"],
  "/hr/leaves": ["leave", "छुट्टी"],
  "/accountant/fees": ["fee", "fees", "फीस"],
};

function normalize(value: string) {
  return value
    .toLocaleLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}/ ]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(value: string) {
  return normalize(value).split(" ").filter((word) => word && !REMOVE_WORDS.has(word));
}

function pageLinks(): PageLink[] {
  const links = Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]"))
    .filter((anchor) => {
      try {
        return new URL(anchor.href).origin === window.location.origin && anchor.textContent?.trim();
      } catch {
        return false;
      }
    })
    .map((anchor) => ({
      href: new URL(anchor.href).pathname,
      label: anchor.textContent?.replace(/\s+/g, " ").trim() ?? "",
    }))
    .filter((link) => link.href.startsWith("/") && link.label.length > 1);
  return [...new Map(links.map((link) => [link.href, link])).values()];
}

function findPage(command: string): PageLink | null {
  const words = tokens(command);
  if (!words.length) return null;

  const candidates = pageLinks().map((link) => {
    const aliasText = Object.entries(ALIASES)
      .filter(([path]) => link.href === path || link.href.startsWith(`${path}/`))
      .flatMap(([, aliases]) => aliases);
    const searchable = tokens(`${link.label} ${link.href.replace(/[/-]/g, " ")} ${aliasText.join(" ")}`);
    const matching = words.filter((word) => searchable.some((candidate) =>
      candidate === word || (word.length >= 4 && (candidate.startsWith(word) || word.startsWith(candidate))),
    ));
    const score = matching.length / words.length + matching.length / Math.max(searchable.length, 1) * 0.25;
    return { ...link, score, matched: matching.length };
  });

  candidates.sort((a, b) => b.score - a.score || b.matched - a.matched);
  const best = candidates[0];
  return best && best.matched > 0 && best.score >= 0.3 ? best : null;
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function classMentioned(command: string, className: string) {
  const canonical = normalize(className).replace(/\bclass\b/g, "").replace(/[\s-]+/g, "");
  const match = canonical.match(/^(\d+)([a-z]+)$/);
  if (!match) return false;
  const [, grade, section] = match;
  return new RegExp(`(?:class\\s*)?${grade}\\s*[- ]?\\s*${escapeRegex(section)}(?![\\p{L}\\p{N}])`, "u").test(normalize(command));
}

const STATUS_MARKERS: { words: string[]; status: AttendanceStatus }[] = [
  { words: ["not present", "nahi aaya", "nahi aayi", "absent", "अनुपस्थित", "गैरहाजिर"], status: "absent" },
  { words: ["on leave", "leave", "chhutti", "छुट्टी"], status: "leave" },
  { words: ["present", "hazir", "हाजिर", "उपस्थित"], status: "present" },
];

function statusNearName(command: string, name: string): AttendanceStatus | null {
  const paddedCommand = ` ${normalize(command)} `;
  const normalizedName = normalize(name);
  const nameIndex = paddedCommand.indexOf(` ${normalizedName} `);
  if (nameIndex < 0) return null;
  const nameEnd = nameIndex + normalizedName.length;
  const options = STATUS_MARKERS.flatMap(({ words, status }) => words.flatMap((word) => {
    const marker = ` ${normalize(word)} `;
    const matches: { status: AttendanceStatus; distance: number }[] = [];
    let markerIndex = paddedCommand.indexOf(marker);
    while (markerIndex >= 0) {
      const distance = markerIndex >= nameEnd ? markerIndex - nameEnd : nameIndex - markerIndex;
      if (distance <= 48) matches.push({ status, distance });
      markerIndex = paddedCommand.indexOf(marker, markerIndex + marker.length);
    }
    return matches;
  }));
  options.sort((a, b) => a.distance - b.distance);
  return options[0]?.status ?? null;
}

function prepareAttendance(command: string, classes: string[], subjects: string[], byClass: Record<string, { id: number; name: string }[]>): AttendanceDraft | string {
  const normalizedCommand = normalize(command);
  const classMatches = classes.filter((className) => classMentioned(command, className));
  if (classMatches.length !== 1) return "Ek hi class clearly boliye, jaise “Class 10 A Science attendance, sab present, Rohan absent”.";
  const className = classMatches[0];
  const subjectMatches = subjects.filter((subject) => {
    const name = normalize(subject);
    return name.length > 1 && ` ${normalizedCommand} `.includes(` ${name} `);
  });
  if (subjectMatches.length !== 1) return "Class ke saath ek subject bhi clearly boliye, jaise “Class 10 A Science attendance”.";

  const roster = byClass[className] ?? [];
  if (!roster.length) return `${className} ka student roster load nahi hua ya aapko uska access nahi hai.`;
  const duplicateNames = roster
    .map((student) => normalize(student.name))
    .filter((name, index, names) => names.indexOf(name) !== index);
  if (duplicateNames.some((name) => ` ${normalizedCommand} `.includes(` ${name} `))) {
    return "Is class mein same naam ke multiple students hain. Voice se unka status safely match nahi ho raha; attendance screen par unhe manually mark karein.";
  }

  const allPresent = /\b(all( students)? present|sab(hi)?( bachche| bacche| students)? (present|hazir))\b|ba?aki( sab)? (present|hazir)|बाकी( सभी)? (उपस्थित|हाजिर)|सब(hi)?( बच्चे| विद्यार्थी)? (उपस्थित|हाजिर)/u.test(normalizedCommand);
  const statuses: Record<string, AttendanceStatus> = {};
  const unrecognized: string[] = [];
  for (const student of roster) {
    const status = statusNearName(command, student.name);
    if (status) statuses[String(student.id)] = status;
    else if (allPresent) statuses[String(student.id)] = "present";
    else unrecognized.push(student.name);
  }
  if (unrecognized.length) {
    return `Register poora save hota hai. “Sab present” boliye aur absent/leave students ke naam batayein, ya har student ka status boliye. Abhi status nahi mila: ${unrecognized.slice(0, 3).join(", ")}${unrecognized.length > 3 ? "…" : ""}.`;
  }

  const date = new Date().toLocaleDateString("en-CA");
  const existingRegister = attendanceStore.get()
    .find((record) => record.className === className && record.date === date)
    ?.periods.some((period) => period.subjectName === subjectMatches[0] && period.entries.length);
  return {
    className,
    subject: subjectMatches[0],
    date,
    statuses,
    present: Object.values(statuses).filter((status) => status === "present").length,
    absent: Object.values(statuses).filter((status) => status === "absent").length,
    leave: Object.values(statuses).filter((status) => status === "leave").length,
    absentNames: roster.filter((student) => statuses[String(student.id)] === "absent").map((student) => student.name),
    leaveNames: roster.filter((student) => statuses[String(student.id)] === "leave").map((student) => student.name),
    replacesExisting: !!existingRegister,
  };
}

export function VoiceAssistant() {
  const navigate = useNavigate();
  const location = useLocation();
  const { role } = authStore.useValue();
  const { classes, byClass } = useClassRoster();
  const subjects = useSubjects();
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const meterContextRef = useRef<AudioContext | null>(null);
  const recordingPcmChunksRef = useRef<Float32Array[]>([]);
  const recordingPcmActiveRef = useRef(false);
  const meterFrameRef = useRef<number | null>(null);
  const speechWorkerRef = useRef<Worker | null>(null);
  const transcriptionRef = useRef<{ resolve: (text: string) => void; reject: (error: Error) => void } | null>(null);
  const recordingTimerRef = useRef<number | null>(null);
  const [open, setOpen] = useState(false);
  const [listening, setListening] = useState(false);
  const [audioInputs, setAudioInputs] = useState<{ deviceId: string; label: string }[]>([]);
  const [selectedAudioInput, setSelectedAudioInput] = useState("");
  const [audioLevel, setAudioLevel] = useState(0);
  const [engine, setEngine] = useState<SpeechEngine>(initialEngine);
  const browserSpeechSupported = !!browserRecognition();
  const recognitionRef = useRef<BrowserRecognition | null>(null);
  const recognitionTextRef = useRef("");
  const [liveTranscript, setLiveTranscript] = useState("");
  // Browser engine: Roman-script Hinglish (en-IN) matches menu names and student names best.
  const [speechLanguage, setSpeechLanguage] = useState<"auto" | "hindi" | "english">(() => (initialEngine() === "browser" ? "english" : "hindi"));
  const [pendingTranscript, setPendingTranscript] = useState("");
  const [transcribing, setTranscribing] = useState(false);
  const [speechProgress, setSpeechProgress] = useState<number | null>(null);
  const [speechFile, setSpeechFile] = useState("");
  const [command, setCommand] = useState("");
  const [target, setTarget] = useState<PageLink | null>(null);
  const [pendingAction, setPendingAction] = useState<JarvisAction | null>(null);
  const [runningAction, setRunningAction] = useState(false);
  // the action is also read from voice handlers created earlier, so keep it in a ref too
  const pendingActionRef = useRef<{ action: JarvisAction; key: string } | null>(null);
  const [attendanceDraft, setAttendanceDraft] = useState<AttendanceDraft | null>(null);
  const [savingAttendance, setSavingAttendance] = useState(false);
  const [message, setMessage] = useState("");
  const [voiceReplies, setVoiceReplies] = useState(true);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [draftMessage, setDraftMessage] = useState("");
  const [thinking, setThinking] = useState(false);
  const [modelStatus, setModelStatus] = useState<ModelStatus | null>(null);
  const canTakeAttendance = role === "teacher" && can("attendance.write");
  // "Hey Jarvis": a background recogniser that only looks for the wake word
  const [wakeEnabled, setWakeEnabled] = useState(savedWakeWord);
  const [wakeActive, setWakeActive] = useState(false);
  const [wakeTick, setWakeTick] = useState(0);
  const wakeRef = useRef<BrowserRecognition | null>(null);
  const wakeRetryDelayRef = useRef(400);
  const lastSpokenRef = useRef("");
  const wakeAvailable = engine === "browser" && browserSpeechSupported;

  useEffect(() => {
    // speak each new message once (not again when listening/thinking flips back)
    if (!voiceReplies || !message || listening || thinking || !("speechSynthesis" in window)) return;
    if (lastSpokenRef.current === message) return;
    lastSpokenRef.current = message;
    const speech = window.speechSynthesis;
    speech.cancel();
    const reply = new SpeechSynthesisUtterance(message);
    reply.lang = "hi-IN";
    reply.rate = 0.95;
    const voices = speech.getVoices();
    const voice = voices.find((candidate) => candidate.lang.toLowerCase() === "hi-in")
      ?? voices.find((candidate) => candidate.lang.toLowerCase().startsWith("hi"))
      ?? voices.find((candidate) => candidate.lang.toLowerCase() === "en-in");
    if (voice) reply.voice = voice;
    speech.speak(reply);
  }, [message, listening, thinking, voiceReplies]);

  useEffect(() => () => {
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    recognitionRef.current?.abort();
    if (wakeRef.current) {
      wakeRef.current.onend = null;
      wakeRef.current.abort();
    }
    if (recordingTimerRef.current !== null) window.clearTimeout(recordingTimerRef.current);
    recordingPcmActiveRef.current = false;
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    if (meterFrameRef.current !== null) window.cancelAnimationFrame(meterFrameRef.current);
    void meterContextRef.current?.close();
    speechWorkerRef.current?.terminate();
  }, []);

  // memory: the conversation saved on the server comes back after a refresh, logout or on another device
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [savedCount, setSavedCount] = useState(0);
  const [memoryMinutes, setMemoryMinutes] = useState(10);
  useEffect(() => {
    if (!open || historyLoaded) return;
    setHistoryLoaded(true);
    void api.get<{ messages: { role: "user" | "assistant"; content: string; source: string | null }[]; total: number; memoryMinutes: number }>("/assistant/history")
      .then((saved) => {
        setSavedCount(saved.total);
        setMemoryMinutes(saved.memoryMinutes);
        setChat((current) => current.length ? current : saved.messages.map((m) => ({ role: m.role, content: m.content, fromData: !!m.source })));
      })
      .catch(() => { /* memory is optional — start fresh */ });
  }, [open, historyLoaded]);

  // keep the newest message in view
  const chatBoxRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const box = chatBoxRef.current;
    if (box) box.scrollTop = box.scrollHeight;
  }, [chat, thinking, open]);

  const clearMemory = async () => {
    try {
      await api.del("/assistant/history");
      setChat([]);
      setSavedCount(0);
      setMessage("Jarvis ki memory saaf kar di.");
    } catch (error) {
      setMessage(errorMessage(error));
    }
  };

  useEffect(() => {
    if (!open || modelStatus) return;
    let active = true;
    void api.get<ModelStatus>("/assistant/status")
      .then((status) => { if (active) setModelStatus(status); })
      .catch((error: unknown) => {
        if (active) setModelStatus({ available: false, model: "local", message: errorMessage(error) });
      });
    return () => { active = false; };
  }, [open, modelStatus]);

  const awaitingAnswerRef = useRef(false);
  const listenAfterReplyRef = useRef(false);

  /** Runs the confirmed change through the normal ERP endpoint (its own permission checks and audit log). */
  const runAction = async () => {
    const pending = pendingActionRef.current;
    if (!pending || runningAction) return;
    setRunningAction(true);
    try {
      const { action, key } = pending;
      if (action.method === "PATCH") await api.patch(action.path, action.body);
      else if (action.method === "PUT") await api.put(action.path, action.body);
      // the idempotency key stops a double tap from recording a payment twice
      else await api.post(action.path, action.body, { headers: { "Idempotency-Key": key } });
      setChat((previous) => [...previous, { role: "assistant" as const, content: `✓ ${action.done}` }].slice(-60));
      setMessage(action.done);
    } catch (error) {
      setMessage(`Kaam nahi hua: ${errorMessage(error)}`);
    } finally {
      pendingActionRef.current = null;
      setPendingAction(null);
      setRunningAction(false);
    }
  };
  const cancelAction = () => {
    pendingActionRef.current = null;
    setPendingAction(null);
    setMessage("Theek hai, kuch nahi badla.");
  };
  const runActionRef = useRef(runAction);
  runActionRef.current = runAction;

  const askAssistant = async (question: string, handsFree = false) => {
    const text = question.trim();
    if (!text || thinking) return;
    const nextChat = [...chat, { role: "user" as const, content: text }].slice(-60);
    setChat(nextChat);
    setDraftMessage("");
    setThinking(true);
    setMessage("Local assistant soch raha hai…");
    // the server trims this further; a long prompt is what makes a CPU-only model slow
    const pageText = (document.querySelector("main")?.innerText ?? "").replace(/\s+/g, " ").trim().slice(0, 6_000);
    try {
      const result = await api.post<{ reply: string; navigation: PageLink | null; model: string; source: string | null; expectsReply?: boolean; action?: JarvisAction }>("/assistant/chat", {
        // the server reads the saved memory; this short copy is only used when nothing is saved yet
        messages: nextChat.slice(-12).map(({ role, content }) => ({ role, content })),
        pagePath: location.pathname,
        pageTitle: document.title,
        pageText,
        links: pageLinks().slice(0, 100),
      });
      const assistantReply: ChatMessage = { role: "assistant", content: result.reply, fromData: !!result.source };
      setChat((previous) => [...previous, assistantReply].slice(-60));
      setSavedCount((count) => count + 2);
      if (handsFree && result.navigation) {
        // spoken "Hey Jarvis …" request: opening a page changes nothing, so no extra tap
        navigate(result.navigation.href);
        setTarget(null);
        setMessage(`${result.navigation.label} page khol diya.`);
      } else {
        setTarget(result.navigation);
        setMessage(result.reply);
      }
      // Jarvis asked something back ("Kaunsi class?"): the next sentence is the answer, not a page command,
      // and in hands-free mode it listens again by itself once it has finished speaking
      awaitingAnswerRef.current = !!result.expectsReply;
      if (result.expectsReply && handsFree) listenAfterReplyRef.current = true;
      // a prepared change: show the confirm card (hands-free: "haan" / "nahi" by voice)
      pendingActionRef.current = result.action ? { action: result.action, key: crypto.randomUUID() } : null;
      setPendingAction(result.action ?? null);
      if (result.action && handsFree) listenAfterReplyRef.current = true;
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setThinking(false);
    }
  };

  const handleVoiceCommand = (heard: string, handsFree = false) => {
    // a prepared change is waiting: a clear spoken "haan" runs it, "nahi" cancels it
    if (pendingActionRef.current) {
      const reply = normalize(heard);
      if (/^(haan|han|ha|haa|yes|confirm|kar do|karo|theek hai|thik hai|ok|okay)\b/.test(reply) && !/\b(nahi|nhi|mat|no)\b/.test(reply)) {
        setPendingTranscript("");
        setCommand(heard);
        void runActionRef.current();
        return;
      }
      if (/^(nahi|nhi|no|cancel|mat|rehne do|chhodo|chodo)\b/.test(reply)) {
        setPendingTranscript("");
        setCommand(heard);
        cancelAction();
        return;
      }
    }
    setPendingTranscript("");
    setCommand(heard);
    setTarget(null);
    setAttendanceDraft(null);
    const markingAttendance = /mark(ing)? attendance|attendance (mark|save|lagao)|hajiri (lagao|mark)|हाजिरी( लगाओ| दर्ज)|उपस्थिति( दर्ज| लगाओ)|\b(present|absent|leave)\b|अनुपस्थित|गैरहाजिर|छुट्टी/u.test(normalize(heard));
    if (location.pathname === "/teacher/attendance" && canTakeAttendance && markingAttendance) {
      const draft = prepareAttendance(heard, classes, subjects.map((subject) => subject.name), byClass);
      if (typeof draft === "string") {
        setMessage(draft);
        return;
      }
      setAttendanceDraft(draft);
      setMessage("Attendance preview ready hai. Save karne se pehle details verify karein.");
      return;
    }
    // answering Jarvis's question ("class 10 A ki dikhao") is not a page command — unless a page is named
    const answering = awaitingAnswerRef.current && !/\b(page|kholo|khol|open|navigate)\b|खोल|पेज/u.test(normalize(heard));
    const page = answering ? null : findPage(heard);
    const navigationRequest = /open|show|go to|navigate|khol|khul|dikha|dikhaiye|खोल|दिखा|जाओ|पेज/u.test(normalize(heard));
    if (page && navigationRequest && handsFree) {
      navigate(page.href);
      setMessage(`${page.label} page khol diya.`);
    } else if (page && navigationRequest) {
      setTarget(page);
      setMessage(`Main "${page.label}" page kholne ke liye ready hoon.`);
    } else {
      void askAssistant(heard, handsFree);
    }
  };

  // ── "Hey Jarvis" wake word ──────────────────────────────────────────────
  const stopWake = () => {
    const wake = wakeRef.current;
    wakeRef.current = null;
    setWakeActive(false);
    if (wake) {
      wake.onend = null;
      wake.onresult = null;
      wake.onerror = null;
      wake.abort();
    }
  };

  /** Heard "Hey Jarvis": run what followed it, or answer and listen for the command. */
  const onWake = (rest: string) => {
    setOpen(true);
    const Recognition = browserRecognition();
    if (!Recognition) return;
    if (rest.split(/\s+/).filter(Boolean).length >= 2) {
      handleVoiceCommand(rest, true);
      return;
    }
    const startCommand = () => startBrowserListening(Recognition, true);
    if (!voiceReplies || !("speechSynthesis" in window)) {
      startCommand();
      return;
    }
    // say "Haan, boliye" first and only then open the mic, so Jarvis does not hear itself
    const speech = window.speechSynthesis;
    speech.cancel();
    const hello = new SpeechSynthesisUtterance("Haan, boliye");
    hello.lang = "hi-IN";
    const voice = speech.getVoices().find((candidate) => candidate.lang.toLowerCase().startsWith("hi"));
    if (voice) hello.voice = voice;
    let started = false;
    const begin = () => { if (!started) { started = true; startCommand(); } };
    hello.onend = begin;
    hello.onerror = begin;
    window.setTimeout(begin, 2_500); // some phones never fire onend
    speech.speak(hello);
  };

  // the wake recogniser lives across renders; it calls the newest onWake through this ref
  const onWakeRef = useRef(onWake);
  onWakeRef.current = onWake;

  const startWake = () => {
    const Recognition = browserRecognition();
    if (!Recognition || wakeRef.current || recognitionRef.current) return;
    const wake = new Recognition();
    wake.lang = "en-IN";
    wake.continuous = true;
    wake.interimResults = true;
    wake.maxAlternatives = 1;
    wake.onresult = (event) => {
      const latest = event.results[event.results.length - 1];
      const text = latest?.[0]?.transcript ?? "";
      const match = WAKE_PATTERN.exec(text);
      if (!match) return;
      const rest = text.slice((match.index ?? 0) + match[0].length).replace(/^[\s,.!?]+/, "").trim();
      // "Hey Jarvis marks kholo" said in one go: wait for the full sentence before acting
      if (rest && !latest.isFinal) return;
      stopWake();
      wakeRetryDelayRef.current = 400;
      onWakeRef.current(rest);
    };
    wake.onerror = (event) => {
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        setWakeEnabled(false);
        try { localStorage.setItem(WAKE_KEY, "off"); } catch { /* fine */ }
        setMessage("“Hey Jarvis” ke liye microphone permission chahiye. Site settings mein Microphone → Allow karke phir switch on karein.");
      } else if (event.error === "network") {
        wakeRetryDelayRef.current = Math.min(30_000, wakeRetryDelayRef.current * 2);
      }
    };
    wake.onend = () => {
      // the browser ends every session after a while or after silence — start a new one
      wakeRef.current = null;
      setWakeActive(false);
      setWakeTick((tick) => tick + 1);
    };
    try {
      wake.start();
      wakeRef.current = wake;
      setWakeActive(true);
    } catch {
      setWakeTick((tick) => tick + 1);
    }
  };

  // Jarvis asked back in hands-free mode: once it has finished speaking, listen for the answer
  // (no need to say "Hey Jarvis" again)
  useEffect(() => {
    if (thinking || listening || !listenAfterReplyRef.current) return;
    listenAfterReplyRef.current = false;
    const Recognition = browserRecognition();
    if (!Recognition || engine !== "browser") return;
    let speechStarted = false;
    let waited = 0;
    let timer = 0;
    const check = () => {
      const speaking = "speechSynthesis" in window && window.speechSynthesis.speaking;
      if (speaking) speechStarted = true;
      waited += 250;
      // speech finished, or it never started (voice replies off) — or give up waiting after 15 s
      if ((!speaking && (speechStarted || waited >= 1_500)) || waited >= 15_000) {
        startBrowserListening(Recognition, true);
        return;
      }
      timer = window.setTimeout(check, 250);
    };
    timer = window.setTimeout(check, 250);
    return () => window.clearTimeout(timer);
    // startBrowserListening only uses refs and setters
  }, [thinking, listening, engine]);

  const busy = listening || thinking || transcribing || savingAttendance;
  useEffect(() => {
    if (!wakeEnabled || !wakeAvailable) {
      stopWake();
      return;
    }
    if (busy) {
      stopWake();
      return;
    }
    // wait while Jarvis is talking, otherwise it may hear its own reply
    const timer = window.setTimeout(function tryStart() {
      if ("speechSynthesis" in window && window.speechSynthesis.speaking) {
        timer2 = window.setTimeout(tryStart, 600);
        return;
      }
      startWake();
    }, wakeRetryDelayRef.current);
    let timer2: number | undefined;
    return () => {
      window.clearTimeout(timer);
      if (timer2 !== undefined) window.clearTimeout(timer2);
    };
    // startWake/stopWake only touch refs and setters, so they are not dependencies
  }, [wakeEnabled, wakeAvailable, busy, wakeTick]);

  const getSpeechWorker = () => {
    if (!speechWorkerRef.current) {
      const worker = new Worker(new URL("./speechWorker.ts", import.meta.url), { type: "module" });
      worker.onmessage = (event: MessageEvent<SpeechWorkerMessage>) => {
        const result = event.data;
        if (result.type === "progress") {
          if (result.progress !== null) setSpeechProgress(result.progress);
          setSpeechFile(result.file);
          setMessage(result.progress === null
            ? `Local Whisper model file check ho rahi hai: ${result.file}`
            : `Pehli baar local speech model download ho raha hai (${Math.round(result.progress)}%). Mic audio device se bahar nahi bheja jata.`);
        } else if (result.type === "result") {
          transcriptionRef.current?.resolve(result.text);
          transcriptionRef.current = null;
        } else if (result.type === "error") {
          transcriptionRef.current?.reject(new Error(result.message));
          transcriptionRef.current = null;
        }
      };
      worker.onerror = () => {
        transcriptionRef.current?.reject(new Error("Local speech model load nahi hua. Internet connection check karke dobara try karein."));
        transcriptionRef.current = null;
      };
      speechWorkerRef.current = worker;
    }
    return speechWorkerRef.current;
  };

  const transcribeAudio = async (audio: Float32Array) => {
    const energy = audio.reduce((sum, sample) => sum + sample * sample, 0) / audio.length;
    if (!audio.length || Math.sqrt(energy) < 0.0015) {
      setMessage("Mic recording mein awaaz bahut halki hai. Live meter dekhein, headset mic select karein aur mic ke paas bolkar try karein.");
      return;
    }
    const worker = getSpeechWorker();
    setTranscribing(true);
    setSpeechProgress(null);
    setSpeechFile("");
    setMessage("Local Whisper audio samajh raha hai. Pehli baar model download ho sakta hai…");
    try {
      const heard = await new Promise<string>((resolve, reject) => {
        transcriptionRef.current = { resolve, reject };
        worker.postMessage({ type: "transcribe", audio, language: speechLanguage }, [audio.buffer]);
      });
      if (!heard) {
        setMessage("Awaaz samajh nahi aayi. Mic ke paas saaf aur thoda dheere bolkar dobara try karein.");
        return;
      }
      setPendingTranscript(heard);
      setMessage("Transcript check karein. Zaroorat ho to text edit karke phir Jarvis ko bhejein.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Local voice input process nahi ho paya.");
    } finally {
      setTranscribing(false);
      setSpeechProgress(null);
    }
  };

  const audioToMono16k = async (recording: Float32Array, sampleRate: number) => {
    const duration = recording.length / sampleRate;
    if (duration < 0.3) throw new Error("Mic se bahut kam audio capture hua. Bolkar kam se kam 2–3 second record karein.");
    const offline = new OfflineAudioContext(1, Math.ceil(duration * 16_000), 16_000);
    const buffer = offline.createBuffer(1, recording.length, sampleRate);
    buffer.getChannelData(0).set(recording);
    const source = offline.createBufferSource();
    source.buffer = buffer;
    source.connect(offline.destination);
    source.start();
    return (await offline.startRendering()).getChannelData(0).slice();
  };

  const startAudioMeter = async (stream: MediaStream) => {
    const context = new AudioContext();
    meterContextRef.current = context;
    await context.resume();
    const analyser = context.createAnalyser();
    analyser.fftSize = 1024;
    const source = context.createMediaStreamSource(stream);
    const processor = context.createScriptProcessor(4096, 1, 1);
    const mutedOutput = context.createGain();
    mutedOutput.gain.value = 0;
    source.connect(analyser);
    source.connect(processor);
    processor.connect(mutedOutput);
    mutedOutput.connect(context.destination);
    processor.onaudioprocess = (event) => {
      if (recordingPcmActiveRef.current) {
        recordingPcmChunksRef.current.push(new Float32Array(event.inputBuffer.getChannelData(0)));
      }
    };
    const samples = new Float32Array(analyser.fftSize);
    let lastUpdate = 0;
    const measure = (timestamp: number) => {
      analyser.getFloatTimeDomainData(samples);
      let sum = 0;
      for (const sample of samples) sum += sample * sample;
      const rms = Math.sqrt(sum / samples.length);
      const decibels = rms > 0 ? 20 * Math.log10(rms) : -100;
      if (timestamp - lastUpdate >= 100) {
        setAudioLevel(Math.max(0, Math.min(1, (decibels + 60) / 60)));
        lastUpdate = timestamp;
      }
      meterFrameRef.current = window.requestAnimationFrame(measure);
    };
    meterFrameRef.current = window.requestAnimationFrame(measure);
  };

  const stopAudioMeter = () => {
    if (meterFrameRef.current !== null) {
      window.cancelAnimationFrame(meterFrameRef.current);
      meterFrameRef.current = null;
    }
    void meterContextRef.current?.close();
    meterContextRef.current = null;
    setAudioLevel(0);
  };

  /** Fast path: the browser's speech service gives live text in a second or two. */
  const startBrowserListening = (Recognition: RecognitionConstructor, handsFree = false) => {
    stopWake();
    setCommand("");
    setPendingTranscript("");
    setLiveTranscript("");
    setTarget(null);
    setAttendanceDraft(null);
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    const recognition = new Recognition();
    recognition.lang = speechLanguage === "hindi" ? "hi-IN" : "en-IN";
    // Android Chrome repeats words in continuous mode; there it stops by itself after a pause.
    recognition.continuous = !/android/i.test(navigator.userAgent);
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognitionTextRef.current = "";
    let failed = false;
    recognition.onresult = (event) => {
      let text = "";
      for (let index = 0; index < event.results.length; index++) text += ` ${event.results[index][0]?.transcript ?? ""}`;
      recognitionTextRef.current = text.replace(/\s+/g, " ").trim();
      setLiveTranscript(recognitionTextRef.current);
    };
    recognition.onerror = (event) => {
      if (event.error === "aborted") return;
      failed = true;
      setMessage(RECOGNITION_ERRORS[event.error] ?? `Voice input nahi chala (${event.error}). Dobara try karein.`);
    };
    recognition.onend = () => {
      recognitionRef.current = null;
      if (recordingTimerRef.current !== null) {
        window.clearTimeout(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }
      setListening(false);
      setLiveTranscript("");
      const heard = recognitionTextRef.current;
      if (heard && handsFree) {
        handleVoiceCommand(heard, true);
      } else if (heard) {
        setPendingTranscript(heard);
        setMessage("Transcript check karein. Zaroorat ho to text edit karke phir Jarvis ko bhejein.");
      } else if (!failed) {
        setMessage(RECOGNITION_ERRORS["no-speech"]);
      }
    };
    try {
      recognition.start();
    } catch (error) {
      setMessage(error instanceof Error ? `Voice input start nahi hua: ${error.message}` : "Voice input start nahi hua.");
      return;
    }
    recognitionRef.current = recognition;
    setListening(true);
    setMessage(handsFree ? "Boliye…" : "Boliye… bolna khatam ho to mic button dabayein.");
    recordingTimerRef.current = window.setTimeout(() => recognitionRef.current?.stop(), 20_000);
  };

  const startListening = async () => {
    stopWake();
    const Recognition = engine === "browser" ? browserRecognition() : null;
    if (Recognition) {
      startBrowserListening(Recognition);
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setMessage("Is browser mein mic recording available nahi hai. Updated Chrome ya Edge use karein.");
      return;
    }
    setCommand("");
    setPendingTranscript("");
    setTarget(null);
    setAttendanceDraft(null);
    setMessage("Microphone se awaaz record hogi, phir isi device par local Whisper usse text banayega.");
    try {
      let activeDeviceId = selectedAudioInput;
      const audio: MediaTrackConstraints = activeDeviceId
        ? { deviceId: { exact: activeDeviceId }, echoCancellation: true, noiseSuppression: true, autoGainControl: true }
        : { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
      let stream = await navigator.mediaDevices.getUserMedia({ audio });
      const devices = await navigator.mediaDevices.enumerateDevices();
      const inputs = devices
        .filter((device) => device.kind === "audioinput")
        .map((device) => ({ deviceId: device.deviceId, label: device.label || "Microphone" }));
      setAudioInputs(inputs);
      if (!activeDeviceId) {
        const bluetoothHeadset = inputs.find((input) =>
          /bluetooth/i.test(input.label) && /headset|headphone|airpod|airpods|airdopes/i.test(input.label),
        );
        if (bluetoothHeadset) {
          activeDeviceId = bluetoothHeadset.deviceId;
          stream.getTracks().forEach((track) => track.stop());
          stream = await navigator.mediaDevices.getUserMedia({
            audio: {
              deviceId: { exact: activeDeviceId },
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
            },
          });
          setSelectedAudioInput(activeDeviceId);
        }
      }
      mediaStreamRef.current = stream;
      recordingPcmChunksRef.current = [];
      recordingPcmActiveRef.current = true;
      await startAudioMeter(stream);
      setListening(true);
      const activeLabel = inputs.find((input) => input.deviceId === activeDeviceId)?.label;
      setMessage(`${activeLabel ? `${activeLabel} se` : "Microphone se"} recording ho rahi hai. Bolne ke baad mic button dabakar rokein.`);
      recordingTimerRef.current = window.setTimeout(() => {
        if (recordingPcmActiveRef.current) {
          setMessage("20-second recording limit poori hui. Local transcription shuru ho rahi hai…");
          stopListening();
        }
      }, 20_000);
    } catch (error) {
      recordingPcmActiveRef.current = false;
      stopAudioMeter();
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
      setListening(false);
      const denied = error instanceof DOMException && (error.name === "NotAllowedError" || error.name === "SecurityError");
      setMessage(denied
        ? "Microphone permission allow karein. Local site ko localhost par kholein, phir dobara try karein."
        : error instanceof Error ? `Microphone start nahi hua: ${error.message}` : "Microphone start nahi hua.");
    }
  };

  const stopListening = () => {
    if (recordingTimerRef.current !== null) {
      window.clearTimeout(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    if (recognitionRef.current) {
      // onend delivers the transcript
      recognitionRef.current.stop();
      return;
    }
    if (!recordingPcmActiveRef.current) return;
    recordingPcmActiveRef.current = false;
    setListening(false);
    const context = meterContextRef.current;
    const sampleRate = context?.sampleRate ?? 48_000;
    const chunks = recordingPcmChunksRef.current;
    recordingPcmChunksRef.current = [];
    const sampleCount = chunks.reduce((total, chunk) => total + chunk.length, 0);
    const recording = new Float32Array(sampleCount);
    let offset = 0;
    for (const chunk of chunks) {
      recording.set(chunk, offset);
      offset += chunk.length;
    }
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
    stopAudioMeter();
    void audioToMono16k(recording, sampleRate)
      .then((audio) => transcribeAudio(audio))
      .catch((error: unknown) => {
        setMessage(error instanceof Error ? error.message : "Captured mic audio process nahi ho paya.");
      });
  };

  const confirmAttendance = async () => {
    if (!attendanceDraft || savingAttendance) return;
    setSavingAttendance(true);
    try {
      const saved = await recordVoiceAttendance(
        attendanceDraft.className,
        attendanceDraft.date,
        attendanceDraft.subject,
        attendanceDraft.statuses,
      );
      if (!saved) {
        setMessage("Is date ke timetable mein yeh subject/class period nahi mila. Attendance save nahi hui.");
        return;
      }
      setMessage(`${attendanceDraft.className} ${attendanceDraft.subject} ki attendance save ho gayi.`);
      setAttendanceDraft(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Attendance save nahi ho payi. Dobara try karein.");
    } finally {
      setSavingAttendance(false);
    }
  };

  const confirmNavigation = () => {
    if (!target) return;
    navigate(target.href);
    setMessage(`${target.label} page khol diya.`);
    setCommand("");
    setTarget(null);
  };

  return (
    <div className="fixed bottom-24 right-4 z-50 flex flex-col items-end gap-3 lg:bottom-6 lg:right-6">
      {open && (
        <section
          aria-label="Voice assistant"
          className="w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-xl"
        >
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold">Jarvis · ERP Assistant</p>
              <p className="text-xs text-muted-foreground">Local AI · page Q&A · {engine === "browser" ? "fast voice" : "on-device voice"}{canTakeAttendance ? " + attendance" : ""}</p>
            </div>
            <div className="flex shrink-0 items-center">
              <Button
                variant="ghost"
                size="icon"
                aria-label={voiceReplies ? "Mute voice replies" : "Enable voice replies"}
                title={voiceReplies ? "Mute voice replies" : "Enable voice replies"}
                onClick={() => {
                  if (voiceReplies && "speechSynthesis" in window) window.speechSynthesis.cancel();
                  setVoiceReplies((enabled) => !enabled);
                }}
              >
                {voiceReplies ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
              </Button>
              <Button variant="ghost" size="icon" aria-label="Close voice assistant" onClick={() => setOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="space-y-3 p-4">
            <p className="text-sm text-muted-foreground">
              Mic dabakar boliye ya likhiye. Jaise “Aakash Tiwari ki fees kitni baaki hai”, “Class 10 B mein kiski fees baaki hai”, “aaj kaun staff chhutti pe hai”, ya “marks page kholo”.
            </p>
            {modelStatus && (
              <p role="status" className={cn("rounded-lg p-3 text-xs", modelStatus.available ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "bg-amber-500/10 text-amber-800 dark:text-amber-300")}>
                {modelStatus.message}
              </p>
            )}
            {canTakeAttendance && location.pathname === "/teacher/attendance" && (
              <p className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">
                Attendance ke liye boliye: “Class 10 A Science attendance, sab present, Rohan absent”. Har student ka status dena zaroori hai—save poora register replace karta hai.
              </p>
            )}
            <label className="block space-y-1 text-xs">
              <span className="font-medium">Speech engine</span>
              <select
                aria-label="Speech engine"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                value={engine}
                disabled={listening || transcribing}
                onChange={(event) => {
                  const next: SpeechEngine = event.target.value === "local" ? "local" : "browser";
                  setEngine(next);
                  setSpeechLanguage(next === "browser" ? "english" : "hindi");
                  try { localStorage.setItem(ENGINE_KEY, next); } catch { /* not saved — fine */ }
                }}
              >
                <option value="browser" disabled={!browserSpeechSupported}>
                  Fast — browser speech (online){browserSpeechSupported ? "" : " · not supported here"}
                </option>
                <option value="local">Private — on-device Whisper (slow)</option>
              </select>
            </label>
            <label className={cn("flex items-start gap-3 rounded-lg border border-border p-3 text-xs", !wakeAvailable && "opacity-60")}>
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 accent-primary"
                checked={wakeEnabled && wakeAvailable}
                disabled={!wakeAvailable}
                onChange={(event) => {
                  const on = event.target.checked;
                  setWakeEnabled(on);
                  try { localStorage.setItem(WAKE_KEY, on ? "on" : "off"); } catch { /* fine */ }
                  setMessage(on ? "“Hey Jarvis” on hai. Boliye “Hey Jarvis”, ya seedha “Hey Jarvis, marks page kholo”." : "“Hey Jarvis” band kar diya.");
                }}
              />
              <span className="space-y-0.5">
                <span className="block text-sm font-medium">“Hey Jarvis” se jagao</span>
                <span className="block text-muted-foreground">
                  {wakeAvailable
                    ? "Mic is page par hamesha sunta rahega (Fast engine — awaaz browser speech service ko jaati hai). Laptop Chrome par sabse accha chalta hai."
                    : "Iske liye Chrome mein “Fast — browser speech” engine chahiye."}
                </span>
              </span>
            </label>
            {engine === "local" && audioInputs.length > 0 && (
              <label className="block space-y-1 text-xs">
                <span className="font-medium">Microphone</span>
                <select
                  aria-label="Choose microphone"
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  value={selectedAudioInput}
                  disabled={listening || transcribing}
                  onChange={(event) => setSelectedAudioInput(event.target.value)}
                >
                  <option value="">Default microphone</option>
                  {audioInputs.map((input) => (
                    <option key={input.deviceId} value={input.deviceId}>{input.label}</option>
                  ))}
                </select>
              </label>
            )}
            <label className="block space-y-1 text-xs">
              <span className="font-medium">Speech language</span>
              <select
                aria-label="Speech language"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                value={speechLanguage}
                disabled={listening || transcribing}
                onChange={(event) => {
                  const language = event.target.value;
                  if (language === "auto" || language === "hindi" || language === "english") {
                    setSpeechLanguage(language);
                  }
                }}
              >
                {engine === "browser" ? (
                  <>
                    <option value="english">Hinglish / English — Roman script (recommended)</option>
                    <option value="hindi">Hindi — देवनागरी script</option>
                  </>
                ) : (
                  <>
                    <option value="hindi">Hindi / Hinglish (recommended)</option>
                    <option value="auto">Auto-detect</option>
                    <option value="english">English</option>
                  </>
                )}
              </select>
            </label>
            {listening && engine === "browser" && (
              <p aria-live="polite" className="min-h-10 rounded-lg border border-dashed border-primary/50 bg-primary/5 p-3 text-sm">
                {liveTranscript || <span className="text-muted-foreground">Sun raha hoon…</span>}
              </p>
            )}
            {listening && engine === "local" && (
              <div aria-label={`Microphone input level ${Math.round(audioLevel * 100)} percent`} className="space-y-1">
                <div className="h-2 overflow-hidden rounded-full bg-muted" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(audioLevel * 100)}>
                  <div className="h-full bg-emerald-500 transition-[width]" style={{ width: `${audioLevel * 100}%` }} />
                </div>
                <p className="text-xs text-muted-foreground">
                  {audioLevel < 0.12 ? "Mic level low — microphone ke paas boliye ya doosra mic select karein." : "Mic awaaz le raha hai."}
                </p>
              </div>
            )}
            {pendingTranscript && (
              <div className="space-y-2 rounded-lg border border-border p-3">
                <label className="block space-y-1 text-sm font-medium" htmlFor="jarvis-transcript">
                  Transcript — sahi karke bhej sakte hain
                  <Textarea
                    id="jarvis-transcript"
                    value={pendingTranscript}
                    onChange={(event) => setPendingTranscript(event.target.value)}
                    rows={2}
                    maxLength={2000}
                  />
                </label>
                <Button className="w-full" disabled={!pendingTranscript.trim()} onClick={() => handleVoiceCommand(pendingTranscript.trim())}>
                  Use transcript
                </Button>
              </div>
            )}
            {command && !pendingTranscript && <p className="rounded-lg bg-muted p-3 text-sm"><span className="font-medium">Aapne kaha:</span> {command}</p>}
            {message && <p role="status" aria-live="polite" className="text-sm">{message}</p>}
            {speechProgress !== null && (
              <div
                role="progressbar"
                aria-label={`Local speech model download${speechFile ? `: ${speechFile}` : ""}`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(speechProgress)}
                className="h-1.5 overflow-hidden rounded-full bg-muted"
              >
                <div className="h-full bg-primary transition-[width]" style={{ width: `${speechProgress}%` }} />
              </div>
            )}
            {chat.length > 0 && (
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span title="Is samay ke baad baatein apne aap delete ho jaati hain">
                  Memory: {savedCount} messages · {memoryMinutes % 60 === 0 ? `${memoryMinutes / 60} ghante` : `${memoryMinutes} minute`} baad apne aap delete
                </span>
                <button
                  type="button"
                  className="font-medium text-destructive hover:underline disabled:opacity-50"
                  disabled={thinking}
                  onClick={() => { if (window.confirm("Jarvis ki saari purani baatein mita dein?")) void clearMemory(); }}
                >
                  Memory clear karo
                </button>
              </div>
            )}
            {chat.length > 0 && (
              <div ref={chatBoxRef} className="max-h-72 space-y-2 overflow-y-auto rounded-lg border border-border p-3">
                {chat.map((item, index) => (
                  <p key={`${index}-${item.role}`} className={cn("whitespace-pre-wrap text-sm", item.role === "assistant" ? "text-foreground" : "text-muted-foreground")}>
                    <span className="font-medium">{item.role === "assistant" ? "Jarvis: " : "Aap: "}</span>{item.content}
                    {item.fromData && (
                      <span className="ml-1.5 inline-block rounded bg-emerald-500/10 px-1.5 py-0.5 align-middle text-[10px] font-medium text-emerald-700 dark:text-emerald-400">
                        ERP data se
                      </span>
                    )}
                  </p>
                ))}
                {thinking && <p className="flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="h-4 w-4 animate-spin" /> Local model jawab bana raha hai…</p>}
              </div>
            )}
            <form
              className="space-y-2"
              onSubmit={(event) => {
                event.preventDefault();
                void askAssistant(draftMessage);
              }}
            >
              <Textarea
                value={draftMessage}
                onChange={(event) => setDraftMessage(event.target.value)}
                placeholder="Kuch bhi poochhein — jaise “Aakash ki fees kitni baaki hai?”"
                aria-label="Ask the local ERP assistant"
                rows={2}
                maxLength={2000}
                disabled={thinking}
              />
              <Button className="w-full" type="submit" disabled={!draftMessage.trim() || thinking}>
                {thinking ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {thinking ? "Soch raha hai…" : "Ask assistant"}
              </Button>
              <div className="flex flex-wrap gap-1.5">
                {["Good morning — aaj ka briefing", "Aaj ka timetable", "Agli chhutti kab hai?", "Kya yaad hai?"].map((quick) => (
                  <button
                    key={quick}
                    type="button"
                    disabled={thinking}
                    className="rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted disabled:opacity-50"
                    onClick={() => void askAssistant(quick)}
                  >
                    {quick}
                  </button>
                ))}
              </div>
            </form>
            {pendingAction && (
              <div className="space-y-2 rounded-lg border-2 border-amber-500/60 bg-amber-500/5 p-3">
                <p className="text-sm font-semibold">{pendingAction.title}</p>
                <p className="text-sm">{pendingAction.summary}</p>
                <p className="text-xs text-muted-foreground">Confirm karne par hi kaam hoga — ERP ke normal niyam aur audit log lagenge.</p>
                <div className="flex gap-2">
                  <Button className="flex-1" disabled={runningAction} onClick={() => void runAction()}>
                    {runningAction ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} {pendingAction.confirm}
                  </Button>
                  <Button variant="outline" disabled={runningAction} onClick={cancelAction}>Cancel</Button>
                </div>
              </div>
            )}
            {target && (
              <div className="flex gap-2">
                <Button className="flex-1" onClick={confirmNavigation}>
                  <Check className="h-4 w-4" /> Haan, page kholo
                </Button>
                <Button variant="outline" onClick={() => { setTarget(null); setMessage("Theek hai, action cancel kar diya."); }}>
                  Cancel
                </Button>
              </div>
            )}
            {attendanceDraft && (
              <div className="space-y-3 rounded-lg border border-border p-3">
                <p className="text-sm font-semibold">Attendance save karne se pehle check karein</p>
                <p className="text-sm">{attendanceDraft.className} · {attendanceDraft.subject} · {attendanceDraft.date}</p>
                <p className="text-xs text-muted-foreground">
                  {attendanceDraft.present} present · {attendanceDraft.absent} absent · {attendanceDraft.leave} leave · {Object.keys(attendanceDraft.statuses).length} students
                </p>
                <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
                  {attendanceDraft.replacesExisting
                    ? "Is class/subject ka aaj ka register maujood hai; confirm karne par poora register replace hoga."
                    : "Confirm karne par is class/subject ka poora register save hoga."}
                </p>
                {(attendanceDraft.absentNames.length > 0 || attendanceDraft.leaveNames.length > 0) && (
                  <p className="text-xs text-muted-foreground">
                    {attendanceDraft.absentNames.length > 0 && <>Absent: {attendanceDraft.absentNames.join(", ")}. </>}
                    {attendanceDraft.leaveNames.length > 0 && <>Leave: {attendanceDraft.leaveNames.join(", ")}.</>}
                  </p>
                )}
                <div className="flex gap-2">
                  <Button className="flex-1" disabled={savingAttendance} onClick={() => void confirmAttendance()}>
                    <Check className="h-4 w-4" /> {savingAttendance ? "Saving…" : "Haan, save attendance"}
                  </Button>
                  <Button variant="outline" disabled={savingAttendance} onClick={() => { setAttendanceDraft(null); setMessage("Attendance cancel kar di."); }}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              {engine === "browser"
                ? "Fast mode: awaaz browser ki speech service (Chrome mein Google) text mein badalti hai, isliye internet chahiye. Awaaz device se bahar na jaye, iske liye “Private — on-device” chunein."
                : "Private mode: local Whisper awaaz ko isi device par text mein badalta hai; pehli baar speech model download hota hai. Audio server ya speech API ko nahi bheja jata."}
              {" "}Record badalne ke liye supported ERP flow aur confirmation zaroori hai.
            </p>
          </div>
        </section>
      )}
      <Button
        type="button"
        size="lg"
        aria-label={listening ? "Stop voice input" : transcribing ? "Transcribing voice input" : "Open voice assistant"}
        aria-expanded={open}
        disabled={transcribing}
        className={cn("h-12 rounded-full px-4 shadow-lg", (listening || transcribing) && "animate-pulse")}
        onClick={() => {
          setOpen(true);
          if (listening) {
            stopListening();
          } else {
            void startListening();
          }
        }}
      >
        {listening ? <MicOff className="h-5 w-5" /> : transcribing ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <Mic className="h-5 w-5" />}
        <span>{listening ? "Listening…" : transcribing ? "Transcribing…" : "Jarvis"}</span>
        {wakeActive && !listening && (
          <span className="relative flex h-2.5 w-2.5" title="“Hey Jarvis” sun raha hai">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400" />
          </span>
        )}
        {!listening && !transcribing && <Navigation className="h-4 w-4 opacity-70" />}
      </Button>
    </div>
  );
}
