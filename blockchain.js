/**
 * blockchain.js - Sonic Labs blockchain integration
 * 
 * Handles all Web3 interactions:
 * - Wallet connection
 * - Score submission with cryptographic proofs
 * - Leaderboard queries
 * - NFT verification
 * - Tournament participation
 */

export class BlockchainBridge {
    constructor(config) {
        this.config = config;
        this.provider = null;
        this.signer = null;
        this.contracts = {};
        
        // Game session tracking
        this.session = {
            active: false,
            seed: null,
            startTime: null,
            actions: [],
            checkpoints: [],
            frameCount: 0
        };
        
        // Network configuration
        this.networks = {
            testnet: {
                chainId: '0xFA2', // 4002
                name: 'Sonic Testnet',
                rpc: 'https://rpc.testnet.soniclabs.com',
                explorer: 'https://testnet.sonicscan.org',
                contracts: {
                    neonDrop: '0x...', // TODO: Deploy contracts
                    leaderboard: '0x...',
                    tournament: '0x...',
                    nft: '0x...'
                }
            },
            mainnet: {
                chainId: '0xFA', // 250
                name: 'Sonic Mainnet',
                rpc: 'https://rpc.soniclabs.com',
                explorer: 'https://sonicscan.org',
                contracts: {
                    neonDrop: '0x...',
                    leaderboard: '0x...',
                    tournament: '0x...',
                    nft: '0x...'
                }
            }
        };
        
        // Event listeners
        this.listeners = new Map();
        
        // Setup wallet event handlers
        this.setupWalletHandlers();
    }
    
    // ============ CONNECTION ============
    async connect() {
        if (!window.ethereum) {
            throw new Error('No Web3 wallet detected. Please install MetaMask.');
        }
        
        try {
            // Request account access
            const accounts = await window.ethereum.request({
                method: 'eth_requestAccounts'
            });
            
            if (accounts.length === 0) {
                throw new Error('No accounts found');
            }
            
            // Setup provider
            this.provider = new ethers.providers.Web3Provider(window.ethereum);
            this.signer = this.provider.getSigner();
            
            // Verify network
            const network = this.config.get('wallet.network') || 'testnet';
            await this.verifyNetwork(network);
            
            // Initialize contracts
            await this.initializeContracts(network);
            
            // Update config
            const address = await this.signer.getAddress();
            this.config.set('wallet.connected', true);
            this.config.set('wallet.address', address);
            
            // Check for NFTs
            await this.checkPlayerAssets();
            
            // Emit connected event
            this.emit('connected', { address, network });
            
            return address;
            
        } catch (error) {
            console.error('Connection failed:', error);
            this.config.set('wallet.connected', false);
            this.config.set('wallet.address', null);
            throw error;
        }
    }
    
    async disconnect() {
        this.provider = null;
        this.signer = null;
        this.contracts = {};
        
        this.config.set('wallet.connected', false);
        this.config.set('wallet.address', null);
        this.config.set('wallet.playerNFT', null);
        
        this.emit('disconnected');
    }
    
    isConnected() {
        return this.config.get('wallet.connected') && this.provider !== null;
    }
    
    // ============ NETWORK MANAGEMENT ============
    async verifyNetwork(networkName) {
        const targetNetwork = this.networks[networkName];
        if (!targetNetwork) {
            throw new Error(`Unknown network: ${networkName}`);
        }
        
        const chainId = await this.provider.getNetwork().then(n => '0x' + n.chainId.toString(16));
        
        if (chainId !== targetNetwork.chainId) {
            await this.switchNetwork(networkName);
        }
    }
    
    async switchNetwork(networkName) {
        const network = this.networks[networkName];
        
        try {
            await window.ethereum.request({
                method: 'wallet_switchEthereumChain',
                params: [{ chainId: network.chainId }]
            });
        } catch (error) {
            // Network not added to wallet
            if (error.code === 4902) {
                await window.ethereum.request({
                    method: 'wallet_addEthereumChain',
                    params: [{
                        chainId: network.chainId,
                        chainName: network.name,
                        nativeCurrency: {
                            name: 'S',
                            symbol: 'S',
                            decimals: 18
                        },
                        rpcUrls: [network.rpc],
                        blockExplorerUrls: [network.explorer]
                    }]
                });
            } else {
                throw error;
            }
        }
    }
    
    // ============ CONTRACT INTERACTION ============
    async initializeContracts(networkName) {
        const network = this.networks[networkName];
        const contracts = network.contracts;
        
        // Initialize main game contract
        this.contracts.neonDrop = new ethers.Contract(
            contracts.neonDrop,
            NEON_DROP_ABI,
            this.signer
        );
        
        // Initialize leaderboard contract
        this.contracts.leaderboard = new ethers.Contract(
            contracts.leaderboard,
            LEADERBOARD_ABI,
            this.signer
        );
        
        // Initialize NFT contract
        if (contracts.nft) {
            this.contracts.nft = new ethers.Contract(
                contracts.nft,
                NFT_ABI,
                this.signer
            );
        }
    }
    
    // ============ GAME SESSION TRACKING ============
    startGameSession(initialState) {
        this.session = {
            active: true,
            seed: initialState.seed || Date.now(),
            startTime: Date.now(),
            actions: [],
            checkpoints: [],
            frameCount: 0,
            startBlock: null
        };
        
        // Record starting block for timestamp verification
        this.provider.getBlockNumber().then(blockNumber => {
            this.session.startBlock = blockNumber;
        });
    }
    
    recordAction(action, frameCount) {
        if (!this.session.active) return;
        
        this.session.actions.push({
            frame: frameCount,
            type: action.type,
            data: this.compressAction(action),
            timestamp: Date.now() - this.session.startTime
        });
        
        // Limit action log size
        if (this.session.actions.length > 10000) {
            this.session.actions = this.session.actions.slice(-5000);
        }
    }
    
    recordFrame(state) {
        if (!this.session.active) return;
        
        this.session.frameCount = state.frameCount;
        
        // Record checkpoint every N frames
        const checkpointInterval = this.config.get('blockchain.proofCheckpointInterval') || 60;
        if (state.frameCount % checkpointInterval === 0) {
            this.session.checkpoints.push({
                frame: state.frameCount,
                score: state.score,
                lines: state.lines,
                level: state.level,
                boardHash: this.hashBoard(state.board),
                stateHash: this.hashState(state)
            });
        }
    }
    
    // ============ SCORE SUBMISSION ============
    async submitScore(score, proof) {
        if (!this.isConnected()) {
            throw new Error('Wallet not connected');
        }
        
        if (!this.contracts.neonDrop) {
            throw new Error('Game contract not initialized');
        }
        
        try {
            // Prepare submission data
            const submission = {
                score: score,
                seed: proof.seed,
                duration: proof.duration,
                merkleRoot: proof.merkleRoot,
                signature: await this.signProof(proof)
            };
            
            // Estimate gas
            const gasEstimate = await this.contracts.neonDrop.estimateGas.submitScore(
                submission.score,
                submission.merkleRoot,
                submission.signature
            );
            
            // Add 20% buffer
            const gasLimit = gasEstimate.mul(120).div(100);
            
            // Submit transaction
            const tx = await this.contracts.neonDrop.submitScore(
                submission.score,
                submission.merkleRoot,
                submission.signature,
                { gasLimit }
            );
            
            // Wait for confirmation
            const receipt = await tx.wait();
            
            // Emit success event
            this.emit('scoreSubmitted', {
                score,
                txHash: receipt.transactionHash,
                blockNumber: receipt.blockNumber
            });
            
            return receipt;
            
        } catch (error) {
            console.error('Score submission failed:', error);
            this.emit('scoreSubmissionFailed', { score, error });
            throw error;
        }
    }
    
    // ============ PROOF GENERATION ============
    generateProof(finalState) {
        if (!this.session.active) {
            throw new Error('No active game session');
        }
        
        const proof = {
            version: '1.0.0',
            seed: this.session.seed,
            startTime: this.session.startTime,
            endTime: Date.now(),
            duration: Date.now() - this.session.startTime,
            
            // Game results
            finalScore: finalState.score,
            finalLines: finalState.lines,
            finalLevel: finalState.level,
            totalPieces: finalState.pieces,
            
            // Compressed action log
            actions: this.compressActions(this.session.actions),
            actionCount: this.session.actions.length,
            
            // State checkpoints
            checkpoints: this.session.checkpoints,
            
            // Merkle proof
            merkleRoot: this.calculateMerkleRoot(this.session.checkpoints),
            
            // Anti-cheat metrics
            metrics: this.calculateMetrics()
        };
        
        // End session
        this.session.active = false;
        
        return proof;
    }
    
    // ============ LEADERBOARD ============
    async getLeaderboard(period = 'daily', count = 10) {
        if (!this.contracts.leaderboard) {
            return [];
        }
        
        try {
            const entries = await this.contracts.leaderboard.getTop(count, period);
            
            return entries.map(entry => ({
                rank: entry.rank.toNumber(),
                address: entry.player,
                score: entry.score.toNumber(),
                timestamp: entry.timestamp.toNumber(),
                verified: entry.verified,
                ens: null // TODO: Resolve ENS names
            }));
            
        } catch (error) {
            console.error('Failed to fetch leaderboard:', error);
            return [];
        }
    }
    
    async getPlayerStats(address) {
        if (!this.contracts.leaderboard) {
            return null;
        }
        
        try {
            const stats = await this.contracts.leaderboard.getPlayerStats(
                address || await this.signer.getAddress()
            );
            
            return {
                gamesPlayed: stats.gamesPlayed.toNumber(),
                highScore: stats.highScore.toNumber(),
                totalScore: stats.totalScore.toString(),
                rank: stats.currentRank.toNumber()
            };
            
        } catch (error) {
            console.error('Failed to fetch player stats:', error);
            return null;
        }
    }
    
    // ============ NFT VERIFICATION ============
    async checkPlayerAssets() {
        if (!this.signer || !this.contracts.nft) {
            return;
        }
        
        try {
            const address = await this.signer.getAddress();
            const balance = await this.contracts.nft.balanceOf(address);
            
            if (balance.gt(0)) {
                // Get first NFT
                const tokenId = await this.contracts.nft.tokenOfOwnerByIndex(address, 0);
                const tokenURI = await this.contracts.nft.tokenURI(tokenId);
                
                // Fetch metadata
                const metadata = await fetch(tokenURI).then(r => r.json());
                
                const nftData = {
                    tokenId: tokenId.toString(),
                    metadata,
                    benefits: this.getNFTBenefits(metadata)
                };
                
                this.config.set('wallet.playerNFT', nftData);
                this.emit('nftDetected', nftData);
            }
            
        } catch (error) {
            console.error('NFT check failed:', error);
        }
    }
    
    getNFTBenefits(metadata) {
        const benefits = {
            scoreMultiplier: 1.0,
            specialPieces: false,
            customTheme: null
        };
        
        // Parse attributes for benefits
        if (metadata.attributes) {
            metadata.attributes.forEach(attr => {
                switch (attr.trait_type) {
                    case 'Tier':
                        if (attr.value === 'Gold') benefits.scoreMultiplier = 1.5;
                        if (attr.value === 'Diamond') benefits.scoreMultiplier = 2.0;
                        break;
                    case 'Special':
                        benefits.specialPieces = attr.value === 'Yes';
                        break;
                }
            });
        }
        
        return benefits;
    }
    
    // ============ UTILITY METHODS ============
    compressAction(action) {
        // Compress action data to save space
        const compressed = action.type.charAt(0);
        
        if (action.dx !== undefined) compressed += action.dx;
        if (action.dy !== undefined) compressed += action.dy;
        if (action.direction !== undefined) compressed += action.direction;
        
        return compressed;
    }
    
    compressActions(actions) {
        // Run-length encode similar actions
        const compressed = [];
        let current = null;
        let count = 0;
        
        for (const action of actions) {
            const key = `${action.type}-${action.data}`;
            
            if (key === current) {
                count++;
            } else {
                if (current) {
                    compressed.push({ a: current, c: count, f: action.frame - count });
                }
                current = key;
                count = 1;
            }
        }
        
        if (current) {
            compressed.push({ a: current, c: count });
        }
        
        return compressed;
    }
    
    calculateMerkleRoot(checkpoints) {
        if (checkpoints.length === 0) return '0x0';
        
        let level = checkpoints.map(cp => cp.stateHash);
        
        while (level.length > 1) {
            const nextLevel = [];
            
            for (let i = 0; i < level.length; i += 2) {
                const left = level[i];
                const right = level[i + 1] || left;
                const combined = ethers.utils.solidityKeccak256(
                    ['bytes32', 'bytes32'],
                    [left, right]
                );
                nextLevel.push(combined);
            }
            
            level = nextLevel;
        }
        
        return level[0];
    }
    
    calculateMetrics() {
        const totalTime = Date.now() - this.session.startTime;
        const minutes = totalTime / 60000;
        
        return {
            apm: Math.round(this.session.actions.length / minutes),
            averageThinkTime: totalTime / this.session.actions.length,
            peakApm: this.calculatePeakAPM(),
            consistency: this.calculateConsistency()
        };
    }
    
    calculatePeakAPM() {
        // Calculate peak APM over 10-second windows
        const windowSize = 10000; // 10 seconds
        const windows = {};
        
        for (const action of this.session.actions) {
            const window = Math.floor(action.timestamp / windowSize);
            windows[window] = (windows[window] || 0) + 1;
        }
        
        const peak = Math.max(...Object.values(windows), 0);
        return peak * 6; // Convert to per-minute
    }
    
    calculateConsistency() {
        // Calculate timing consistency (lower = more consistent = possibly bot)
        if (this.session.actions.length < 10) return 1.0;
        
        const timings = [];
        for (let i = 1; i < this.session.actions.length; i++) {
            timings.push(this.session.actions[i].timestamp - this.session.actions[i-1].timestamp);
        }
        
        const avg = timings.reduce((a, b) => a + b) / timings.length;
        const variance = timings.reduce((sum, t) => sum + Math.pow(t - avg, 2), 0) / timings.length;
        const stdDev = Math.sqrt(variance);
        
        return stdDev / avg; // Coefficient of variation
    }
    
    hashBoard(board) {
        const flat = board.flat().map(cell => cell || '0').join('');
        return ethers.utils.keccak256(ethers.utils.toUtf8Bytes(flat));
    }
    
    hashState(state) {
        const data = {
            score: state.score,
            lines: state.lines,
            level: state.level,
            board: this.hashBoard(state.board)
        };
        
        return ethers.utils.keccak256(
            ethers.utils.toUtf8Bytes(JSON.stringify(data))
        );
    }
    
    async signProof(proof) {
        const message = ethers.utils.solidityKeccak256(
            ['bytes32', 'uint256', 'uint256'],
            [proof.merkleRoot, proof.finalScore, proof.endTime]
        );
        
        return await this.signer.signMessage(ethers.utils.arrayify(message));
    }
    
    // ============ EVENT HANDLING ============
    setupWalletHandlers() {
        if (!window.ethereum) return;
        
        window.ethereum.on('accountsChanged', (accounts) => {
            if (accounts.length === 0) {
                this.disconnect();
            } else if (accounts[0] !== this.config.get('wallet.address')) {
                // Account changed, reconnect
                this.connect();
            }
        });
        
        window.ethereum.on('chainChanged', () => {
            // Network changed, reload to ensure consistency
            window.location.reload();
        });
    }
    
    on(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, new Set());
        }
        
        this.listeners.get(event).add(callback);
        
        return () => this.listeners.get(event)?.delete(callback);
    }
    
    emit(event, data) {
        this.listeners.get(event)?.forEach(cb => cb(data));
    }
    
    isTracking() {
        return this.session.active;
    }
}

// ============ CONTRACT ABIS ============
const NEON_DROP_ABI = [
    "function submitScore(uint256 score, bytes32 merkleRoot, bytes signature) external",
    "function getPlayerStats(address player) external view returns (uint256 gamesPlayed, uint256 highScore, uint256 totalScore)",
    "event ScoreSubmitted(address indexed player, uint256 score, bytes32 merkleRoot, uint256 timestamp)"
];

const LEADERBOARD_ABI = [
    "function getTop(uint256 count, string period) external view returns (tuple(uint256 rank, address player, uint256 score, uint256 timestamp, bool verified)[])",
    "function getPlayerStats(address player) external view returns (tuple(uint256 gamesPlayed, uint256 highScore, uint256 totalScore, uint256 currentRank))"
];

const NFT_ABI = [
    "function balanceOf(address owner) external view returns (uint256)",
    "function tokenOfOwnerByIndex(address owner, uint256 index) external view returns (uint256)",
    "function tokenURI(uint256 tokenId) external view returns (string)"
];