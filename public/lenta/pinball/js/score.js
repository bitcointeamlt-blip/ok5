// score.js — ScoreManager: taškai, combo daugiklis, rekordas (localStorage).
// Player-facing tekstas anglų kalba (žr. game.js HUD).
class ScoreManager {
  constructor() {
    this.score = 0;
    this.combo = 0;            // daugiklis (0 = nėra; rodomas kaip x1..x10)
    this._comboT = 0;         // combo lango laikas
    this.scoreMult = 1;       // roguelike upgrade daugiklis (stackinasi)
    this.floorMult = 1;       // AUKŠTO daugiklis: kas aukštą ×1.1 (kaupiasi) — atlygis už kilimą
    this.best = 0;
    this.drains = 0;
    try { this.best = parseInt(localStorage.getItem('ronkepong_best') || '0', 10) || 0; } catch (_) {}
  }

  reset() {
    this.score = 0; this.combo = 0; this._comboT = 0; this.drains = 0; this.scoreMult = 1; this.floorMult = 1;
  }

  // Taškai + combo × upgrade daugiklis. Grąžina pridėtą sumą (HUD popup'ui).
  award(base) {
    this.combo = Math.min(CONFIG.combo.max, this.combo + 1);
    this._comboT = CONFIG.combo.window;
    const gained = base * this.mult() * this.scoreMult * this.floorMult;
    this.score += gained;
    if (this.score > this.best) {
      this.best = this.score;
      try { localStorage.setItem('ronkepong_best', String(Math.floor(this.best))); } catch (_) {}
    }
    return gained;
  }

  mult() { return Math.max(1, this.combo); }

  // Combo lango likutis 0..1 (1 = ką tik pataikei, 0 = tuoj nutrūks). HUD matuokliui.
  comboFrac() { return CONFIG.combo.window > 0 ? M.clamp(this._comboT / CONFIG.combo.window, 0, 1) : 0; }

  breakCombo() { this.combo = 0; this._comboT = 0; }

  onDrain() { this.drains++; this.breakCombo(); }

  update(dt) {
    if (this._comboT > 0) {
      this._comboT -= dt;
      if (this._comboT <= 0) this.breakCombo();
    }
  }

  // ── LEADERBOARD (lokalus, localStorage `ronkepong_board`): top 10 {score, floor} ──
  loadBoard() {
    try {
      const arr = JSON.parse(localStorage.getItem('ronkepong_board') || '[]');
      if (Array.isArray(arr)) {
        return arr.filter((e) => e && typeof e.score === 'number')
          .sort((a, b) => b.score - a.score || (b.floor || 0) - (a.floor || 0)).slice(0, 10);
      }
    } catch (_) {}
    return [];
  }
  // Įrašo dabartinį runą; grąžina jo RANK (0-based indeksą top10) arba -1 jei nepateko.
  submitScore(floor) {
    const board = this.loadBoard();
    const entry = { score: Math.floor(this.score), floor: floor };
    board.push(entry);
    board.sort((a, b) => b.score - a.score || (b.floor || 0) - (a.floor || 0));
    const top = board.slice(0, 10);
    const rank = top.indexOf(entry);
    try { localStorage.setItem('ronkepong_board', JSON.stringify(top)); } catch (_) {}
    return rank;
  }
}
