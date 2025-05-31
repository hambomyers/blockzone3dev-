/**
 * config.js - Centralized configuration with validation
 * 
 * All game constants, settings, and configuration in one place.
 * Type-safe with validation and persistence.
 */

export class Config {
    constructor() {
        this.data = {};
        this.listeners = new Map();
        this.validators = new Map();
        
        this.setupValidators();
        this.reset();
    }
    
    // ============ CONSTANTS ============
    static CONSTANTS = {
        BOARD: {
            WIDTH: 10,
            HEIGHT: 20,
            BLOCK_SIZE: 24
        },
        
        TIMING: {
            TICK_RATE: 16.67, // 60 FPS
            LOCK_DELAY: 500,
            LOCK_DELAY_FLOAT: 600,
            MAX_LOCK_TIME: 5000,
            CLEAR_ANIMATION_TIME: 300,
            GRAVITY_BASE: 1000,
            GRAVITY_DECREASE: 50,
            GRAVITY_MIN: 50
        },
        
        INPUT: {
            DAS_DELAY_DEFAULT: 133,
            DAS_DELAY_MIN: 50,
            DAS_DELAY_MAX: 300,
            ARR_RATE_DEFAULT: 10,
            ARR_RATE_MIN: 0,
            ARR_RATE_MAX: 50,
            SOUND_COOLDOWN: 50
        },
        
        SCORING: {
            SOFT_DROP: 1,
            HARD_DROP: 2,
            LINE_VALUES: [0, 100, 300, 500, 800],
            SPIN_VALUES: [400, 800, 1200, 1600],
            BACK_TO_BACK_MULTIPLIER: 0.5,
            COMBO_VALUE: 50,
            PERFECT_CLEAR_VALUES: [0, 800, 1200, 1800, 2000],
            LINES_PER_LEVEL: 10
        },
        
        PIECES: {
            TYPES: ['I', 'J', 'L', 'O', 'S', 'T', 'Z', 'FLOAT', 'PLUS', 'U', 'DOT'],
            STANDARD: ['I', 'J', 'L', 'O', 'S', 'T', 'Z'],
            SPECIAL: ['FLOAT', 'PLUS', 'U', 'DOT'],
            FLOAT_CHANCE: 0.07,
            FLOAT_MAX_UP_MOVES: 7,
            SPECIAL_WEIGHT: 0.5
        },
        
        PARTICLES: {
            PER_BLOCK_MIN: 15,
            PER_BLOCK_MAX: 25,
            LIFETIME: 1000,
            GRAVITY: 300,
            MAX_PARTICLES: 500
        },
        
        AUDIO: {
            MASTER_VOLUME_DEFAULT: 0.3,
            SOUND_COOLDOWN: 50,
            MUSIC_FADE_TIME: 2000
        },
        
        BLOCKCHAIN: {
            MIN_SCORE_TO_SUBMIT: 1000,
            PROOF_CHECKPOINT_INTERVAL: 60, // frames
            MAX_PROOF_SIZE: 10000, // bytes
            VERIFICATION_TIMEOUT: 30000 // ms
        }
    };
    
    // ============ DEFAULT SETTINGS ============
    defaults() {
        return {
            game: {
                highScore: 0,
                gamesPlayed: 0,
                totalLines: 0,
                tickRate: Config.CONSTANTS.TIMING.TICK_RATE
            },
            
            graphics: {
                particles: true,
                ghostPiece: true,
                screenShake: false,
                showFPS: false,
                showGrid: false,
                theme: 'neon'
            },
            
            audio: {
                masterVolume: Config.CONSTANTS.AUDIO.MASTER_VOLUME_DEFAULT,
                soundEffects: true,
                music: false,
                announcer: false
            },
            
            input: {
                dasDelay: Config.CONSTANTS.INPUT.DAS_DELAY_DEFAULT,
                arrRate: Config.CONSTANTS.INPUT.ARR_RATE_DEFAULT,
                handling: 'modern', // 'modern' or 'classic'
                softDropSpeed: 1
            },
            
            wallet: {
                connected: false,
                address: null,
                network: 'testnet',
                playerNFT: null
            }
        };
    }
    
    // ============ VALIDATION ============
    setupValidators() {
        // Audio validators
        this.validators.set('audio.masterVolume', (value) => {
            return typeof value === 'number' && value >= 0 && value <= 1;
        });
        
        // Input validators
        this.validators.set('input.dasDelay', (value) => {
            return typeof value === 'number' && 
                   value >= Config.CONSTANTS.INPUT.DAS_DELAY_MIN && 
                   value <= Config.CONSTANTS.INPUT.DAS_DELAY_MAX;
        });
        
        this.validators.set('input.arrRate', (value) => {
            return typeof value === 'number' && 
                   value >= Config.CONSTANTS.INPUT.ARR_RATE_MIN && 
                   value <= Config.CONSTANTS.INPUT.ARR_RATE_MAX;
        });
        
        // Wallet validators
        this.validators.set('wallet.address', (value) => {
            return value === null || (typeof value === 'string' && value.match(/^0x[a-fA-F0-9]{40}$/));
        });
    }
    
    // ============ CORE METHODS ============
    async load() {
        try {
            const saved = localStorage.getItem('neonDropConfig');
            if (saved) {
                const parsed = JSON.parse(saved);
                this.data = this.merge(this.defaults(), parsed);
            } else {
                this.data = this.defaults();
            }
        } catch (error) {
            console.warn('Failed to load config:', error);
            this.data = this.defaults();
        }
    }
    
    save() {
        try {
            localStorage.setItem('neonDropConfig', JSON.stringify(this.data));
        } catch (error) {
            console.warn('Failed to save config:', error);
        }
    }
    
    get(path) {
        const keys = path.split('.');
        let value = this.data;
        
        for (const key of keys) {
            value = value?.[key];
            if (value === undefined) return undefined;
        }
        
        return value;
    }
    
    set(path, value) {
        // Validate
        const validator = this.validators.get(path);
        if (validator && !validator(value)) {
            console.warn(`Invalid value for ${path}:`, value);
            return false;
        }
        
        const keys = path.split('.');
        let obj = this.data;
        
        // Navigate to parent
        for (let i = 0; i < keys.length - 1; i++) {
            if (!obj[keys[i]]) obj[keys[i]] = {};
            obj = obj[keys[i]];
        }
        
        const lastKey = keys[keys.length - 1];
        const oldValue = obj[lastKey];
        obj[lastKey] = value;
        
        // Save and notify
        this.save();
        this.notify(path, value, oldValue);
        
        return true;
    }
    
    reset() {
        this.data = this.defaults();
        this.save();
        this.notify('', this.data, null);
    }
    
    // ============ OBSERVERS ============
    onChange(path, callback) {
        if (!this.listeners.has(path)) {
            this.listeners.set(path, new Set());
        }
        
        this.listeners.get(path).add(callback);
        
        // Return unsubscribe function
        return () => {
            this.listeners.get(path)?.delete(callback);
        };
    }
    
    notify(path, newValue, oldValue) {
        // Notify exact path listeners
        this.listeners.get(path)?.forEach(cb => cb(newValue, oldValue, path));
        
        // Notify parent path listeners
        const parts = path.split('.');
        for (let i = parts.length - 1; i > 0; i--) {
            const parentPath = parts.slice(0, i).join('.');
            this.listeners.get(parentPath)?.forEach(cb => 
                cb(this.get(parentPath), undefined, parentPath)
            );
        }
        
        // Notify root listeners
        this.listeners.get('')?.forEach(cb => cb(this.data, undefined, ''));
    }
    
    // ============ UTILITY METHODS ============
    merge(target, source) {
        const result = { ...target };
        
        for (const key in source) {
            if (source.hasOwnProperty(key)) {
                if (typeof source[key] === 'object' && 
                    source[key] !== null && 
                    !Array.isArray(source[key])) {
                    result[key] = this.merge(result[key] || {}, source[key]);
                } else {
                    result[key] = source[key];
                }
            }
        }
        
        return result;
    }
    
    export() {
        return JSON.stringify(this.data, null, 2);
    }
    
    import(jsonString) {
        try {
            const imported = JSON.parse(jsonString);
            this.data = this.merge(this.defaults(), imported);
            this.save();
            this.notify('', this.data, null);
            return true;
        } catch (error) {
            console.error('Failed to import config:', error);
            return false;
        }
    }
    
    // ============ STATISTICS ============
    incrementStat(path, amount = 1) {
        const current = this.get(path) || 0;
        this.set(path, current + amount);
    }
    
    getStats() {
        return {
            gamesPlayed: this.get('game.gamesPlayed') || 0,
            highScore: this.get('game.highScore') || 0,
            totalLines: this.get('game.totalLines') || 0,
            averageScore: this.get('game.gamesPlayed') > 0 ? 
                Math.floor((this.get('game.totalScore') || 0) / this.get('game.gamesPlayed')) : 0
        };
    }
}

// Export constants for easy access
export const CONSTANTS = Config.CONSTANTS;