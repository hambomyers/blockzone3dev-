/**
 * audio-system.js - Simplified audio engine
 * 
 * Only responsible for playing sounds when requested.
 * No state tracking or change detection.
 * 
 * Professional game audio with:
 * - Lazy initialization on user interaction
 * - Per-sound cooldowns to prevent spam
 * - Graceful fallback if audio fails
 * 
 * UPDATED: Added 'land' sound for immediate feedback when pieces touch down
 */

export class AudioSystem {
    constructor(config) {
        this.config = config;
        this.ctx = null;
        this.initialized = false;
        this.enabled = true;
        this.lastPlayed = new Map();
        
        // Get volume from config
        this.volume = config.get('audio.masterVolume') || 0.3;
        
        // Listen for volume changes
        config.onChange('audio.masterVolume', (newVolume) => {
            this.volume = newVolume;
        });
        
        // Check if sound effects are enabled
        config.onChange('audio.soundEffects', (enabled) => {
            this.enabled = enabled;
        });
    }
    
    /**
     * Initialize audio context
     * Must be called after user interaction due to browser policies
     */
    init() {
        if (this.initialized) return true;
        
        try {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
            this.initialized = true;
            
            // Resume if suspended
            if (this.ctx.state === 'suspended') {
                this.ctx.resume().catch(e => {
                    console.warn('Failed to resume audio context:', e);
                });
            }
            
            console.log('✅ Audio system initialized');
            return true;
        } catch (e) {
            console.warn('❌ Audio initialization failed:', e);
            this.enabled = false;
            return false;
        }
    }
    
    /**
     * Check if audio is ready
     */
    isReady() {
        return this.initialized && this.enabled && this.ctx && this.ctx.state === 'running';
    }
    
    /**
     * Play a sound by type
     * @param {string} type - Sound type to play
     * @param {Object} params - Optional parameters for the sound
     */
    playSound(type, params = {}) {
        // Check if we should play
        if (!this.enabled || !this.config.get('audio.soundEffects')) return;
        
        // Initialize if needed
        if (!this.initialized) {
            if (!this.init()) return;
        }
        
        // Check cooldown
        const now = Date.now();
        const cooldown = params.cooldown || 50;
        const lastTime = this.lastPlayed.get(type) || 0;
        
        if (now - lastTime < cooldown) return;
        
        this.lastPlayed.set(type, now);
        
        // Play the appropriate sound
        try {
            switch(type) {
                case 'move':
                    this.playMoveSound();
                    break;
                    
                case 'rotate':
                    this.playRotateSound();
                    break;
                    
                case 'drop':
                    this.playDropSound();
                    break;
                    
                case 'land':
                    this.playLandSound();
                    break;
                    
                case 'lock':
                    this.playLockSound();
                    break;
                    
                case 'clear':
                    this.playLineClearSound(params.lines || 1);
                    break;
                    
                case 'hold':
                    this.playHoldSound();
                    break;
                    
                case 'levelup':
                    this.playLevelUpSound();
                    break;
                    
                case 'gameover':
                    this.playGameOverSound();
                    break;
                    
                case 'pause':
                    this.playPauseSound();
                    break;
                    
                case 'invalid':
                    this.playInvalidSound();
                    break;
            }
        } catch (e) {
            console.warn(`Failed to play sound ${type}:`, e);
        }
    }
    
    // ============ SOUND GENERATORS ============
    
    playMoveSound() {
        const now = this.ctx.currentTime;
        
        // Mozart's G4 (392 Hz) - Most common note in Eine kleine Nachtmusik
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(392, now); // G4
        
        // Very short, subtle note
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(this.volume * 0.15, now + 0.005);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);
        
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        
        osc.start(now);
        osc.stop(now + 0.05);
    }
    
    playRotateSound() {
        const now = this.ctx.currentTime;
        
        // Mozart's D5 (587 Hz) - The dominant, second most important note
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(587, now); // D5
        
        // Slightly longer than move
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(this.volume * 0.18, now + 0.007);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
        
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        
        osc.start(now);
        osc.stop(now + 0.06);
    }
    
    playDropSound() {
        const now = this.ctx.currentTime;
        
        // Mozart's D6 (1175 Hz) - High D for the swoosh
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1175, now); // D6
        osc.frequency.exponentialRampToValueAtTime(587, now + 0.1); // Glide down to D5
        
        gain.gain.setValueAtTime(this.volume * 0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
        
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        
        osc.start(now);
        osc.stop(now + 0.15);
    }
    
    playLandSound() {
        const now = this.ctx.currentTime;
        
        // Mozart's G3 (196 Hz) - Deep bass G, an octave below the main theme
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(196, now); // G3
        
        // Add subtle 5th harmonic for richness
        const fifth = this.ctx.createOscillator();
        fifth.type = 'sine';
        fifth.frequency.setValueAtTime(294, now); // D4 (perfect fifth)
        
        // Thud envelope
        gain.gain.setValueAtTime(this.volume * 0.4, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
        
        osc.connect(gain);
        fifth.connect(gain);
        gain.connect(this.ctx.destination);
        
        osc.start(now);
        osc.stop(now + 0.15);
        fifth.start(now);
        fifth.stop(now + 0.15);
    }
    
    playLockSound() {
        const now = this.ctx.currentTime;
        
        // Mozart's B4 (494 Hz) - Completes the G major triad
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(494, now); // B4
        
        // Quick, bright click
        gain.gain.setValueAtTime(this.volume * 0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);
        
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        
        osc.start(now);
        osc.stop(now + 0.05);
    }
    
    playLineClearSound(lineCount) {
        const now = this.ctx.currentTime;
        
        // Mozart's ascending G major scale for line clears
        const notes = {
            1: 784,  // G5
            2: 988,  // B5
            3: 1175, // D6
            4: 1568  // G6 - Perfect octave resolution!
        };
        
        const freq = notes[lineCount] || notes[1];
        const duration = 0.3 + (lineCount * 0.1);
        
        // Main tone
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now);
        
        // Volume increases with line count
        const volume = this.volume * (0.3 + lineCount * 0.1);
        
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(volume, now + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
        
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        
        osc.start(now);
        osc.stop(now + duration + 0.1);
        
        // Add perfect fifth harmony for 2+ lines
        if (lineCount >= 2) {
            const harmonic = this.ctx.createOscillator();
            const harmonicGain = this.ctx.createGain();
            
            harmonic.type = 'sine';
            // Add a perfect fifth below (multiply by 2/3)
            harmonic.frequency.setValueAtTime(freq * 2/3, now);
            
            harmonicGain.gain.setValueAtTime(0, now);
            harmonicGain.gain.linearRampToValueAtTime(volume * 0.3, now + 0.01);
            harmonicGain.gain.exponentialRampToValueAtTime(0.001, now + duration);
            
            harmonic.connect(harmonicGain);
            harmonicGain.connect(this.ctx.destination);
            
            harmonic.start(now);
            harmonic.stop(now + duration + 0.1);
        }
        
        // Tetris (4 lines) gets the full Eine kleine Nachtmusik opening!
        if (lineCount === 4) {
            this.playMozartMotif();
        }
    }
    
    playMozartMotif() {
        const now = this.ctx.currentTime;
        // G-G-D-D-G-G-D - The famous opening!
        const motif = [
            { note: 392, time: 0.2 },    // G4
            { note: 392, time: 0.3 },    // G4
            { note: 587, time: 0.4 },    // D5
            { note: 587, time: 0.5 },    // D5
            { note: 784, time: 0.6 },    // G5
            { note: 784, time: 0.7 },    // G5
            { note: 587, time: 0.8 },    // D5
        ];
        
        motif.forEach(({ note, time }) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            
            osc.type = 'sine';
            osc.frequency.setValueAtTime(note, now + time);
            
            gain.gain.setValueAtTime(0, now + time);
            gain.gain.linearRampToValueAtTime(this.volume * 0.15, now + time + 0.01);
            gain.gain.exponentialRampToValueAtTime(0.001, now + time + 0.08);
            
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            
            osc.start(now + time);
            osc.stop(now + time + 0.1);
        });
    }
    
    playHoldSound() {
        const now = this.ctx.currentTime;
        
        // Soft swoosh
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(200, now);
        osc.frequency.exponentialRampToValueAtTime(400, now + 0.1);
        
        gain.gain.setValueAtTime(this.volume * 0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
        
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        
        osc.start(now);
        osc.stop(now + 0.15);
    }
    
    playLevelUpSound() {
        const now = this.ctx.currentTime;
        const notes = [261, 330, 392, 523]; // C4, E4, G4, C5
        
        notes.forEach((freq, i) => {
            const delay = i * 0.05;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            
            osc.type = 'square';
            osc.frequency.setValueAtTime(freq, now + delay);
            
            gain.gain.setValueAtTime(this.volume * 0.2, now + delay);
            gain.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.1);
            
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            
            osc.start(now + delay);
            osc.stop(now + delay + 0.15);
        });
    }
    
    playGameOverSound() {
        const now = this.ctx.currentTime;
        
        // Deep gong
        const fundamental = 55; // Low A
        const harmonics = [1, 2.76, 4.92];
        
        harmonics.forEach((ratio, i) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            
            osc.type = 'sine';
            osc.frequency.setValueAtTime(fundamental * ratio, now);
            
            // Slight vibrato
            const vibrato = this.ctx.createOscillator();
            const vibratoGain = this.ctx.createGain();
            vibrato.frequency.setValueAtTime(3, now);
            vibratoGain.gain.setValueAtTime(ratio * 0.5, now);
            
            vibrato.connect(vibratoGain);
            vibratoGain.connect(osc.frequency);
            
            // ADSR envelope
            const attackTime = 0.05;
            const decayTime = 0.3;
            const sustainLevel = 0.3 / (i + 1);
            const releaseTime = 3.0;
            
            gain.gain.setValueAtTime(0, now);
            gain.gain.linearRampToValueAtTime(this.volume * 0.5 / (i + 1), now + attackTime);
            gain.gain.exponentialRampToValueAtTime(sustainLevel * this.volume, now + attackTime + decayTime);
            gain.gain.exponentialRampToValueAtTime(0.001, now + releaseTime);
            
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            
            osc.start(now);
            osc.stop(now + releaseTime + 0.1);
            vibrato.start(now);
            vibrato.stop(now + releaseTime + 0.1);
        });
        
        // Impact sound
        const noise = this.ctx.createBufferSource();
        const noiseBuffer = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.1, this.ctx.sampleRate);
        const noiseData = noiseBuffer.getChannelData(0);
        
        for (let i = 0; i < noiseData.length; i++) {
            noiseData[i] = (Math.random() - 0.5) * 2 * (1 - i / noiseData.length);
        }
        
        noise.buffer = noiseBuffer;
        
        const noiseFilter = this.ctx.createBiquadFilter();
        noiseFilter.type = 'lowpass';
        noiseFilter.frequency.setValueAtTime(200, now);
        
        const noiseGain = this.ctx.createGain();
        noiseGain.gain.setValueAtTime(this.volume * 0.2, now);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
        
        noise.connect(noiseFilter);
        noiseFilter.connect(noiseGain);
        noiseGain.connect(this.ctx.destination);
        
        noise.start(now);
    }
    
    playPauseSound() {
        const now = this.ctx.currentTime;
        
        // Two-tone beep
        const osc1 = this.ctx.createOscillator();
        const osc2 = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(440, now);
        
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(880, now);
        
        gain.gain.setValueAtTime(this.volume * 0.1, now);
        gain.gain.setValueAtTime(this.volume * 0.1, now + 0.05);
        gain.gain.setValueAtTime(0, now + 0.1);
        
        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(this.ctx.destination);
        
        osc1.start(now);
        osc1.stop(now + 0.1);
        osc2.start(now + 0.05);
        osc2.stop(now + 0.1);
    }
    
    playInvalidSound() {
        const now = this.ctx.currentTime;
        
        // Error buzz
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(100, now);
        
        gain.gain.setValueAtTime(this.volume * 0.1, now);
        gain.gain.setValueAtTime(0, now + 0.05);
        
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        
        osc.start(now);
        osc.stop(now + 0.05);
    }
    
    // ============ UTILITY METHODS ============
    
    setVolume(volume) {
        this.volume = Math.max(0, Math.min(1, volume));
        this.config.set('audio.masterVolume', this.volume);
    }
    
    mute() {
        this.enabled = false;
        this.config.set('audio.soundEffects', false);
    }
    
    unmute() {
        this.enabled = true;
        this.config.set('audio.soundEffects', true);
    }
    
    toggle() {
        if (this.enabled) {
            this.mute();
        } else {
            this.unmute();
        }
    }
}