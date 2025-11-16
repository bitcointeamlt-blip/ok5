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

  // Resume audio context (required for some browsers)
  async resumeContext(): Promise<void> {
    if (this.context && this.context.state === 'suspended') {
      await this.context.resume();
    }
  }
}
