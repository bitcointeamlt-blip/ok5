/* ⚠️ MIRTIES TAISYKLĖS ĮSPĖJIMAS (2026-08-29, user).
 *
 * Trumpa juosta viršuje: PvP mūšyje kritęs unitas turi 10% šansą žūti negrįžtamai, o apsauga — BLESS,
 * kuris generuojasi kas 24 h ligoninėje.
 *
 * Rodoma KAS KARTĄ pirmą kartą įjungus žaidimą: uždarymas įsimenamas `sessionStorage`, ne `localStorage`,
 * tad per tą patį seansą juosta nebekyšo, o kitą kartą atsidarius žaidimą — vėl primena.
 *
 * Tekstas ANGLIŠKAS (žaidimo UI taisyklė). KISS: viena juosta, vienas ×, jokių būsenų.
 * Nuimti — ištrink šitą failą iš `index.html`.
 */
(function () {
  'use strict';
  var KEY = 'f9_death_notice_seen';
  try { if (sessionStorage.getItem(KEY) === 'x') return; } catch (_) {}

  function build() {
    if (document.getElementById('f9-death-notice')) return;
    var bar = document.createElement('div');
    bar.id = 'f9-death-notice';
    bar.style.cssText = [
      'position:fixed', 'top:0', 'left:0', 'right:0', 'z-index:2147483000',
      'background:linear-gradient(180deg,#3a1414 0%,#241010 100%)',
      'border-bottom:2px solid #a33', 'color:#ffd9d9',
      "font-family:'Press Start 2P',monospace,sans-serif", 'font-size:9px', 'line-height:1.7',
      'padding:9px 42px 9px 14px', 'text-align:center', 'letter-spacing:0.3px',
      'box-shadow:0 2px 14px rgba(0,0,0,0.5)',
    ].join(';');
    bar.innerHTML =
      '<span style="color:#ff8a88;">⚠ PERMADEATH</span> — in PvP matches a fallen unit has a '
      + '<span style="color:#ff8a88;">10% chance to die for good</span> and its NFT is burned. '
      + '<span style="color:#8fd47c;">Put BLESS on a unit and it goes to the hospital instead.</span> '
      + 'You get free BLESS every 24h in the Hospital.';

    var x = document.createElement('button');
    x.textContent = '×';
    x.title = 'Dismiss';
    x.style.cssText = [
      'position:absolute', 'top:50%', 'right:10px', 'transform:translateY(-50%)',
      'background:none', 'border:none', 'color:#ffd9d9', 'font-size:20px',
      'line-height:1', 'cursor:pointer', 'font-family:inherit', 'padding:2px 6px',
    ].join(';');
    x.onclick = function () {
      try { sessionStorage.setItem(KEY, 'x'); } catch (_) {}
      if (bar.parentNode) bar.parentNode.removeChild(bar);
    };
    bar.appendChild(x);
    document.body.appendChild(bar);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
  else build();
})();
