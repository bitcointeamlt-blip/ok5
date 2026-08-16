// ronkeblocks_launcher.js — 🧱 PVP TETRIS (PvP „Tetris") paleidyklė lenta žaidime.
//
// Principas kaip 🎳 RonkePong (ronkepong_launcher.js): dock mygtukas atidaro modal-iframe.
// SKIRTUMAI: (1) NEMOKAMA — „for fun" + testavimui, jokio cooldown/kainos; (2) žaidimas
// LANDSCAPE (kaip pilis) → NEkeičiam orientacijos (pinball buvo portrait); (3) atidaro trumpą
// pasirinkimą: „vs AI" (žaidžia iškart, veikia visur) arba „ONLINE 1v1" (Colyseus lobis —
// lokaliai ws://localhost:2567). UI ENGLISH (žaidimo taisyklė). Izoliuota — window.RonkeBlocks.
(function () {
  if (window.RonkeBlocks) return;

  var _overlay = null;

  // ── Modalas ──────────────────────────────────────────────────────────────
  // mode: null → rodom pasirinkimą; 'ai' → tetris/index.html; 'online' → ?net=colyseus (lobis)
  function _open(mode) {
    if (_overlay) return;
    _overlay = document.createElement('div');
    _overlay.id = 'rb-overlay';
    _overlay.style.cssText = 'position:fixed;inset:0;z-index:100000;background:rgba(4,5,8,.97);' +
      'display:flex;align-items:center;justify-content:center;';
    document.body.appendChild(_overlay);

    // 🚩 Bendras „minigame atidarytas" flag'as — F9 auto-popup'ai (RAID REPORT) atideda rodymą
    //   kol žaidi (žr. f9_pvp_live _showRaidReports). Tas pats principas kaip pinball.
    try { window.__minigameOpen = true; } catch (_) {}
    // 🔇 nutildom PAGRINDINIO žaidimo (F9/adventure) muziką+SFX, kad nesikirstų su tetris garsu.
    //   Tetris garsas yra IFRAME'e (atskiras dokumentas) → jo _applyGlobalMute neliečia.
    try { if (window._applyGlobalMute) window._applyGlobalMute(true); } catch (_) {}
    // 📱 Tetris = LANDSCAPE (kaip pilis) → orientacijos NEkeičiam (pinball buvo portrait).

    if (mode) _loadGame(mode); else _showChooser();
  }

  // Pasirinkimas: vs AI (for fun, visada) / ONLINE 1v1 (Colyseus). + ✕ EXIT.
  function _showChooser() {
    _overlay.innerHTML =
      '<div style="text-align:center;font-family:monospace;color:#ffd97a;max-width:340px;padding:20px;">' +
        '<div style="font-size:26px;font-weight:800;letter-spacing:1px;text-shadow:2px 2px 0 #000;">PVP TETRIS</div>' +
        '<div style="font-size:12px;opacity:.7;margin:6px 0 22px;">medieval 1v1 block battle</div>' +
        '<button id="rb-ai" class="rb-choice">⚔️ &nbsp;PLAY vs AI</button>' +
        '<button id="rb-online" class="rb-choice">🌐 &nbsp;ONLINE 1v1</button>' +
        '<div style="font-size:10px;opacity:.5;margin-top:14px;">online = play a friend (share room code)</div>' +
      '</div>' +
      _exitBtnHtml();
    // choice mygtukų stilius
    var st = document.createElement('style');
    st.textContent = '.rb-choice{display:block;width:100%;margin:8px 0;padding:14px;font-family:monospace;' +
      'font-size:16px;font-weight:800;letter-spacing:.5px;color:#ffd97a;background:#2a1c10;cursor:pointer;' +
      'border:2px solid #e0a832;border-radius:10px;box-shadow:2px 2px 0 rgba(0,0,0,.5);transition:background .12s;}' +
      '.rb-choice:hover{background:#3a2814;}';
    _overlay.appendChild(st);
    _overlay.querySelector('#rb-ai').onclick = function () { _loadGame('ai'); };
    _overlay.querySelector('#rb-online').onclick = function () { _loadGame('online'); };
    _wireExit();
  }

  function _loadGame(mode) {
    var url = (mode === 'online') ? 'tetris/index.html?net=colyseus&v=rb107' : 'tetris/index.html?v=rb107';
    _overlay.innerHTML =
      '<iframe src="' + url + '" style="border:0;width:100%;height:100%;display:block;" allow="autoplay"></iframe>' +
      _exitBtnHtml();
    _wireExit();
  }

  function _exitBtnHtml() {
    return '<button id="rb-close" style="position:absolute;top:10px;right:12px;z-index:2;font-family:monospace;' +
      'font-size:14px;font-weight:800;padding:8px 14px;border-radius:8px;border:1px solid #866;background:#2a1c1c;' +
      'color:#fbb;cursor:pointer;">✕ EXIT</button>';
  }
  function _wireExit() {
    var b = _overlay && _overlay.querySelector('#rb-close');
    if (b) b.onclick = _close;
  }

  function _close() {
    if (_overlay) { try { _overlay.remove(); } catch (_) {} _overlay = null; }
    // 🚩 minigame uždarytas → atsegam flag'ą + pranešam, kad atidėti popup'ai gali pasirodyti.
    try { window.__minigameOpen = false; window.dispatchEvent(new Event('minigame:closed')); } catch (_) {}
    // 🔊 grąžinam pagrindinio žaidimo garsą pagal IŠSAUGOTĄ user pasirinkimą (ne priverstinai on).
    try { if (window._applyGlobalMute) window._applyGlobalMute(localStorage.getItem('lenta_muted') === '1'); } catch (_) {}
  }

  window.RonkeBlocks = {
    open: function () { _open(null); },       // dock mygtukas → pasirinkimas
    openAI: function () { _open('ai'); },
    openOnline: function () { _open('online'); },
    close: _close,
  };
})();
