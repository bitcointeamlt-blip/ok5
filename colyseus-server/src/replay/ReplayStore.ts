import fs from "node:fs/promises";
import path from "node:path";

import type { ReplayV1 } from "./ReplayTypes";

function safeId(id: string): string {
  const cleaned = (id || "").trim();
  if (!cleaned) return "";
  // allow a-zA-Z0-9 _ -
  return cleaned.replace(/[^a-zA-Z0-9_-]/g, "_");
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

  filePathForId(id: string): { id: string; filePath: string; fileName: string } {
    const sid = safeId(id);
    if (!sid) throw new Error("Invalid replay id");
    const fileName = `${sid}.json`;
    return { id: sid, fileName, filePath: path.join(this.dir, fileName) };
  }

  async write(replay: ReplayV1): Promise<void> {
    await this.ensureDir();
    const { filePath } = this.filePathForId(replay.id);
    const tmp = filePath + ".tmp";
    const body = JSON.stringify(replay);
    await fs.writeFile(tmp, body, "utf8");
    await fs.rename(tmp, filePath);
  }

  async read(id: string): Promise<ReplayV1> {
    await this.ensureDir();
    const { filePath } = this.filePathForId(id);
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as ReplayV1;
  }

  async list(limit = 50): Promise<ReplayListItem[]> {
    await this.ensureDir();
    const files = await fs.readdir(this.dir);
    const items: ReplayListItem[] = [];
    for (const f of files) {
      if (!f.endsWith(".json")) continue;
      const id = f.replace(/\.json$/i, "");
      try {
        const st = await fs.stat(path.join(this.dir, f));
        items.push({ id, file: f, sizeBytes: st.size, modifiedAt: st.mtimeMs });
      } catch {
        // ignore
      }
    }
    items.sort((a, b) => b.modifiedAt - a.modifiedAt);
    return items.slice(0, Math.max(1, Math.min(200, Math.floor(limit) || 50)));
  }
}

export const replayStore = new ReplayStore();


