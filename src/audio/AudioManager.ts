export class AudioManager {
  private context: AudioContext | null = null;
  private isMuted: boolean = false;
  private masterVolume: number = 0.5;

  constructor() {
    this.initializeAudioContext();
  }

  private async initializeAudioContext(): Promise<void> {
    try {
      this.context = new (window.AudioContext || (window as any).webkitAudioContext)();
    } catch (error) {
      console.warn('Web Audio API not supported:', error);
    }
  }

  // Set mute state
  setMuted(muted: boolean): void {
    this.isMuted = muted;
  }

  // Set master volume (0-1)
  setVolume(volume: number): void {
    this.masterVolume = Math.max(0, Math.min(1, volume));
  }

  // Play a sound effect
  private playSound(frequency: number, duration: number, type: OscillatorType = 'sine'): void {
    if (this.isMuted || !this.context) return;

    try {
      const oscillator = this.context.createOscillator();
      const gainNode = this.context.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(this.context.destination);

      oscillator.frequency.setValueAtTime(frequency, this.context.currentTime);
      oscillator.type = type;

      // Volume envelope
      gainNode.gain.setValueAtTime(0, this.context.currentTime);
      gainNode.gain.linearRampToValueAtTime(this.masterVolume * 0.3, this.context.currentTime + 0.01);
      gainNode.gain.exponentialRampToValueAtTime(0.001, this.context.currentTime + duration);

      oscillator.start(this.context.currentTime);
      oscillator.stop(this.context.currentTime + duration);
    } catch (error) {
      console.warn('Failed to play sound:', error);
    }
  }

  // Play click hit sound
  playClickHit(): void {
    this.playSound(800, 0.1, 'square');
  }

  // Play upgrade success sound
  playUpgradeSuccess(): void {
    this.playSound(600, 0.2, 'sine');
    setTimeout(() => this.playSound(800, 0.2, 'sine'), 100);
  }

  // Play upgrade fail sound
  playUpgradeFail(): void {
    this.playSound(200, 0.3, 'sawtooth');
  }

  // Play insufficient currency sound
  playInsufficientCurrency(): void {
    this.playSound(150, 0.4, 'sawtooth');
  }

  // Play death sound
  playDeath(): void {
    this.playSound(100, 1.0, 'sawtooth');
  }

  // Play respawn sound
  playRespawn(): void {
    this.playSound(400, 0.3, 'sine');
    setTimeout(() => this.playSound(600, 0.2, 'sine'), 150);
  }

  // Play armor regen sound
  playArmorRegen(): void {
    this.playSound(500, 0.1, 'sine');
  }

  // Play dot hit sound - like hammer hitting a nail (short, light, high-pitched)
  playDotHit(): void {
    // Short, sharp, high-pitched sound - like hammer hitting a nail
    // Use square wave for metallic/percussive sound
    // Very short duration (0.06s) and lighter volume
    if (this.isMuted || !this.context) return;

    try {
      const oscillator = this.context.createOscillator();
      const gainNode = this.context.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(this.context.destination);

      // High frequency (1100 Hz) for sharp, metallic sound
      oscillator.frequency.setValueAtTime(1100, this.context.currentTime);
      oscillator.type = 'square'; // Square wave for metallic/percussive sound

      // Very short, sharp envelope - quick attack, quick decay
      const duration = 0.06; // Very short - 60ms
      gainNode.gain.setValueAtTime(0, this.context.currentTime);
      gainNode.gain.linearRampToValueAtTime(this.masterVolume * 0.15, this.context.currentTime + 0.005); // Quick attack
      gainNode.gain.exponentialRampToValueAtTime(0.001, this.context.currentTime + duration); // Quick decay

      oscillator.start(this.context.currentTime);
      oscillator.stop(this.context.currentTime + duration);
    } catch (error) {
      console.warn('Failed to play dot hit sound:', error);
    }
  }

  // Play bounce sound - like spring or trampoline (bouncy, elastic sound)
  playBounce(): void {
    // Bouncy, elastic sound - like spring or trampoline
    // Use sine wave with frequency sweep for bouncy effect
    // Short duration with quick attack and longer decay
    if (this.isMuted || !this.context) return;

    try {
      const oscillator = this.context.createOscillator();
      const gainNode = this.context.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(this.context.destination);

      // Start with higher frequency, sweep down for bouncy effect
      const startFreq = 600; // Start higher
      const endFreq = 300; // End lower (bouncy effect)
      oscillator.frequency.setValueAtTime(startFreq, this.context.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(endFreq, this.context.currentTime + 0.12);
      oscillator.type = 'sine'; // Sine wave for smoother, more elastic sound

      // Quick attack, longer decay for bouncy feel
      const duration = 0.12; // 120ms - slightly longer than hit sound
      gainNode.gain.setValueAtTime(0, this.context.currentTime);
      gainNode.gain.linearRampToValueAtTime(this.masterVolume * 0.2, this.context.currentTime + 0.01); // Quick attack
      gainNode.gain.exponentialRampToValueAtTime(0.001, this.context.currentTime + duration); // Longer decay

      oscillator.start(this.context.currentTime);
      oscillator.stop(this.context.currentTime + duration);
    } catch (error) {
      console.warn('Failed to play bounce sound:', error);
    }
  }

  // Play projectile launch sound - like cannon explosion (short puff sound)
  playProjectileLaunch(): void {
    // Short, explosive puff sound - like cannon or mortar firing
    // Use noise-like sound with quick attack and decay
    if (this.isMuted || !this.context) return;

    try {
      // Create multiple oscillators for richer explosion sound
      const osc1 = this.context.createOscillator();
      const osc2 = this.context.createOscillator();
      const gainNode = this.context.createGain();

      osc1.connect(gainNode);
      osc2.connect(gainNode);
      gainNode.connect(this.context.destination);

      // Low frequency rumble (cannon boom)
      osc1.frequency.setValueAtTime(80, this.context.currentTime);
      osc1.frequency.exponentialRampToValueAtTime(40, this.context.currentTime + 0.08);
      osc1.type = 'sawtooth'; // Sawtooth for more aggressive sound

      // High frequency crack (explosion crack)
      osc2.frequency.setValueAtTime(400, this.context.currentTime);
      osc2.frequency.exponentialRampToValueAtTime(200, this.context.currentTime + 0.08);
      osc2.type = 'square'; // Square for sharp crack

      // Very short, sharp envelope - quick attack, quick decay
      const duration = 0.08; // 80ms - very short puff
      gainNode.gain.setValueAtTime(0, this.context.currentTime);
      gainNode.gain.linearRampToValueAtTime(this.masterVolume * 0.25, this.context.currentTime + 0.005); // Very quick attack
      gainNode.gain.exponentialRampToValueAtTime(0.001, this.context.currentTime + duration); // Quick decay

      osc1.start(this.context.currentTime);
      osc2.start(this.context.currentTime);
      osc1.stop(this.context.currentTime + duration);
      osc2.stop(this.context.currentTime + duration);
    } catch (error) {
      console.warn('Failed to play projectile launch sound:', error);
    }
  }

  // Play bullet shot sound - like gunshot from barrel (sharp, quick pop)
  playBulletShot(): void {
    // Sharp, quick pop sound - like gunshot from barrel
    // Use high frequency with quick attack and decay
    if (this.isMuted || !this.context) return;

    try {
      // Create multiple oscillators for richer gunshot sound
      const osc1 = this.context.createOscillator();
      const osc2 = this.context.createOscillator();
      const gainNode = this.context.createGain();

      osc1.connect(gainNode);
      osc2.connect(gainNode);
      gainNode.connect(this.context.destination);

      // High frequency pop (gunshot crack)
      osc1.frequency.setValueAtTime(1200, this.context.currentTime);
      osc1.frequency.exponentialRampToValueAtTime(600, this.context.currentTime + 0.05);
      osc1.type = 'square'; // Square for sharp crack

      // Mid frequency pop (barrel echo)
      osc2.frequency.setValueAtTime(800, this.context.currentTime);
      osc2.frequency.exponentialRampToValueAtTime(400, this.context.currentTime + 0.05);
      osc2.type = 'sawtooth'; // Sawtooth for sharper sound

      // Very short, sharp envelope - instant attack, quick decay
      const duration = 0.05; // 50ms - very short pop
      gainNode.gain.setValueAtTime(0, this.context.currentTime);
      gainNode.gain.linearRampToValueAtTime(this.masterVolume * 0.3, this.context.currentTime + 0.003); // Instant attack
      gainNode.gain.exponentialRampToValueAtTime(0.001, this.context.currentTime + duration); // Quick decay

      osc1.start(this.context.currentTime);
      osc2.start(this.context.currentTime);
      osc1.stop(this.context.currentTime + duration);
      osc2.stop(this.context.currentTime + duration);
    } catch (error) {
      console.warn('Failed to play bullet shot sound:', error);
    }
  }

  // Play arrow shot sound - like arrow flying through air (fffiiiit sound)
  playArrowShot(): void {
    // Arrow flying sound - "fffiiiit" - longer than other sounds
    // Use higher frequency with different waveform to distinguish from bounce sound
    if (this.isMuted || !this.context) return;

    try {
      // Use two oscillators for richer arrow sound - different from bounce
      const osc1 = this.context.createOscillator();
      const osc2 = this.context.createOscillator();
      const gainNode = this.context.createGain();

      osc1.connect(gainNode);
      osc2.connect(gainNode);
      gainNode.connect(this.context.destination);

      // Higher frequency start - more "whistling" sound (arrow cutting through air)
      const startFreq1 = 1200; // Higher than bounce (was 900)
      const endFreq1 = 500; // Higher end frequency (was 300)
      osc1.frequency.setValueAtTime(startFreq1, this.context.currentTime);
      osc1.frequency.exponentialRampToValueAtTime(endFreq1, this.context.currentTime + 0.25);
      osc1.type = 'square'; // Square wave for sharper, more distinct sound (different from bounce's sine)

      // Second oscillator for airy tail
      const startFreq2 = 1000;
      const endFreq2 = 400;
      osc2.frequency.setValueAtTime(startFreq2, this.context.currentTime);
      osc2.frequency.exponentialRampToValueAtTime(endFreq2, this.context.currentTime + 0.25);
      osc2.type = 'sine'; // Sine for airy tail

      // Longer duration than other sounds - arrow flies through air
      const duration = 0.25; // 250ms - longer "fffiiiit" sound
      gainNode.gain.setValueAtTime(0, this.context.currentTime);
      gainNode.gain.linearRampToValueAtTime(this.masterVolume * 0.18, this.context.currentTime + 0.01); // Quick attack
      gainNode.gain.linearRampToValueAtTime(this.masterVolume * 0.12, this.context.currentTime + 0.1); // Sustain
      gainNode.gain.exponentialRampToValueAtTime(0.001, this.context.currentTime + duration); // Longer decay

      osc1.start(this.context.currentTime);
      osc2.start(this.context.currentTime);
      osc1.stop(this.context.currentTime + duration);
      osc2.stop(this.context.currentTime + duration);
    } catch (error) {
      console.warn('Failed to play arrow shot sound:', error);
    }
  }

  // Play damage hit sound - like pain/impact sound when damage is dealt
  playDamageHit(isCrit: boolean = false): void {
    // Pain/impact sound when damage is dealt - like getting hit
    // Use lower frequency for more impact, higher for crit hits
    if (this.isMuted || !this.context) return;

    try {
      const osc1 = this.context.createOscillator();
      const osc2 = this.context.createOscillator();
      const gainNode = this.context.createGain();

      osc1.connect(gainNode);
      osc2.connect(gainNode);
      gainNode.connect(this.context.destination);

      // Lower frequency impact sound (pain/impact)
      const startFreq1 = isCrit ? 250 : 200; // Higher for crit hits
      const endFreq1 = isCrit ? 150 : 120; // Higher for crit hits
      osc1.frequency.setValueAtTime(startFreq1, this.context.currentTime);
      osc1.frequency.exponentialRampToValueAtTime(endFreq1, this.context.currentTime + 0.15);
      osc1.type = 'sawtooth'; // Sawtooth for more aggressive, painful sound

      // Mid frequency impact (body impact)
      const startFreq2 = isCrit ? 400 : 300;
      const endFreq2 = isCrit ? 250 : 200;
      osc2.frequency.setValueAtTime(startFreq2, this.context.currentTime);
      osc2.frequency.exponentialRampToValueAtTime(endFreq2, this.context.currentTime + 0.15);
      osc2.type = 'square'; // Square for sharper impact

      // Short impact sound - quick attack, medium decay
      const duration = 0.15; // 150ms - impact sound
      const volume = isCrit ? 0.25 : 0.2; // Louder for crit hits
      gainNode.gain.setValueAtTime(0, this.context.currentTime);
      gainNode.gain.linearRampToValueAtTime(this.masterVolume * volume, this.context.currentTime + 0.01); // Quick attack
      gainNode.gain.exponentialRampToValueAtTime(0.001, this.context.currentTime + duration); // Medium decay

      osc1.start(this.context.currentTime);
      osc2.start(this.context.currentTime);
      osc1.stop(this.context.currentTime + duration);
      osc2.stop(this.context.currentTime + duration);
    } catch (error) {
      console.warn('Failed to play damage hit sound:', error);
    }
  }

  // Resume audio context (required for some browsers)
  async resumeContext(): Promise<void> {
    if (this.context && this.context.state === 'suspended') {
      await this.context.resume();
    }
  }
}
