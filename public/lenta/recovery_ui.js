// recovery_ui.js — „Apsaugok / atkurk progresą" UI custodial žaidėjams.
//
// KAM: custodial (1-click / Instant Play) žaidėjo progresas rištas prie serveryje laikomo acc.
// Kad neprarastų perėjęs įrenginį, jis pririša MAIN Ronin piniginę ARBA email → tai tampa
// prisijungimo raktais prie TO PATIES acc (progresas NEprarandamas). Naudoja window.PlayClient
// (link/recover) + Supabase OTP email'ui. UI ENGLISH.
//
// Rodoma TIK kai: PlayClient turi acc IR PLAY_API_URL nustatytas (t.y. custodial sistema gyva)
// IR dar nėra pririšto rakto. Kitaip mygtukas nesirodo (nepainioja įprastų wallet žaidėjų).
// Izoliuotas modulis (window.RecoveryUI).
(function () {
  if (window.RecoveryUI) return;

  var SB_URL = 'https://rbkivemouxwcgrpzazxb.supabase.co';
  var SB_KEY = 'sb_publishable_E4cHxTFKDTYgrdxcv5uRfQ_9tryLJ4p';
  var _sb = null, _pill = null, _timer = null, _lastState = '';

  function _sbClient() {
    if (_sb) return _sb;
    try { if (window.supabase && window.supabase.createClient) _sb = window.supabase.createClient(SB_URL, SB_KEY, { auth: { persistSession: true } }); } catch (_) {}
    return _sb;
  }

  function _active() {
    return !!(window.PlayClient && window.PlayClient.hasAccount && window.PlayClient.hasAccount() && window.PLAY_API_URL);
  }

  // Ar jau apsaugotas (pririštas wallet/email)? status kešuojam trumpai.
  var _protCache = { t: 0, v: null };
  async function _isProtected() {
    if (Date.now() - _protCache.t < 30000 && _protCache.v !== null) return _protCache.v;
    try {
      var st = await window.PlayClient.status();
      var prot = !!((st.linkedWallets && st.linkedWallets.length) || st.emailLinked);
      _protCache = { t: Date.now(), v: prot };
      return prot;
    } catch (_) { return true; }   // klaida → nerodom (saugiau)
  }

  // ── Pill mygtukas ("🔒 Save progress") ────────────────────────────────────
  function _ensurePill() {
    if (_pill) return;
    _pill = document.createElement('button');
    _pill.id = 'rec-pill';
    _pill.style.cssText = 'position:fixed;right:12px;bottom:112px;z-index:9700;font-family:monospace;font-weight:700;' +
      'font-size:12px;padding:9px 12px;border-radius:10px;border:2px solid #6bb0e0;cursor:pointer;display:none;' +
      'background:linear-gradient(180deg,#12283a,#0c1a26);color:#bfe0ff;box-shadow:0 2px 10px rgba(0,0,0,.5);';
    _pill.innerHTML = '🔒 Save progress';
    _pill.onclick = openSaveModal;
    document.body.appendChild(_pill);
  }

  async function _tick() {
    _ensurePill();
    if (!_active()) { _pill.style.display = 'none'; return; }
    var prot = await _isProtected();
    _pill.style.display = prot ? 'none' : 'block';
  }

  // ── Modalai ────────────────────────────────────────────────────────────────
  function _overlay(inner) {
    var ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;z-index:100002;background:rgba(8,12,20,.85);display:flex;align-items:center;justify-content:center;font-family:system-ui,Segoe UI,sans-serif;';
    ov.innerHTML = '<div style="background:linear-gradient(180deg,#14202e,#0d1620);border:2px solid #4a9da6;border-radius:14px;padding:20px;width:min(360px,92vw);box-shadow:0 12px 40px rgba(0,0,0,.6);color:#e8f4f6;">' + inner + '</div>';
    document.body.appendChild(ov);
    return ov;
  }
  function _msg(ov, text, col) { var m = ov.querySelector('[data-msg]'); if (m) { m.textContent = text; m.style.color = col || '#9fe'; } }

  // „Save progress" — pasirinkimas: wallet ARBA email
  function openSaveModal() {
    var ov = _overlay(
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">' +
      '<span style="color:#ffcf5c;font-weight:800;font-size:16px;">🔒 Save your progress</span>' +
      '<button data-x style="background:#e85d5d;color:#fff;border:none;border-radius:8px;width:30px;height:30px;font-size:16px;cursor:pointer;">✕</button></div>' +
      '<div style="font-size:12px;opacity:.82;line-height:1.55;margin-bottom:14px;">Link your main wallet or email so you never lose your units, RONKE and progress — and can log in from any device.</div>' +
      '<button data-wallet style="width:100%;padding:12px;border-radius:10px;border:2px solid #ffcf5c;background:#15324a;color:#e8f4f6;font-weight:700;font-size:14px;cursor:pointer;margin-bottom:9px;">🔷 Link Ronin wallet</button>' +
      '<button data-email style="width:100%;padding:12px;border-radius:10px;border:2px solid #6b4a2e;background:#2a1f12;color:#f5e6c3;font-weight:700;font-size:14px;cursor:pointer;margin-bottom:9px;">✉️ Save with email</button>' +
      '<div data-msg style="font-size:12px;text-align:center;min-height:16px;margin-top:4px;"></div>');
    ov.addEventListener('click', function (e) {
      if (e.target === ov || e.target.closest('[data-x]')) { try { ov.remove(); } catch (_) {} return; }
      if (e.target.closest('[data-wallet]')) { _doLinkWallet(ov); return; }
      if (e.target.closest('[data-email]')) { try { ov.remove(); } catch (_) {} openEmailModal(false); return; }
    });
  }

  async function _doLinkWallet(ov) {
    _msg(ov, 'Opening wallet…', '#9fe');
    try {
      var r = await window.PlayClient.linkWallet();
      if (r && r.linked) { _protCache = { t: 0, v: null }; _msg(ov, '✅ Progress saved to ' + r.linked.slice(0, 8) + '…', '#8f8'); setTimeout(function () { try { ov.remove(); } catch (_) {} _tick(); }, 1800); }
      else _msg(ov, (r && r.error === 'wallet_linked_elsewhere') ? 'This wallet is already linked to another account.' : 'Could not link — try again.', '#f99');
    } catch (e) { _msg(ov, (e && e.message) || 'Wallet link cancelled.', '#f99'); }
  }

  // Email OTP: įvedi email → Supabase siunčia kodą → įvedi kodą → JWT → link/recover.
  // recover=false → SAVE (link prie esamo acc); recover=true → RESTORE (grąžina seną acc).
  function openEmailModal(recover) {
    var ov = _overlay(
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">' +
      '<span style="color:#ffcf5c;font-weight:800;font-size:16px;">✉️ ' + (recover ? 'Restore progress' : 'Save with email') + '</span>' +
      '<button data-x style="background:#e85d5d;color:#fff;border:none;border-radius:8px;width:30px;height:30px;font-size:16px;cursor:pointer;">✕</button></div>' +
      '<div style="font-size:12px;opacity:.82;line-height:1.5;margin-bottom:12px;">' + (recover ? 'Enter the email you saved your progress with — we\'ll send a login code.' : 'We\'ll send a 6-digit code to confirm your email.') + '</div>' +
      '<input data-email-in type="email" placeholder="you@email.com" style="width:100%;box-sizing:border-box;padding:11px;border-radius:9px;border:1px solid #3a5a6a;background:#0a141c;color:#e8f4f6;font-size:14px;margin-bottom:9px;">' +
      '<div data-code-wrap style="display:none;"><input data-code-in inputmode="numeric" placeholder="6-digit code" style="width:100%;box-sizing:border-box;padding:11px;border-radius:9px;border:1px solid #3a5a6a;background:#0a141c;color:#e8f4f6;font-size:14px;letter-spacing:3px;text-align:center;margin-bottom:9px;"></div>' +
      '<button data-go style="width:100%;padding:12px;border-radius:10px;border:2px solid #59c135;background:#1d3a10;color:#c8ffc0;font-weight:700;font-size:14px;cursor:pointer;">Send code</button>' +
      '<div data-msg style="font-size:12px;text-align:center;min-height:16px;margin-top:8px;"></div>');
    var stage = 'email';
    ov.addEventListener('click', async function (e) {
      if (e.target === ov || e.target.closest('[data-x]')) { try { ov.remove(); } catch (_) {} return; }
      if (!e.target.closest('[data-go]')) return;
      var sb = _sbClient();
      if (!sb) { _msg(ov, 'Email service unavailable — try wallet instead.', '#f99'); return; }
      var emailIn = ov.querySelector('[data-email-in]'), codeIn = ov.querySelector('[data-code-in]');
      if (stage === 'email') {
        var email = (emailIn.value || '').trim();
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { _msg(ov, 'Enter a valid email.', '#f99'); return; }
        _msg(ov, 'Sending code…', '#9fe');
        try {
          var r = await sb.auth.signInWithOtp({ email: email, options: { shouldCreateUser: true } });
          if (r.error) { _msg(ov, r.error.message || 'Could not send code.', '#f99'); return; }
          stage = 'code'; emailIn.disabled = true;
          ov.querySelector('[data-code-wrap]').style.display = 'block';
          ov.querySelector('[data-go]').textContent = recover ? 'Restore' : 'Confirm & save';
          _msg(ov, 'Code sent to ' + email, '#8f8');
        } catch (err) { _msg(ov, (err && err.message) || 'Send failed.', '#f99'); }
      } else {
        var code = (codeIn.value || '').trim();
        if (code.length < 6) { _msg(ov, 'Enter the 6-digit code.', '#f99'); return; }
        _msg(ov, 'Verifying…', '#9fe');
        try {
          var v = await sb.auth.verifyOtp({ email: (emailIn.value || '').trim(), token: code, type: 'email' });
          if (v.error) { _msg(ov, v.error.message || 'Wrong code.', '#f99'); return; }
          var jwt = v.data && v.data.session && v.data.session.access_token;
          if (!jwt) { _msg(ov, 'Verification failed.', '#f99'); return; }
          if (recover) {
            var rr = await window.PlayClient.recoverByEmail(jwt);
            if (rr && rr.userId) { _protCache = { t: 0, v: null }; _msg(ov, '✅ Progress restored!', '#8f8'); setTimeout(function () { location.reload(); }, 1500); }
            else _msg(ov, (rr && rr.error === 'not_linked') ? 'No progress found for this email.' : 'Restore failed.', '#f99');
          } else {
            var lr = await window.PlayClient.linkEmail(jwt);
            if (lr && lr.linked) { _protCache = { t: 0, v: null }; _msg(ov, '✅ Progress saved to ' + lr.linked, '#8f8'); setTimeout(function () { try { ov.remove(); } catch (_) {} _tick(); }, 1800); }
            else _msg(ov, (lr && lr.error === 'email_linked_elsewhere') ? 'This email is linked to another account.' : 'Save failed.', '#f99');
          }
        } catch (err2) { _msg(ov, (err2 && err2.message) || 'Verify failed.', '#f99'); }
      }
    });
  }

  // „Restore progress" — įėjimo taškas naujam įrenginiui (per wallet ARBA email).
  function openRestoreModal() {
    var ov = _overlay(
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">' +
      '<span style="color:#ffcf5c;font-weight:800;font-size:16px;">↺ Restore progress</span>' +
      '<button data-x style="background:#e85d5d;color:#fff;border:none;border-radius:8px;width:30px;height:30px;font-size:16px;cursor:pointer;">✕</button></div>' +
      '<div style="font-size:12px;opacity:.82;line-height:1.55;margin-bottom:14px;">Log in with the wallet or email you saved your progress with.</div>' +
      '<button data-wallet style="width:100%;padding:12px;border-radius:10px;border:2px solid #ffcf5c;background:#15324a;color:#e8f4f6;font-weight:700;font-size:14px;cursor:pointer;margin-bottom:9px;">🔷 Restore with wallet</button>' +
      '<button data-email style="width:100%;padding:12px;border-radius:10px;border:2px solid #6b4a2e;background:#2a1f12;color:#f5e6c3;font-weight:700;font-size:14px;cursor:pointer;">✉️ Restore with email</button>' +
      '<div data-msg style="font-size:12px;text-align:center;min-height:16px;margin-top:8px;"></div>');
    ov.addEventListener('click', async function (e) {
      if (e.target === ov || e.target.closest('[data-x]')) { try { ov.remove(); } catch (_) {} return; }
      if (e.target.closest('[data-wallet]')) {
        _msg(ov, 'Opening wallet…', '#9fe');
        try {
          var rr = await window.PlayClient.recoverByWallet();
          if (rr && rr.userId) { _msg(ov, '✅ Progress restored!', '#8f8'); setTimeout(function () { location.reload(); }, 1400); }
          else _msg(ov, (rr && rr.error === 'not_linked') ? 'No progress found for this wallet.' : 'Restore failed.', '#f99');
        } catch (err) { _msg(ov, (err && err.message) || 'Cancelled.', '#f99'); }
        return;
      }
      if (e.target.closest('[data-email]')) { try { ov.remove(); } catch (_) {} openEmailModal(true); return; }
    });
  }

  function _init() {
    _tick();
    _timer = setInterval(_tick, 20000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _init);
  else _init();

  window.RecoveryUI = { openSave: openSaveModal, openRestore: openRestoreModal, refresh: _tick };
})();
