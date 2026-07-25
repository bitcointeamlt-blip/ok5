// flipper.js — FlipperController: fizinis flipperis (ne animacija).
// Greitas pakėlimas, lėtesnis grįžimas; laiko kampinį greitį (omega),
// kurį ball.js panaudoja paviršiaus greičiui (ω×r) → stiprus, natūralus pop.
class FlipperController {
  // side: 'L' arba 'R'. restDeg/pressDeg — kampai laipsniais (+x, y-žemyn).
  constructor(px, py, side) {
    this.px = px; this.py = py;
    this.side = side;
    this.length = CONFIG.flipper.length;
    this.half = CONFIG.flipper.thickness / 2;

    if (side === 'L') {
      this.restAngle = M.deg(CONFIG.flipper.restDeg);
      this.pressAngle = M.deg(CONFIG.flipper.pressDeg);
    } else {
      // Veidrodis: tipas rodo kairėn.
      this.restAngle = M.deg(180 - CONFIG.flipper.restDeg);
      this.pressAngle = M.deg(180 - CONFIG.flipper.pressDeg);
    }

    this.angle = this.restAngle;
    this.prevAngle = this.restAngle;
    this.omega = 0;
    this.pressed = false;
    this._recalcTip();
  }

  _recalcTip() {
    this.tipX = this.px + Math.cos(this.angle) * this.length;
    this.tipY = this.py + Math.sin(this.angle) * this.length;
  }

  update(dt) {
    this.prevAngle = this.angle;
    const target = this.pressed ? this.pressAngle : this.restAngle;
    const spd = this.pressed ? CONFIG.flipper.raiseSpeed : CONFIG.flipper.returnSpeed;
    this.angle = M.moveToward(this.angle, target, spd * dt);
    this.omega = (this.angle - this.prevAngle) / dt;   // rad/s
    this._recalcTip();
  }
}
