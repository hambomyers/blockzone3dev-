/**
 * game-engine.js - Complete game engine with integrated sound triggers
 * ENHANCED: Direct sound triggering at action points
 * UPDATED: Stable piece identity system for consistent visuals
 * FIXED: Added display state calculations for renderer
 * 
 * Sound is triggered exactly where actions happen, ensuring:
 * - No duplicate sounds
 * - Perfect synchronization
 * - Clear cause and effect
 */

import * as Physics from './physics-pure.js';
import { ParticleSystem } from './particles.js';

// ============ PIECE DEFINITIONS ============
export const PIECE_DEFINITIONS = {
    I: {
        shape: [[0,0,0,0], [1,1,1,1], [0,0,0,0], [0,0,0,0]],
        color: '#00FFFF',
        spawn: { x: 3, y: -2 }
    },
    J: {
        shape: [[1,0,0], [1,1,1], [0,0,0]],
        color: '#0000FF',
        spawn: { x: 3, y: -2 }
    },
    L: {
        shape: [[0,0,1], [1,1,1], [0,0,0]],
        color: '#FF7F00',
        spawn: { x: 3, y: -2 }
    },
    O: {
        shape: [[1,1], [1,1]],
        color: '#FFFF00',
        spawn: { x: 4, y: -2 }
    },
    S: {
        shape: [[0,1,1], [1,1,0], [0,0,0]],
        color: '#00FF00',
        spawn: { x: 3, y: -2 }
    },
    T: {
        shape: [[0,1,0], [1,1,1], [0,0,0]],
        color: '#8A2BE2',
        spawn: { x: 3, y: -2 }
    },
    Z: {
        shape: [[1,1,0], [0,1,1], [0,0,0]],
        color: '#FF0000',
        spawn: { x: 3, y: -2 }
    },
    FLOAT: {
        shape: [[1]],
        color: '#FFFFFF',
        spawn: { x: 4, y: -1 },
        special: true
    },
    PLUS: {
        shape: [[0,1,0], [1,1,1], [0,1,0]],
        color: '#FFD700',
        spawn: { x: 3, y: -3 }
    },
    U: {
        shape: [[1,0,1], [1,0,1], [1,1,1]],
        color: '#FF69B4',
        spawn: { x: 3, y: -3 }
    },
    DOT: {
        shape: [[1,1,0], [1,0,1], [0,1,1]],
        color: '#00CED1',
        spawn: { x: 3, y: -3 }
    }
};

// ============ CONSTANTS ============
export const CONSTANTS = {
    BOARD: {
        WIDTH: 10,
        HEIGHT: 20,
        BLOCK_SIZE: 24
    },
    
    TIMING: {
        LOCK_DELAY: 500,
        LOCK_DELAY_FLOAT: 600,
        MAX_LOCK_TIME: 5000,
        CLEAR_ANIMATION_TIME: 300
    },
    
    SCORING: {
        SOFT_DROP: 1,
        HARD_DROP: 2,
        LINE_VALUES: [0, 100, 300, 500, 800],
        COMBO_VALUE: 50,
        LINES_PER_LEVEL: 10
    },
    
    PIECES: {
        TYPES: ['I', 'J', 'L', 'O', 'S', 'T', 'Z', 'FLOAT', 'PLUS', 'U', 'DOT'],
        STANDARD: ['I', 'J', 'L', 'O', 'S', 'T', 'Z'],
        SPECIAL: ['FLOAT', 'PLUS', 'U', 'DOT'],
        FLOAT_CHANCE: 0.07
    },
    
    PARTICLES: {
        MAX_PARTICLES: 500
    }
};

// ============ RANDOM NUMBER GENERATOR ============
class SeededRandom {
    constructor(seed) {
        this.seed = seed;
        this.state = seed;
    }
    
    next() {
        this.state = (this.state * 1664525 + 1013904223) % 4294967296;
        return this.state / 4294967296;
    }
    
    choice(array) {
        return array[Math.floor(this.next() * array.length)];
    }
    
    shuffle(array) {
        const shuffled = [...array];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(this.next() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
    }
}

// ============ GAME ENGINE CLASS ============
export class GameEngine {
    constructor(config, audioSystem = null) {
        this.config = config;
        this.audio = audioSystem;
        this.state = this.createInitialState();
        this.rng = new SeededRandom(Date.now());
        this.particleSystem = new ParticleSystem();
        
        // For deterministic replay
        this.seed = Date.now();
        this.actionLog = [];
        this.frameCount = 0;
        
        // Error recovery
        this.lastValidState = null;
        this.errorCount = 0;
        
        // Cache high score
        this.savedHighScore = config.get('game.highScore') || 0;
    }
    
    // Set audio system (can be set after construction)
    setAudioSystem(audioSystem) {
        this.audio = audioSystem;
    }
    
    // Create initial state
    createInitialState() {
        return {
            // Board state
            board: Array(20).fill().map(() => Array(10).fill(null)),
            current: null,
            next: null,
            hold: null,
            canHold: true,
            deathPiece: null,
            
            // Game state
            phase: 'MENU',
            score: 0,
            lines: 0,
            level: 1,
            combo: 0,
            pieces: 0,
            unlockedPieces: ['I', 'J', 'L', 'O', 'S', 'T', 'Z', 'FLOAT'], // Start with standard + FLOAT
            
            // Timers
            gravityAccumulator: 0,
            lockTimer: 0,
            totalLockTime: 0,
            clearTimer: 0,
            
            // Reset spawn danger flag
            spawnedInDanger: false,
            
            // Meta
            startTime: null,
            generation: 0,
            clearingLines: [],
            
            // RNG state
            seed: this.seed,
            frameCount: 0
        };
    }
    
    // Get current state with display calculations
    getState() {
        // Calculate current gravity delay for renderer
        const timeFactor = (Date.now() - this.state.startTime) / 2000;
        const scoreFactor = this.state.score / 200;
        const combinedProgress = Math.max(timeFactor, scoreFactor);
        let currentGravityDelay = Math.max(50, 1000 - combinedProgress * 3);
        const reliefMultiplier = Math.pow(1.05, this.state.level - 1);
        currentGravityDelay = currentGravityDelay * reliefMultiplier;
        
        // Calculate display values for renderer
        const displayState = {
            ...this.state,
            // High score display
            isNewHighScore: this.state.score > this.savedHighScore && this.state.score > 0,
            displayHighScore: Math.max(this.state.score, this.savedHighScore),
            // Visual helpers
            canCurrentPieceFall: false,
            currentGravityDelay: currentGravityDelay // Pass this to renderer!
        };
        
        // Calculate if current piece can fall (for visual smoothing)
        if (this.state.current) {
            displayState.canCurrentPieceFall = Physics.canPieceFitAt(
                this.state.board, 
                this.state.current, 
                this.state.current.gridX, 
                this.state.current.gridY + 1
            );
        }
        
        return displayState;
    }
    
    // Main tick
    tick(deltaTime) {
        // Validate state
        if (!this.validateState()) {
            this.recoverFromError();
            return;
        }
        
        // Store last valid state periodically
        if (this.state.frameCount % 60 === 0) {
            this.lastValidState = this.cloneState(this.state);
        }
        
        // Skip if paused/menu/game over
        if (this.state.phase === 'MENU' || this.state.phase === 'PAUSED' || this.state.phase === 'GAME_OVER') {
            return;
        }
        
        // Update particles
        this.particleSystem.update(deltaTime);
        
        // Process based on phase
        switch (this.state.phase) {
            case 'FALLING':
                this.processFalling(deltaTime);
                break;
            case 'LOCKING':
                this.processLocking(deltaTime);
                break;
            case 'CLEARING':
                this.processClearing(deltaTime);
                break;
        }
        
        this.state.frameCount++;
    }
    
    // Process falling phase
    processFalling(deltaTime) {
        if (!this.state.current) {
            this.state.phase = 'GAME_OVER';
            return;
        }
        
        // Apply gravity
        const newAccumulator = this.state.gravityAccumulator + deltaTime;
        
        // HYBRID GRAVITY SYSTEM
        const timeFactor = (Date.now() - this.state.startTime) / 2000; // Half second
        const scoreFactor = this.state.score / 200;
        const combinedProgress = Math.max(timeFactor, scoreFactor); // Whichever is higher
        let gravityDelay = Math.max(50, 1000 - combinedProgress * 3);
        
        // Apply permanent relief based on level (5% per level beyond 1)
        const reliefMultiplier = Math.pow(1.05, this.state.level - 1);
        gravityDelay = gravityDelay * reliefMultiplier;
        
        if (newAccumulator >= gravityDelay) {
            // Try to fall one row
            if (Physics.canPieceFitAt(this.state.board, this.state.current, this.state.current.gridX, this.state.current.gridY + 1)) {
                this.state.current.gridY++;
                this.state.gravityAccumulator = 0;
                
                // Check if this move just made us land
                if (!Physics.canPieceFitAt(this.state.board, this.state.current, this.state.current.gridX, this.state.current.gridY + 1)) {
                    // Just hit the ground!
                    if (this.audio) {
                        this.audio.playSound('land');
                    }
                    // Start locking
                    this.state.phase = 'LOCKING';
                    this.state.lockTimer = 0;
                    this.state.totalLockTime = 0;
                }
            } else {
                // Can't fall - already on ground, start locking
                this.state.phase = 'LOCKING';
                this.state.lockTimer = 0;
                this.state.totalLockTime = 0;
                this.state.gravityAccumulator = 0;
            }
        } else {
            this.state.gravityAccumulator = newAccumulator;
        }
    }
    
    // Process locking phase
    processLocking(deltaTime) {
        const newLockTimer = this.state.lockTimer + deltaTime;
        const newTotalLockTime = (this.state.totalLockTime || 0) + deltaTime;
        
        // Check if piece can fall again
        if (Physics.canPieceFitAt(this.state.board, this.state.current, this.state.current.gridX, this.state.current.gridY + 1)) {
            this.state.phase = 'FALLING';
            this.state.lockTimer = 0;
            this.state.totalLockTime = 0;
            return;
        }
        
        // Check if we've exceeded maximum lock time
        if (newTotalLockTime >= CONSTANTS.TIMING.MAX_LOCK_TIME) {
            this.lockPiece();
            return;
        }
        
        // Lock delay
        let lockDelay = CONSTANTS.TIMING.LOCK_DELAY;
        
        if (this.state.current.type === 'FLOAT') {
            lockDelay = CONSTANTS.TIMING.LOCK_DELAY_FLOAT;
        } else if (this.state.spawnedInDanger) {
            lockDelay = 1000; // 1 second when spawned in danger
        }
        
        if (newLockTimer >= lockDelay) {
            this.lockPiece();
        } else {
            this.state.lockTimer = newLockTimer;
            this.state.totalLockTime = newTotalLockTime;
        }
    }
    
    // Process clearing phase
    processClearing(deltaTime) {
        const newClearTimer = this.state.clearTimer + deltaTime;
        
        if (newClearTimer >= CONSTANTS.TIMING.CLEAR_ANIMATION_TIME) {
            this.finishClearing();
        } else {
            this.state.clearTimer = newClearTimer;
        }
    }
    
    // Move piece
    move(dx, dy) {
        const piece = this.state.current;
        if (!piece) return false;
        
        const targetX = piece.gridX + dx;
        const targetY = piece.gridY + dy;
        
        // Try exact position first
        if (Physics.canPieceFitAt(this.state.board, piece, targetX, targetY)) {
            // Execute move
            piece.gridX = targetX;
            piece.gridY = targetY;
            
            // Track up moves for FLOAT
            if (piece.type === 'FLOAT' && dy < 0) {
                piece.upMovesUsed = (piece.upMovesUsed || 0) + 1;
            }
            
            // Reset gravity for vertical moves
            if (dy !== 0) {
                this.state.gravityAccumulator = 0;
            }
            
            // Check if we just landed
            const canFall = Physics.canPieceFitAt(this.state.board, piece, piece.gridX, piece.gridY + 1);
            
            if (!canFall) {
                // Just hit the ground!
                if (this.state.phase === 'FALLING') {
                    // Play landing sound for soft drops
                    if (this.audio && dy > 0) {
                        this.audio.playSound('land');
                    }
                    this.state.phase = 'LOCKING';
                    this.state.lockTimer = 0;
                }
            } else if (canFall && this.state.phase === 'LOCKING') {
                // Can fall again (unless FLOAT moving up)
                if (!(piece.type === 'FLOAT' && dy < 0)) {
                    this.state.phase = 'FALLING';
                    this.state.lockTimer = 0;
                }
            } else if (this.state.phase === 'LOCKING') {
                // Reset lock timer on successful move
                this.state.lockTimer = 0;
            }
            
            // SOUND: Successful move
            if (this.audio && dx !== 0) {
                this.audio.playSound('move');
            }
            
            // Scoring for soft drop
            if (dy > 0) {
                const oldScore = this.state.score;
                this.state.score += CONSTANTS.SCORING.SOFT_DROP * dy;
                
                // Check for piece unlock
                const oldMilestone = Math.floor(oldScore / 3000);
                const newMilestone = Math.floor(this.state.score / 3000);
                if (newMilestone > oldMilestone) {
                    this.unlockNewPiece();
                }
            }
            
            return true;
        }
        
        // For FLOAT pieces moving horizontally, try one row down
        if (piece.type === 'FLOAT' && dx !== 0 && dy === 0) {
            const altY = targetY + 1;
            if (altY < 20 && Physics.canPieceFitAt(this.state.board, piece, targetX, altY)) {
                piece.gridX = targetX;
                piece.gridY = altY;
                
                // SOUND: Successful move
                if (this.audio) {
                    this.audio.playSound('move');
                }
                
                return true;
            }
        }
        
        // SOUND: Invalid move (hit floor only, not walls)
        if (this.audio && dy < 0) {
            this.audio.playSound('invalid');
        }
        
        return false;
    }
    
    // Rotate piece
    rotate(direction) {
        if (!this.state.current) return false;
        
        const result = Physics.tryRotation(this.state.board, this.state.current, direction);
        
        if (!result.success) {
            // SOUND: Failed rotation
            if (this.audio) {
                this.audio.playSound('invalid');
            }
            return false;
        }
        
        this.state.current = result.piece;
        
        // SOUND: Successful rotation
        if (this.audio) {
            this.audio.playSound('rotate');
        }
        
        // Check locking phase transitions
        const canFall = Physics.canPieceFitAt(this.state.board, result.piece, result.piece.gridX, result.piece.gridY + 1);
        
        if (!canFall && this.state.phase === 'FALLING') {
            this.state.phase = 'LOCKING';
            this.state.lockTimer = 0;
        } else if (canFall && this.state.phase === 'LOCKING') {
            this.state.phase = 'FALLING';
            this.state.lockTimer = 0;
        } else if (this.state.phase === 'LOCKING') {
            this.state.lockTimer = 0;
        }
        
        return true;
    }
    
    // Hard drop
    hardDrop() {
        if (!this.state.current) return;
        
        const shadowY = Physics.calculateShadow(this.state.board, this.state.current);
        const dropDistance = shadowY - this.state.current.gridY;
        
        if (dropDistance > 0) {
            this.state.current.gridY = shadowY;
            
            // Scoring
            const oldScore = this.state.score;
            this.state.score += CONSTANTS.SCORING.HARD_DROP * dropDistance;
            
            // Check for piece unlock
            const oldMilestone = Math.floor(oldScore / 3000);
            const newMilestone = Math.floor(this.state.score / 3000);
            if (newMilestone > oldMilestone) {
                this.unlockNewPiece();
            }
            
            // SOUND: Drop sound (swoosh) followed by immediate land
            if (this.audio) {
                this.audio.playSound('drop');
                this.audio.playSound('land');
            }
        }
        
        // Immediately lock
        this.lockPiece();
    }
    
    // Lock piece in place
    lockPiece() {
        if (!this.state.current) return;
        
        // Check for game over
        if (this.state.current.gridY < 0) {
            const newBoard = Physics.placePiece(this.state.board, this.state.current);
            this.state.board = newBoard;
            this.state.deathPiece = { ...this.state.current };
            this.state.phase = 'GAME_OVER';
            this.state.current = null;
            
            // SOUND: Game over
            if (this.audio) {
                this.audio.playSound('gameover');
            }
            
            // Update high score if needed
            if (this.state.score > this.savedHighScore) {
                this.savedHighScore = this.state.score;
                this.config.set('game.highScore', this.savedHighScore);
            }
            
            return;
        }
        
        // Place piece on board
        const newBoard = Physics.placePiece(this.state.board, this.state.current);
        
        // Check for lines
        const clearedLines = Physics.findClearedLines(newBoard);
        
        // Update stats
        this.state.pieces++;
        
        // Reset spawn danger flag
        this.state.spawnedInDanger = false;
        
        if (clearedLines.length > 0) {
            // SOUND: Line clear (with line count)
            if (this.audio) {
                this.audio.playSound('clear', { lines: clearedLines.length });
            }
            
            // Create particles
            this.particleSystem.createLineExplosion(clearedLines, newBoard);
            
            this.state.board = newBoard;
            this.state.current = null;
            this.state.phase = 'CLEARING';
            this.state.clearTimer = 0;
            this.state.clearingLines = clearedLines;
            this.state.canHold = true;
        } else {
            // No lines - spawn next
            this.state.board = newBoard;
            this.state.current = null;
            this.state.canHold = true;
            this.spawnNextPiece();
        }
    }
    
    // Finish clearing lines
    finishClearing() {
        const newBoard = Physics.removeClearedLines(this.state.board, this.state.clearingLines);
        const linesCleared = this.state.clearingLines.length;
        
        // Calculate score
        const lineScore = CONSTANTS.SCORING.LINE_VALUES[Math.min(linesCleared, 4)] * this.state.level;
        const comboScore = this.state.combo > 0 ? CONSTANTS.SCORING.COMBO_VALUE * this.state.combo * this.state.level : 0;
        
        this.state.board = newBoard;
        this.state.clearingLines = [];
        this.state.lines += linesCleared;
        this.state.score += lineScore + comboScore;
        
        // Check for piece unlock every 3000 points
        const oldMilestone = Math.floor((this.state.score - lineScore - comboScore) / 3000);
        const newMilestone = Math.floor(this.state.score / 3000);
        
        if (newMilestone > oldMilestone) {
            this.unlockNewPiece();
        }
        
        this.state.combo = linesCleared > 0 ? this.state.combo + 1 : 0;
        
        this.spawnNextPiece();
    }
    
    // Unlock new pieces based on score milestones
    unlockNewPiece() {
        const piecesToUnlock = ['PLUS', 'U', 'DOT'];
        const currentPieceCount = this.state.unlockedPieces.length - 8; // Subtract starting pieces
        
        if (currentPieceCount < piecesToUnlock.length) {
            const newPiece = piecesToUnlock[currentPieceCount];
            this.state.unlockedPieces.push(newPiece);
            this.state.level++; // Level is now based on pieces unlocked
            
            // Play a special sound for unlocking
            if (this.audio) {
                this.audio.playSound('clear', { lines: 2 }); // Use 2-line clear sound
            }
            
            console.log(`🎉 NEW PIECE UNLOCKED: ${newPiece}! Level ${this.state.level}`);
            console.log(`Gravity is now 5% slower due to level ${this.state.level}`);
        }
    }
    
    // Spawn next piece
    spawnNextPiece() {
        if (this.state.phase === 'GAME_OVER') return;
        
        const newPiece = {
            ...this.state.next,
            generation: this.state.generation + 1,
            upMovesUsed: 0
        };
        
        // Check if can spawn
        const canSpawn = Physics.canSpawn(this.state.board, newPiece);
        
        if (!canSpawn) {
            // Piece can't spawn cleanly
            const partiallyBlocked = this.isPartiallyBlocked(newPiece);
            
            if (partiallyBlocked) {
                // Give player a chance
                this.state.current = newPiece;
                this.state.next = this.getNextPiece();
                this.state.phase = 'LOCKING';
                this.state.lockTimer = 0;
                this.state.totalLockTime = 0;
                this.state.spawnedInDanger = true;
                this.state.generation++;
                
                console.log('Piece spawned in danger! You have 1 second to move.');
            } else {
                // Completely blocked - game over
                this.state.deathPiece = newPiece;
                this.state.phase = 'GAME_OVER';
                
                // SOUND: Game over
                if (this.audio) {
                    this.audio.playSound('gameover');
                }
                
                // Update high score if needed
                if (this.state.score > this.savedHighScore) {
                    this.savedHighScore = this.state.score;
                    this.config.set('game.highScore', this.savedHighScore);
                }
            }
            return;
        }
        
        // Normal spawn
        this.state.current = newPiece;
        this.state.next = this.getNextPiece();
        this.state.phase = 'FALLING';
        this.state.spawnedInDanger = false;
        this.state.generation++;
    }
    
    // Check if piece is partially blocked
    isPartiallyBlocked(piece) {
        // Check if piece can be moved in any direction
        const moves = [
            { dx: -1, dy: 0 },
            { dx: 1, dy: 0 },
            { dx: 0, dy: 1 },
        ];
        
        for (const move of moves) {
            if (Physics.canPieceFitAt(this.state.board, piece, piece.gridX + move.dx, piece.gridY + move.dy)) {
                return true;
            }
        }
        
        // Check rotations
        for (const direction of [-1, 1]) {
            const result = Physics.tryRotation(this.state.board, piece, direction);
            if (result.success) {
                return true;
            }
        }
        
        return false;
    }
    
    // Hold piece
    tryHold() {
        if (!this.state.current || !this.state.canHold) {
            // SOUND: Invalid hold
            if (this.audio) {
                this.audio.playSound('invalid');
            }
            return;
        }
        
        const held = this.state.current;
        const newCurrent = this.state.hold || this.state.next;
        
        // Reset positions
        const heldPiece = this.createPiece(held.type);
        const activePiece = {
            ...this.createPiece(newCurrent.type),
            generation: this.state.generation + 1,
            upMovesUsed: 0
        };
        
        this.state.current = activePiece;
        this.state.hold = heldPiece;
        this.state.next = this.state.hold ? this.state.next : this.getNextPiece();
        this.state.canHold = false;
        this.state.phase = 'FALLING';
        this.state.generation++;
        
        // SOUND: Hold sound
        if (this.audio) {
            this.audio.playSound('hold');
        }
    }
    
    // Create piece with stable visual identity
    createPiece(type) {
        const def = PIECE_DEFINITIONS[type];
        if (!def) {
            throw new Error(`Unknown piece type: ${type}`);
        }
        
        return {
            type,
            shape: def.shape,
            color: def.color,
            gridX: def.spawn.x,
            gridY: def.spawn.y,
            rotation: 0,
            upMovesUsed: 0,
            variant: Math.floor(Math.random() * 100),  // Visual variant (0-99)
            uniqueId: `${type}-${Date.now()}-${Math.random()}`  // Unique identifier
        };
    }
    
    // Get next piece
    getNextPiece() {
        const availablePieces = this.getAvailablePieces();
        
        // Special handling for FLOAT
        if (availablePieces.includes('FLOAT') && this.rng.next() < CONSTANTS.PIECES.FLOAT_CHANCE) {
            return this.createPiece('FLOAT');
        }
        
        // Weight special pieces lower
        const weighted = availablePieces.flatMap(piece => {
            const isSpecial = CONSTANTS.PIECES.SPECIAL.includes(piece);
            const weight = isSpecial ? 0.5 : 1.0;
            return Array(Math.floor(weight * 100)).fill(piece);
        });
        
        return this.createPiece(this.rng.choice(weighted));
    }
    
    // Get available pieces
    getAvailablePieces() {
        return this.state.unlockedPieces;
    }
    
    // ============ STATE VALIDATION & RECOVERY ============
    
    validateState() {
        if (!this.state) return false;
        if (!Array.isArray(this.state.board)) return false;
        if (this.state.board.length !== 20) return false;
        if (this.state.score < 0 || this.state.lines < 0) return false;
        if (!CONSTANTS.PIECES.TYPES.includes(this.state.current?.type || 'I')) return false;
        
        return true;
    }
    
    canRecover() {
        return this.errorCount < 5 && this.lastValidState !== null;
    }
    
    recoverFromError() {
        this.errorCount++;
        
        if (this.lastValidState) {
            console.warn('Recovering from invalid state');
            this.state = this.cloneState(this.lastValidState);
            this.state.current = null;
            return;
        }
        
        console.error('Full game reset required');
        this.state = this.createInitialState();
    }
    
    cloneState(state) {
        return {
            ...state,
            board: state.board.map(row => [...row]),
            current: state.current ? { ...state.current } : null,
            next: state.next ? { ...state.next } : null,
            hold: state.hold ? { ...state.hold } : null,
            clearingLines: [...state.clearingLines]
        };
    }
    
    // ============ INPUT HANDLING ============
    
    handleInput(action) {
        // Log action for replay
        this.actionLog.push({
            frame: this.state.frameCount,
            action: action
        });
        
        switch (action.type) {
            case 'UP_PRESSED':
                if (this.state.current?.type === 'FLOAT' && (this.state.current.upMovesUsed || 0) < 7) {
                    this.move(0, -1);
                } else {
                    this.rotate(1);
                }
                break;
            case 'MOVE':
                this.move(action.dx, action.dy);
                break;
            case 'ROTATE':
                this.rotate(action.direction);
                break;
            case 'HARD_DROP':
                this.hardDrop();
                break;
            case 'HOLD':
                this.tryHold();
                break;
            case 'START_GAME':
                this.startGame();
                break;
            case 'PAUSE':
                this.togglePause();
                break;
        }
    }
    
    // ============ PARTICLE SYSTEM ============
    
    getParticles() {
        return this.particleSystem.getParticles();
    }
    
    // ============ GAME CONTROL ============
    
    startGame() {
        if (this.state.phase !== 'MENU' && this.state.phase !== 'GAME_OVER') return;
        
        // Create fresh state
        this.state = this.createInitialState();
        this.state.phase = 'FALLING';
        this.state.startTime = Date.now();
        this.state.current = this.getNextPiece();
        this.state.next = this.getNextPiece();
        
        // Reset for new game
        this.particleSystem.clear();
        this.actionLog = [];
        this.frameCount = 0;
        this.seed = Date.now();
        this.rng = new SeededRandom(this.seed);
        
        // Reset error tracking
        this.errorCount = 0;
        this.lastValidState = null;
    }
    
    togglePause() {
        if (this.state.phase === 'FALLING' || this.state.phase === 'LOCKING') {
            this.state.phase = 'PAUSED';
            
            // SOUND: Pause
            if (this.audio) {
                this.audio.playSound('pause');
            }
        } else if (this.state.phase === 'PAUSED') {
            this.state.phase = 'FALLING';
            
            // SOUND: Unpause
            if (this.audio) {
                this.audio.playSound('pause');
            }
        }
    }
    
    pause() {
        if (this.state.phase === 'FALLING' || this.state.phase === 'LOCKING') {
            this.state.phase = 'PAUSED';
            
            // SOUND: Pause
            if (this.audio) {
                this.audio.playSound('pause');
            }
        }
    }
    
    // ============ CRYPTO/REPLAY SUPPORT ============
    
    generateGameProof() {
        return {
            seed: this.seed,
            finalScore: this.state.score,
            finalLines: this.state.lines,
            frameCount: this.state.frameCount,
            actionLog: this.actionLog,
            stateHash: this.hashState(this.state)
        };
    }
    
    hashState(state) {
        const data = {
            score: state.score,
            lines: state.lines,
            level: state.level,
            pieces: state.pieces
        };
        
        let hash = 0;
        const str = JSON.stringify(data);
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return Math.abs(hash).toString(16);
    }
    
    // Replay game from seed and actions
    static replay(seed, actions) {
        const engine = new GameEngine({ get: () => null });
        engine.seed = seed;
        engine.rng = new SeededRandom(seed);
        engine.startGame();
        
        for (const { frame, action } of actions) {
            while (engine.state.frameCount < frame) {
                engine.tick(16.67);
            }
            
            engine.handleInput(action);
        }
        
        return engine.state;
    }
    
    // ============ DEBUG COMMANDS ============
    
    setLevel(level) {
        this.state.level = Math.max(1, level);
        this.state.lines = (level - 1) * CONSTANTS.SCORING.LINES_PER_LEVEL;
        console.log(`Level set to ${this.state.level}`);
    }
    
    forceNextPiece(type) {
        if (CONSTANTS.PIECES.TYPES.includes(type)) {
            this.state.next = this.createPiece(type);
            console.log(`Next piece set to ${type}`);
        }
    }
    
    getStats() {
        const elapsed = this.state.startTime ? (Date.now() - this.state.startTime) / 1000 : 0;
        
        return {
            score: this.state.score,
            lines: this.state.lines,
            level: this.state.level,
            pieces: this.state.pieces,
            pps: elapsed > 0 ? (this.state.pieces / elapsed).toFixed(2) : 0,
            time: elapsed,
            particles: this.particleSystem.getCount()
        };
    }
}