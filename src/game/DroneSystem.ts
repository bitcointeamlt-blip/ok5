import { GameState } from './GameState';
import { CombatSystem } from './CombatSystem';

// Drone types with unique behaviors
export type DroneType = 'attack' | 'collector' | 'shield';

export interface Drone {
  id: number;
  type: DroneType;
  angle: number;        // Current orbit angle
  orbitSpeed: number;   // Radians per second
  orbitRadius: number;  // Distance from DOT
  attackTimer: number;  // Time until next attack
  attackCooldown: number; // Cooldown between attacks
  damage: number;       // Damage per attack (for attack drones)
  bonus: number;        // Bonus value (collector: currency bonus, shield: armor reduction)
  color: string;        // Drone color
  size: number;         // Drone size
}

export interface DroneProjectile {
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  speed: number;
  damage: number;
  lifetime: number;
  droneId: number;
}

export interface DroneStats {
  attack: { count: number; totalDamage: number };
  collector: { count: number; totalBonus: number };
  shield: { count: number; totalReduction: number };
}

// Drone purchase costs (reduced for testing)
export const DRONE_COSTS = {
  attack: { base: 1, growth: 1.5 },
  collector: { base: 1, growth: 1.6 },
  shield: { base: 1, growth: 1.7 }
};

// Drone configurations
const DRONE_CONFIGS: Record<DroneType, Omit<Drone, 'id' | 'angle' | 'attackTimer'>> = {
  attack: {
    type: 'attack',
    orbitSpeed: 1.2,
    orbitRadius: 80,
    attackCooldown: 2.0,
    damage: 1,
    bonus: 0,
    color: '#ff4444',
    size: 8
  },
  collector: {
    type: 'collector',
    orbitSpeed: 0.8,
    orbitRadius: 100,
    attackCooldown: 0,
    damage: 0,
    bonus: 5, // +5 currency per DOT kill
    color: '#44ff44',
    size: 10
  },
  shield: {
    type: 'shield',
    orbitSpeed: 1.0,
    orbitRadius: 60,
    attackCooldown: 0,
    damage: 0,
    bonus: 0.1, // 10% armor reduction per drone
    color: '#4444ff',
    size: 9
  }
};

export class DroneSystem {
  private gameState: GameState;
  private combatSystem: CombatSystem;
  private drones: Drone[] = [];
  private projectiles: DroneProjectile[] = [];
  private nextDroneId: number = 1;
  private stats: DroneStats = {
    attack: { count: 0, totalDamage: 0 },
    collector: { count: 0, totalBonus: 0 },
    shield: { count: 0, totalReduction: 0 }
  };

  // DOT position (will be set by renderer)
  private dotX: number = 0;
  private dotY: number = 0;

  constructor(gameState: GameState, combatSystem: CombatSystem) {
    this.gameState = gameState;
    this.combatSystem = combatSystem;
  }

  // Set DOT position for drone orbiting
  setDotPosition(x: number, y: number): void {
    this.dotX = x;
    this.dotY = y;
  }

  // Get drone purchase cost
  getDroneCost(type: DroneType): number {
    const config = DRONE_COSTS[type];
    const count = this.getDroneCountByType(type);
    return Math.ceil(config.base * Math.pow(config.growth, count));
  }

  // Get drone count by type
  getDroneCountByType(type: DroneType): number {
    return this.drones.filter(d => d.type === type).length;
  }

  // Check if player can afford drone
  canAffordDrone(type: DroneType): boolean {
    return this.gameState.player.dotCurrency >= this.getDroneCost(type);
  }

  // Purchase a drone
  purchaseDrone(type: DroneType): boolean {
    const cost = this.getDroneCost(type);

    if (this.gameState.player.dotCurrency < cost) {
      return false;
    }

    // Deduct cost
    this.gameState.player.dotCurrency -= cost;

    // Create new drone
    const config = DRONE_CONFIGS[type];
    const existingOfType = this.getDroneCountByType(type);

    const drone: Drone = {
      id: this.nextDroneId++,
      ...config,
      angle: (existingOfType * Math.PI * 2) / (existingOfType + 1), // Distribute evenly
      attackTimer: config.attackCooldown
    };

    this.drones.push(drone);

    // Update stats
    this.stats[type].count++;

    // Redistribute angles for all drones of this type
    this.redistributeDroneAngles(type);

    return true;
  }

  // Redistribute drone angles evenly
  private redistributeDroneAngles(type: DroneType): void {
    const dronesOfType = this.drones.filter(d => d.type === type);
    const count = dronesOfType.length;

    dronesOfType.forEach((drone, index) => {
      drone.angle = (index * Math.PI * 2) / count;
    });
  }

  // Update all drones
  update(deltaTime: number): void {
    // Update drone positions and attacks
    this.drones.forEach(drone => {
      // Update orbit angle
      drone.angle += drone.orbitSpeed * deltaTime;
      if (drone.angle > Math.PI * 2) {
        drone.angle -= Math.PI * 2;
      }

      // Attack drone logic
      if (drone.type === 'attack' && this.gameState.flags.state === 'Alive') {
        drone.attackTimer -= deltaTime;

        if (drone.attackTimer <= 0) {
          this.droneAttack(drone);
          drone.attackTimer = drone.attackCooldown;
        }
      }
    });

    // Update projectiles
    this.updateProjectiles(deltaTime);
  }

  // Drone attacks the DOT
  private droneAttack(drone: Drone): void {
    const dronePos = this.getDronePosition(drone);

    // Create projectile
    const projectile: DroneProjectile = {
      x: dronePos.x,
      y: dronePos.y,
      targetX: this.dotX,
      targetY: this.dotY,
      speed: 200,
      damage: drone.damage,
      lifetime: 1.0,
      droneId: drone.id
    };

    this.projectiles.push(projectile);
  }

  // Update projectiles
  private updateProjectiles(deltaTime: number): void {
    this.projectiles = this.projectiles.filter(proj => {
      // Move projectile toward target
      const dx = proj.targetX - proj.x;
      const dy = proj.targetY - proj.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < 10) {
        // Hit DOT
        this.combatSystem.applyDamage(proj.damage);
        this.stats.attack.totalDamage += proj.damage;
        return false;
      }

      // Move
      const moveX = (dx / dist) * proj.speed * deltaTime;
      const moveY = (dy / dist) * proj.speed * deltaTime;
      proj.x += moveX;
      proj.y += moveY;

      // Lifetime
      proj.lifetime -= deltaTime;
      return proj.lifetime > 0;
    });
  }

  // Get drone position
  getDronePosition(drone: Drone): { x: number; y: number } {
    return {
      x: this.dotX + Math.cos(drone.angle) * drone.orbitRadius,
      y: this.dotY + Math.sin(drone.angle) * drone.orbitRadius
    };
  }

  // Get all drones
  getDrones(): Drone[] {
    return this.drones;
  }

  // Get all projectiles
  getProjectiles(): DroneProjectile[] {
    return this.projectiles;
  }

  // Calculate total collector bonus
  getCollectorBonus(): number {
    return this.drones
      .filter(d => d.type === 'collector')
      .reduce((sum, d) => sum + d.bonus, 0);
  }

  // Calculate total shield reduction (for armor regen)
  getShieldReduction(): number {
    const reduction = this.drones
      .filter(d => d.type === 'shield')
      .reduce((sum, d) => sum + d.bonus, 0);
    return Math.min(reduction, 0.9); // Cap at 90% reduction
  }

  // Get stats
  getStats(): DroneStats {
    return this.stats;
  }

  // Get total drone count
  getTotalDroneCount(): number {
    return this.drones.length;
  }

  // Serialize for saving
  serialize(): any {
    return {
      drones: this.drones.map(d => ({
        type: d.type,
        damage: d.damage,
        bonus: d.bonus
      })),
      stats: this.stats,
      nextDroneId: this.nextDroneId
    };
  }

  // Deserialize from save
  deserialize(data: any): void {
    if (!data) return;

    this.nextDroneId = data.nextDroneId || 1;
    this.stats = data.stats || {
      attack: { count: 0, totalDamage: 0 },
      collector: { count: 0, totalBonus: 0 },
      shield: { count: 0, totalReduction: 0 }
    };

    // Recreate drones
    this.drones = [];
    if (data.drones) {
      data.drones.forEach((d: any) => {
        const config = DRONE_CONFIGS[d.type as DroneType];
        const drone: Drone = {
          id: this.nextDroneId++,
          ...config,
          damage: d.damage || config.damage,
          bonus: d.bonus || config.bonus,
          angle: 0,
          attackTimer: config.attackCooldown
        };
        this.drones.push(drone);
      });

      // Redistribute angles
      (['attack', 'collector', 'shield'] as DroneType[]).forEach(type => {
        this.redistributeDroneAngles(type);
      });
    }
  }

  // Clear all drones (for reset)
  clear(): void {
    this.drones = [];
    this.projectiles = [];
    this.nextDroneId = 1;
    this.stats = {
      attack: { count: 0, totalDamage: 0 },
      collector: { count: 0, totalBonus: 0 },
      shield: { count: 0, totalReduction: 0 }
    };
  }
}
