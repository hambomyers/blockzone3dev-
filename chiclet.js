/**
 * chiclet.js - Beautiful procedurally-varied glowing blocks
 * This is the visual heart of the game - each block is unique
 * 
 * FIXED: Proper scaling for any screen size
 * CLEANED: Removed duplicate drawFloatArrow method
 */

export class ChicletRenderer {
    constructor() {
        this.blockSize = 24;  // Default size, will be updated
        this.scale = 1;       // Display scale
        this.cache = new Map();
        this.styleCache = new Map();
        this.initialized = false;
        
        // Cache size limits
        this.MAX_CACHE_SIZE = 300;
        this.MAX_STYLE_CACHE_SIZE = 500;
    }
    
    initialize() {
        if (this.initialized) return;
        this.initialized = true;
        console.log('Chiclet renderer ready');
    }
    
    setBlockSize(size) {
        if (this.blockSize !== size) {
            this.blockSize = size;
            this.clearCache();
        }
    }
    
    setScale(scale) {
        if (this.scale !== scale) {
            this.scale = scale;
            this.clearCache();
        }
    }
    
    drawBlock(ctx, x, y, color, row, col, pieceData = null) {
        if (!this.initialized) {
            this.initialize();
        }
        
        // Determine variant
        let variant;
        let cacheKey;
        
        if (pieceData) {
            // Active piece - use its stable variant (now 0-99 for variety)
            variant = pieceData.variant || 0;
            
            if (pieceData.type === 'FLOAT') {
                const upMovesUsed = pieceData.upMovesUsed || 0;
                const brightness = Math.floor(255 - (upMovesUsed * 30));
                cacheKey = `FLOAT_${brightness}_v${variant}_${this.blockSize}`;
            } else {
                cacheKey = `${color}_v${variant}_${this.blockSize}`;
            }
        } else {
            // Board piece - use position-based variant
            variant = (row * 7 + col * 11) % 100;
            cacheKey = `${color}_board_v${variant}_${this.blockSize}`;
        }
        
        // Check cache
        let cachedBlock = this.cache.get(cacheKey);
        
        if (!cachedBlock) {
            // Create cached block
            let renderColor = color;
            if (pieceData && pieceData.type === 'FLOAT') {
                const upMovesUsed = pieceData.upMovesUsed || 0;
                const brightness = Math.floor(255 - (upMovesUsed * 30));
                const hexBrightness = brightness.toString(16).padStart(2, '0');
                renderColor = `#${hexBrightness}${hexBrightness}${hexBrightness}`;
            }
            
            cachedBlock = this.createCachedBlock(renderColor, variant, pieceData);
            
            // Manage cache
            if (this.cache.size >= this.MAX_CACHE_SIZE) {
                const keysToDelete = Array.from(this.cache.keys()).slice(0, 50);
                keysToDelete.forEach(key => this.cache.delete(key));
            }
            
            this.cache.set(cacheKey, cachedBlock);
        }
        
        // Draw the cached block
        ctx.drawImage(cachedBlock, x, y);
        
        // Draw arrow for unused FLOAT pieces
        if (pieceData && pieceData.type === 'FLOAT' && (pieceData.upMovesUsed || 0) === 0) {
            this.drawFloatArrow(ctx, x, y);
        }
    }
    
    drawFloatArrow(ctx, x, y) {
        ctx.save();
        
        const centerX = x + this.blockSize / 2;
        const centerY = y + this.blockSize / 2;
        
        // Scale arrow with block size
        const arrowHeight = this.blockSize * 0.8;
        const arrowWidth = this.blockSize * 0.6;
        const stemWidth = this.blockSize * 0.25;
        
        // White arrow with black outline
        ctx.fillStyle = '#FFFFFF';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2.5 * this.scale;
        
        // Draw arrow shape
        ctx.beginPath();
        ctx.moveTo(centerX, centerY - arrowHeight/2);
        ctx.lineTo(centerX + arrowWidth/2, centerY - arrowHeight/6);
        ctx.lineTo(centerX + stemWidth/2, centerY - arrowHeight/6);
        ctx.lineTo(centerX + stemWidth/2, centerY + arrowHeight/2);
        ctx.lineTo(centerX - stemWidth/2, centerY + arrowHeight/2);
        ctx.lineTo(centerX - stemWidth/2, centerY - arrowHeight/6);
        ctx.lineTo(centerX - arrowWidth/2, centerY - arrowHeight/6);
        ctx.closePath();
        
        // Strong shadow for depth
        ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
        ctx.shadowBlur = 4 * this.scale;
        ctx.shadowOffsetX = 2 * this.scale;
        ctx.shadowOffsetY = 2 * this.scale;
        
        ctx.fill();
        ctx.shadowColor = 'transparent';
        ctx.stroke();
        
        // Pulse effect
        const pulse = Math.sin(Date.now() * 0.003) * 0.1 + 0.9;
        ctx.globalAlpha = pulse;
        ctx.strokeStyle = '#00FF00';
        ctx.lineWidth = 1 * this.scale;
        ctx.stroke();
        
        ctx.restore();
    }
    
    createCachedBlock(color, variant, pieceData = null) {
        const canvas = document.createElement('canvas');
        canvas.width = this.blockSize;
        canvas.height = this.blockSize;
        const ctx = canvas.getContext('2d', { alpha: true });
        
        // Use variant as consistent seed for this piece
        this.drawChiclet(ctx, 0, 0, color, variant, pieceData);
        
        return canvas;
    }
    
    getChicletStyle(variant, color, isPiece = false) {
        // For pieces, use variant directly as seed
        // For board cells, variant is already position-based
        const seed = variant * 37;
        
        // Parse color
        let r = 255, g = 255, b = 255;
        if (color.startsWith('#')) {
            r = parseInt(color.substr(1, 2), 16);
            g = parseInt(color.substr(3, 2), 16);
            b = parseInt(color.substr(5, 2), 16);
        }
        
        // Special handling for white/float pieces
        const isWhite = (r === 255 && g === 255 && b === 255);
        if (isWhite) {
            // Subtle color tints
            const tints = [
                { r: 5, g: 0, b: 0 },
                { r: 0, g: 5, b: 0 },
                { r: 0, g: 0, b: 5 },
                { r: 5, g: 5, b: 0 },
            ];
            
            const tint = tints[seed % tints.length];
            r = Math.min(255, r + tint.r);
            g = Math.min(255, g + tint.g);
            b = Math.min(255, b + tint.b);
        }
        
        const style = {
            edge: `rgb(${Math.max(0, r - 60)}, ${Math.max(0, g - 60)}, ${Math.max(0, b - 60)})`,
            middle: `rgb(${Math.min(255, r + 60)}, ${Math.min(255, g + 60)}, ${Math.min(255, b + 60)})`,
            highlight: `rgb(${Math.min(255, r + 120)}, ${Math.min(255, g + 120)}, ${Math.min(255, b + 120)})`,
            
            // Edge variations based on variant
            topCurve: (seed % 3) === 0,
            rightCurve: ((seed + 1) % 3) === 0,
            bottomCurve: ((seed + 2) % 3) === 0,
            leftCurve: ((seed + 3) % 3) === 0,
            
            // Scale variations with display scale
            topVar: ((seed % 200 - 100) / 150) * this.scale,
            rightVar: (((seed * 3) % 200 - 100) / 150) * this.scale,
            bottomVar: (((seed * 5) % 200 - 100) / 150) * this.scale,
            leftVar: (((seed * 7) % 200 - 100) / 150) * this.scale,
            
            shineSpots: this.calculateShineSpots(variant, isWhite),
            isWhite: isWhite
        };
        
        return style;
    }
    
    calculateShineSpots(variant, isWhite) {
        const spots = [];
        const seed = variant * 79;
        const numSpots = isWhite ? 5 : 3 + (seed % 3);
        
        for (let i = 0; i < numSpots; i++) {
            const spotSeed = seed + i * 89;
            const angle = (spotSeed * 0.1) % (Math.PI * 2);
            const radius = 0.15 + ((spotSeed * 97) % 100) / 100 * 0.25;
            
            const x = 0.5 + Math.cos(angle) * radius;
            const y = 0.5 + Math.sin(angle) * radius;
            const size = isWhite ? 0.15 : 0.08 + ((spotSeed * 101) % 100) / 100 * 0.12;
            const intensity = isWhite ? 0.9 : 0.7 + ((spotSeed * 103) % 100) / 100 * 0.3;
            const isEdge = ((spotSeed * 131) % 100) < 60;
            
            spots.push({ x, y, size, intensity, isEdge, angle });
        }
        
        return spots;
    }
    
    drawChiclet(ctx, x, y, color, variant, pieceData = null) {
        const size = this.blockSize;
        const isPiece = pieceData !== null;
        const style = this.getChicletStyle(variant, color, isPiece);
        const cornerRadius = Math.min(4 * this.scale, size * 0.15); // Scale corner radius
        
        // Draw shape with edge variations
        ctx.beginPath();
        
        // Top edge
        ctx.moveTo(x + cornerRadius, y);
        if (style.topCurve) {
            ctx.quadraticCurveTo(
                x + size/2, y + style.topVar,
                x + size - cornerRadius, y
            );
        } else {
            ctx.lineTo(x + size - cornerRadius, y);
        }
        
        // Top-right corner
        ctx.quadraticCurveTo(x + size, y, x + size, y + cornerRadius);
        
        // Right edge
        if (style.rightCurve) {
            ctx.quadraticCurveTo(
                x + size + style.rightVar, y + size/2,
                x + size, y + size - cornerRadius
            );
        } else {
            ctx.lineTo(x + size, y + size - cornerRadius);
        }
        
        // Bottom-right corner
        ctx.quadraticCurveTo(x + size, y + size, x + size - cornerRadius, y + size);
        
        // Bottom edge
        if (style.bottomCurve) {
            ctx.quadraticCurveTo(
                x + size/2, y + size + style.bottomVar,
                x + cornerRadius, y + size
            );
        } else {
            ctx.lineTo(x + cornerRadius, y + size);
        }
        
        // Bottom-left corner
        ctx.quadraticCurveTo(x, y + size, x, y + size - cornerRadius);
        
        // Left edge
        if (style.leftCurve) {
            ctx.quadraticCurveTo(
                x + style.leftVar, y + size/2,
                x, y + cornerRadius
            );
        } else {
            ctx.lineTo(x, y + cornerRadius);
        }
        
        // Top-left corner
        ctx.quadraticCurveTo(x, y, x + cornerRadius, y);
        ctx.closePath();
        
        // Fill with edge color
        ctx.fillStyle = style.edge;
        ctx.fill();
        
        // Gradient fill
        const gradient = ctx.createRadialGradient(
            x + size/2, y + size/2, size * 0.15,
            x + size/2, y + size/2, size * 0.9
        );
        
        gradient.addColorStop(0, style.middle);
        gradient.addColorStop(0.6, color);
        gradient.addColorStop(1, style.edge);
        
        ctx.fillStyle = gradient;
        ctx.fill();
        
        // Draw shine spots
        ctx.save();
        ctx.clip();
        
        style.shineSpots.forEach(spot => {
            const spotX = x + spot.x * size;
            const spotY = y + spot.y * size;
            const spotSize = spot.size * size;
            
            if (spot.isEdge) {
                // Elongated edge highlights
                ctx.save();
                ctx.translate(spotX, spotY);
                ctx.rotate(spot.angle);
                ctx.scale(1, 2.5);
                
                const shine = ctx.createRadialGradient(0, 0, 0, 0, 0, spotSize);
                shine.addColorStop(0, `rgba(255, 255, 255, ${spot.intensity})`);
                shine.addColorStop(0.5, `rgba(255, 255, 255, ${spot.intensity * 0.3})`);
                shine.addColorStop(1, 'rgba(255, 255, 255, 0)');
                
                ctx.fillStyle = shine;
                ctx.beginPath();
                ctx.arc(0, 0, spotSize, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            } else {
                // Round shine spots
                const shine = ctx.createRadialGradient(spotX, spotY, 0, spotX, spotY, spotSize);
                shine.addColorStop(0, `rgba(255, 255, 255, ${spot.intensity})`);
                shine.addColorStop(0.6, `rgba(255, 255, 255, ${spot.intensity * 0.5})`);
                shine.addColorStop(1, 'rgba(255, 255, 255, 0)');
                
                ctx.fillStyle = shine;
                ctx.beginPath();
                ctx.arc(spotX, spotY, spotSize, 0, Math.PI * 2);
                ctx.fill();
            }
        });
        
        ctx.restore();
        
        // Edge highlight
        ctx.strokeStyle = style.highlight;
        ctx.lineWidth = 1 * this.scale;
        ctx.globalAlpha = 0.6;
        
        ctx.beginPath();
        ctx.moveTo(x + cornerRadius, y);
        if (style.topCurve) {
            ctx.quadraticCurveTo(x + size/2, y + style.topVar, x + size - cornerRadius, y);
        } else {
            ctx.lineTo(x + size - cornerRadius, y);
        }
        ctx.stroke();
        
        ctx.beginPath();
        ctx.moveTo(x + cornerRadius, y);
        ctx.quadraticCurveTo(x, y, x, y + cornerRadius);
        if (style.leftCurve) {
            ctx.quadraticCurveTo(x + style.leftVar, y + size/2, x, y + size - cornerRadius);
        } else {
            ctx.lineTo(x, y + size - cornerRadius);
        }
        ctx.stroke();
        
        ctx.globalAlpha = 1;
        
        // Extra subtle glow for white pieces
        if (style.isWhite) {
            ctx.save();
            ctx.shadowColor = 'rgba(255, 255, 255, 0.3)';
            ctx.shadowBlur = 4 * this.scale;
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
            ctx.lineWidth = 1 * this.scale;
            
            ctx.stroke();
            ctx.restore();
        }
    }
    
    clearCache() {
        this.cache.clear();
        this.styleCache.clear();
    }
}