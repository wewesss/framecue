import type { Item, ItemKind, ItemStatus, Region, RenderEvent, VideoInfo } from "../core/types";

export interface VideoResponse extends VideoInfo {
  sha256: string;
  workspace: string;
}

export interface NewItem {
  kind: ItemKind;
  frameStart: number;
  frameEnd?: number;
  region?: Region | null;
  comment: string;
}

export interface ItemChanges {
  comment?: string;
  status?: ItemStatus;
  priority?: number;
  region?: Region | null;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = init?.body ? { "Content-Type": "application/json" } : undefined;
  const res = await fetch(path, { ...init, headers });
  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      message = `${res.status} ${res.statusText}`;
    }
    throw new Error(message);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  video: () => request<VideoResponse>("/api/video"),
  items: () => request<Item[]>("/api/items"),
  create: (input: NewItem) =>
    request<Item>("/api/items", { method: "POST", body: JSON.stringify(input) }),
  update: (id: string, changes: ItemChanges) =>
    request<Item>(`/api/items/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(changes),
    }),
  remove: (id: string) =>
    request<void>(`/api/items/${encodeURIComponent(id)}`, { method: "DELETE" }),
  recaptureAfter: (id: string) =>
    request<Item>(`/api/items/${encodeURIComponent(id)}/after`, { method: "POST" }),
  reorder: (ids: string[]) =>
    request<Item[]>("/api/items/reorder", { method: "POST", body: JSON.stringify({ ids }) }),
};

export const streamUrl = "/api/video/stream";

export function videoSrc(sha256: string): string {
  return `${streamUrl}?v=${sha256.slice(0, 16)}`;
}

export function subscribeEvents(handlers: {
  render: (event: RenderEvent) => void;
  items: () => void;
}): () => void {
  const source = new EventSource("/api/events");
  source.addEventListener("render", (event) => {
    handlers.render(JSON.parse((event as MessageEvent<string>).data) as RenderEvent);
  });
  source.addEventListener("items", () => handlers.items());
  let opened = false;
  source.addEventListener("open", () => {
    if (opened) handlers.items();
    opened = true;
  });
  return () => source.close();
}
export const peaksUrl = "/api/audio/peaks";

export interface PeaksResponse {
  rate: number;
  data: Int8Array;
}

export async function fetchPeaks(version: string): Promise<PeaksResponse | null> {
  const res = await fetch(`${peaksUrl}?v=${version.slice(0, 16)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  const rate = Number(res.headers.get("X-Peaks-Rate"));
  return { rate, data: new Int8Array(await res.arrayBuffer()) };
}

export function frameImageUrl(image: string): string {
  const [, id, ...name] = image.split("/");
  return `/api/frames/${encodeURIComponent(id ?? "")}/${name.map(encodeURIComponent).join("/")}`;
}
