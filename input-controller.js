/**
 * input-controller.js - State-aware input handling
 * 
 * Features:
 * - DAS (Delayed Auto Shift) for smooth piece movement
 * - ARR (Auto Repeat Rate) for continuous input
 * - State awareness - blocks invalid inputs based on game phase
 * - Professional input handling like modern Tetris games
 * 
 * CLEANED: No audio handling - that's done in the game engine
 */

export class InputController {
    constructor(onAction, getState, config) {
        this.onAction = onAction;
        this.getState = getState;
        this.config = config;
        this.keys = new Map();
        this.das = new Map(); // Delayed Auto Shift timers
        this.arr = new Map(); // Auto Repeat Rate timers
        
        // Timing configuration from config
        this.DAS_DELAY = config.get('input.dasDelay') || 133;
        this.ARR_RATE = config.get('input.arrRate') || 10;
        
        // Listen for config changes
        config.onChange('input.dasDelay', (value) => {
            this.DAS_DELAY = value;
        });
        
        config.onChange('input.arrRate', (value) => {
            this.ARR_RATE = value;
        });
        
        // Track last successful move position to prevent ghosting
        this.lastValidPosition = null;
        
        this.setupListeners();
    }
    
    setupListeners() {
        document.addEventListener('keydown', (e) => this.onKeyDown(e));
        document.addEventListener('keyup', (e) => this.onKeyUp(e));
    }
    
    onKeyDown(e) {
        // Ignore held keys
        if (this.keys.has(e.code)) return;
        
        this.keys.set(e.code, true);
        
        // Convert key to game action
        const action = this.keyToAction(e.code);
        if (!action) return;
        
        // Check if action is allowed in current state
        if (!this.isActionAllowed(action)) return;
        
        // Execute action immediately
        this.onAction(action);
        
        // Track position for movement actions
        if (action.type === 'MOVE') {
            const state = this.getState();
            if (state.current) {
                this.lastValidPosition = {
                    x: state.current.gridX,
                    y: state.current.gridY
                };
            }
            
            // Setup auto-repeat for movement
            this.startAutoRepeat(e.code, action);
        }
    }
    
    onKeyUp(e) {
        this.keys.delete(e.code);
        this.stopAutoRepeat(e.code);
        
        // Clear position tracking when key is released
        if (this.keyToAction(e.code)?.type === 'MOVE') {
            this.lastValidPosition = null;
        }
    }
    
    keyToAction(keyCode) {
        const mapping = {
            // Movement
            'ArrowLeft': { type: 'MOVE', dx: -1, dy: 0 },
            'KeyA': { type: 'MOVE', dx: -1, dy: 0 },
            'ArrowRight': { type: 'MOVE', dx: 1, dy: 0 },
            'KeyD': { type: 'MOVE', dx: 1, dy: 0 },
            'ArrowDown': { type: 'MOVE', dx: 0, dy: 1 },
            'KeyS': { type: 'MOVE', dx: 0, dy: 1 },
            
            // Just report UP was pressed
            'ArrowUp': { type: 'UP_PRESSED' },
            'KeyW': { type: 'UP_PRESSED' },
            
            // Other rotation keys  
            'KeyZ': { type: 'ROTATE', direction: -1 },
            'ShiftLeft': { type: 'ROTATE', direction: -1 },
            'KeyX': { type: 'ROTATE', direction: 1 },
            'ControlLeft': { type: 'ROTATE', direction: 1 },
            
            // Special actions
            'Space': { type: 'SPACE' },
            'KeyC': { type: 'HOLD' },
            'ShiftRight': { type: 'HOLD' },
            'Escape': { type: 'ESCAPE' },
            'Enter': { type: 'ENTER' }
        };
        
        return mapping[keyCode];
    }
    
    isActionAllowed(action) {
        const state = this.getState();
        
        // Menu/Game Over - only allow start keys
        if (state.phase === 'MENU' || state.phase === 'GAME_OVER') {
            return action.type === 'SPACE' || action.type === 'ENTER' || action.type === 'ESCAPE';
        }
        
        // Paused - only allow unpause
        if (state.phase === 'PAUSED') {
            return action.type === 'SPACE' || action.type === 'ENTER' || action.type === 'ESCAPE';
        }
        
        // Block downward movement in LOCKING phase
        if (state.phase === 'LOCKING' && action.type === 'MOVE' && action.dy > 0) {
            return false;
        }
        
        // Additional validation for movement
        if (action.type === 'MOVE' && state.current && this.lastValidPosition) {
            // Check if piece position has changed unexpectedly
            if (state.current.gridX !== this.lastValidPosition.x ||
                state.current.gridY !== this.lastValidPosition.y) {
                // Position changed, update our tracking
                this.lastValidPosition = {
                    x: state.current.gridX,
                    y: state.current.gridY
                };
            }
        }
        
        return true;
    }
    
    startAutoRepeat(keyCode, action) {
        // DAS: Wait before starting repeat
        const dasTimer = setTimeout(() => {
            // ARR: Repeat at fixed rate
            const arrTimer = setInterval(() => {
                if (this.keys.has(keyCode)) {
                    // Re-validate action before each repeat
                    if (this.isActionAllowed(action)) {
                        // Check current position before action
                        const stateBefore = this.getState();
                        const posBefore = stateBefore.current ? {
                            x: stateBefore.current.gridX,
                            y: stateBefore.current.gridY
                        } : null;
                        
                        // Execute action
                        this.onAction(action);
                        
                        // Verify position after action
                        const stateAfter = this.getState();
                        const posAfter = stateAfter.current ? {
                            x: stateAfter.current.gridX,
                            y: stateAfter.current.gridY
                        } : null;
                        
                        // If position didn't change for horizontal move, stop repeating
                        if (action.dx !== 0 && posBefore && posAfter &&
                            posBefore.x === posAfter.x && posBefore.y === posAfter.y) {
                            // Hit a wall, stop auto-repeat
                            clearInterval(arrTimer);
                            this.arr.delete(keyCode);
                        } else if (posAfter) {
                            // Update tracked position
                            this.lastValidPosition = posAfter;
                        }
                    } else {
                        // Action no longer allowed, stop
                        clearInterval(arrTimer);
                        this.arr.delete(keyCode);
                    }
                } else {
                    // Key released, stop
                    clearInterval(arrTimer);
                    this.arr.delete(keyCode);
                }
            }, this.ARR_RATE);
            
            this.arr.set(keyCode, arrTimer);
        }, this.DAS_DELAY);
        
        this.das.set(keyCode, dasTimer);
    }
    
    stopAutoRepeat(keyCode) {
        // Clear DAS timer
        const dasTimer = this.das.get(keyCode);
        if (dasTimer) {
            clearTimeout(dasTimer);
            this.das.delete(keyCode);
        }
        
        // Clear ARR timer
        const arrTimer = this.arr.get(keyCode);
        if (arrTimer) {
            clearInterval(arrTimer);
            this.arr.delete(keyCode);
        }
    }
    
    // Clean up when controller is destroyed
    destroy() {
        // Remove event listeners
        document.removeEventListener('keydown', this.onKeyDown);
        document.removeEventListener('keyup', this.onKeyUp);
        
        // Clear all timers
        this.das.forEach(timer => clearTimeout(timer));
        this.arr.forEach(timer => clearInterval(timer));
        
        this.das.clear();
        this.arr.clear();
        this.keys.clear();
    }
}