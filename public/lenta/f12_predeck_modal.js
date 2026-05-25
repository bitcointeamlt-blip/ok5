// f12_predeck_modal.js — F12 PewPew Saga pre-game card deck selector.
//
// Pasirinkti kokius unit'us pridėti į starting deck'ą + kiek kiekvieno.
// Šiame faile pirmoje fazėje: tik FREE unitai (4 pagrindinai NFT-mapped tipai).
// Antroje fazėje pridėsim NFT inventoriaus integraciją (papildomas blokas + EIP-712).
//
// API:
//   window._F12PreDeck.show(callback)  → atidaro modal, po confirm šaukia callback(choiceObj)
//   choiceObj formatas: { ballType: count }  (pvz {shadow: 1, arrow: 2, heart: 1, leaf: 0})
//
// State perduodamas į F12 per:
//   window._f12PreDeckChoice = choiceObj   (skaitoma initState'e floor12_merge.js)
(function () {
  'use strict';

  // 4 pagrindiniai unit'ai — match'ina NFT collection (skull/archer/shaman/harpoon).
  // ballType = floor12 merge ball'o tipas, kuris merge'ininos virsta tuo unit'u.
  const PICKABLE = [
    { ballType: 'shadow', utype: 'skull',        name: 'Skull',   icon: 'unit-images/skull-idle.gif' },
    { ballType: 'arrow',  utype: 'archer',       name: 'Archer',  icon: 'unit-images/archer-idle.gif' },
    { ballType: 'heart',  utype: 'shaman',       name: 'Shaman',  icon: 'unit-images/shaman-idle.gif' },
    { ballType: 'leaf',   utype: 'harpoon_fish', name: 'Harpoon', icon: 'unit-images/harpoon-idle.gif' },
  ];
  const MAX_PER_TYPE = 5;
  const MAX_TOTAL = 12;

  let choice = {};
  let onConfirmCb = null;

  function totalCount() {
    let n = 0;
    for (const k in choice) n += (choice[k] | 0);
    return n;
  }

  function render() {
    const grid = document.getElementById('f12-predeck-grid');
    if (!grid) return;
    grid.innerHTML = '';
    PICKABLE.forEach(p => {
      const cnt = choice[p.ballType] | 0;
      const row = document.createElement('div');
      row.className = 'f12-predeck-row';
      if (cnt > 0) row.classList.add('has-picked');
      row.innerHTML =
        '<img class="f12-predeck-img" src="' + p.icon + '" alt="' + p.name + '">' +
        '<div class="f12-predeck-info">' +
          '<div class="f12-predeck-name">' + p.name.toUpperCase() + '</div>' +
          '<div class="f12-predeck-tag">FREE</div>' +
        '</div>' +
        '<div class="f12-predeck-ctrls">' +
          '<button class="f12-predeck-minus" data-bt="' + p.ballType + '" type="button">−</button>' +
          '<span class="f12-predeck-count">' + cnt + '</span>' +
          '<button class="f12-predeck-plus" data-bt="' + p.ballType + '" type="button">+</button>' +
        '</div>';
      grid.appendChild(row);
    });
    const totEl = document.getElementById('f12-predeck-total');
    if (totEl) totEl.textContent = totalCount();
    const totWrap = document.getElementById('f12-predeck-summary');
    if (totWrap) totWrap.classList.toggle('at-max', totalCount() >= MAX_TOTAL);
  }

  function onGridClick(e) {
    const t = e.target;
    if (!t || !t.dataset) return;
    const bt = t.dataset.bt;
    if (!bt) return;
    const cur = choice[bt] | 0;
    const tot = totalCount();
    if (t.classList.contains('f12-predeck-plus')) {
      if (cur < MAX_PER_TYPE && tot < MAX_TOTAL) {
        choice[bt] = cur + 1;
        render();
      }
    } else if (t.classList.contains('f12-predeck-minus')) {
      if (cur > 0) {
        choice[bt] = cur - 1;
        render();
      }
    }
  }

  function confirm() {
    const m = document.getElementById('f12-predeck-modal');
    if (m) m.style.display = 'none';
    const cb = onConfirmCb;
    onConfirmCb = null;
    if (cb) {
      try { cb(Object.assign({}, choice)); } catch (e) { console.error('[F12PreDeck] cb err', e); }
    }
  }

  function bind() {
    const m = document.getElementById('f12-predeck-modal');
    if (!m) return false;
    const grid = document.getElementById('f12-predeck-grid');
    if (grid) grid.addEventListener('click', onGridClick);
    const startBtn = document.getElementById('f12-predeck-start');
    if (startBtn) startBtn.addEventListener('click', confirm);
    const skipBtn = document.getElementById('f12-predeck-skip');
    if (skipBtn) skipBtn.addEventListener('click', function() {
      choice = {};
      confirm();
    });
    return true;
  }

  function show(cb) {
    onConfirmCb = cb;
    choice = { shadow: 1, arrow: 1, heart: 1, leaf: 1 };
    render();
    const m = document.getElementById('f12-predeck-modal');
    if (m) m.style.display = 'flex';
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind);
  } else {
    bind();
  }

  window._F12PreDeck = { show };
})();
