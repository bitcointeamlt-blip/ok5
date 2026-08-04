/* MŪŠIO KORIDORIAUS SIMULIACIJA.
 *
 * Pakeičia senąją 3 s laikmačio taisyklę. Dabar:
 *   išvalai liniją  ->  paleidi unitą
 *   unitas eina koridoriumi savo tempu
 *   susitiko priešo unitą -> KOVA; laimėtojas tęsia kelionę
 *   nuėjo iki galo -> priešui prisideda viena linija
 *
 * Gynyba nebėra „spėk išvalyti per 3 s" — gynyba yra PALEISTI SAVO UNITĄ,
 * kuris perims ateinantį. Todėl laikas nebefiksuotas: viską lemia atstumas.
 *
 * Ašis normalizuota: 0 = tavo lentos kraštas, 1 = priešo lentos kraštas.
 * Tavo unitai eina 0 -> 1, priešo 1 -> 0. Pikseliai atsiranda tik piešiant,
 * tad simuliacija nepriklauso nuo ekrano dydžio (svarbu serveriui, 3 etapas).
 *
 * Šitas failas NEŽINO nieko apie canvas — kaip ir variklis. */
(function (global) {
  'use strict';

  var C = global.CFG;

  /* Elgsenos konstantos — IŠ F12, ne iš akies (žr. tools/extract_f12.js).
   * Atsarginės reikšmės čia tik tam, kad be `f12_data.js` nesugriūtų. */
  var BH = (global.F12 && global.F12.behavior) || {
    swingHold: 880,
    ally: { thinkMin: 2000, thinkRnd: 3000, guardChance: 0.10, idleChance: 0.18, idleMin: 1000, idleRnd: 1200 },
    ghostPause: { min: 1600, rnd: 2200, chance: 0.5, idleMin: 650, idleRnd: 750 }
  };

  function Army() {
    this.time = 0;
    this.units = [];
    this.shots = [];                     // skrendantys sviediniai (strėlės, harpūnai, rutuliai)
    this.events = [];
    this.queue = { you: [], foe: [] };   // laukiantys, kol atsilaisvins aukštas
    this._id = 1;
    /* Koridoriaus RNG. LOKALIAI (be seed) = Math.random → IDENTIŠKAS originalus elgesys.
     * ONLINE (su seed iš serverio) = deterministinis mulberry32 → abu klientai išsprendžia kovą vienodai.
     * Taip lokalus žaidimas NEPAKINTA, o online gauna determinizmą. */
    this.rnd = Math.random;
  }

  Army.prototype.reset = function (seed) {
    this.time = 0;
    this.units.length = 0;
    this.shots.length = 0;
    this.events.length = 0;
    this.queue.you.length = 0;
    this.queue.foe.length = 0;
    this._id = 1;
    this.rnd = (seed == null) ? Math.random : global.RNG.mulberry32(((((seed >>> 0) ^ 0x51ed2c3a) >>> 0)) || 1);
  };

  /* Ar tame aukšte jau yra tos pusės unitas? Aukšte telpa vienas iš pusės — todėl
   * susitikimas visada 1 prieš 1, o ne kelių krūva. */
  Army.prototype.laneBusy = function (side, lane) {
    for (var i = 0; i < this.units.length; i++) {
      var u = this.units[i];
      if (u.state !== 'dead' && u.side === side && u.lane === lane) return true;
    }
    return false;
  };

  Army.prototype.freeLane = function (side) {
    var n = C.MARCH.LANES || 1;
    for (var l = 0; l < n; l++) if (!this.laneBusy(side, l)) return l;
    return -1;
  };

  /* Paleidimo prašymas. Jei visi aukštai užimti — unitas laukia eilėje. */
  Army.prototype.request = function (side, type) {
    this.queue[side].push(type);
    this._pumpQueue();
  };

  Army.prototype._pumpQueue = function () {
    ['you', 'foe'].forEach(function (side) {
      var q = this.queue[side];
      while (q.length) {
        var lane = this.freeLane(side);
        if (lane < 0) break;
        this.spawn(side, q.shift(), lane);
      }
    }, this);
  };

  Army.prototype.waiting = function (side) { return this.queue[side].length; };

  Army.prototype.emit = function (t, d) {
    var e = d || {}; e.t = t; this.events.push(e); return e;
  };

  Army.prototype.drainEvents = function () {
    var e = this.events.slice();
    this.events.length = 0;
    return e;
  };

  /* side: 'you' | 'foe'. Statai imami iš F12 (`Units.stats`) — hp/dmg/cd/range/spd. */
  Army.prototype.spawn = function (side, type, lane) {
    var Un = global.Units;
    var st = Un ? Un.stats(type) : { hp: 4, dmg: 2, cd: 1500, range: 0.05, spd: 0.012 };
    var u = {
      id: this._id++,
      side: side,
      type: type,
      lane: lane || 0,
      dir: side === 'you' ? 1 : -1,
      x: side === 'you' ? 0 : 1,
      hp: st.hp, maxHp: st.hp,
      dmg: st.dmg,
      cd: st.cd,
      range: st.range * (C.MARCH.RANGE_SCALE || 1),
      /* F12 specialieji: skull blokuoja 25 %, hog 10 % crit, ronhood 1 % crit + 11 % miss,
       * shaman kerta per plotą, o smūgis pataiko `hitDelay` ms į animaciją. */
      crit: st.crit, block: st.block, miss: st.miss, aoe: st.aoe,
      hitDelay: st.hitDelay,
      swingT: -1,           // >0 kai ginklas pakeltas ir smūgis dar skrenda
      swingAt: -1e9,        // kada paskutinį kartą užsimota (F12 SWING_HOLD)
      swingTargetId: 0,     // F12: taikinys užfiksuojamas UŽSIMOJANT, ne pataikant
      holding: false,       // stovi vietoje (kirtis groja arba pauzė)
      nextPauseAt: 0, idleUntil: 0,
      guardAt: -1e9,        // kada paskutinį kartą atrėmė skydu (blokas animacijai)
      /* Skydo animaciją F12 turi tik skull; trukmė = guard kadrai / 10 fps. */
      hasGuard: !!(Un && Un.guardDur(type) > 0),
      guardMs: Un ? Un.guardDur(type) : 0,
      /* F12 greitis labai lėtas (0.012 -> ~83 s takeliui); koridoriui skaliuojam,
       * bet tarpusavio santykiai lieka F12. */
      speed: st.spd * C.MARCH.SPEED_SCALE,
      state: 'march',       // march | fight | dead
      lastAttackAt: 0,      // F12 modelis: absoliutus paskutinio smūgio laikas
      foeId: 0,
      dist: 0               // nueitas kelias (animacijai — kad kojos neslystų)
    };
    this.units.push(u);
    this.emit('spawn', { unit: u });
    return u;
  };

  Army.prototype.count = function (side) {
    var n = 0;
    for (var i = 0; i < this.units.length; i++) {
      if (this.units[i].side === side && this.units[i].state !== 'dead') n++;
    }
    return n;
  };

  /* Kiek unitų šiuo metu eina TAVĘS link (t. y. priešo paleisti). */
  Army.prototype.incoming = function (side) {
    return this.count(side === 'you' ? 'foe' : 'you');
  };

  Army.prototype.byId = function (id) {
    for (var i = 0; i < this.units.length; i++) if (this.units[i].id === id) return this.units[i];
    return null;
  };

  /* Artimiausias gyvas priešas TAME PAČIAME aukšte.
   * Kitų aukštų unitai vienas kito nemato — todėl kova visada 1 prieš 1. */
  Army.prototype._nearestFoe = function (u) {
    var best = null, bd = 1e9;
    for (var i = 0; i < this.units.length; i++) {
      var v = this.units[i];
      if (v.side === u.side || v.state === 'dead' || v.lane !== u.lane) continue;
      var d = Math.abs(v.x - u.x);
      if (d < bd) { bd = d; best = v; }
    }
    return best ? { unit: best, dist: bd } : null;
  };

  /* TIKRA KOVA pagal F12 modelį:
   *   eina, kol priešas patenka į `range` -> sustoja ir kapoja kas `cd` ms po `dmg`,
   *   kol vieno HP nukrinta iki 0. Tolimojo mūšio unitai (archer/shaman/ghost)
   *   sustoja anksčiau ir šaudo, artimieji (skull/hog) turi prieiti. */
  Army.prototype.update = function (dt) {
    var i, u;
    var M = C.MARCH;
    this.time += dt;

    /* --- 1 fazė: sprendimai. Žala tik SUKAUPIAMA, dar netaikoma.
     * Kitaip ciklo eilės tvarka nulemtų lygiąsias: pirmas masyve visada spėtų
     * nukauti priešą prieš jo atsaką. Vienalaikiai mirtini smūgiai turi žudyti abu. */
    var strikes = [];
    for (i = 0; i < this.units.length; i++) {
      u = this.units[i];
      if (u.state === 'dead') continue;

      var near = this._nearestFoe(u);
      var inRange = near && near.dist <= u.range;

      /* ── UŽSIMOJIMO PABAIGA (F12 `_pendingProjAt` / `_pendingMeleeAt`) ──
       * SVARBU: F12 šitą tikrina UŽ kovos šakos ribų — kartą užsimota, smūgis
       * ĮVYKSTA, net jei taikinys tuo tarpu pasitraukė iš range. Anksčiau čia
       * buvo priešingai: išėjus iš range `swingT` buvo anuliuojamas, todėl
       * tolimojo mūšio unitai su ilgu `hitDelay` (šamanas 430 ms, vaiduoklis
       * 400 ms) prarasdavo šūvį ir atrodė, kad jie apskritai nešaudo. */
      if (u.swingT > 0) {
        u.swingT -= dt;
        if (u.swingT <= 0) {
          u.swingT = -1;
          var tgtU = this.byId(u.swingTargetId);
          var pd = global.Units && global.Units.projOf(u.type);
          if (pd) {
            /* TOLIMOJO mūšio unitas paleidžia SVIEDINĮ. Kaip F12: crit/miss
             * sprendžiamas paleidimo momentu ir keliauja kartu su strėle,
             * o žala nukrenta tik atskridus (`dur` ms). */
            var isCrit = u.crit > 0 && this.rnd() < u.crit;
            this.shots.push({
              side: u.side, lane: u.lane, type: u.type,
              x0: u.x, x1: tgtU ? tgtU.x : u.x + u.dir * 0.3, x: u.x,
              dir: u.dir, t: 0, dur: pd.dur || 300,
              targetId: u.swingTargetId, byId: u.id,
              dmg: isCrit ? u.dmg * 2 : u.dmg,
              crit: isCrit, miss: u.miss > 0 && this.rnd() < u.miss,
              aoe: u.aoe, kind: pd.kind || 'bolt'
            });
            this.emit('shoot', { by: u, x: u.x, lane: u.lane });
          } else if (tgtU && tgtU.state !== 'dead') {
            strikes.push({ by: u, on: tgtU });
          }
        }
      }

      if (inRange) {
        if (u.state !== 'fight') {
          u.state = 'fight';
          this.emit('fight', { a: u, b: near.unit, x: (u.x + near.unit.x) / 2 });
        }
        u.foeId = near.unit.id;

        /* F12 (floor12 ~10167): PIRMA ataka paruošta IŠ KARTO (`!a.lastAttackAt`),
         * o toliau — pilnas cooldown nuo paskutinio smūgio. Cooldown NEsibrūkšta
         * pasitraukus iš kovos: `lastAttackAt` yra absoliutus laikas, ne skaitiklis. */
        var attackReady = !u.lastAttackAt || (this.time - u.lastAttackAt > u.cd);
        if (attackReady && u.swingT <= 0) {
          u.lastAttackAt = this.time;
          u.swingT = u.hitDelay;                // užsimoja — smūgis pataikys vėliau
          u.swingAt = this.time;                // F12: nuo čia unitas stovi SWING_HOLD ms
          u.swingTargetId = near.unit.id;       // taikinys UŽFIKSUOJAMAS užsimojant
          this.emit('swing', { by: u, x: u.x, lane: u.lane });
        }
      } else {
        /* Iš kovos išeinam, BET vykstantis užsimojimas lieka gyvas (žr. viršuje). */
        if (u.state === 'fight') { u.state = 'march'; u.foeId = 0; }

        /* F12 elgsena (floor12 ~10293): po užsimojimo unitas STOVI, kol kirtis
         * atsigroja pilnai — kitaip gaunasi „kirtis ore" einant. */
        var holding = (this.time - u.swingAt) < BH.swingHold;

        /* Periodinės pauzės — unitai eina ne kaip konvejeris, o gyvai.
         * F12 turi DVI atskiras schemas ir mes laikomės abiejų:
         *   a) bendras ally „think" (floor12 ~9985): kas 2–5 s; 10 % skydas,
         *      dar 8 % idle 1.0–2.2 s;
         *   b) vaiduoklis (floor12 ~10283) — VIENINTELIS su sava pakibimo pauze:
         *      kas 1.6–3.8 s, 50 % tikimybe pakimba 0.65–1.4 s.
         * Skydas rodomas tik tiems, kas turi guard sheet'ą (F12 — skull). */
        var isGhost = u.type === 'ghost';
        if (this.time >= u.nextPauseAt) {
          var g = BH.ghostPause, a = BH.ally;
          u.nextPauseAt = this.time +
            (isGhost ? g.min + this.rnd() * g.rnd
                     : a.thinkMin + this.rnd() * a.thinkRnd);
          var r = this.rnd();
          if (isGhost) {
            if (r < g.chance) u.idleUntil = this.time + g.idleMin + this.rnd() * g.idleRnd;
          } else if (r < a.guardChance && u.hasGuard) {
            u.guardAt = this.time;              // stabteli su skydu (F12 guardStart)
          } else if (r < a.idleChance) {
            u.idleUntil = this.time + a.idleMin + this.rnd() * a.idleRnd;
          }
        }
        if (this.time < u.idleUntil) holding = true;
        /* F12: guard animacija taip pat SUSTABDO (isPaused = guarding || idling). */
        if (u.hasGuard && (this.time - u.guardAt) < u.guardMs) holding = true;

        u.holding = holding;
        if (!holding) {
          var step = u.speed * (dt / 1000);
          u.x += u.dir * step;
          u.dist += step;
        }
      }
    }

    /* --- 1b fazė: skrendantys sviediniai. Atskridę virsta tokiu pat smūgiu. --- */
    for (i = this.shots.length - 1; i >= 0; i--) {
      var sh = this.shots[i];
      sh.t += dt;
      var pr = Math.min(1, sh.t / sh.dur);
      var tg = this.byId(sh.targetId);
      if (tg && tg.state !== 'dead') sh.x1 = tg.x;          // seka judantį taikinį
      sh.x = sh.x0 + (sh.x1 - sh.x0) * pr;
      if (pr < 1) continue;

      this.shots.splice(i, 1);
      var shooter = this.byId(sh.byId);
      /* F12 sprogimą spawnina KIEKVIENAM atskridusiam sviediniui — ir pataikius,
       * ir prašovus (`_f12ArrowImpacts` / `_f12ShamanExpl` po `_tick*`). */
      this.emit('impact', { x: sh.x, lane: sh.lane, type: sh.type, kind: sh.kind });
      if (sh.miss) { this.emit('miss', { on: tg, x: sh.x, lane: sh.lane }); continue; }
      if (!tg || tg.state === 'dead') continue;
      strikes.push({
        by: shooter || { dmg: sh.dmg, side: sh.side, lane: sh.lane, aoe: sh.aoe, range: 1, crit: 0, miss: 0 },
        on: tg, fixedDmg: sh.dmg, crit: sh.crit, ranged: true, aoe: sh.aoe
      });
    }

    /* --- 2 fazė: taikom visą šio tick'o žalą vienu metu, su F12 crit/miss/block/aoe --- */
    for (i = 0; i < strikes.length; i++) {
      var s = strikes[i];
      /* AOE (shaman) kerta VISUS priešus tame aukšte, kiti — tik taikinį */
      var victims = [s.on];
      if (s.by.aoe) {
        victims = [];
        for (var vi = 0; vi < this.units.length; vi++) {
          var vv = this.units[vi];
          if (vv.side !== s.by.side && vv.state !== 'dead' && vv.lane === s.by.lane) victims.push(vv);
        }
        if (!victims.length) victims = [s.on];
      }
      for (var k2 = 0; k2 < victims.length; k2++) {
        var tgt = victims[k2];
        /* Sviediniams crit/miss jau nuspręsta paleidimo metu (F12 modelis). */
        if (s.fixedDmg == null && s.by.miss && this.rnd() < s.by.miss) {
          this.emit('miss', { by: s.by, on: tgt, x: tgt.x, lane: tgt.lane });
          continue;
        }
        var crit = s.fixedDmg != null ? !!s.crit : (s.by.crit > 0 && this.rnd() < s.by.crit);
        if (tgt.block > 0 && this.rnd() < tgt.block) {
          tgt.guardAt = this.time;                 // paleidžia skydo animaciją
          this.emit('block', { by: s.by, on: tgt, x: tgt.x, lane: tgt.lane });
          continue;
        }
        var dmg = s.fixedDmg != null ? s.fixedDmg : (crit ? s.by.dmg * 2 : s.by.dmg);
        tgt.hp -= dmg;
        this.emit('hit', {
          by: s.by, on: tgt, x: tgt.x, lane: tgt.lane,
          dmg: dmg, crit: crit, ranged: s.ranged || s.by.range > 0.06
        });
      }
    }

    /* --- 3 fazė: mirtys (abu gali kristi kartu) --- */
    for (i = 0; i < this.units.length; i++) {
      u = this.units[i];
      if (u.state !== 'dead' && u.hp <= 0) {
        u.state = 'dead';
        var killer = null;
        for (var k = 0; k < strikes.length; k++) if (strikes[k].on === u) killer = strikes[k].by;
        this.emit('die', { unit: u, x: u.x, killer: killer && killer.hp > 0 ? killer : null });
      }
    }

    /* atvykimai */
    for (i = 0; i < this.units.length; i++) {
      u = this.units[i];
      if (u.state !== 'march') continue;
      if (u.dir > 0 && u.x >= 1) { u.x = 1; u.state = 'dead'; this.emit('arrive', { unit: u, target: 'foe' }); }
      else if (u.dir < 0 && u.x <= 0) { u.x = 0; u.state = 'dead'; this.emit('arrive', { unit: u, target: 'you' }); }
    }

    /* 5) šluojam žuvusius */
    for (i = this.units.length - 1; i >= 0; i--) {
      if (this.units[i].state === 'dead') this.units.splice(i, 1);
    }

    /* 6) atsilaisvinę aukštai — įleidžiam laukiančius */
    if (this.queue.you.length || this.queue.foe.length) this._pumpQueue();
  };

  global.Army = Army;
})(window);
