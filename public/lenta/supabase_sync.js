// ─────────────────────────────────────────────────────────────────────────
// Supabase profile sync layer — Phase 1 foundation
//
// Strategy:
//   - Wallet'ą sujungus → loadProfileFromCloud() patikrina cloud progress
//   - Jei cloud yra naujesnis → override localStorage
//   - Jei localStorage naujesnis → push į cloud
//   - saveProfile() perpoint'inamas į saveBoth() — rašo abu (cloud + local)
//   - Offline graceful — jei Supabase nepasiekiamas, vis tiek dirba localStorage
// ─────────────────────────────────────────────────────────────────────────

(function () {
  'use strict';

  const SUPABASE_URL = 'https://rbkivemouxwcgrpzazxb.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_E4cHxTFKDTYgrdxcv5uRfQ_9tryLJ4p';

  let sb = null;            // Supabase client instance
  let syncEnabled = false;  // ar cloud sync aktyvi (wallet prisijungęs)
  let lastPushAt = 0;       // throttle push'ams

  // ── Init ────────────────────────────────────────────────────────────
  function initClient() {
    if (sb) return sb;
    try {
      if (!window.supabase || typeof window.supabase.createClient !== 'function') {
        console.warn('[SupabaseSync] supabase-js not loaded');
        return null;
      }
      sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
        auth: { persistSession: false },   // mes nenaudojam Supabase Auth (wallet-based)
      });
    } catch (e) {
      console.warn('[SupabaseSync] init failed:', e);
    }
    return sb;
  }

  // ── Helpers ─────────────────────────────────────────────────────────
  function getWalletAddress() {
    try {
      if (window.Wallet && typeof window.Wallet.snapshot === 'function') {
        const s = window.Wallet.snapshot();
        if (s && s.connected && s.address) return s.address.toLowerCase();
      }
    } catch (_) {}
    return null;
  }

  function getCurrentProfile() {
    try {
      return (typeof window.Profile === 'object') ? window.Profile : null;
    } catch (_) { return null; }
  }

  function getLocalSavedAt() {
    const p = getCurrentProfile();
    return (p && typeof p._savedAt === 'number') ? p._savedAt : 0;
  }

  // ── Cloud read ──────────────────────────────────────────────────────
  async function loadProfileFromCloud(address) {
    if (!sb) initClient();
    if (!sb || !address) return null;
    try {
      const { data, error } = await sb
        .from('profiles')
        .select('profile_data, updated_at')
        .eq('ronin_address', address)
        .maybeSingle();
      if (error) { console.warn('[SupabaseSync] load error:', error); return null; }
      return data;   // { profile_data, updated_at } arba null
    } catch (e) {
      console.warn('[SupabaseSync] load exception:', e);
      return null;
    }
  }

  // ── Cloud write (upsert) ────────────────────────────────────────────
  async function pushProfileToCloud(address, profileData) {
    if (!sb) initClient();
    if (!sb || !address || !profileData) return false;
    try {
      const { error } = await sb
        .from('profiles')
        .upsert({
          ronin_address: address,
          profile_data: profileData,
        }, { onConflict: 'ronin_address' });
      if (error) { console.warn('[SupabaseSync] push error:', error); return false; }
      lastPushAt = Date.now();
      return true;
    } catch (e) {
      console.warn('[SupabaseSync] push exception:', e);
      return false;
    }
  }

  // ── Conflict resolution: cloud vs local ─────────────────────────────
  // Strategy: paskutinis `_savedAt` timestamp laimi. Jei cloud naujesnis →
  // override localStorage. Jei local naujesnis → push į cloud.
  async function syncOnWalletConnect(address) {
    if (!address) return;
    syncEnabled = true;
    const cloud = await loadProfileFromCloud(address);
    const localProfile = getCurrentProfile();
    const localTs = getLocalSavedAt();
    if (!cloud) {
      if (localProfile) {
        await pushProfileToCloud(address, localProfile);
      }
      return;
    }

    const cloudTs = (cloud.profile_data && cloud.profile_data._savedAt) || 0;
    if (cloudTs > localTs) {
      // Override Profile + perrašom localStorage
      Object.assign(window.Profile, cloud.profile_data);
      try { if (typeof window.saveProfile === 'function') window.saveProfile(); } catch (_) {}
      try { if (typeof window.updateHUD === 'function') window.updateHUD(); } catch (_) {}
    } else if (localTs > cloudTs) {
      await pushProfileToCloud(address, localProfile);
    }
  }

  // ── Push hook — kviečiamas po saveProfile() ─────────────────────────
  // Throttle 2s kad neforce'intų cloud su kiekvienu micro-change'u.
  let pushTimer = null;
  function schedulePush() {
    if (!syncEnabled) return;
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = setTimeout(async () => {
      pushTimer = null;
      const addr = getWalletAddress();
      const profile = getCurrentProfile();
      if (!addr || !profile) return;
      // Žymime savedAt prieš push (kad cloud žinotų timestamp'ą)
      profile._savedAt = Date.now();
      await pushProfileToCloud(addr, profile);
    }, 2000);
  }

  // ── Wrap saveProfile to also push to cloud ──────────────────────────
  // Laukiame kol game.js apibrėš window.saveProfile, tada wrap'inam.
  function wrapSaveProfile() {
    if (window._saveProfileWrapped) return;
    const orig = window.saveProfile;
    if (typeof orig !== 'function') return;
    window.saveProfile = function () {
      try { orig.apply(this, arguments); } catch (e) { console.warn('saveProfile orig failed:', e); }
      schedulePush();
    };
    window._saveProfileWrapped = true;
  }

  // ── Edge Functions invoke helper ────────────────────────────────────
  // Phase 2 — kviečia /functions/v1/<name> endpoint'ą su POST body.
  // Naudoja anon key auth header'iui (Edge Function pati turi
  // service_role key per Deno.env, niekas frontend'e jo nemato).
  async function invokeFunction(name, payload) {
    if (!sb) initClient();
    if (!sb) throw new Error('Supabase not initialized');
    const url = `${SUPABASE_URL}/functions/v1/${name}`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
      },
      body: JSON.stringify(payload || {}),
    });
    const data = await resp.json().catch(() => null);
    return { ok: resp.ok, status: resp.status, data };
  }

  // ── Trophy validation shortcut ─────────────────────────────────────
  // Calls "rapid-endpoint" Edge Function (Phase 2 anti-cheat).
  // Function name = "rapid-endpoint" because Supabase Dashboard placeholder
  // defaulted to that during initial deploy; internal identifier only.
  async function validateAchievement(achievementId) {
    const addr = (window.Wallet && window.Wallet.getAddress && window.Wallet.getAddress()) || null;
    if (!addr) return { ok: false, error: 'Wallet not connected' };
    return await invokeFunction('rapid-endpoint', {
      wallet: addr.toLowerCase(),
      achievementId,
    });
  }

  // ── Public API ──────────────────────────────────────────────────────
  window.SupabaseSync = {
    init: initClient,
    syncOnWalletConnect,
    pushProfileToCloud,
    loadProfileFromCloud,
    isEnabled: () => syncEnabled,
    invoke: invokeFunction,
    validateAchievement,
  };

  // ── Auto-init + wallet event hooks ──────────────────────────────────
  document.addEventListener('DOMContentLoaded', () => {
    initClient();
    // Bandom wrap'inti saveProfile (gali būti dar nedeklaruotas — retry)
    let tries = 0;
    const wrapInterval = setInterval(() => {
      tries++;
      if (typeof window.saveProfile === 'function') {
        wrapSaveProfile();
        clearInterval(wrapInterval);
      } else if (tries > 50) {   // 5s timeout
        console.warn('[SupabaseSync] saveProfile not found after 5s');
        clearInterval(wrapInterval);
      }
    }, 100);

    // Hook'inam ant wallet connect — kai prisijungia, sinchronizuojam
    if (window.Wallet && typeof window.Wallet.onChange === 'function') {
      window.Wallet.onChange(() => {
        const addr = getWalletAddress();
        if (addr) syncOnWalletConnect(addr);
        else syncEnabled = false;
      });
    } else {
      // Fallback: poll'inam wallet state kas 1s
      let lastAddr = null;
      setInterval(() => {
        const addr = getWalletAddress();
        if (addr && addr !== lastAddr) {
          lastAddr = addr;
          syncOnWalletConnect(addr);
        } else if (!addr && lastAddr) {
          lastAddr = null;
          syncEnabled = false;
        }
      }, 1500);
    }
  });
})();
