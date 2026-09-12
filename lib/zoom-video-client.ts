import type { ZoomVideoConfig } from "./zoom-video-tag";
import type { UniversityConsultationService } from "./online-consultation-settings";
import { normalizeConsultationIntake, type ConsultationIntake } from "./consultation-intake";

type VideoClient = {
  init(options: { entryId: string; name?: string }): Promise<void>;
  startVideo(): void | Promise<void>;
  on(event: string, callback: () => void): void;
};
declare global {
  interface Window {
    VideoClient?: new (options: { env: string }) => VideoClient;
    universityConsultation?: { category: UniversityConsultationService } & Partial<ConsultationIntake>;
  }
}
let sdk: Promise<void> | undefined;
let source: string | undefined;
let active = false;

function loadSdk(config: ZoomVideoConfig): Promise<void> {
  if (source && source !== config.scriptSrc) return Promise.reject(new Error("VIDEO_REGION_MISMATCH"));
  if (sdk) return sdk;
  source = config.scriptSrc;
  sdk = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.type = "module";
    script.src = config.scriptSrc;
    // Neither data-apikey nor data-entry-id: both trigger Zoom's automatic tag mode.
    // The custom-button API discovers the account using init({ entryId }).
    const timer = window.setTimeout(() => fail(), 20_000);
    const fail = () => {
      window.clearTimeout(timer);
      script.remove();
      sdk = undefined;
      source = undefined;
      reject(new Error("VIDEO_SDK_LOAD_FAILED"));
    };
    script.onerror = fail;
    script.onload = () => {
      if (!window.VideoClient) return fail();
      window.clearTimeout(timer);
      resolve();
    };
    document.body.append(script);
  });
  return sdk;
}

/** Keep one active engagement across service buttons and release it on Zoom's end event. */
export async function startZoomVideo(config: ZoomVideoConfig, onEnd: () => void, category: UniversityConsultationService, intake?: ConsultationIntake): Promise<void> {
  if (active) throw new Error("VIDEO_ALREADY_ACTIVE");
  const normalized = intake ? normalizeConsultationIntake(intake) : undefined;
  if (normalized === null) throw new Error("VIDEO_INVALID_INTAKE");
  active = true;
  try {
    // Zoom's website-data variable reads this before the engagement enters the flow.
    window.universityConsultation = { category, ...normalized };
    await loadSdk(config);
    const client = new window.VideoClient!({ env: config.environment });
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      active = false;
      delete window.universityConsultation;
      onEnd();
    };
    client.on("video-end", release);
    client.on("video-click-end", release);
    client.on("video-force-end", release);
    await client.init({ entryId: config.entryId, ...(normalized ? { name: normalized.displayName } : {}) });
    await client.startVideo();
  } catch (error) {
    active = false;
    delete window.universityConsultation;
    throw error;
  }
}
