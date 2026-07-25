// debug.js — gyvo fizikos derinimo panelė (etapo-1 reikalavimas).
// Toggle: `` ` `` (backtick) arba `~`. Slankikliai keičia CONFIG reikšmes GYVAI.
class DebugPanel {
  constructor(game) {
    this.game = game;
    this.el = document.getElementById('debug');
    this.visible = false;
    this.liveEl = null;

    // Kiekvienas įrašas: [CONFIG kelias, etiketė, min, max, step].
    this.params = [
      ['gravity', 'Gravity', 100, 1400, 10],
      ['maxSpeed', 'Max speed', 300, 1600, 20],
      ['linearDamping', 'Air drag', 0, 0.3, 0.005],
      ['restWall', 'Wall bounce', 0, 1, 0.02],
      ['restBumper', 'Bumper bounce', 0, 1.2, 0.02],
      ['restSlingshot', 'Sling bounce', 0, 1.2, 0.02],
      ['restFlipper', 'Flipper bounce', 0, 1, 0.02],
      ['wallFriction', 'Wall friction', 0, 0.4, 0.01],
      ['flipper.raiseSpeed', 'Flip up spd', 5, 50, 1],
      ['flipper.returnSpeed', 'Flip down spd', 3, 40, 1],
      ['flipper.kick', 'Flip kick', 0.6, 2.2, 0.02],
      ['bumper.impulse', 'Bumper pop', 0, 800, 10],
      ['slingshot.impulse', 'Sling pop', 0, 800, 10],
      ['plunger.max', 'Plunger max', 400, 1400, 20],
    ];

    this._build();
  }

  _get(path) {
    return path.split('.').reduce((o, k) => o[k], CONFIG);
  }
  _set(path, v) {
    const parts = path.split('.');
    const last = parts.pop();
    parts.reduce((o, k) => o[k], CONFIG)[last] = v;
  }

  _build() {
    const h = document.createElement('h3');
    h.textContent = 'RONKEPONG — PHYSICS';
    this.el.appendChild(h);

    for (const [path, label, min, max, step] of this.params) {
      const row = document.createElement('div');
      row.className = 'row';
      const lab = document.createElement('label');
      lab.textContent = label; lab.title = path;
      const inp = document.createElement('input');
      inp.type = 'range'; inp.min = min; inp.max = max; inp.step = step;
      inp.value = this._get(path);
      const val = document.createElement('span');
      val.className = 'val';
      val.textContent = (+inp.value).toFixed(step < 1 ? 2 : 0);
      inp.addEventListener('input', () => {
        const v = parseFloat(inp.value);
        this._set(path, v);
        val.textContent = v.toFixed(step < 1 ? 2 : 0);
      });
      row.appendChild(lab); row.appendChild(inp); row.appendChild(val);
      this.el.appendChild(row);
    }

    this.liveEl = document.createElement('div');
    this.liveEl.className = 'live';
    this.el.appendChild(this.liveEl);

    const hint = document.createElement('div');
    hint.className = 'hint';
    hint.innerHTML = 'A/&larr; &middot; D/&rarr; flippers &nbsp; SPACE launch<br>R restart &middot; ESC pause &middot; ` toggle panel';
    this.el.appendChild(hint);

    const btn = document.createElement('button');
    btn.textContent = 'Close (`)';
    btn.addEventListener('click', () => this.toggle());
    this.el.appendChild(btn);
  }

  toggle() {
    this.visible = !this.visible;
    this.el.style.display = this.visible ? 'block' : 'none';
  }

  updateLive(fps, ball) {
    if (!this.visible || !this.liveEl) return;
    const sp = Math.round(Math.hypot(ball.vx, ball.vy));
    this.liveEl.textContent = `fps ${fps} | ball speed ${sp} | particles ${this.game.feedback.particles.length}`;
  }
}
