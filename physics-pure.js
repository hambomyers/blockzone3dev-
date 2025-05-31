/**
 * physics-pure.js - Pure physics with FIXED collision detection
 * PRESERVES: All visual aesthetics, chiclet rendering, Japanese ma spacing
 * FIXES: Pieces disappearing when moving left/right at board edges
 */

// THE ONLY COLLISION FUNCTION - Fixed to handle pieces at edges properly
export const canPieceFitAt = (board, piece, x, y) => {
    // Validate inputs to prevent crashes
    if (!board || !piece || !piece.shape) return false;
    
    // Check each block of the piece
    for (let dy = 0; dy < piece.shape.length; dy++) {
        for (let dx = 0; dx < piece.shape[dy].length; dx++) {
            // Skip empty cells in piece shape
            if (!piece.shape[dy][dx]) continue;
            
            const boardX = x + dx;
            const boardY = y + dy;
            
            // Hit walls - check this FIRST, even above the board
            if (boardX < 0 || boardX >= 10) return false;
            
            // Allow pieces up to 2 rows above board (Y = -2)
            if (boardY < -2) return false;
            
            // Hit floor
            if (boardY >= 20) return false;
            
            // Only check board collisions if we're in the visible area
            if (boardY >= 0) {
                // Check board bounds before accessing
                if (boardY < board.length && boardX < board[boardY].length) {
                    // Hit another piece
                    if (board[boardY][boardX] !== null) return false;
                }
            }
        }
    }
    
    return true;
};

// Calculate where a piece would land if dropped
export const calculateShadow = (board, piece) => {
    let shadowY = piece.gridY;
    
    // Keep going down until we can't
    while (shadowY < 20 && canPieceFitAt(board, piece, piece.gridX, shadowY + 1)) {
        shadowY++;
    }
    
    return shadowY;
};

// Check if piece is at its shadow position
export const isResting = (board, piece) => {
    return piece.gridY === calculateShadow(board, piece);
};

// Rotate piece shape
export const rotatePiece = (piece, direction) => {
    const n = piece.shape.length;
    const rotated = Array(n).fill().map(() => Array(n).fill(0));
    
    for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
            if (direction === 1) {
                rotated[i][j] = piece.shape[n - 1 - j][i];
            } else {
                rotated[i][j] = piece.shape[j][n - 1 - i];
            }
        }
    }
    
    return {
        ...piece,
        shape: rotated,
        rotation: (piece.rotation + direction + 4) % 4
    };
};

// Try rotation with wall kicks
export const tryRotation = (board, piece, direction) => {
    const rotated = rotatePiece(piece, direction);
    
    // Try base rotation first
    if (canPieceFitAt(board, rotated, rotated.gridX, rotated.gridY)) {
        return { success: true, piece: rotated };
    }
    
    // O piece doesn't wall kick
    if (piece.type === 'O') {
        return { success: false };
    }
    
    const kicks = getWallKicks(piece, direction);
    
    // Try each wall kick
    for (const kick of kicks) {
        const kickX = rotated.gridX + kick.x;
        const kickY = rotated.gridY + kick.y;
        
        if (canPieceFitAt(board, rotated, kickX, kickY)) {
            return { 
                success: true, 
                piece: { ...rotated, gridX: kickX, gridY: kickY }
            };
        }
    }
    
    return { success: false };
};

// Get wall kicks for SRS (Super Rotation System)
export const getWallKicks = (piece, direction) => {
    const kicks = {
        'I': {
            '0->1': [{x:-2,y:0}, {x:1,y:0}, {x:-2,y:-1}, {x:1,y:2}],
            '1->0': [{x:2,y:0}, {x:-1,y:0}, {x:2,y:1}, {x:-1,y:-2}],
            '1->2': [{x:-1,y:0}, {x:2,y:0}, {x:-1,y:2}, {x:2,y:-1}],
            '2->1': [{x:1,y:0}, {x:-2,y:0}, {x:1,y:-2}, {x:-2,y:1}],
            '2->3': [{x:2,y:0}, {x:-1,y:0}, {x:2,y:1}, {x:-1,y:-2}],
            '3->2': [{x:-2,y:0}, {x:1,y:0}, {x:-2,y:-1}, {x:1,y:2}],
            '3->0': [{x:1,y:0}, {x:-2,y:0}, {x:1,y:-2}, {x:-2,y:1}],
            '0->3': [{x:-1,y:0}, {x:2,y:0}, {x:-1,y:2}, {x:2,y:-1}]
        },
        'default': {
            '0->1': [{x:-1,y:0}, {x:-1,y:1}, {x:0,y:-2}, {x:-1,y:-2}],
            '1->0': [{x:1,y:0}, {x:1,y:-1}, {x:0,y:2}, {x:1,y:2}],
            '1->2': [{x:1,y:0}, {x:1,y:-1}, {x:0,y:2}, {x:1,y:2}],
            '2->1': [{x:-1,y:0}, {x:-1,y:1}, {x:0,y:-2}, {x:-1,y:-2}],
            '2->3': [{x:1,y:0}, {x:1,y:1}, {x:0,y:-2}, {x:1,y:-2}],
            '3->2': [{x:-1,y:0}, {x:-1,y:-1}, {x:0,y:2}, {x:-1,y:2}],
            '3->0': [{x:-1,y:0}, {x:-1,y:-1}, {x:0,y:2}, {x:-1,y:2}],
            '0->3': [{x:1,y:0}, {x:1,y:1}, {x:0,y:-2}, {x:1,y:-2}]
        }
    };
    
    const fromRot = piece.rotation;
    const toRot = (piece.rotation + direction + 4) % 4;
    const key = `${fromRot}->${toRot}`;
    
    if (piece.type === 'I') {
        return kicks.I[key] || [];
    }
    
    return kicks.default[key] || [];
};

// Place piece on board - preserves exact visual style
export const placePiece = (board, piece) => {
    // Validate inputs
    if (!board || !piece || !piece.shape) {
        console.error('Invalid inputs to placePiece:', { board: !!board, piece: !!piece });
        return board || [];
    }
    
    const newBoard = board.map(row => [...row]);
    
    piece.shape.forEach((row, dy) => {
        row.forEach((cell, dx) => {
            if (cell) {
                const x = piece.gridX + dx;
                const y = piece.gridY + dy;
                
                // Extra safety checks to prevent crashes
                if (y >= 0 && y < newBoard.length && 
                    x >= 0 && x < newBoard[y].length) {
                    newBoard[y][x] = piece.color;
                } else {
                    console.warn('Piece placement out of bounds:', { x, y, pieceX: piece.gridX, pieceY: piece.gridY });
                }
            }
        });
    });
    
    return newBoard;
};

// Find cleared lines
export const findClearedLines = (board) => {
    return board.reduce((cleared, row, index) => {
        if (row.every(cell => cell !== null)) {
            cleared.push(index);
        }
        return cleared;
    }, []);
};

// Remove cleared lines - maintains board spacing aesthetic
export const removeClearedLines = (board, lines) => {
    const newBoard = board.filter((row, index) => !lines.includes(index));
    
    // Add empty rows at top to maintain 20 row height
    while (newBoard.length < 20) {
        newBoard.unshift(Array(10).fill(null));
    }
    
    return newBoard;
};

// Check if spawn is valid
export const canSpawn = (board, piece) => {
    return canPieceFitAt(board, piece, piece.gridX, piece.gridY);
};