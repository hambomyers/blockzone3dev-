/**
 * main.js - Professional game initialization with clean audio
 * 
 * Audio is initialized once on first user interaction and
 * passed to the game engine for direct sound triggering.
 * 
 * UPDATED: Added starfield Easter egg integration
 */

import { GameEngine } from './game-engine.js';
import { Renderer } from './renderer.js';
import { InputController } from './input-controller.js';
import { AudioSystem } from './audio-system.js';
import { Config } from './config.js';
import { createStarfieldRenderer } from './starfield.js';

class NeonDrop {
    constructor() {
        this.config = new Config();
        
        // Create stub blockchain object to prevent errors
        this.blockchain = {
            isConnected: () => false,
            isTracking: () => false,
            startGameSession: () => {},
            recordFrame: () => {}
        };
        
        // Core systems
        this.engine = null;
        this.renderer = null;
        this.audio = null;
        this.input = null;
        
        // Starfield Easter egg
        this.starfieldRenderer = null;
        this.starfieldState = {
            enabled: false,
            brightness: 1.0,
            stars: []
        };
        this.starKeys = new Set(); // Track S+T+A+R keys
        
        // Game state
        this.running = false;
        this.lastTime = performance.now();
        this.accumulator = 0;
        
        // Audio initialization flag
        this.audioInitialized = false;
        
        // Initialize with error handling
        this.initialize().catch(this.handleInitError.bind(this));
    }
    
    async initialize() {
        // Load config
        await this.config.load();
        
        // Create audio system (but don't initialize yet)
        this.audio = new AudioSystem(this.config);
        
        // Create game engine with audio system
        this.engine = new GameEngine(this.config, this.audio);
        
        // Create renderer
        const canvas = document.getElementById('game');
        const bgCanvas = document.getElementById('bg');
        this.renderer = new Renderer(canvas, bgCanvas, this.config);
        
        // Create starfield renderer
        this.starfieldRenderer = createStarfieldRenderer();
        
        // Create input controller
        this.input = new InputController(
            this.handleInput.bind(this),
            () => this.engine.getState(),
            this.config
        );
        
        // Setup audio initialization on user interaction
        this.setupAudioInit();
        
        // Setup starfield key detection
        this.setupStarfieldKeys();
        
        // Setup window handlers
        this.setupWindowHandlers();
        
        // Initial render
        this.render();
        
        // Start game loop
        this.running = true;
        this.loop();
        
        // Log success
        console.log('%c🎮 Neon Drop initialized successfully', 
            'color: #8A2BE2; font-size: 16px; font-weight: bold');
    }
    
    setupAudioInit() {
        // Initialize audio on first user interaction
        const initAudio = () => {
            if (!this.audioInitialized) {
                this.audioInitialized = this.audio.init();
                if (this.audioInitialized) {
                    console.log('🔊 Audio initialized on user interaction');
                }
            }
        };
        
        // Multiple event types to catch first interaction
        ['click', 'keydown', 'touchstart'].forEach(eventType => {
            document.addEventListener(eventType, initAudio, { once: true });
        });
    }
    
    setupStarfieldKeys() {
        // Track S+T+A+R keys for Easter egg
        document.addEventListener('keydown', (e) => {
            // Only in menu
            if (this.engine.getState().phase !== 'MENU') return;
            
            // Track STAR keys
            if (e.key.toUpperCase() === 'S') this.starKeys.add('S');
            if (e.key.toUpperCase() === 'T') this.starKeys.add('T');
            if (e.key.toUpperCase() === 'A') this.starKeys.add('A');
            if (e.key.toUpperCase() === 'R') this.starKeys.add('R');
            
            // Check if all keys are held
            if (this.starKeys.size === 4) {
                this.toggleStarfield();
                this.starKeys.clear();
            }
            
            // Brightness controls when starfield is active
            if (this.starfieldState.enabled) {
                if (e.key === '+' || e.key === '=') {
                    this.adjustStarfieldBrightness(0.1);
                } else if (e.key === '-' || e.key === '_') {
                    this.adjustStarfieldBrightness(-0.1);
                }
            }
        });
        
        document.addEventListener('keyup', (e) => {
            // Clear keys on release
            const key = e.key.toUpperCase();
            if (['S', 'T', 'A', 'R'].includes(key)) {
                this.starKeys.delete(key);
            }
        });
    }
    
    toggleStarfield() {
        this.starfieldState.enabled = !this.starfieldState.enabled;
        
        if (this.starfieldState.enabled) {
            // Calculate initial stars
            this.starfieldState.stars = this.starfieldRenderer.calculateStars();
            console.log('✨ Starfield enabled! Use +/- to adjust brightness');
        } else {
            console.log('Starfield disabled');
        }
        
        // Save preference
        this.config.set('graphics.starfield', this.starfieldState.enabled);
    }
    
    adjustStarfieldBrightness(delta) {
        this.starfieldState.brightness = Math.max(0.1, Math.min(2.0, 
            this.starfieldState.brightness + delta));
        console.log(`Starfield brightness: ${(this.starfieldState.brightness * 100).toFixed(0)}%`);
    }
    
    handleInput(action) {
        if (!this.engine) return;
        
        // Ensure audio is initialized on any input
        if (!this.audioInitialized) {
            this.audioInitialized = this.audio.init();
        }
        
        // Handle menu/game over states specially
        if (this.engine.getState().phase === 'MENU' || this.engine.getState().phase === 'GAME_OVER') {
            if (action.type === 'START_GAME' || action.type === 'SPACE' || action.type === 'ENTER') {
                // Convert to START_GAME for engine
                this.engine.handleInput({ type: 'START_GAME' });
                return;
            }
        }
        
        // During gameplay, Space is hard drop
        if ((action.type === 'SPACE' || action.type === 'START_GAME') && 
            (this.engine.getState().phase === 'FALLING' || this.engine.getState().phase === 'LOCKING')) {
            // Convert to HARD_DROP during gameplay
            action = { type: 'HARD_DROP' };
        }
        
        // Convert ESCAPE to PAUSE
        if (action.type === 'ESCAPE') {
            action = { type: 'PAUSE' };
        }
        
        // Apply action to engine - the engine handles all sound triggers
        this.engine.handleInput(action);
    }
    
    loop() {
        if (!this.running) return;
        
        const now = performance.now();
        const deltaTime = Math.min(now - this.lastTime, 100); // Cap at 100ms
        this.lastTime = now;
        
        // Fixed timestep with accumulation
        this.accumulator += deltaTime;
        const tickRate = this.config.get('game.tickRate');
        
        // Update logic at fixed timestep
        let updated = false;
        while (this.accumulator >= tickRate) {
            this.update(tickRate);
            this.accumulator -= tickRate;
            updated = true;
        }
        
        // Render only if updated
        if (updated) {
            this.render();
        }
        
        // Continue loop
        requestAnimationFrame(() => this.loop());
    }
    
    update(deltaTime) {
        // Update game engine
        this.engine.tick(deltaTime);
        
        // Update starfield stars periodically (every hour)
        if (this.starfieldState.enabled && Date.now() % 3600000 < deltaTime) {
            this.starfieldState.stars = this.starfieldRenderer.calculateStars();
        }
    }
    
    render() {
        const state = this.engine.getState();
        const particles = this.engine.getParticles();
        
        // Pass starfield state to renderer
        this.renderer.render(state, particles, this.starfieldState);
    }
    
    setupWindowHandlers() {
        // Handle resize
        window.addEventListener('resize', () => {
            this.renderer.handleResize();
        });
        
        // Handle visibility change
        document.addEventListener('visibilitychange', () => {
            if (document.hidden && this.engine.getState().phase === 'FALLING') {
                this.engine.pause();
            }
        });
        
        // Handle errors
        window.addEventListener('error', (event) => {
            console.error('Game error:', event.error);
            this.handleError(event.error);
        });
        
        // Handle before unload
        window.addEventListener('beforeunload', () => {
            this.config.save();
        });
    }
    
    handleError(error) {
        // Log error
        console.error('Game error:', error);
        
        // Try to recover
        if (this.engine && this.engine.canRecover()) {
            console.log('Attempting recovery...');
            this.engine.recoverFromError();
        } else {
            // Show error message
            this.showErrorMessage('An error occurred. Please refresh the page.');
        }
    }
    
    handleInitError(error) {
        console.error('Initialization failed:', error);
        this.showErrorMessage('Failed to initialize game. Please refresh the page.');
    }
    
    showErrorMessage(message) {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-message';
        errorDiv.textContent = message;
        document.body.appendChild(errorDiv);
    }
    
    // Public API for debugging
    getState() { return this.engine?.getState(); }
    getConfig() { return this.config; }
    getStats() { return this.engine?.getStats(); }
}

// Initialize when DOM is ready
let gameInstance = null;

function initializeGame() {
    try {
        gameInstance = new NeonDrop();
        
        // Expose debug interface
        window.neonDrop = {
            game: gameInstance,
            state: () => gameInstance.getState(),
            config: () => gameInstance.getConfig(),
            stats: () => gameInstance.getStats(),
            
            // Debug commands
            setLevel: (n) => gameInstance.engine.setLevel(n),
            spawnPiece: (type) => gameInstance.engine.forceNextPiece(type),
            showGrid: () => gameInstance.renderer.toggleGrid(),
            
            // Audio debug
            mute: () => gameInstance.audio.mute(),
            unmute: () => gameInstance.audio.unmute(),
            setVolume: (v) => gameInstance.audio.setVolume(v),
            
            // Starfield debug
            toggleStarfield: () => gameInstance.toggleStarfield(),
            setStarBrightness: (b) => { 
                gameInstance.starfieldState.brightness = b;
                console.log(`Starfield brightness: ${(b * 100).toFixed(0)}%`);
            }
        };
        
    } catch (error) {
        console.error('Failed to create game instance:', error);
        document.body.innerHTML = '<div class="error">Failed to initialize game</div>';
    }
}

// Wait for DOM
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeGame);
} else {
    initializeGame();
}

// Prevent accidental navigation
window.addEventListener('keydown', (e) => {
    // Prevent backspace navigation
    if (e.key === 'Backspace' && e.target === document.body) {
        e.preventDefault();
    }
    
    // Prevent space scrolling
    if (e.key === ' ' && e.target === document.body) {
        e.preventDefault();
    }
});