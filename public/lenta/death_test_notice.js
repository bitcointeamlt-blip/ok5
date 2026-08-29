/* ⚠️ GYVO MIRTIES TESTO ĮSPĖJIMAS (2026-08-29, user).
 *
 * Trumpa juosta viršuje: unitų mirties testas vyksta, geriau palaukti. Uždaroma ×, pasirinkimas
 * įsimenamas (localStorage) — žaidėjui juosta rodoma vieną kartą, ne kas perkrovimą.
 *
 * Tekstas ANGLIŠKAS (žaidimo UI taisyklė). Trumpai ir be dramos: kas vyksta, ką daryti, kaip būti saugiam.
 * Nuimti — ištrink šitą failą iš `index.html` (arba pakeisk KEY, jei norisi parodyti iš naujo).
 */
(function () {
  'use strict';
  var KEY = 'f9_death_test_notice_20260829';
  try { if (localStorage.getItem(KEY) === 'x') return; } catch (_) {}

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
      '<span style="color:#ff8a88;">⚠ LIVE TEST</span> — unit death is being tested: units can be lost permanently. '
      + 'We recommend not playing until testing is finished — watch for the next announcement. '
      + '<span style="color:#8fd47c;">To stay safe: use SAFE mining, or keep your units out of the castle.</span>';

    var x = document.createElement('button');
    x.textContent = '×';
    x.title = 'Dismiss';
    x.style.cssText = [
      'position:absolute', 'top:50%', 'right:10px', 'transform:translateY(-50%)',
      'background:none', 'border:none', 'color:#ffd9d9', 'font-size:20px',
      'line-height:1', 'cursor:pointer', 'font-family:inherit', 'padding:2px 6px',
    ].join(';');
    x.onclick = function () {
      try { localStorage.setItem(KEY, 'x'); } catch (_) {}
      if (bar.parentNode) bar.parentNode.removeChild(bar);
    };
    bar.appendChild(x);
    document.body.appendChild(bar);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
  else build();
})();
