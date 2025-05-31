/**
 * particles.js - Centralized particle system
 * 
 * Handles all particle creation and physics.
 * Clean separation from game logic and rendering.
 */

import { CONSTANTS } from './config.js';

export class ParticleSystem {
    constructor() {
        this.particles = [];
        this.maxParticles = CONSTANTS.PARTICLES.MAX_PARTICLES * 3; // Allow bursts
    }
    
    // ============ PUBLIC API ============
    
    /**
     * Create explosion effect when lines are cleared
     * @param {number[]} lines - Array of line indices that were cleared
     * @param {Array<Array>} board - Game board for color info
     */
    createLineExplosion(lines, board) {
        const lineCount = lines.length;
        const intensity = lineCount / 4; // 0.25, 0.5, 0.75, 1.0
        
        lines.forEach((lineY, lineIndex) => {
            for (let x = 0; x < 10; x++) {
                if (board[lineY][x]) {
                    const color = board[lineY][x];
                    const blockCenterX = x * CONSTANTS.BOARD.BLOCK_SIZE + CONSTANTS.BOARD.BLOCK_SIZE / 2;
                    const blockCenterY = lineY * CONSTANTS.BOARD.BLOCK_SIZE + CONSTANTS.BOARD.BLOCK_SIZE / 2;
                    
                    // Particle count scales with intensity
                    const particleCount = Math.floor(20 * (1 + intensity * 2)); // 20, 30, 40, 60
                    
                    for (let i = 0; i < particleCount; i++) {
                        const particle = this.createFireworkParticle(
                            blockCenterX, 
                            blockCenterY, 
                            color, 
                            lineCount,
                            intensity,
                            x,
                            i / particleCount,
                            lineIndex / lineCount
                        );
                        
                        this.particles.push(particle);
                    }
                }
            }
        });
        
        // Limit particle count
        if (this.particles.length > this.maxParticles) {
            this.particles = this.particles.slice(-this.maxParticles);
        }
    }
    
    /**
     * Update all particles
     * @param {number} deltaTime - Time since last update in milliseconds
     */
    update(deltaTime) {
        const dt = deltaTime / 1000;
        
        this.particles = this.particles.filter(p => {
            // Update lifetime
            p.life -= dt;
            if (p.life <= 0) return false;
            
            // Physics update - parabolic motion
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.vy += CONSTANTS.PARTICLES.GRAVITY * dt; // Gravity pulls down
            
            // Calculate progress for effects
            const progress = 1 - (p.life / p.maxLife);
            
            // Rainbow color shift for tetris
            if (p.rainbow) {
                const hue = (p.rainbowOffset + progress * 180) % 360;
                p.color = `hsl(${hue}, 100%, ${70 - progress * 20}%)`;
            }
            
            // Each particle has its own fade curve
            p.opacity = Math.pow(1 - progress, p.fadeExponent);
            
            return true;
        });
    }
    
    /**
     * Get all active particles for rendering
     * @returns {Array} Array of particle objects
     */
    getParticles() {
        return this.particles;
    }
    
    /**
     * Clear all particles
     */
    clear() {
        this.particles = [];
    }
    
    /**
     * Get particle count for debugging
     */
    getCount() {
        return this.particles.length;
    }
    
    // ============ PRIVATE METHODS ============
    
    createFireworkParticle(x, y, color, lineCount, intensity, columnX, particleRatio, lineRatio) {
        // Start position with some spread
        const startX = x + (Math.random() - 0.5) * CONSTANTS.BOARD.BLOCK_SIZE * 0.5;
        const startY = y + (Math.random() - 0.5) * CONSTANTS.BOARD.BLOCK_SIZE * 0.5;
        
        // Calculate base height
        const availableHeight = CONSTANTS.BOARD.HEIGHT * CONSTANTS.BOARD.BLOCK_SIZE * 0.8;
        const baseHeight = availableHeight * (0.3 + intensity * 0.5);
        
        // ANGLE: Spread increases with line count
        const maxSpread = (Math.PI / 3) * (1 + intensity); // 60° to 120° total spread
        const angle = (Math.PI / 2) + (Math.random() - 0.5) * maxSpread;
        
        // HEIGHT: More variation with more lines
        const heightVariation = 0.7 + Math.random() * (0.6 * (1 + intensity));
        const maxHeight = baseHeight * heightVariation;
        
        // VELOCITY: Initial velocity to reach maxHeight
        const velocity = Math.sqrt(2 * CONSTANTS.PARTICLES.GRAVITY * maxHeight);
        
        // 90% stay on screen, 10% can go wild
        const velocityMultiplier = Math.random() > 0.9 ? 1.5 : 1.0;
        
        // LIFETIME: More variation with more lines
        const lifeVariation = 0.7 + Math.random() * (0.6 * (1 + intensity));
        const lifetime = (1 + intensity * 3) * lifeVariation;
        
        // SIZE: More variation with more lines
        const sizeVariation = 0.8 + Math.random() * (0.4 * (1 + intensity));
        const size = (2 + intensity * 6) * sizeVariation;
        
        // Create particle
        const particle = {
            // Position
            startX: startX,
            startY: startY,
            x: startX,
            y: startY,
            
            // Velocity components
            vx: Math.cos(angle) * velocity * velocityMultiplier,
            vy: -Math.sin(angle) * velocity * velocityMultiplier, // Negative for upward
            
            // Visual properties  
            color: color,
            size: size,
            type: Math.random() > (1 - intensity * 0.5) ? 'glow' : 'spark',
            
            // Lifetime
            maxLife: lifetime,
            life: lifetime,
            
            // Unique fade rate
            fadeExponent: 1.5 + Math.random() * (2 * (1 + intensity)),
            
            // Special effects
            rainbow: lineCount === 4 && Math.random() > 0.3,
            rainbowOffset: columnX * 36 + lineRatio * 60
        };
        
        // Color variations for multi-line clears
        if (lineCount >= 2 && Math.random() > 0.7) {
            const hue = Math.random() * 360;
            particle.color = `hsl(${hue}, 90%, 60%)`;
        }
        
        if (lineCount >= 3 && Math.random() > 0.6) {
            particle.color = Math.random() > 0.5 ? '#FFD700' : '#C0C0C0';
        }
        
        return particle;
    }
}