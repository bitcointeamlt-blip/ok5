export class AudioManager {
  private context: AudioContext | null = null;
  private isMuted: boolean = false;
  private masterVolume: number = 0.5;
  // Jetpack continuous sound
  private jetpackOscillator: OscillatorNode | null = null;
  private jetpackGainNode: GainNode | null = null;

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

  // Play damage dealt sound - when you deal damage to opponent (satisfying hit sound)
  playDamageDealt(isCrit: boolean = false): void {
    // Satisfying hit sound when you deal damage - like hitting something
    // Use sharper, more aggressive sound for dealing damage
    if (this.isMuted || !this.context) return;

    try {
      const osc1 = this.context.createOscillator();
      const osc2 = this.context.createOscillator();
      const gainNode = this.context.createGain();

      osc1.connect(gainNode);
      osc2.connect(gainNode);
      gainNode.connect(this.context.destination);

      // Higher frequency impact sound (satisfying hit)
      const startFreq1 = isCrit ? 400 : 350; // Higher for satisfying hit
      const endFreq1 = isCrit ? 250 : 200; // Higher for satisfying hit
      osc1.frequency.setValueAtTime(startFreq1, this.context.currentTime);
      osc1.frequency.exponentialRampToValueAtTime(endFreq1, this.context.currentTime + 0.12);
      osc1.type = 'square'; // Square for sharper, more satisfying hit sound

      // Mid-high frequency impact (hit impact)
      const startFreq2 = isCrit ? 600 : 500;
      const endFreq2 = isCrit ? 400 : 350;
      osc2.frequency.setValueAtTime(startFreq2, this.context.currentTime);
      osc2.frequency.exponentialRampToValueAtTime(endFreq2, this.context.currentTime + 0.12);
      osc2.type = 'square'; // Square for sharper impact

      // Short, sharp hit sound - quick attack, quick decay
      const duration = 0.12; // 120ms - sharp hit sound
      const volume = isCrit ? 0.3 : 0.25; // Louder for crit hits
      gainNode.gain.setValueAtTime(0, this.context.currentTime);
      gainNode.gain.linearRampToValueAtTime(this.masterVolume * volume, this.context.currentTime + 0.005); // Very quick attack
      gainNode.gain.exponentialRampToValueAtTime(0.001, this.context.currentTime + duration); // Quick decay

      osc1.start(this.context.currentTime);
      osc2.start(this.context.currentTime);
      osc1.stop(this.context.currentTime + duration);
      osc2.stop(this.context.currentTime + duration);
    } catch (error) {
      console.warn('Failed to play damage dealt sound:', error);
    }
  }

  // Play damage received sound - when you receive damage from opponent (pain/impact sound)
  playDamageReceived(isCrit: boolean = false): void {
    // Pain/impact sound when damage is received - like getting hit
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
      console.warn('Failed to play damage received sound:', error);
    }
  }

  // Play jetpack continuous sound - like real jetpack/reactive engine sound
  public startJetpackSound(fuelPercent: number): void {
    // Stop existing jetpack sound if playing
    this.stopJetpackSound();
    
    if (this.isMuted || !this.context) return;

    try {
      // Create multiple oscillators for jetpack/reactive engine sound
      const osc1 = this.context.createOscillator(); // Low rumble (engine base)
      const osc2 = this.context.createOscillator(); // Mid whoosh (thrust)
      const osc3 = this.context.createOscillator(); // High frequency (air flow)
      const gainNode = this.context.createGain();
      
      // Create low-pass filter for jetpack sound (warmer, more engine-like)
      const filter = this.context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 3000; // Allow mid-high frequencies for jetpack sound
      filter.Q.value = 0.7; // Softer filter

      osc1.connect(filter);
      osc2.connect(filter);
      osc3.connect(filter);
      filter.connect(gainNode);
      gainNode.connect(this.context.destination);

      // Low frequency rumble (engine base) - like reactive engine
      const baseFreq1 = 80; // Low rumble for engine
      const maxFreq1 = 150; // Higher rumble as fuel depletes (more intense)
      const freq1 = baseFreq1 + (1 - fuelPercent) * (maxFreq1 - baseFreq1);
      
      osc1.frequency.setValueAtTime(freq1, this.context.currentTime);
      osc1.type = 'sawtooth'; // Sawtooth for engine rumble

      // Mid frequency whoosh (thrust) - like jetpack thrust
      const baseFreq2 = 300; // Mid frequency for thrust
      const maxFreq2 = 500; // Higher frequency as fuel depletes (more intense)
      const freq2 = baseFreq2 + (1 - fuelPercent) * (maxFreq2 - baseFreq2);
      
      osc2.frequency.setValueAtTime(freq2, this.context.currentTime);
      osc2.type = 'sawtooth'; // Sawtooth for thrust sound

      // High frequency air flow (whoosh) - like air rushing
      const baseFreq3 = 800; // High frequency for air flow
      const maxFreq3 = 1200; // Higher frequency as fuel depletes (more intense)
      const freq3 = baseFreq3 + (1 - fuelPercent) * (maxFreq3 - baseFreq3);
      
      osc3.frequency.setValueAtTime(freq3, this.context.currentTime);
      osc3.type = 'sine'; // Sine for smoother air flow

      // Volume starts weak and gets stronger as fuel depletes (inverse of fuel percent)
      // Use exponential curve for smoother transition from weak to strong
      const baseVolume = 0.05; // Very weak at start
      const maxVolume = 0.2; // Strong at end
      // Exponential curve: volume increases faster as fuel depletes
      const fuelRemaining = fuelPercent; // 1.0 = full, 0.0 = empty
      const volumeCurve = Math.pow(1 - fuelRemaining, 1.5); // Exponential curve (1.5 power for smoother)
      const volume = baseVolume + volumeCurve * (maxVolume - baseVolume);

      // Start sound with quick fade in
      gainNode.gain.setValueAtTime(0, this.context.currentTime);
      gainNode.gain.linearRampToValueAtTime(this.masterVolume * volume, this.context.currentTime + 0.08);

      osc1.start(this.context.currentTime);
      osc2.start(this.context.currentTime);
      osc3.start(this.context.currentTime);
      
      // Store references for later control (store osc1 as main oscillator)
      this.jetpackOscillator = osc1;
      this.jetpackGainNode = gainNode;
      
      // Store osc2 and osc3 references for updates
      (this as any).jetpackOsc2 = osc2;
      (this as any).jetpackOsc3 = osc3;
      (this as any).jetpackFilter = filter;
    } catch (error) {
      console.warn('Failed to start jetpack sound:', error);
    }
  }

  // Update jetpack sound based on fuel level
  public updateJetpackSound(fuelPercent: number): void {
    if (!this.jetpackOscillator || !this.jetpackGainNode || !this.context) return;

    try {
      const osc2 = (this as any).jetpackOsc2;
      const osc3 = (this as any).jetpackOsc3;
      
      // Update frequency for engine rumble - higher frequency = less fuel (more intense)
      const baseFreq1 = 80;
      const maxFreq1 = 150;
      const freq1 = baseFreq1 + (1 - fuelPercent) * (maxFreq1 - baseFreq1);
      this.jetpackOscillator.frequency.setValueAtTime(freq1, this.context.currentTime);

      // Update frequency for thrust whoosh - higher frequency = less fuel (more intense)
      if (osc2) {
        const baseFreq2 = 300;
        const maxFreq2 = 500;
        const freq2 = baseFreq2 + (1 - fuelPercent) * (maxFreq2 - baseFreq2);
        osc2.frequency.setValueAtTime(freq2, this.context.currentTime);
      }

      // Update frequency for air flow - higher frequency = less fuel (more intense)
      if (osc3) {
        const baseFreq3 = 800;
        const maxFreq3 = 1200;
        const freq3 = baseFreq3 + (1 - fuelPercent) * (maxFreq3 - baseFreq3);
        osc3.frequency.setValueAtTime(freq3, this.context.currentTime);
      }

      // Update volume - starts weak and gets stronger as fuel depletes
      // Use exponential curve for smoother transition from weak to strong
      const baseVolume = 0.05; // Very weak at start
      const maxVolume = 0.2; // Strong at end
      // Exponential curve: volume increases faster as fuel depletes
      const fuelRemaining = fuelPercent; // 1.0 = full, 0.0 = empty
      const volumeCurve = Math.pow(1 - fuelRemaining, 1.5); // Exponential curve (1.5 power for smoother)
      const volume = baseVolume + volumeCurve * (maxVolume - baseVolume);
      this.jetpackGainNode.gain.setValueAtTime(this.masterVolume * volume, this.context.currentTime);
    } catch (error) {
      console.warn('Failed to update jetpack sound:', error);
    }
  }

  // Stop jetpack sound
  public stopJetpackSound(): void {
    if (this.jetpackOscillator && this.jetpackGainNode && this.context) {
      try {
        // Fade out smoothly
        const currentTime = this.context.currentTime;
        this.jetpackGainNode.gain.linearRampToValueAtTime(0, currentTime + 0.15);
        this.jetpackOscillator.stop(currentTime + 0.15);
        
        // Stop second and third oscillators if exist
        const osc2 = (this as any).jetpackOsc2;
        const osc3 = (this as any).jetpackOsc3;
        if (osc2) {
          osc2.stop(currentTime + 0.15);
        }
        if (osc3) {
          osc3.stop(currentTime + 0.15);
        }
      } catch (error) {
        console.warn('Failed to stop jetpack sound:', error);
      }
      this.jetpackOscillator = null;
      this.jetpackGainNode = null;
      (this as any).jetpackOsc2 = null;
      (this as any).jetpackOsc3 = null;
      (this as any).jetpackFilter = null;
    }
  }

  // Play drowning sound - muffled, underwater sound effect
  public playDrowningSound(): void {
    if (this.isMuted || !this.context) return;

    try {
      // Create multiple oscillators for underwater/muffled sound
      const osc1 = this.context.createOscillator();
      const osc2 = this.context.createOscillator();
      const gainNode = this.context.createGain();
      
      // Create low-pass filter for muffled effect (like sound through closed door)
      const filter = this.context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 800; // Low frequency cutoff for muffled sound
      filter.Q.value = 1;

      osc1.connect(filter);
      osc2.connect(filter);
      filter.connect(gainNode);
      gainNode.connect(this.context.destination);

      // Low frequency rumble (underwater pressure)
      osc1.frequency.setValueAtTime(150, this.context.currentTime);
      osc1.frequency.exponentialRampToValueAtTime(100, this.context.currentTime + 0.4);
      osc1.type = 'sawtooth';

      // Mid frequency bubble sound
      osc2.frequency.setValueAtTime(300, this.context.currentTime);
      osc2.frequency.exponentialRampToValueAtTime(200, this.context.currentTime + 0.4);
      osc2.type = 'sine';

      // Muffled, underwater sound - longer duration
      const duration = 0.4;
      gainNode.gain.setValueAtTime(0, this.context.currentTime);
      gainNode.gain.linearRampToValueAtTime(this.masterVolume * 0.15, this.context.currentTime + 0.05);
      gainNode.gain.linearRampToValueAtTime(this.masterVolume * 0.12, this.context.currentTime + 0.2);
      gainNode.gain.exponentialRampToValueAtTime(0.001, this.context.currentTime + duration);

      osc1.start(this.context.currentTime);
      osc2.start(this.context.currentTime);
      osc1.stop(this.context.currentTime + duration);
      osc2.stop(this.context.currentTime + duration);
    } catch (error) {
      console.warn('Failed to play drowning sound:', error);
    }
  }

  // Play muffled damage hit sound - like sound through closed door
  public playMuffledDamageHit(): void {
    if (this.isMuted || !this.context) return;

    try {
      const osc1 = this.context.createOscillator();
      const osc2 = this.context.createOscillator();
      const gainNode = this.context.createGain();
      
      // Create low-pass filter for muffled effect (like sound through closed door)
      const filter = this.context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 600; // Low frequency cutoff for muffled sound
      filter.Q.value = 1;

      osc1.connect(filter);
      osc2.connect(filter);
      filter.connect(gainNode);
      gainNode.connect(this.context.destination);

      // Lower frequency impact sound (muffled)
      const startFreq1 = 150;
      const endFreq1 = 100;
      osc1.frequency.setValueAtTime(startFreq1, this.context.currentTime);
      osc1.frequency.exponentialRampToValueAtTime(endFreq1, this.context.currentTime + 0.15);
      osc1.type = 'sawtooth';

      // Mid frequency impact (muffled)
      const startFreq2 = 250;
      const endFreq2 = 180;
      osc2.frequency.setValueAtTime(startFreq2, this.context.currentTime);
      osc2.frequency.exponentialRampToValueAtTime(endFreq2, this.context.currentTime + 0.15);
      osc2.type = 'square';

      // Muffled sound - quieter and shorter
      const duration = 0.15;
      gainNode.gain.setValueAtTime(0, this.context.currentTime);
      gainNode.gain.linearRampToValueAtTime(this.masterVolume * 0.12, this.context.currentTime + 0.01); // Quieter
      gainNode.gain.exponentialRampToValueAtTime(0.001, this.context.currentTime + duration);

      osc1.start(this.context.currentTime);
      osc2.start(this.context.currentTime);
      osc1.stop(this.context.currentTime + duration);
      osc2.stop(this.context.currentTime + duration);
    } catch (error) {
      console.warn('Failed to play muffled damage hit sound:', error);
    }
  }

  // Play overheat sound - intense warning sound
  public playOverheatSound(): void {
    if (this.isMuted || !this.context) return;

    try {
      const osc1 = this.context.createOscillator();
      const osc2 = this.context.createOscillator();
      const gainNode = this.context.createGain();

      osc1.connect(gainNode);
      osc2.connect(gainNode);
      gainNode.connect(this.context.destination);

      // Intense warning sound - high frequency with modulation
      osc1.frequency.setValueAtTime(600, this.context.currentTime);
      osc1.frequency.exponentialRampToValueAtTime(800, this.context.currentTime + 0.3);
      osc1.type = 'square'; // Square for harsh warning sound

      osc2.frequency.setValueAtTime(400, this.context.currentTime);
      osc2.frequency.exponentialRampToValueAtTime(600, this.context.currentTime + 0.3);
      osc2.type = 'sawtooth'; // Sawtooth for intensity

      // Short warning burst
      const duration = 0.3;
      gainNode.gain.setValueAtTime(0, this.context.currentTime);
      gainNode.gain.linearRampToValueAtTime(this.masterVolume * 0.25, this.context.currentTime + 0.01);
      gainNode.gain.exponentialRampToValueAtTime(0.001, this.context.currentTime + duration);

      osc1.start(this.context.currentTime);
      osc2.start(this.context.currentTime);
      osc1.stop(this.context.currentTime + duration);
      osc2.stop(this.context.currentTime + duration);
    } catch (error) {
      console.warn('Failed to play overheat sound:', error);
    }
  }

  // Play mine placement sound - subtle placement sound
  public playMinePlacement(): void {
    // Mine placement sound - subtle click/thud sound
    if (this.isMuted || !this.context) return;

    try {
      // Create oscillators for placement sound
      const osc1 = this.context.createOscillator(); // Low frequency thud
      const osc2 = this.context.createOscillator(); // Mid frequency click
      const gainNode = this.context.createGain();

      osc1.connect(gainNode);
      osc2.connect(gainNode);
      gainNode.connect(this.context.destination);

      // Low frequency thud (placement impact)
      osc1.frequency.setValueAtTime(150, this.context.currentTime);
      osc1.frequency.exponentialRampToValueAtTime(100, this.context.currentTime + 0.08);
      osc1.type = 'sine'; // Sine for softer thud

      // Mid frequency click (placement sound)
      osc2.frequency.setValueAtTime(400, this.context.currentTime);
      osc2.frequency.exponentialRampToValueAtTime(300, this.context.currentTime + 0.05);
      osc2.type = 'square'; // Square for click

      // Short, subtle placement sound
      const duration = 0.1; // 100ms - short placement sound
      gainNode.gain.setValueAtTime(0, this.context.currentTime);
      gainNode.gain.linearRampToValueAtTime(this.masterVolume * 0.2, this.context.currentTime + 0.01); // Quick attack
      gainNode.gain.exponentialRampToValueAtTime(0.001, this.context.currentTime + duration); // Quick decay

      osc1.start(this.context.currentTime);
      osc2.start(this.context.currentTime);
      osc1.stop(this.context.currentTime + duration);
      osc2.stop(this.context.currentTime + duration);
    } catch (error) {
      console.warn('Failed to play mine placement sound:', error);
    }
  }

  // Play mine explosion sound - loud, impactful explosion sound
  public playMineExplosion(): void {
    // Explosion sound - loud, impactful boom
    if (this.isMuted || !this.context) return;

    try {
      // Create multiple oscillators for rich explosion sound
      const osc1 = this.context.createOscillator(); // Low frequency boom
      const osc2 = this.context.createOscillator(); // Mid frequency crack
      const osc3 = this.context.createOscillator(); // High frequency pop
      const gainNode = this.context.createGain();

      osc1.connect(gainNode);
      osc2.connect(gainNode);
      osc3.connect(gainNode);
      gainNode.connect(this.context.destination);

      // Low frequency boom (explosion base)
      osc1.frequency.setValueAtTime(80, this.context.currentTime);
      osc1.frequency.exponentialRampToValueAtTime(40, this.context.currentTime + 0.15);
      osc1.type = 'sawtooth'; // Sawtooth for richer boom

      // Mid frequency crack (explosion impact)
      osc2.frequency.setValueAtTime(200, this.context.currentTime);
      osc2.frequency.exponentialRampToValueAtTime(100, this.context.currentTime + 0.1);
      osc2.type = 'square'; // Square for sharp crack

      // High frequency pop (explosion spark)
      osc3.frequency.setValueAtTime(800, this.context.currentTime);
      osc3.frequency.exponentialRampToValueAtTime(400, this.context.currentTime + 0.05);
      osc3.type = 'square'; // Square for sharp pop

      // Explosion envelope - quick attack, longer decay
      const duration = 0.2; // 200ms - explosion sound
      gainNode.gain.setValueAtTime(0, this.context.currentTime);
      gainNode.gain.linearRampToValueAtTime(this.masterVolume * 0.4, this.context.currentTime + 0.01); // Quick attack
      gainNode.gain.exponentialRampToValueAtTime(0.001, this.context.currentTime + duration); // Longer decay

      osc1.start(this.context.currentTime);
      osc2.start(this.context.currentTime);
      osc3.start(this.context.currentTime);
      osc1.stop(this.context.currentTime + duration);
      osc2.stop(this.context.currentTime + duration);
      osc3.stop(this.context.currentTime + duration);
    } catch (error) {
      console.warn('Failed to play mine explosion sound:', error);
    }
  }

  // Play health pack spawn sound - subtle spawn sound
  public playHealthPackSpawn(): void {
    // Health pack spawn sound - subtle, pleasant sound
    if (this.isMuted || !this.context) return;

    try {
      const osc1 = this.context.createOscillator();
      const osc2 = this.context.createOscillator();
      const gainNode = this.context.createGain();

      osc1.connect(gainNode);
      osc2.connect(gainNode);
      gainNode.connect(this.context.destination);

      // High frequency pleasant chime (spawn sound)
      osc1.frequency.setValueAtTime(600, this.context.currentTime);
      osc1.frequency.exponentialRampToValueAtTime(800, this.context.currentTime + 0.1);
      osc1.type = 'sine'; // Sine for pleasant sound

      // Mid frequency pleasant tone
      osc2.frequency.setValueAtTime(400, this.context.currentTime);
      osc2.frequency.exponentialRampToValueAtTime(500, this.context.currentTime + 0.1);
      osc2.type = 'sine'; // Sine for pleasant sound

      // Short, pleasant spawn sound
      const duration = 0.15; // 150ms
      gainNode.gain.setValueAtTime(0, this.context.currentTime);
      gainNode.gain.linearRampToValueAtTime(this.masterVolume * 0.15, this.context.currentTime + 0.01);
      gainNode.gain.exponentialRampToValueAtTime(0.001, this.context.currentTime + duration);

      osc1.start(this.context.currentTime);
      osc2.start(this.context.currentTime);
      osc1.stop(this.context.currentTime + duration);
      osc2.stop(this.context.currentTime + duration);
    } catch (error) {
      console.warn('Failed to play health pack spawn sound:', error);
    }
  }

  // Play health pack pickup sound - satisfying pickup sound
  public playHealthPackPickup(): void {
    // Health pack pickup sound - satisfying, healing sound
    if (this.isMuted || !this.context) return;

    try {
      const osc1 = this.context.createOscillator();
      const osc2 = this.context.createOscillator();
      const gainNode = this.context.createGain();

      osc1.connect(gainNode);
      osc2.connect(gainNode);
      gainNode.connect(this.context.destination);

      // Rising pleasant tone (healing sound)
      osc1.frequency.setValueAtTime(500, this.context.currentTime);
      osc1.frequency.exponentialRampToValueAtTime(700, this.context.currentTime + 0.2);
      osc1.type = 'sine'; // Sine for pleasant healing sound

      // Higher frequency pleasant tone
      osc2.frequency.setValueAtTime(700, this.context.currentTime);
      osc2.frequency.exponentialRampToValueAtTime(900, this.context.currentTime + 0.2);
      osc2.type = 'sine'; // Sine for pleasant sound

      // Satisfying pickup sound
      const duration = 0.2; // 200ms
      gainNode.gain.setValueAtTime(0, this.context.currentTime);
      gainNode.gain.linearRampToValueAtTime(this.masterVolume * 0.2, this.context.currentTime + 0.01);
      gainNode.gain.exponentialRampToValueAtTime(0.001, this.context.currentTime + duration);

      osc1.start(this.context.currentTime);
      osc2.start(this.context.currentTime);
      osc1.stop(this.context.currentTime + duration);
      osc2.stop(this.context.currentTime + duration);
    } catch (error) {
      console.warn('Failed to play health pack pickup sound:', error);
    }
  }

  // Resume audio context (required for some browsers)
  async resumeContext(): Promise<void> {
    if (this.context && this.context.state === 'suspended') {
      await this.context.resume();
    }
  }
}
