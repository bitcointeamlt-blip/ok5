// ─────────────────────────────────────────────────────────────────────────
// Boards — žaidėjo stendo (ADS board) nuotraukos pasidalinimas per Supabase Storage.
//
// Kiekvieno žaidėjo stendas saugomas viešam bucket'e `boards` kaip <wallet>.png
// (jau „iškeptas" — zoom/pan pritaikytas, hole-aspect kropas). Bet kuris klientas
// gali jį užkrauti per deterministinį viešą URL → kai darysim Castle Siege Fazė 1
// („esi kito žaidėjo pilyje"), tiesiog rodysim Boards.loadForWallet(ownerAddr).
//
// READ = viešas URL (jokio rakto/kliento nereikia). WRITE = anon publishable raktas.
// SETUP (vienkartinis, dashboard SQL editor — žr. žinutę kuri pridėjo šį failą).
// ─────────────────────────────────────────────────────────────────────────
(function () {
  'use strict';

  const SUPABASE_URL = 'https://rbkivemouxwcgrpzazxb.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_E4cHxTFKDTYgrdxcv5uRfQ_9tryLJ4p';
  const BUCKET = 'boards';

  let sb = null;
  function client() {
    if (sb) return sb;
    try {
      if (window.supabase && typeof window.supabase.createClient === 'function') {
        sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });
      }
    } catch (_) {}
    return sb;
  }

  function norm(a) { return (a || '').toString().trim().toLowerCase(); }
  function publicUrl(addr) { return SUPABASE_URL + '/storage/v1/object/public/' + BUCKET + '/' + norm(addr) + '.png'; }

  const _cache = {};   // addr → { img, ready, failed }
  const _ver = {};     // addr → cache-bust skaitliukas (didinamas po upload)

  // Užkrauna (ir kešuoja) žaidėjo stendo Image. Grąžina rec su .img — piešk kai rec.ready.
  function loadForWallet(addr) {
    addr = norm(addr); if (!addr) return null;
    if (_cache[addr]) return _cache[addr];
    const im = new Image(); im.crossOrigin = 'anonymous';
    const rec = { img: im, ready: false, failed: false, addr: addr };
    im.onload = function () {
      rec.ready = true; rec.failed = false;
      // 🎞️ paskelbtas turinys gali būti animuotas GIF (failo vardas visada .png — tikrinam MAGIC BYTES):
      //    GIF87a/GIF89a antraštė → dekoduojam kadrus per game.js _f9DecodeAdsGif → im._gif → žaidime animuojasi.
      try {
        fetch(im.src).then(function (r) { return r.arrayBuffer(); }).then(function (buf) {
          const u8 = new Uint8Array(buf, 0, Math.min(6, buf.byteLength));
          const sig = String.fromCharCode.apply(null, u8);
          if (/^GIF8[79]a/.test(sig) && window._f9DecodeAdsGif) window._f9DecodeAdsGif(im.src, function (g) { if (g) im._gif = g; });
        }).catch(function () {});
      } catch (_) {}
    };
    im.onerror = function () { rec.failed = true; };   // 404 = žaidėjas dar neturi stendo
    const bust = _ver[addr] ? ('?b=' + _ver[addr]) : '';
    im.src = publicUrl(addr) + bust;
    _cache[addr] = rec; return rec;
  }
  function getCached(addr) { return _cache[norm(addr)] || null; }
  function invalidate(addr) { addr = norm(addr); delete _cache[addr]; _ver[addr] = (_ver[addr] || 0) + 1; }

  // Įkelia/perrašo žaidėjo stendą. blob = iškeptas PNG ARBA raw GIF (ctype='image/gif').
  //    Failo vardas VISADA <addr>.png (deterministinis URL) — tipą skaitytojas atpažįsta pagal magic bytes.
  async function upload(blob, addr, ctype) {
    addr = norm(addr); if (!addr) return { ok: false, error: 'no wallet' };
    if (!blob) return { ok: false, error: 'no image' };
    const c = client(); if (!c) return { ok: false, error: 'supabase not loaded' };
    try {
      const { error } = await c.storage.from(BUCKET).upload(addr + '.png', blob, {
        upsert: true, contentType: ctype || 'image/png', cacheControl: '60'
      });
      if (error) return { ok: false, error: (error.message || String(error)) };
      invalidate(addr);
      return { ok: true, url: publicUrl(addr) };
    } catch (e) { return { ok: false, error: String((e && e.message) || e) }; }
  }

  // Pašalina žaidėjo stendą iš cloud (kai Remove).
  async function remove(addr) {
    addr = norm(addr); const c = client(); if (!c || !addr) return { ok: false };
    try { await c.storage.from(BUCKET).remove([addr + '.png']); invalidate(addr); return { ok: true }; }
    catch (e) { return { ok: false, error: String((e && e.message) || e) }; }
  }

  window.Boards = { publicUrl: publicUrl, loadForWallet: loadForWallet, getCached: getCached, invalidate: invalidate, upload: upload, remove: remove, BUCKET: BUCKET };
})();
