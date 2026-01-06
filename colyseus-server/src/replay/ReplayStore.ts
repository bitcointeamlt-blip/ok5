import fs from "node:fs/promises";
import path from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { ReplayV1 } from "./ReplayTypes";

function safeId(id: string): string {
  const cleaned = (id || "").trim();
  if (!cleaned) return "";
  // allow a-zA-Z0-9 _ -
  return cleaned.replace(/[^a-zA-Z0-9_-]/g, "_");
}

type ReplayStoreMode = "local" | "supabase" | "both";

function envReplayStoreMode(): ReplayStoreMode {
  const raw = String(process.env.REPLAY_STORE || "").trim().toLowerCase();
  if (raw === "supabase") return "supabase";
  if (raw === "both") return "both";
  return "local";
}

function envReplaySupabaseBucket(): string {
  return (process.env.REPLAY_SUPABASE_BUCKET || "").trim() || "pvp-replays";
}

let _sb: SupabaseClient | null = null;
function getSupabase(): SupabaseClient | null {
  if (_sb) return _sb;
  const url = (process.env.SUPABASE_URL || "").trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!url || !key) return null;
  _sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return _sb;
}

export type ReplayListItem = {
  id: string;
  file: string;
  sizeBytes: number;
  modifiedAt: number;
};

export class ReplayStore {
  private dir: string;
  private ensured = false;
  private ensuredBucket = false;

  constructor(dir?: string) {
    const envDir = (process.env.REPLAY_DIR || "").trim();
    this.dir = dir || envDir || path.join(process.cwd(), "replays");
  }

  getDir(): string {
    return this.dir;
  }

  private async ensureDir(): Promise<void> {
    if (this.ensured) return;
    await fs.mkdir(this.dir, { recursive: true });
    this.ensured = true;
  }

  private async ensureBucket(): Promise<void> {
    if (this.ensuredBucket) return;
    const client = getSupabase();
    if (!client) return;
    const bucket = envReplaySupabaseBucket();
    try {
      const { data, error } = await client.storage.getBucket(bucket);
      if (!error && data) {
        this.ensuredBucket = true;
        return;
      }
    } catch {
      // continue to create attempt
    }
    try {
      await client.storage.createBucket(bucket, { public: false });
    } catch {
      // ignore (bucket may already exist or may be restricted by project settings)
    }
    this.ensuredBucket = true;
  }

  filePathForId(id: string): { id: string; filePath: string; fileName: string } {
    const sid = safeId(id);
    if (!sid) throw new Error("Invalid replay id");
    const fileName = `${sid}.json`;
    return { id: sid, fileName, filePath: path.join(this.dir, fileName) };
  }

  async write(replay: ReplayV1): Promise<void> {
    const mode = envReplayStoreMode();
    const { id, filePath, fileName } = this.filePathForId(replay.id);
    const body = JSON.stringify(replay);

    // Local filesystem
    if (mode === "local" || mode === "both") {
      await this.ensureDir();
      const tmp = filePath + ".tmp";
      await fs.writeFile(tmp, body, "utf8");
      await fs.rename(tmp, filePath);
    }

    // Supabase Storage (persistent across redeploys)
    if (mode === "supabase" || mode === "both") {
      const client = getSupabase();
      if (!client) return;
      await this.ensureBucket();
      const bucket = envReplaySupabaseBucket();
      const objectPath = fileName; // store at bucket root
      const { error } = await client.storage.from(bucket).upload(objectPath, body, {
        upsert: true,
        contentType: "application/json",
        cacheControl: "60"
      });
      if (error) {
        // If upload fails, don't throw — local mode may still have succeeded.
        // But in supabase-only mode, we do want to signal failure.
        if (mode === "supabase") throw new Error(error.message);
      }
      // Best-effort: keep local dir clean/id safe behavior in supabase mode too.
      void id;
    }
  }

  async read(id: string): Promise<ReplayV1> {
    const mode = envReplayStoreMode();
    const { filePath, fileName } = this.filePathForId(id);

    // Try local first (fast path)
    if (mode === "local" || mode === "both") {
      await this.ensureDir();
      try {
        const raw = await fs.readFile(filePath, "utf8");
        return JSON.parse(raw) as ReplayV1;
      } catch (e: any) {
        // fall through to supabase if enabled
        if (mode === "local") throw e;
      }
    }

    // Supabase fallback
    if (mode === "supabase" || mode === "both") {
      const client = getSupabase();
      if (!client) throw new Error("supabase_not_configured");
      await this.ensureBucket();
      const bucket = envReplaySupabaseBucket();
      const { data, error } = await client.storage.from(bucket).download(fileName);
      if (error || !data) throw new Error(error?.message || "not_found");
      const raw = await data.text();
      return JSON.parse(raw) as ReplayV1;
    }

    // Should never happen
    throw new Error("replay_store_unavailable");
  }

  async list(limit = 50): Promise<ReplayListItem[]> {
    const mode = envReplayStoreMode();
    const outLimit = Math.max(1, Math.min(200, Math.floor(limit) || 50));

    // Local list
    if (mode === "local") {
      await this.ensureDir();
      const files = await fs.readdir(this.dir);
      const items: ReplayListItem[] = [];
      for (const f of files) {
        if (!f.endsWith(".json")) continue;
        const rid = f.replace(/\.json$/i, "");
        try {
          const st = await fs.stat(path.join(this.dir, f));
          items.push({ id: rid, file: f, sizeBytes: st.size, modifiedAt: st.mtimeMs });
        } catch {
          // ignore
        }
      }
      items.sort((a, b) => b.modifiedAt - a.modifiedAt);
      return items.slice(0, outLimit);
    }

    // Supabase list (or both -> prefer supabase as source of truth)
    const client = getSupabase();
    if (!client) return [];
    await this.ensureBucket();
    const bucket = envReplaySupabaseBucket();
    const { data, error } = await client.storage.from(bucket).list("", {
      limit: outLimit,
      sortBy: { column: "updated_at", order: "desc" }
    } as any);
    if (error || !data) return [];
    const items: ReplayListItem[] = [];
    for (const obj of data as any[]) {
      const name = String(obj?.name || "");
      if (!name.endsWith(".json")) continue;
      const rid = name.replace(/\.json$/i, "");
      const updatedAt = Date.parse(String(obj?.updated_at || obj?.created_at || "")) || 0;
      items.push({ id: rid, file: name, sizeBytes: 0, modifiedAt: updatedAt });
    }
    return items.slice(0, outLimit);
  }
}

export const replayStore = new ReplayStore();


