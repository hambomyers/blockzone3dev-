/**
 * renderer.js - Complete rendering system with modular chiclet renderer
 * Updated with minimal Japanese ma-inspired edge glow
 * CLEANED: Removed duplicate FLOAT arrow, uses game state for display values
 * ADDED: Starfield Easter egg support
 */

import { CONSTANTS, PIECE_DEFINITIONS } from './game-engine.js';
import { ChicletRenderer } from './chiclet.js';
import { createStarfieldRenderer } from './starfield.js';

export class Renderer {
    constructor(canvas, bgCanvas, config) {
        this.canvas = canvas;
        this.bgCanvas = bgCanvas;
        this.ctx = canvas.getContext('2d', { alpha: true });
        this.bgCtx = bgCanvas.getContext('2d');
        this.config = config;
        
        // Base dimensions (designed at 1x scale)
        this.baseBlockSize = CONSTANTS.BOARD.BLOCK_SIZE;
        this.scale = 1;
        
        // Actual rendered block size (after scaling)
        this.blockSize = this.baseBlockSize * this.scale;
        
        // MA (間) spacing constant - scales with display
        this.MA_GAP = 2;
        
        // Create chiclet renderer
        this.chicletRenderer = null; // Will be created after scale detection
        
        // Create starfield renderer
        this.starfieldRenderer = createStarfieldRenderer();
        
        // Display settings
        this.showGrid = false;
        this.showFPS = false;
        this.fps = 0;
        this.frameCount = 0;
        this.lastFPSUpdate = 0;
        
        // Pre-calculated layouts for all piece types
        this.previewLayouts = new Map();
        this.previewScale = 0.75; // 25% smaller than current
        
        // Edge glow settings - simplified
        this.edgeGlowEnabled = this.config.get('graphics.edgeGlow') !== false; // Default true
        
        this.setupCanvas();
        this.precalculateLayouts();
    }
    
    setupCanvas() {
        // Detect optimal scale for display
        this.detectScale();
        
        // Create chiclet renderer with current scale
        this.chicletRenderer = new ChicletRenderer({
            blockSize: this.blockSize,
            scale: this.scale,
            mode: 'beautiful'
        });
        
        const boardWidth = CONSTANTS.BOARD.WIDTH * this.blockSize;
        const boardHeight = CONSTANTS.BOARD.HEIGHT * this.blockSize;
        
        // PERFECT BLOCK ALIGNMENT - everything is 1 block (24px) or MA gap (2px)
        const blockMargin = this.blockSize; // 24px margins
        const titleHeight = this.blockSize; // 24px for title
        const scoreHeight = this.blockSize; // 24px for score area
        const holdHeight = this.blockSize; // 24px for hold piece area
        
        // Canvas height calculation with scaled MA gap
        this.canvas.width = blockMargin * 2 + boardWidth;
        this.canvas.height = blockMargin + titleHeight + (this.MA_GAP * this.scale) + boardHeight + 
                           (this.MA_GAP * this.scale) + scoreHeight + holdHeight + blockMargin;
        
        // CRITICAL: Keep exact board position for game logic
        this.boardX = (this.canvas.width - boardWidth) / 2;
        this.boardY = blockMargin + titleHeight + (this.MA_GAP * this.scale);
        
        // Pre-calculate all UI positions
        this.uiPositions = {
            title: {
                // Title bottom should be 1 pixel above the white dots
                y: this.boardY - this.blockSize - 2
            },
            preview: {
                centerX: this.boardX + boardWidth / 2,
                // Two white dots will be at top of board - 1 pixel
                whiteDotsY: this.boardY - 1,
                // Preview bottom is 1 pixel above the white dots
                baselineY: this.boardY - 2
            },
            hold: {
                centerX: this.boardX + boardWidth / 2,
                whitePointY: this.boardY + boardHeight + (this.MA_GAP * this.scale),
                topY: this.boardY + boardHeight + (this.MA_GAP * this.scale) + (1 * this.scale)
            },
            score: {
                y: this.boardY + boardHeight + (this.MA_GAP * this.scale),
                leftX: this.boardX,
                rightX: this.boardX + boardWidth
            }
        };
        
        // Setup background canvas
        this.handleResize();
    }
    
    detectScale() {
        // Auto-detect scale based on window size
        const targetBoardHeight = window.innerHeight * 0.7; // Board should take ~70% of screen height
        const baseHeight = CONSTANTS.BOARD.HEIGHT * this.baseBlockSize;
        
        // Calculate scale, but clamp to reasonable values
        this.scale = Math.min(4, Math.max(0.5, targetBoardHeight / baseHeight));
        
        // Round to nearest 0.25 for pixel-perfect scaling
        this.scale = Math.round(this.scale * 4) / 4;
        
        // Update actual block size
        this.blockSize = this.baseBlockSize * this.scale;
        
        console.log(`Display scale: ${this.scale}x (block size: ${this.blockSize}px)`);
    }
    
    precalculateLayouts() {
        // Use piece definitions from game engine
        Object.entries(PIECE_DEFINITIONS).forEach(([type, def]) => {
            // Calculate piece bounds (which blocks are filled)
            let minX = def.shape[0].length, maxX = 0;
            let minY = def.shape.length, maxY = 0;
            
            def.shape.forEach((row, dy) => {
                row.forEach((cell, dx) => {
                    if (cell) {
                        minX = Math.min(minX, dx);
                        maxX = Math.max(maxX, dx);
                        minY = Math.min(minY, dy);
                        maxY = Math.max(maxY, dy);
                    }
                });
            });
            
            // Calculate preview dimensions
            const pixelSize = Math.floor(14 * this.scale * this.previewScale);
            const gap = Math.floor(4 * this.scale * this.previewScale);
            
            const blocksWide = maxX - minX + 1;
            const blocksTall = maxY - minY + 1;
            const width = blocksWide * (pixelSize + gap) - gap;
            const height = blocksTall * (pixelSize + gap) - gap;
            
            this.previewLayouts.set(type, {
                minX, maxX, minY, maxY,
                pixelSize, gap,
                width, height,
                blocksWide, blocksTall,
                shape: def.shape
            });
        });
    }
    
    handleResize() {
        // Re-detect scale on window resize
        const oldScale = this.scale;
        this.detectScale();
        
        if (oldScale !== this.scale) {
            // Scale changed, rebuild everything
            this.setupCanvas();
            this.precalculateLayouts();
            
            // Update chiclet renderer
            if (this.chicletRenderer) {
                this.chicletRenderer.setBlockSize(this.blockSize);
                this.chicletRenderer.setScale(this.scale);
            }
        }
        
        this.bgCanvas.width = window.innerWidth;
        this.bgCanvas.height = window.innerHeight;
    }
    
    render(state, particles = [], starfieldState = null) {
        // Update FPS
        this.updateFPS();
        
        // Clear background canvas and render background effects
        this.renderBackground(state, particles, starfieldState);
        
        // Clear or fill main canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Black board area only
        this.ctx.fillStyle = '#000000';
        this.ctx.fillRect(this.boardX, this.boardY, 
            CONSTANTS.BOARD.WIDTH * this.blockSize, 
            CONSTANTS.BOARD.HEIGHT * this.blockSize);
        
        // Debug grid
        if (this.showGrid) {
            this.renderGrid();
        }
        
        // Two white reference dots at top center of board
        this.ctx.fillStyle = '#FFFFFF';
        this.ctx.fillRect(
            this.uiPositions.preview.centerX - 2, 
            this.uiPositions.preview.whiteDotsY, 
            2, 1
        );
        this.ctx.fillRect(
            this.uiPositions.preview.centerX + 1, 
            this.uiPositions.preview.whiteDotsY, 
            2, 1
        );
        
        // Two white reference dots on left and right sides (vertically centered)
        const boardCenterY = this.boardY + (CONSTANTS.BOARD.HEIGHT * this.blockSize) / 2;
        // Left side dot
        this.ctx.fillRect(
            this.boardX - 1, 
            boardCenterY - 0.5, 
            1, 1
        );
        // Right side dot
        this.ctx.fillRect(
            this.boardX + CONSTANTS.BOARD.WIDTH * this.blockSize, 
            boardCenterY - 0.5, 
            1, 1
        );
        
        // Game elements
        this.renderBoard(state);
        
        // Render particles on game board (for line clears to show on game canvas)
        if (this.config.get('graphics.particles') && particles.length > 0) {
            this.renderParticles(particles, true); // true = game canvas
        }
        
        if (this.config.get('graphics.ghostPiece') && state.current) {
            this.renderGhostPiece(state);
        }
        
        this.renderCurrentPiece(state);
        
        // Death piece for game over
        if (state.deathPiece && state.phase === 'GAME_OVER') {
            this.renderPieceAt(
                state.deathPiece,
                state.deathPiece.gridX * this.blockSize,
                state.deathPiece.gridY * this.blockSize,
                0.3
            );
        }
        
        // UI elements with perfect spacing
        this.renderTitle(state);
        this.renderUI(state);
        
        // Overlays
        this.renderOverlays(state);
        
        // FPS display
        if (this.showFPS) {
            this.renderFPS();
        }
    }
    
    renderBackground(state, particles, starfieldState) {
        // Clear background
        this.bgCtx.clearRect(0, 0, this.bgCanvas.width, this.bgCanvas.height);
        
        // Render starfield if enabled (before black background)
        if (starfieldState && starfieldState.enabled && this.starfieldRenderer) {
            this.starfieldRenderer.render(
                this.bgCtx, 
                starfieldState,
                { width: this.bgCanvas.width, height: this.bgCanvas.height }
            );
        } else {
            // Simple black background
            this.bgCtx.fillStyle = '#000000';
            this.bgCtx.fillRect(0, 0, this.bgCanvas.width, this.bgCanvas.height);
        }
        
        // Render particles on background canvas
        if (this.config.get('graphics.particles') && particles.length > 0) {
            this.renderParticles(particles, false); // false = background canvas
        }
        
        // Render minimal edge glow
        if (this.edgeGlowEnabled) {
            this.renderEdgeGlow(state);
        }
    }
    
    // Minimal, elegant edge glow - Japanese ma (間) aesthetic
    renderEdgeGlow(state) {
        if (!state.current || state.phase === 'GAME_OVER') return;
        
        const piece = state.current;
        const visualPos = this.getVisualPosition(state, piece);
        
        // Find piece edges and vertical bounds
        let minX = Infinity, maxX = -Infinity;
        let minY = Infinity, maxY = -Infinity;
        piece.shape.forEach((row, dy) => {
            row.forEach((cell, dx) => {
                if (cell) {
                    const blockX = piece.gridX + dx;
                    const blockY = piece.gridY + dy;
                    minX = Math.min(minX, blockX);
                    maxX = Math.max(maxX, blockX);
                    minY = Math.min(minY, blockY);
                    maxY = Math.max(maxY, blockY);
                }
            });
        });
        
        // Calculate distance to board edges
        const leftDistance = minX;
        const rightDistance = 9 - maxX;
        
        // Only glow within 2 blocks of edge
        const GLOW_DISTANCE = 2;
        
        // Setup canvas positions
        const gameLeft = (this.bgCanvas.width - this.canvas.width) / 2;
        const gameTop = (this.bgCanvas.height - this.canvas.height) / 2;
        const boardScreenX = gameLeft + this.boardX;
        const boardScreenY = gameTop + this.boardY;
        
        // Calculate piece center Y position (with visual smoothing)
        const pieceCenterY = boardScreenY + visualPos.y + ((maxY - minY + 1) * this.blockSize) / 2;
        
        // Glow height - about 6 blocks tall, centered on piece
        const glowHeight = this.blockSize * 6;
        const glowTop = pieceCenterY - glowHeight / 2;
        
        this.bgCtx.save();
        
        // Left edge - localized glow that follows the piece
        if (leftDistance <= GLOW_DISTANCE) {
            const intensity = 1 - (leftDistance / GLOW_DISTANCE);
            const maxOpacity = intensity * 0.16; // Twice as bright - max 16% opacity
            
            // Create a radial gradient centered on the piece
            const gradient = this.bgCtx.createRadialGradient(
                boardScreenX,
                pieceCenterY,
                0,
                boardScreenX,
                pieceCenterY,
                glowHeight / 2
            );
            
            gradient.addColorStop(0, `rgba(255, 255, 255, ${maxOpacity})`);
            gradient.addColorStop(0.5, `rgba(255, 255, 255, ${maxOpacity * 0.5})`);
            gradient.addColorStop(1, 'transparent');
            
            this.bgCtx.fillStyle = gradient;
            this.bgCtx.fillRect(
                boardScreenX - this.blockSize * 2,
                glowTop,
                this.blockSize * 3,
                glowHeight
            );
        }
        
        // Right edge - localized glow that follows the piece
        if (rightDistance <= GLOW_DISTANCE) {
            const intensity = 1 - (rightDistance / GLOW_DISTANCE);
            const maxOpacity = intensity * 0.16; // Twice as bright - max 16% opacity
            
            // Create a radial gradient centered on the piece
            const gradient = this.bgCtx.createRadialGradient(
                boardScreenX + CONSTANTS.BOARD.WIDTH * this.blockSize,
                pieceCenterY,
                0,
                boardScreenX + CONSTANTS.BOARD.WIDTH * this.blockSize,
                pieceCenterY,
                glowHeight / 2
            );
            
            gradient.addColorStop(0, `rgba(255, 255, 255, ${maxOpacity})`);
            gradient.addColorStop(0.5, `rgba(255, 255, 255, ${maxOpacity * 0.5})`);
            gradient.addColorStop(1, 'transparent');
            
            this.bgCtx.fillStyle = gradient;
            this.bgCtx.fillRect(
                boardScreenX + (CONSTANTS.BOARD.WIDTH - 1) * this.blockSize,
                glowTop,
                this.blockSize * 3,
                glowHeight
            );
        }
        
        this.bgCtx.restore();
    }
    
    // CONSOLIDATED PARTICLE RENDERING - Works on both canvases
    renderParticles(particles, onGameCanvas = false) {
        const ctx = onGameCanvas ? this.ctx : this.bgCtx;
        ctx.save();
        
        // Calculate offset based on canvas
        let offsetX, offsetY;
        if (onGameCanvas) {
            // For game canvas, just use board position
            offsetX = this.boardX;
            offsetY = this.boardY;
            
            // Clip to board area
            ctx.beginPath();
            ctx.rect(this.boardX, this.boardY,
                CONSTANTS.BOARD.WIDTH * this.blockSize,
                CONSTANTS.BOARD.HEIGHT * this.blockSize);
            ctx.clip();
        } else {
            // For background canvas, calculate viewport offset
            const gameLeft = (this.bgCanvas.width - this.canvas.width) / 2;
            const gameTop = (this.bgCanvas.height - this.canvas.height) / 2;
            offsetX = gameLeft + this.boardX;
            offsetY = gameTop + this.boardY;
        }
        
        particles.forEach(p => {
            // Skip far particles on game canvas
            if (onGameCanvas) {
                const margin = 50;
                if (p.x < -margin || p.x > (CONSTANTS.BOARD.WIDTH * this.blockSize + margin) ||
                    p.y < -margin || p.y > (CONSTANTS.BOARD.HEIGHT * this.blockSize + margin)) {
                    return;
                }
            }
            
            const x = offsetX + p.x;
            const y = offsetY + p.y;
            ctx.globalAlpha = (p.life * 0.8) * (p.opacity || 1);
            
            this.drawParticle(ctx, p, x, y);
        });
        
        ctx.restore();
    }
    
    drawParticle(ctx, p, x, y) {
        const size = p.size * this.scale;
        
        if (p.type === 'glow') {
            const gradient = ctx.createRadialGradient(x, y, 0, x, y, size);
            gradient.addColorStop(0, p.color);
            gradient.addColorStop(0.4, p.color);
            gradient.addColorStop(1, 'transparent');
            ctx.fillStyle = gradient;
            ctx.fillRect(x - size, y - size, size * 2, size * 2);
        } else if (p.type === 'spark') {
            ctx.strokeStyle = p.color;
            ctx.lineWidth = size * 0.5;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(x - p.vx * 0.1, y - p.vy * 0.1);
            ctx.lineTo(x, y);
            ctx.stroke();
        } else {
            ctx.fillStyle = p.color;
            ctx.fillRect(x - size/2, y - size/2, size, size);
        }
    }
    
    renderBoard(state) {
        state.board.forEach((row, y) => {
            row.forEach((color, x) => {
                if (color) {
                    // Flash clearing lines
                    if (state.clearingLines && state.clearingLines.includes(y)) {
                        this.ctx.globalAlpha = 0.5 + 0.5 * Math.sin(Date.now() * 0.02);
                    }
                    
                    this.drawChiclet(
                        this.boardX + x * this.blockSize,
                        this.boardY + y * this.blockSize,
                        color,
                        y, x
                    );
                    
                    this.ctx.globalAlpha = 1;
                }
            });
        });
    }
    
    renderCurrentPiece(state) {
        if (!state.current || state.phase === 'GAME_OVER') return;
        
        // Get visual position with gravity smoothing
        const visualPos = this.getVisualPosition(state, state.current);
        
        this.renderPieceAt(
            state.current,
            visualPos.x,
            visualPos.y,
            1.0
        );
    }
    
    renderGhostPiece(state) {
        if (!state.current || state.phase === 'GAME_OVER') return;
        
        // Calculate ghost position
        let ghostY = state.current.gridY;
        
        // Use the canCurrentPieceFall flag from state to avoid importing physics
        while (ghostY < 20) {
            // Simple check - we know ghost goes down until it can't
            const testY = ghostY + 1;
            let canFit = true;
            
            // Check each block of the piece
            for (let dy = 0; dy < state.current.shape.length; dy++) {
                for (let dx = 0; dx < state.current.shape[dy].length; dx++) {
                    if (state.current.shape[dy][dx]) {
                        const boardX = state.current.gridX + dx;
                        const boardY = testY + dy;
                        
                        if (boardX < 0 || boardX >= 10 || boardY >= 20 || 
                            (boardY >= 0 && state.board[boardY][boardX])) {
                            canFit = false;
                            break;
                        }
                    }
                }
                if (!canFit) break;
            }
            
            if (canFit) {
                ghostY = testY;
            } else {
                break;
            }
        }
        
        // Don't render if piece is already at ghost
        if (state.current.gridY === ghostY) return;
        
        // Ghost is always at grid position (no smoothing)
        this.renderPieceAt(
            state.current,
            state.current.gridX * this.blockSize,
            ghostY * this.blockSize,
            0.3
        );
    }
    
    renderPieceAt(piece, gridX, gridY, opacity) {
        this.ctx.globalAlpha = opacity;
        
        piece.shape.forEach((row, dy) => {
            row.forEach((cell, dx) => {
                if (cell) {
                    const x = this.boardX + gridX + dx * this.blockSize;
                    const y = this.boardY + gridY + dy * this.blockSize;
                    
                    let color = piece.color;
                    if (piece.type === 'FLOAT' && piece.upMovesUsed > 0) {
                        const brightness = Math.floor(255 - (piece.upMovesUsed * 30));
                        const hexBrightness = brightness.toString(16).padStart(2, '0');
                        color = `#${hexBrightness}${hexBrightness}${hexBrightness}`;
                    }
                    
                    this.drawChiclet(x, y, color,
                        piece.gridY + dy,
                        piece.gridX + dx,
                        piece
                    );
                }
            });
        });
        
        this.ctx.globalAlpha = 1.0;
    }
    
    getVisualPosition(state, piece) {
        if (!piece) return { x: 0, y: 0 };
        
        // Calculate position
        const x = piece.gridX * this.blockSize;
        let y = piece.gridY * this.blockSize;
        
        // Add smooth gravity falling
        if (state.gravityAccumulator !== undefined && state.phase === 'FALLING') {
            // Use the canCurrentPieceFall flag from state
            if (state.canCurrentPieceFall && state.currentGravityDelay) {
                const gravityProgress = Math.min(state.gravityAccumulator / state.currentGravityDelay, 1);
                y += gravityProgress * this.blockSize;
            }
        }
        
        return { x, y };
    }
    
    renderTitle(state) {
        // Title positioned so bottom is 1 pixel above white dots
        const titleY = this.uiPositions.title.y;
        
        // NEON blocks
        ['N', 'E', 'O', 'N'].forEach((letter, i) => {
            const x = this.boardX + i * this.blockSize;
            this.drawChiclet(x, titleY, '#FFFF00', 0, i);
            
            // Cut out letter
            this.ctx.save();
            this.ctx.globalCompositeOperation = 'destination-out';
            this.ctx.font = `bold ${28 * this.scale}px Bungee, monospace`;
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            this.ctx.fillText(letter, x + this.blockSize / 2, titleY + this.blockSize / 2 + 2 * this.scale);
            this.ctx.restore();
        });
        
        // DROP blocks
        ['D', 'R', 'O', 'P'].forEach((letter, i) => {
            const x = this.boardX + (i + 6) * this.blockSize;
            this.drawChiclet(x, titleY, '#FFFF00', 0, i + 6);
            
            // Cut out letter
            this.ctx.save();
            this.ctx.globalCompositeOperation = 'destination-out';
            this.ctx.font = `bold ${28 * this.scale}px Bungee, monospace`;
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            this.ctx.fillText(letter, x + this.blockSize / 2, titleY + this.blockSize / 2 + 2 * this.scale);
            this.ctx.restore();
        });
        
        // Next piece preview
        if (state.next && state.phase !== 'GAME_OVER' && state.phase !== 'MENU') {
            this.renderPreviewPiece(state.next);
        }
    }
    
    renderPreviewPiece(piece) {
        const layout = this.previewLayouts.get(piece.type);
        if (!layout) return;
        
        // Calculate center position
        const centerX = this.uiPositions.preview.centerX;
        const bottomY = this.uiPositions.preview.baselineY;
        const centerY = bottomY - layout.height / 2;
        
        // Set opacity for non-distracting preview
        this.ctx.save();
        this.ctx.globalAlpha = 0.5;
        
        // Draw rounded pixel squares
        layout.shape.forEach((row, dy) => {
            row.forEach((cell, dx) => {
                if (cell) {
                    const x = centerX - layout.width/2 + (dx - layout.minX) * (layout.pixelSize + layout.gap);
                    const y = centerY - layout.height/2 + (dy - layout.minY) * (layout.pixelSize + layout.gap);
                    
                    this.drawPreviewPixel(x, y, layout.pixelSize, piece.color);
                }
            });
        });
        
        this.ctx.restore();
    }
    
    drawPreviewPixel(x, y, size, color) {
        // Draw rounded rectangle pixel
        this.ctx.fillStyle = color;
        this.ctx.beginPath();
        
        // Very rounded corners - radius is 40% of size for that LCD look
        const radius = size * 0.4;
        
        // Draw rounded rectangle
        this.ctx.moveTo(x + radius, y);
        this.ctx.lineTo(x + size - radius, y);
        this.ctx.quadraticCurveTo(x + size, y, x + size, y + radius);
        this.ctx.lineTo(x + size, y + size - radius);
        this.ctx.quadraticCurveTo(x + size, y + size, x + size - radius, y + size);
        this.ctx.lineTo(x + radius, y + size);
        this.ctx.quadraticCurveTo(x, y + size, x, y + size - radius);
        this.ctx.lineTo(x, y + radius);
        this.ctx.quadraticCurveTo(x, y, x + radius, y);
        this.ctx.closePath();
        
        this.ctx.fill();
        
        // Add a subtle gradient for depth
        const gradient = this.ctx.createRadialGradient(
            x + size/2, y + size/2, size * 0.1,
            x + size/2, y + size/2, size * 0.7
        );
        gradient.addColorStop(0, 'rgba(255, 255, 255, 0.3)');
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0.2)');
        
        this.ctx.fillStyle = gradient;
        this.ctx.fill();
    }
    
    renderUI(state) {
        // CLEAN MINIMAL UI - Just P1 score and High Score
        
        // Score text positioned exactly at the white dot
        const textY = this.uiPositions.score.y;
        
        // Set font (scaled)
        this.ctx.font = `${16 * this.scale}px monospace`;
        this.ctx.textBaseline = 'top';
        
        // Score - P1 on the left
        this.ctx.textAlign = 'left';
        this.ctx.fillStyle = '#FFFFFF';
        const score = state.score.toString().padStart(6, '0');
        this.ctx.fillText(`P1 ${score}`, this.uiPositions.score.leftX, textY);
        
        // High score - HS on the right
        this.ctx.textAlign = 'right';
        
        // Use display values from state
        const displayHighScore = state.displayHighScore || 0;
        const highScoreText = displayHighScore.toString().padStart(6, '0');
        
        // Color it yellow if it's currently being beaten
        this.ctx.fillStyle = state.isNewHighScore ? '#FFFF00' : '#FFFFFF';
        
        this.ctx.fillText(`HS ${highScoreText}`, this.uiPositions.score.rightX, textY);
        
        // Hold piece
        if (state.hold) {
            this.renderHoldPiece(state.hold, state);
        }
    }
    
    renderHoldPiece(piece, state) {
        const layout = this.previewLayouts.get(piece.type);
        if (!layout) return;
        
        // Calculate position - top edge 1px below board bottom
        const centerX = this.uiPositions.hold.centerX;
        const topY = this.uiPositions.hold.topY;
        const centerY = topY + layout.height / 2;
        
        // Set opacity - same as preview (0.5), dimmer if can't hold
        this.ctx.save();
        this.ctx.globalAlpha = state.canHold ? 0.5 : 0.25;
        
        // Draw rounded pixel squares - same style as preview
        layout.shape.forEach((row, dy) => {
            row.forEach((cell, dx) => {
                if (cell) {
                    const x = centerX - layout.width/2 + (dx - layout.minX) * (layout.pixelSize + layout.gap);
                    const y = centerY - layout.height/2 + (dy - layout.minY) * (layout.pixelSize + layout.gap);
                    
                    this.drawPreviewPixel(x, y, layout.pixelSize, piece.color);
                }
            });
        });
        
        this.ctx.restore();
    }
    
    renderOverlays(state) {
        if (state.phase === 'MENU') {
            this.dimBoard();
            this.ctx.font = `${14 * this.scale}px Bungee, monospace`;
            this.ctx.fillStyle = '#FFFF00';
            this.ctx.textAlign = 'center';
            
            const text = 'PRESS SPACE TO START';
            const centerX = this.boardX + CONSTANTS.BOARD.WIDTH * this.blockSize / 2;
            const centerY = this.boardY + CONSTANTS.BOARD.HEIGHT * this.blockSize / 2;
            
            // Calculate exact width from 1 pixel after left dot to 1 pixel before right dot
            // Left dot is at boardX - 1, so start at boardX (1 pixel after)
            // Right dot is at boardX + boardWidth, so end at boardX + boardWidth - 1 (1 pixel before)
            const textStartX = this.boardX;
            const textEndX = this.boardX + CONSTANTS.BOARD.WIDTH * this.blockSize - 1;
            const textWidth = textEndX - textStartX;
            
            // Measure text and scale to fit exactly in this space
            this.ctx.save();
            this.ctx.translate(centerX, centerY);
            const measuredWidth = this.ctx.measureText(text).width;
            const scaleX = textWidth / measuredWidth;
            this.ctx.scale(scaleX, 1);
            this.ctx.fillText(text, 0, 0);
            this.ctx.restore();
        } else if (state.phase === 'PAUSED') {
            this.dimBoard();
            this.ctx.font = `${36 * this.scale}px monospace`;
            this.ctx.fillStyle = '#FFFF00';
            this.ctx.textAlign = 'center';
            this.ctx.fillText('PAUSED', 
                this.boardX + CONSTANTS.BOARD.WIDTH * this.blockSize / 2,
                this.boardY + CONSTANTS.BOARD.HEIGHT * this.blockSize / 2);
        } else if (state.phase === 'GAME_OVER') {
            this.dimBoard();
            this.ctx.font = `${36 * this.scale}px monospace`;
            this.ctx.fillStyle = '#FF0000';
            this.ctx.textAlign = 'center';
            const centerX = this.boardX + CONSTANTS.BOARD.WIDTH * this.blockSize / 2;
            const centerY = this.boardY + CONSTANTS.BOARD.HEIGHT * this.blockSize / 2;
            this.ctx.fillText('GAME OVER', centerX, centerY - 20 * this.scale);
            
            this.ctx.font = `${18 * this.scale}px monospace`;
            this.ctx.fillStyle = '#FFFFFF';
            this.ctx.fillText('Press Space to restart', centerX, centerY + 20 * this.scale);
        }
    }
    
    dimBoard() {
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        this.ctx.fillRect(
            this.boardX, 
            this.boardY,
            CONSTANTS.BOARD.WIDTH * this.blockSize,
            CONSTANTS.BOARD.HEIGHT * this.blockSize
        );
    }
    
    // Toggle edge glow
    toggleEdgeGlow() {
        this.edgeGlowEnabled = !this.edgeGlowEnabled;
        this.config.set('graphics.edgeGlow', this.edgeGlowEnabled);
    }
    
    // ============ CHICLET RENDERING (now delegates to chiclet.js) ============
    
    drawChiclet(x, y, color, row, col, pieceData = null) {
        this.chicletRenderer.drawBlock(this.ctx, x, y, color, row, col, pieceData);
    }
    
    // ============ UTILITY METHODS ============
    
    renderGrid() {
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        this.ctx.lineWidth = 1;
        
        // Vertical lines
        for (let x = 0; x <= CONSTANTS.BOARD.WIDTH; x++) {
            this.ctx.beginPath();
            this.ctx.moveTo(this.boardX + x * this.blockSize, this.boardY);
            this.ctx.lineTo(this.boardX + x * this.blockSize, 
                this.boardY + CONSTANTS.BOARD.HEIGHT * this.blockSize);
            this.ctx.stroke();
        }
        
        // Horizontal lines
        for (let y = 0; y <= CONSTANTS.BOARD.HEIGHT; y++) {
            this.ctx.beginPath();
            this.ctx.moveTo(this.boardX, this.boardY + y * this.blockSize);
            this.ctx.lineTo(this.boardX + CONSTANTS.BOARD.WIDTH * this.blockSize, 
                this.boardY + y * this.blockSize);
            this.ctx.stroke();
        }
    }
    
    toggleGrid() {
        this.showGrid = !this.showGrid;
    }
    
    dimBackground(dim) {
        // Used for pause/menu states
        this.backgroundDimmed = dim;
    }
    
    updateFPS() {
        this.frameCount++;
        const now = performance.now();
        
        if (now - this.lastFPSUpdate >= 1000) {
            this.fps = this.frameCount;
            this.frameCount = 0;
            this.lastFPSUpdate = now;
        }
    }
    
    renderFPS() {
        this.ctx.save();
        this.ctx.font = `${12 * this.scale}px monospace`;
        this.ctx.fillStyle = '#0f0';
        this.ctx.textAlign = 'left';
        this.ctx.fillText(`FPS: ${this.fps}`, 10 * this.scale, 20 * this.scale);
        this.ctx.fillText(`Scale: ${this.scale}x`, 10 * this.scale, 35 * this.scale);
        this.ctx.restore();
    }
}