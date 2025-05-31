/**
 * input-controller.js - State-aware input handling with full touch support
 * 
 * Features:
 * - DAS (Delayed Auto Shift) for smooth piece movement
 * - ARR (Auto Repeat Rate) for continuous input
 * - State awareness - blocks invalid inputs based on game phase
 * - Professional input handling like modern Tetris games
 * - Full touch/mobile support with swipe and tap detection
 * 
 * UPDATED: Complete touch controls for mobile devices
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
        
        // Touch tracking
        this.touchStartX = 0;
        this.touchStartY = 0;
        this.touchStartTime = 0;
        this.isSwiping = false;
        this.touchHoldTimer = null;
        
        this.setupListeners();
    }
    
    setupListeners() {
        // Keyboard listeners
        document.addEventListener('keydown', (e) => this.onKeyDown(e));
        document.addEventListener('keyup', (e) => this.onKeyUp(e));
        
        // Touch listeners
        document.addEventListener('touchstart', (e) => this.onTouchStart(e), { passive: false });
        document.addEventListener('touchmove', (e) => this.onTouchMove(e), { passive: false });
        document.addEventListener('touchend', (e) => this.onTouchEnd(e), { passive: false });
        
        // On-screen button listeners
        const touchButtons = document.querySelectorAll('.touch-btn');
        touchButtons.forEach(btn => {
            // Use touchstart for immediate response
            btn.addEventListener('touchstart', (e) => {
                e.preventDefault();
                this.onTouchButtonPress(btn.dataset.action);
            });
            
            btn.addEventListener('touchend', (e) => {
                e.preventDefault();
                this.onTouchButtonRelease(btn.dataset.action);
            });
            
            // Also support mouse for debugging
            btn.addEventListener('mousedown', (e) => {
                e.preventDefault();
                this.onTouchButtonPress(btn.dataset.action);
            });
            
            btn.addEventListener('mouseup', (e) => {
                e.preventDefault();
                this.onTouchButtonRelease(btn.dataset.action);
            });
        });
        
        // Detect if device has touch
        if ('ontouchstart' in window) {
            document.body.classList.add('touch-device');
        }
    }
    
    // ============ KEYBOARD HANDLING ============
    
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
            'Enter': { type: 'ENTER' },
            'KeyP': { type: 'ESCAPE' } // P for pause
        };
        
        return mapping[keyCode];
    }
    
    // ============ TOUCH HANDLING ============
    
    onTouchStart(e) {
        // Prevent default to stop scrolling
        e.preventDefault();
        
        const touch = e.touches[0];
        this.touchStartX = touch.clientX;
        this.touchStartY = touch.clientY;
        this.touchStartTime = Date.now();
        this.isSwiping = false;
        
        // Start hold timer for continuous down movement
        this.touchHoldTimer = setTimeout(() => {
            if (!this.isSwiping) {
                this.startTouchHold();
            }
        }, 200);
    }
    
    onTouchMove(e) {
        e.preventDefault();
        
        if (!this.touchStartX || !this.touchStartY) return;
        
        const touch = e.touches[0];
        const deltaX = touch.clientX - this.touchStartX;
        const deltaY = touch.clientY - this.touchStartY;
        
        // Detect if this is a swipe
        if (Math.abs(deltaX) > 10 || Math.abs(deltaY) > 10) {
            this.isSwiping = true;
            clearTimeout(this.touchHoldTimer);
        }
        
        // Threshold for swipe detection
        const threshold = 30;
        
        // Horizontal swipe for movement
        if (Math.abs(deltaX) > threshold && Math.abs(deltaX) > Math.abs(deltaY)) {
            const action = { type: 'MOVE', dx: deltaX > 0 ? 1 : -1, dy: 0 };
            if (this.isActionAllowed(action)) {
                this.onAction(action);
                // Reset start position for continuous swiping
                this.touchStartX = touch.clientX;
            }
        }
        
        // Vertical swipe
        if (Math.abs(deltaY) > threshold && Math.abs(deltaY) > Math.abs(deltaX)) {
            if (deltaY > 0) {
                // Swipe down - soft drop
                const action = { type: 'MOVE', dx: 0, dy: 1 };
                if (this.isActionAllowed(action)) {
                    this.onAction(action);
                    this.touchStartY = touch.clientY;
                }
            } else {
                // Swipe up - rotate
                const action = { type: 'ROTATE', direction: 1 };
                if (this.isActionAllowed(action)) {
                    this.onAction(action);
                    this.touchStartY = touch.clientY;
                    this.touchStartX = touch.clientX;
                }
            }
        }
    }
    
    onTouchEnd(e) {
        e.preventDefault();
        
        clearTimeout(this.touchHoldTimer);
        this.stopTouchHold();
        
        const touchDuration = Date.now() - this.touchStartTime;
        const state = this.getState();
        
        // Check if we're in menu or game over - ANY tap should start
        if (state.phase === 'MENU' || state.phase === 'GAME_OVER') {
            this.onAction({ type: 'START_GAME' });
            return;
        }
        
        // Quick tap for rotate
        if (!this.isSwiping && touchDuration < 200) {
            const action = { type: 'ROTATE', direction: 1 };
            if (this.isActionAllowed(action)) {
                this.onAction(action);
            }
        }
        
        // Double tap detection for hard drop
        if (!this.isSwiping && this.lastTapTime && (Date.now() - this.lastTapTime) < 300) {
            const action = { type: 'HARD_DROP' };
            if (this.isActionAllowed(action)) {
                this.onAction(action);
            }
            this.lastTapTime = null;
        } else {
            this.lastTapTime = Date.now();
        }
        
        // Reset touch tracking
        this.touchStartX = 0;
        this.touchStartY = 0;
        this.isSwiping = false;
    }
    
    // Touch hold for continuous down movement
    startTouchHold() {
        this.touchHoldInterval = setInterval(() => {
            const action = { type: 'MOVE', dx: 0, dy: 1 };
            if (this.isActionAllowed(action)) {
                this.onAction(action);
            }
        }, 50);
    }
    
    stopTouchHold() {
        if (this.touchHoldInterval) {
            clearInterval(this.touchHoldInterval);
            this.touchHoldInterval = null;
        }
    }
    
    // ============ ON-SCREEN BUTTON HANDLING ============
    
    onTouchButtonPress(actionType) {
        let action = null;
        
        switch (actionType) {
            case 'left':
                action = { type: 'MOVE', dx: -1, dy: 0 };
                break;
            case 'right':
                action = { type: 'MOVE', dx: 1, dy: 0 };
                break;
            case 'down':
                action = { type: 'MOVE', dx: 0, dy: 1 };
                break;
            case 'rotate':
                action = { type: 'ROTATE', direction: 1 };
                break;
            case 'drop':
                action = { type: 'HARD_DROP' };
                break;
            case 'hold':
                action = { type: 'HOLD' };
                break;
        }
        
        if (action && this.isActionAllowed(action)) {
            this.onAction(action);
            
            // Start auto-repeat for movement buttons
            if (action.type === 'MOVE') {
                this.startButtonRepeat(actionType, action);
            }
        }
    }
    
    onTouchButtonRelease(actionType) {
        this.stopButtonRepeat(actionType);
    }
    
    startButtonRepeat(buttonType, action) {
        // Similar to keyboard auto-repeat
        const repeatKey = `btn-${buttonType}`;
        
        // DAS: Wait before starting repeat
        const dasTimer = setTimeout(() => {
            // ARR: Repeat at fixed rate
            const arrTimer = setInterval(() => {
                if (this.isActionAllowed(action)) {
                    this.onAction(action);
                }
            }, this.ARR_RATE);
            
            this.arr.set(repeatKey, arrTimer);
        }, this.DAS_DELAY);
        
        this.das.set(repeatKey, dasTimer);
    }
    
    stopButtonRepeat(buttonType) {
        const repeatKey = `btn-${buttonType}`;
        
        // Clear DAS timer
        const dasTimer = this.das.get(repeatKey);
        if (dasTimer) {
            clearTimeout(dasTimer);
            this.das.delete(repeatKey);
        }
        
        // Clear ARR timer
        const arrTimer = this.arr.get(repeatKey);
        if (arrTimer) {
            clearInterval(arrTimer);
            this.arr.delete(repeatKey);
        }
    }
    
    // ============ COMMON METHODS ============
    
    isActionAllowed(action) {
        const state = this.getState();
        
        // Menu/Game Over - allow start actions
        if (state.phase === 'MENU' || state.phase === 'GAME_OVER') {
            return action.type === 'SPACE' || action.type === 'ENTER' || action.type === 'ESCAPE' ||
                   action.type === 'START_GAME'; // Added START_GAME
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
        document.removeEventListener('touchstart', this.onTouchStart);
        document.removeEventListener('touchmove', this.onTouchMove);
        document.removeEventListener('touchend', this.onTouchEnd);
        
        // Clear all timers
        this.das.forEach(timer => clearTimeout(timer));
        this.arr.forEach(timer => clearInterval(timer));
        
        this.das.clear();
        this.arr.clear();
        this.keys.clear();
        
        // Clear touch timers
        clearTimeout(this.touchHoldTimer);
        clearInterval(this.touchHoldInterval);
    }
}
