// camera.js — CameraController. Etape 1 vaizdas statiškas (visa lenta telpa),
// bet struktūra paruošta vertikaliam sekimui + screen shake (etapai 2–3).
class CameraController {
  constructor() {
    this.x = 0; this.y = 0;       // pasaulio poslinkis (etape 1 = 0)
    this.shakeX = 0; this.shakeY = 0;
    this._shakeMag = 0;
  }

  addShake(mag) {
    this._shakeMag = Math.min(CONFIG.fx.shakeMax, Math.max(this._shakeMag, mag));
  }

  update(dt) {
    if (this._shakeMag > 0.05) {
      this.shakeX = M.rand(-1, 1) * this._shakeMag;
      this.shakeY = M.rand(-1, 1) * this._shakeMag;
      this._shakeMag *= Math.pow(0.001, dt);   // greitas gesimas
    } else {
      this.shakeX = 0; this.shakeY = 0; this._shakeMag = 0;
    }
  }

  // Pritaiko transformą kadro pradžioje (px = pasaulis - kamera + shake).
  apply(ctx) {
    ctx.translate(
      Math.round(-this.x + this.shakeX),
      Math.round(-this.y + this.shakeY)
    );
  }
}
