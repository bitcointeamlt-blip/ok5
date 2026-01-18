export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
}

export class ParticleSystem {
  private particles: Particle[] = [];
  private maxParticles: number = 200;

  // Add hit particles
  addHitParticles(x: number, y: number, count: number = 8): void {
    for (let i = 0; i < count; i++) {
      if (this.particles.length >= this.maxParticles) break;
      
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5;
      const speed = 60 + Math.random() * 60; // 60-120 px/s
      
      this.particles.push({
        x: x + (Math.random() - 0.5) * 10,
        y: y + (Math.random() - 0.5) * 10,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.3 + Math.random() * 0.1, // 0.3-0.4s
        maxLife: 0.3 + Math.random() * 0.1,
        size: 2 + Math.random() * 2, // 2-4px
        color: '#000000'
      });
    }
  }

  // Add death particles
  addDeathParticles(x: number, y: number, count: number = 32): void {
    for (let i = 0; i < count; i++) {
      if (this.particles.length >= this.maxParticles) break;
      
      const angle = Math.random() * Math.PI * 2;
      const speed = 30 + Math.random() * 90; // 30-120 px/s
      
      this.particles.push({
        x: x + (Math.random() - 0.5) * 20,
        y: y + (Math.random() - 0.5) * 20,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1.5 + Math.random() * 0.5, // 1.5-2s
        maxLife: 1.5 + Math.random() * 0.5,
        size: 1 + Math.random() * 3, // 1-4px
        color: '#000000'
      });
    }
  }

  // Update all particles
  update(deltaTime: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const particle = this.particles[i];
      
      // Update position
      particle.x += particle.vx * deltaTime;
      particle.y += particle.vy * deltaTime;
      
      // Update life
      particle.life -= deltaTime;
      
      // Remove dead particles
      if (particle.life <= 0) {
        this.particles.splice(i, 1);
      }
    }
  }

  // Render all particles
  render(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    
    for (const particle of this.particles) {
      const alpha = particle.life / particle.maxLife;
      const size = particle.size * alpha;
      
      ctx.globalAlpha = alpha;
      ctx.fillStyle = particle.color;
      ctx.fillRect(
        particle.x - size / 2,
        particle.y - size / 2,
        size,
        size
      );
    }
    
    ctx.restore();
  }

  // Clear all particles
  clear(): void {
    this.particles = [];
  }

  // Get particle count
  getParticleCount(): number {
    return this.particles.length;
  }
}
