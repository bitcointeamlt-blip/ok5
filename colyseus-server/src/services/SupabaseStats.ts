import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type SoloStatsSnapshot = {
  dmg: number;
  critChance: number;
  accuracy: number;
  maxHP: number;
  maxArmor: number;
};

let _client: SupabaseClient | null = null;

function getClient(): SupabaseClient | null {
  if (_client) return _client;
  const url = process.env.SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!url || !key) return null;
  _client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _client;
}

type CacheEntry = { at: number; stats: SoloStatsSnapshot | null };
const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60_000;

export async function fetchSoloStatsForAddress(address: string): Promise<SoloStatsSnapshot | null> {
  const addr = (address || "").trim();
  if (!addr) return null;

  const now = Date.now();
  const c = cache.get(addr);
  if (c && (now - c.at) < CACHE_TTL_MS) return c.stats;

  const client = getClient();
  if (!client) return null;

  try {
    const { data, error } = await client
      .from("profiles")
      .select("solo_data")
      .eq("ronin_address", addr)
      .single();
    if (error) {
      cache.set(addr, { at: now, stats: null });
      return null;
    }
    const solo: any = (data as any)?.solo_data;
    if (!solo || typeof solo !== "object") {
      cache.set(addr, { at: now, stats: null });
      return null;
    }
    const upgrades: any = solo.upgrades || {};
    const out: SoloStatsSnapshot = {
      dmg: typeof solo.dmg === "number" && Number.isFinite(solo.dmg) ? solo.dmg : 1,
      critChance: typeof upgrades.critChance === "number" && Number.isFinite(upgrades.critChance) ? upgrades.critChance : 4,
      accuracy: typeof upgrades.accuracy === "number" && Number.isFinite(upgrades.accuracy) ? upgrades.accuracy : 60,
      maxHP: typeof solo.maxHP === "number" && Number.isFinite(solo.maxHP) ? solo.maxHP : 100,
      maxArmor: typeof solo.maxArmor === "number" && Number.isFinite(solo.maxArmor) ? solo.maxArmor : 50,
    };
    cache.set(addr, { at: now, stats: out });
    return out;
  } catch {
    cache.set(addr, { at: now, stats: null });
    return null;
  }
}




