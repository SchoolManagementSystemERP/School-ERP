/// <reference lib="webworker" />

import { env, pipeline } from "@huggingface/transformers";

type TranscriptionRequest = {
  type: "transcribe";
  audio: Float32Array;
  language: "auto" | "hindi" | "english";
};
type WorkerRequest = TranscriptionRequest;

const workerScope = self as DedicatedWorkerGlobalScope;
const MODEL_ID = "onnx-community/whisper-small";

env.allowLocalModels = false;
env.allowRemoteModels = true;
env.useBrowserCache = true;
env.useWasmCache = true;
env.cacheKey = "school-erp-whisper-cache-v3";
if (env.backends.onnx.wasm) env.backends.onnx.wasm.numThreads = 1;

// The model arrives as several files, each reporting its own percentage — which made the bar jump
// between 0 and other values. Sum bytes across all files and never let the shown number go back.
const fileBytes = new Map<string, { loaded: number; total: number }>();
let shownProgress = 0;

function reportProgress(info: unknown) {
  const event = info as { status?: string; file?: string; loaded?: number; total?: number };
  if (!event.file) return;
  if (event.status === "progress" && typeof event.total === "number" && event.total > 0) {
    fileBytes.set(event.file, { loaded: event.loaded ?? 0, total: event.total });
  } else if (event.status === "done") {
    const bytes = fileBytes.get(event.file);
    if (bytes) bytes.loaded = bytes.total;
  } else {
    return;
  }
  let loaded = 0;
  let total = 0;
  for (const bytes of fileBytes.values()) {
    loaded += bytes.loaded;
    total += bytes.total;
  }
  if (!total) return;
  shownProgress = Math.max(shownProgress, Math.min(99, (loaded / total) * 100));
  workerScope.postMessage({ type: "progress", progress: shownProgress, file: event.file });
}

async function createTranscriber() {
  return pipeline("automatic-speech-recognition", MODEL_ID, { dtype: "q8", progress_callback: reportProgress });
}

/** Phone browsers sometimes drop a big download midway — try again a couple of times before giving up. */
async function loadTranscriber() {
  for (let attempt = 1; ; attempt++) {
    try {
      return await createTranscriber();
    } catch (error) {
      if (attempt >= 3) throw error;
      workerScope.postMessage({ type: "progress", progress: null, file: `download ruk gaya — dobara try (${attempt + 1}/3)` });
      await new Promise((resolve) => setTimeout(resolve, 2_000 * attempt));
    }
  }
}

let transcriberPromise: ReturnType<typeof loadTranscriber> | null = null;

workerScope.addEventListener("message", async (event: MessageEvent<WorkerRequest>) => {
  if (event.data.type !== "transcribe") return;
  try {
    transcriberPromise ??= loadTranscriber();
    const transcriber = await transcriberPromise;
    const result = await transcriber(event.data.audio, {
      ...(event.data.language === "auto" ? {} : { language: event.data.language }),
      task: "transcribe",
    });
    workerScope.postMessage({ type: "result", text: result.text.trim() });
  } catch (error) {
    transcriberPromise = null;
    workerScope.postMessage({
      type: "error",
      message: error instanceof Error ? error.message : "Local speech recognition failed.",
    });
  }
});
