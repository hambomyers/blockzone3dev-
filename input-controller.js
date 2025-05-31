/**
 * input-controller.js - Modern swipe-based input handling
 * 
 * Features:
 * - Swipe-first mobile controls (no buttons!)
 * - DAS/ARR for keyboard
 * - Clean gesture detection
 * - Works great with fat thumbs
 * 
 * MODERN MOBILE CONTROLS:
 * - Swipe left/right: Move
 * - Swipe down: Soft drop
 * - Tap: Rotate
 * - Hold (long press): Hard drop
 * - Swipe up: Float up (or rotate)
 * - Two-finger tap: Hold piece
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
        
        // Modern touch tracking
        this.touches = new Map(); // Track multiple touches
        this.gestureStartTime = 0;
        this.gestureStartX = 0;
        this.gestureStartY = 0;
        this.isGesturing = false;
        this.longPressTimer = null;
        this.lastTapTime = 0;
        
        // Swipe thresholds
        this.SWIPE_THRESHOLD = 30;
        this.SWIPE_VELOCITY_THRESHOLD = 0.3; // pixels per ms
        this.LONG_PRESS_DURATION = 400; // ms
        
        this.setupListeners();
    }
    
    setupListeners() {
        // Keyboard listeners
        document.addEventListener('keydown', (e) => this.onKeyDown(e));
        document.addEventListener('keyup', (e) => this.onKeyUp(e));
        
        // Modern touch listeners
        const gameCanvas = document.getElementById('game');
        const touchTarget = gameCanvas || document;
        
        touchTarget.addEventListener('touchstart', (e) => this.onTouchStart(e), { passive: false });
        touchTarget.addEventListener('touchmove', (e) => this.onTouchMove(e), { passive: false });
        touchTarget.addEventListener('touchend', (e) => this.onTouchEnd(e), { passive: false });
        touchTarget.addEventListener('touchcancel', (e) => this.onTouchCancel(e), { passive: false });
        
        // Detect if device has touch
        if ('ontouchstart' in window) {
            document.body.classList.add('touch-device');
        }
    }
    
    // ============ KEYBOARD HANDLING (unchanged) ============
    
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
    
    // ============ MODERN TOUCH HANDLING ============
    
    onTouchStart(e) {
        e.preventDefault();
        const state = this.getState();
        
        // Store all touches
        for (let i = 0; i < e.touches.length; i++) {
            const touch = e.touches[i];
            this.touches.set(touch.identifier, {
                startX: touch.clientX,
                startY: touch.clientY,
                startTime: Date.now(),
                currentX: touch.clientX,
                currentY: touch.clientY
            });
        }
        
        // Handle based on number of fingers
        if (e.touches.length === 1) {
            // Single touch - track for gestures
            const touch = e.touches[0];
            this.gestureStartX = touch.clientX;
            this.gestureStartY = touch.clientY;
            this.gestureStartTime = Date.now();
            this.isGesturing = false;
            
            // Check if we're in menu
            if (state.phase === 'MENU' || state.phase === 'GAME_OVER') {
                // Don't start long press timer in menu
                return;
            }
            
            // Start long press timer for hard drop
            this.longPressTimer = setTimeout(() => {
                if (!this.isGesturing && this.touches.size === 1) {
                    this.handleLongPress();
                }
            }, this.LONG_PRESS_DURATION);
            
        } else if (e.touches.length === 2) {
            // Two fingers - immediate hold action
            clearTimeout(this.longPressTimer);
            this.handleTwoFingerTap();
        }
    }
    
    onTouchMove(e) {
        e.preventDefault();
        
        if (this.touches.size === 0) return;
        
        // Update touch positions
        for (let i = 0; i < e.touches.length; i++) {
            const touch = e.touches[i];
            const tracked = this.touches.get(touch.identifier);
            if (tracked) {
                tracked.currentX = touch.clientX;
                tracked.currentY = touch.clientY;
            }
        }
        
        // Only process single touch gestures
        if (e.touches.length !== 1) return;
        
        const touch = e.touches[0];
        const deltaX = touch.clientX - this.gestureStartX;
        const deltaY = touch.clientY - this.gestureStartY;
        const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
        
        // If we've moved enough, it's a gesture
        if (distance > 10) {
            this.isGesturing = true;
            clearTimeout(this.longPressTimer);
        }
        
        // Process swipes with better thresholds
        if (distance > this.SWIPE_THRESHOLD) {
            const absX = Math.abs(deltaX);
            const absY = Math.abs(deltaY);
            
            // Determine swipe direction
            if (absX > absY * 1.5) {
                // Horizontal swipe (more lenient)
                this.handleSwipe(deltaX > 0 ? 'right' : 'left');
                this.gestureStartX = touch.clientX; // Reset for continuous swipes
            } else if (absY > absX * 1.5) {
                // Vertical swipe (more strict)
                this.handleSwipe(deltaY > 0 ? 'down' : 'up');
                this.gestureStartY = touch.clientY; // Reset for continuous swipes
            }
        }
    }
    
    onTouchEnd(e) {
        e.preventDefault();
        
        // Clear long press timer
        clearTimeout(this.longPressTimer);
        
        // Get the ended touch
        const endedTouches = [];
        for (let i = 0; i < e.changedTouches.length; i++) {
            const touch = e.changedTouches[i];
            const tracked = this.touches.get(touch.identifier);
            if (tracked) {
                endedTouches.push({
                    ...tracked,
                    endX: touch.clientX,
                    endY: touch.clientY,
                    endTime: Date.now()
                });
                this.touches.delete(touch.identifier);
            }
        }
        
        // If all touches ended and we have exactly one touch
        if (this.touches.size === 0 && endedTouches.length === 1) {
            const touch = endedTouches[0];
            const duration = touch.endTime - touch.startTime;
            const distance = Math.sqrt(
                Math.pow(touch.endX - touch.startX, 2) + 
                Math.pow(touch.endY - touch.startY, 2)
            );
            
            const state = this.getState();
            
            // Check if we're in menu - any tap starts game
            if (state.phase === 'MENU' || state.phase === 'GAME_OVER') {
                this.onAction({ type: 'START_GAME' });
                return;
            }
            
            // Quick tap with minimal movement = rotate
            if (duration < 200 && distance < 10) {
                this.handleTap();
            }
        }
        
        // Reset gesture tracking when all touches end
        if (this.touches.size === 0) {
            this.isGesturing = false;
        }
    }
    
    onTouchCancel(e) {
        // Clear all touch tracking
        clearTimeout(this.longPressTimer);
        this.touches.clear();
        this.isGesturing = false;
    }
    
    // ============ GESTURE HANDLERS ============
    
    handleSwipe(direction) {
        const state = this.getState();
        if (!state.current) return;
        
        let action = null;
        
        switch (direction) {
            case 'left':
                action = { type: 'MOVE', dx: -1, dy: 0 };
                break;
            case 'right':
                action = { type: 'MOVE', dx: 1, dy: 0 };
                break;
            case 'down':
                action = { type: 'MOVE', dx: 0, dy: 1 };
                break;
            case 'up':
                // Smart up handling
                if (state.current.type === 'FLOAT') {
                    action = { type: 'UP_PRESSED' }; // Let game engine handle FLOAT logic
                } else {
                    action = { type: 'ROTATE', direction: 1 };
                }
                break;
        }
        
        if (action && this.isActionAllowed(action)) {
            this.onAction(action);
        }
    }
    
    handleTap() {
        const action = { type: 'ROTATE', direction: 1 };
        if (this.isActionAllowed(action)) {
            this.onAction(action);
        }
    }
    
    handleLongPress() {
        const action = { type: 'HARD_DROP' };
        if (this.isActionAllowed(action)) {
            this.onAction(action);
        }
    }
    
    handleTwoFingerTap() {
        const action = { type: 'HOLD' };
        if (this.isActionAllowed(action)) {
            this.onAction(action);
        }
    }
    
    // ============ COMMON METHODS ============
    
    isActionAllowed(action) {
        const state = this.getState();
        
        // Menu/Game Over - allow start actions
        if (state.phase === 'MENU' || state.phase === 'GAME_OVER') {
            return action.type === 'SPACE' || action.type === 'ENTER' || action.type === 'ESCAPE' ||
                   action.type === 'START_GAME';
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
        
        const gameCanvas = document.getElementById('game');
        const touchTarget = gameCanvas || document;
        touchTarget.removeEventListener('touchstart', this.onTouchStart);
        touchTarget.removeEventListener('touchmove', this.onTouchMove);
        touchTarget.removeEventListener('touchend', this.onTouchEnd);
        touchTarget.removeEventListener('touchcancel', this.onTouchCancel);
        
        // Clear all timers
        this.das.forEach(timer => clearTimeout(timer));
        this.arr.forEach(timer => clearInterval(timer));
        
        this.das.clear();
        this.arr.clear();
        this.keys.clear();
        
        // Clear touch timers
        clearTimeout(this.longPressTimer);
    }
}
