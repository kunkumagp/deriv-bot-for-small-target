// All-in-One Trading Bot with WebSocket Trading
class TradingBot {
    constructor() {
        // WebSocket connection
        this.webSocket = null;
        this.pingInterval = null;
        
        // Bot state
        this.isRunning = false;
        this.autoRun = false;
        this.currentAccount = null;
        this.currentMarket = null;
        this.tradingMode = null;
        this.tradeType = null;
        
        // Trading data
        this.accountBalance = 0;
        this.initialBalance = 0;
        this.tradeHistory = [];
        this.tickData = [];
        this.recentDigits = [];
        
        // Martingale system
        this.baseStake = 0.35; // 0.35% of balance
        this.currentStake = 0;
        this.consecutiveLosses = 0;
        this.maxConsecutiveLosses = 5;
        this.martingaleMultiplier = 2.5;
        
        // Analysis data
        this.analysisData = {
            winRate: 0,
            totalTrades: 0,
            avgWin: 0,
            avgLoss: 0,
            lastSignal: 'None',
            profitLoss: 0
        };
        
        // Trade types
        this.tradeStrategies = {
            'even-odd': new EvenOddStrategy(this),
            'over-under': new OverUnderStrategy(this),
            'digit-differ': new DigitDifferStrategy(this)
        };
        
        this.init();
    }

    init() {
        this.loadSettings();
        this.setupEventListeners();
        this.updateUI();
        this.addNotification('info', 'Bot initialized successfully');
    }

    setupEventListeners() {
        // Trade type selection
        document.getElementById('trade-type-select').addEventListener('change', (e) => {
            this.tradeType = e.target.value;
            this.saveSettings();
            if (e.target.value) {
                this.addNotification('info', `Trade type changed to: ${e.target.value}`);
            }
        });

        // Account selection
        document.getElementById('account-select').addEventListener('change', (e) => {
            this.currentAccount = e.target.value;
            this.saveSettings();
            if (e.target.value) {
                this.addNotification('info', `Account changed to: ${e.target.value}`);
                // Reconnect websocket with new account
                if (this.webSocket) {
                    this.disconnectWebSocket();
                    setTimeout(() => this.connectWebSocket(), 1000);
                }
            }
        });

        // Market selection
        document.getElementById('market-select').addEventListener('change', (e) => {
            this.currentMarket = e.target.value;
            this.saveSettings();
            if (e.target.value) {
                this.addNotification('info', `Market changed to: ${e.target.value}`);
            }
        });

        // Trading mode selection
        document.getElementById('trading-mode-select').addEventListener('change', (e) => {
            this.tradingMode = e.target.value;
            this.saveSettings();
            if (e.target.value) {
                this.addNotification('info', `Trading mode changed to: ${e.target.value}`);
            }
        });
    }

    // Method to manually trigger a trade for testing
    forceTrade() {
        if (!this.isRunning) {
            this.addNotification('warning', 'Bot must be running to force a trade');
            return;
        }
        
        if (!this.tradeType || !this.tradeStrategies[this.tradeType]) {
            this.addNotification('error', 'No trading strategy selected');
            return;
        }
        
        const requiredDigits = this.getRequiredDigitsForStrategy();
        if (this.recentDigits.length < requiredDigits) {
            this.addNotification('warning', `Need ${requiredDigits} ticks, have ${this.recentDigits.length}`);
            return;
        }
        
        this.addNotification('info', 'Forcing trade analysis...');
        this.tradeStrategies[this.tradeType].prepareNextTrade();
    }

    // Method to test localStorage functionality
    testLocalStorage() {
        try {
            // Test if localStorage is available
            const test = 'test';
            localStorage.setItem(test, test);
            localStorage.removeItem(test);
            
            // Display current stored settings
            const storedSettings = localStorage.getItem('trading-bot-settings');
            console.log('Current localStorage data:', storedSettings);
            
            if (storedSettings) {
                this.addNotification('info', 'localStorage is working correctly');
                return true;
            } else {
                this.addNotification('warning', 'No settings found in localStorage');
                return false;
            }
        } catch (error) {
            console.error('localStorage test failed:', error);
            this.addNotification('error', 'localStorage not available in this browser');
            return false;
        }
    }

    // Method to manually save current settings (for testing)
    forceSaveSettings() {
        this.saveSettings();
        this.addNotification('info', 'Settings manually saved to localStorage');
    }

    // Method to clear and reload settings (for testing)
    reloadSettings() {
        this.loadSettings();
        this.addNotification('info', 'Settings reloaded from localStorage');
    }

    // WebSocket Management
    connectWebSocket() {
        if (!this.currentAccount) {
            this.addNotification('error', 'Please select an account first');
            return;
        }

        this.addNotification('info', 'Connecting to Deriv WebSocket...');
        
        this.webSocket = new WebSocket('wss://ws.binaryws.com/websockets/v3?app_id=1089');
        
        this.webSocket.onopen = () => {
            this.addNotification('success', 'WebSocket connected successfully');
            this.authenticate();
            this.startPing();
        };
        
        this.webSocket.onmessage = (event) => {
            this.handleWebSocketMessage(JSON.parse(event.data));
        };
        
        this.webSocket.onclose = () => {
            this.addNotification('warning', 'WebSocket connection closed');
            this.stopPing();
            if (this.isRunning) {
                // Auto-reconnect if bot is running
                setTimeout(() => this.connectWebSocket(), 5000);
            }
        };
        
        this.webSocket.onerror = (error) => {
            this.addNotification('error', 'WebSocket connection error');
            console.error('WebSocket error:', error);
        };
    }

    disconnectWebSocket() {
        if (this.webSocket) {
            this.stopPing();
            this.webSocket.close();
            this.webSocket = null;
        }
    }

    authenticate() {
        if (!this.webSocket || this.webSocket.readyState !== WebSocket.OPEN) {
            return;
        }

        const authMessage = {
            authorize: this.currentAccount
        };
        
        this.webSocket.send(JSON.stringify(authMessage));
    }

    startPing() {
        this.pingInterval = setInterval(() => {
            if (this.webSocket && this.webSocket.readyState === WebSocket.OPEN) {
                this.webSocket.send(JSON.stringify({ ping: 1 }));
            }
        }, 30000);
    }

    stopPing() {
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
        }
    }

    subscribeTicks() {
        if (!this.webSocket || this.webSocket.readyState !== WebSocket.OPEN || !this.currentMarket) {
            return;
        }

        const tickMessage = {
            ticks: this.currentMarket,
            subscribe: 1
        };
        
        this.webSocket.send(JSON.stringify(tickMessage));
        this.addNotification('info', `Subscribed to ${this.currentMarket} ticks`);
    }

    handleWebSocketMessage(data) {
        try {
            switch (data.msg_type) {
                case 'authorize':
                    this.handleAuthorize(data);
                    break;
                case 'tick':
                    this.handleTick(data);
                    break;
                case 'proposal':
                    this.handleProposal(data);
                    break;
                case 'buy':
                    this.handleBuy(data);
                    break;
                case 'proposal_open_contract':
                    this.handleContract(data);
                    break;
                case 'balance':
                    this.handleBalance(data);
                    break;
                case 'error':
                    this.handleError(data);
                    break;
            }
        } catch (error) {
            console.error('Error handling WebSocket message:', error);
            this.addNotification('error', 'Error processing server message');
        }
    }

    handleAuthorize(data) {
        if (data.authorize) {
            this.accountBalance = parseFloat(data.authorize.balance);
            this.initialBalance = this.accountBalance;
            this.currentStake = this.calculateBaseStake();
            this.updateAccountDisplay();
            this.addNotification('success', `Authorized successfully. Balance: $${this.accountBalance.toFixed(2)}`);
            
            // Start trading flow if bot is running
            if (this.isRunning) {
                this.startTradingFlow();
            }
        }
    }

    handleTick(data) {
        if (data.tick) {
            const tick = data.tick;
            const lastDigit = Math.floor(tick.quote * 100) % 10;
            
            this.tickData.push(tick);
            this.recentDigits.push(lastDigit);
            
            // Keep only last 100 digits for analysis
            if (this.recentDigits.length > 100) {
                this.recentDigits.shift();
                this.tickData.shift();
            }
            
            // Update progress bar based on data collection
            const requiredDigits = this.getRequiredDigitsForStrategy();
            const progress = Math.min((this.recentDigits.length / requiredDigits) * 100, 100);
            document.getElementById('progress-fill').style.width = `${progress}%`;
            
            // Start trading when we have enough data
            if (this.isRunning && this.recentDigits.length >= requiredDigits) {
                if (this.tradeStrategies[this.tradeType]) {
                    // Update status to analyzing if we have enough data
                    if (this.recentDigits.length === requiredDigits) {
                        this.updateBotStatus('analyzing', 'Analyzing Market...');
                        this.addNotification('success', `Market data ready (${requiredDigits} ticks). Starting analysis...`);
                    }
                    
                    // Process tick with current strategy
                    this.tradeStrategies[this.tradeType].processTick(tick, lastDigit);
                }
            } else if (this.isRunning) {
                // Still collecting data
                this.updateBotStatus('analyzing', `Collecting Data... (${this.recentDigits.length}/${requiredDigits})`);
            }
        }
    }

    getRequiredDigitsForStrategy() {
        if (!this.tradeType || !this.tradeStrategies[this.tradeType]) {
            return 20; // Default
        }
        return this.tradeStrategies[this.tradeType].requiredDigits;
    }

    handleProposal(data) {
        if (this.isRunning && this.tradeType && this.tradeStrategies[this.tradeType]) {
            this.tradeStrategies[this.tradeType].handleProposal(data);
        }
    }

    handleBuy(data) {
        if (data.buy) {
            this.addNotification('info', `Trade placed: ${data.buy.contract_id}`);
            
            // Subscribe to contract updates
            const contractMessage = {
                proposal_open_contract: 1,
                contract_id: data.buy.contract_id,
                subscribe: 1
            };
            this.webSocket.send(JSON.stringify(contractMessage));
        }
    }

    handleContract(data) {
        if (data.proposal_open_contract) {
            const contract = data.proposal_open_contract;
            
            if (contract.is_sold) {
                this.processTradeResult(contract);
            }
        }
    }

    handleBalance(data) {
        if (data.balance) {
            this.accountBalance = parseFloat(data.balance.balance);
            this.updateAccountDisplay();
        }
    }

    handleError(data) {
        console.error('WebSocket error:', data.error);
        this.addNotification('error', `API Error: ${data.error.message}`);
    }

    processTradeResult(contract) {
        const profit = parseFloat(contract.profit) || 0;
        const stake = parseFloat(contract.buy_price) || 0;
        const isWin = profit > 0;
        
        // Update trade history
        const tradeData = {
            timestamp: new Date(),
            contractId: contract.contract_id,
            stake: stake,
            profit: profit,
            isWin: isWin,
            tradeType: this.tradeType
        };
        
        this.tradeHistory.push(tradeData);
        this.updateAnalysisData();
        
        // Handle martingale
        if (isWin) {
            this.consecutiveLosses = 0;
            this.currentStake = this.calculateBaseStake();
            this.addNotification('success', `Trade won: +$${profit.toFixed(2)}`);
        } else {
            this.consecutiveLosses++;
            this.currentStake = this.calculateMartingaleStake();
            this.addNotification('error', `Trade lost: -$${stake.toFixed(2)}`);
            
            if (this.consecutiveLosses >= this.maxConsecutiveLosses) {
                this.stopBot();
                this.addNotification('warning', 'Maximum consecutive losses reached. Bot stopped.');
                return;
            }
        }
        
        // Continue trading if auto-run is enabled or if this is the first trade
        if ((this.autoRun || this.tradeHistory.length === 1) && this.isRunning) {
            const waitTime = isWin ? 2000 : 3000; // Wait longer after losses
            setTimeout(() => {
                if (this.isRunning && this.tradeStrategies[this.tradeType]) {
                    this.updateBotStatus('analyzing', 'Preparing next trade...');
                    this.tradeStrategies[this.tradeType].prepareNextTrade();
                }
            }, waitTime);
        } else if (!this.autoRun && this.isRunning) {
            // Manual mode - wait for next opportunity
            this.updateBotStatus('running', 'Waiting for next opportunity...');
        }
    }

    calculateBaseStake() {
        return (this.accountBalance * this.baseStake) / 100;
    }

    calculateMartingaleStake() {
        const baseStake = this.calculateBaseStake();
        return baseStake * Math.pow(this.martingaleMultiplier, this.consecutiveLosses);
    }

    // Bot Control Methods
    toggleAutoRun() {
        this.autoRun = !this.autoRun;
        const toggle = document.getElementById('auto-run-toggle');
        const status = document.getElementById('auto-run-status');
        
        if (this.autoRun) {
            toggle.classList.add('active');
            status.textContent = 'Enabled';
            status.style.color = 'var(--success-color)';
        } else {
            toggle.classList.remove('active');
            status.textContent = 'Disabled';
            status.style.color = 'var(--text-secondary)';
        }
        
        this.saveSettings();
        this.addNotification('info', `Auto run ${this.autoRun ? 'enabled' : 'disabled'}`);
    }

    startBot() {
        if (!this.validateSettings()) {
            return;
        }

        this.isRunning = true;
        this.updateBotStatus('running', 'Initializing...');
        
        // Update button states
        document.getElementById('startBot').disabled = true;
        document.getElementById('stopBot').disabled = false;
        document.getElementById('startBot').style.display = 'none';
        document.getElementById('stopBot').style.display = 'inline-block';
        document.getElementById('forceTrade').style.display = 'inline-block';
        
        // Reset progress bar
        document.getElementById('progress-fill').style.width = '0%';
        
        // Clear previous data for fresh start
        this.recentDigits = [];
        this.tickData = [];
        
        this.addNotification('success', 'Bot started - Connecting to market...');
        
        // Calculate base stake
        this.currentStake = this.calculateBaseStake();
        
        // Initialize strategy
        if (this.tradeStrategies[this.tradeType]) {
            this.tradeStrategies[this.tradeType].initialize();
            const requiredDigits = this.tradeStrategies[this.tradeType].requiredDigits;
            this.addNotification('info', `Strategy: ${this.tradeType.toUpperCase()} | Required data: ${requiredDigits} ticks`);
        }
        
        // Connect WebSocket and start trading flow
        if (!this.webSocket || this.webSocket.readyState !== WebSocket.OPEN) {
            this.updateBotStatus('running', 'Connecting to Deriv...');
            this.connectWebSocket();
        } else {
            // Already connected, start immediately
            this.startTradingFlow();
        }
    }

    startTradingFlow() {
        this.updateBotStatus('running', 'Connected - Starting data collection...');
        
        // Start tick subscription
        if (this.currentMarket) {
            this.subscribeTicks();
        }
        
        // Show trading info
        const requiredDigits = this.getRequiredDigitsForStrategy();
        this.addNotification('info', `Collecting ${requiredDigits} ticks for ${this.tradeType} analysis...`);
    }

    stopBot() {
        this.isRunning = false;
        this.updateBotStatus('stopped', 'Stopped');
        
        // Update button states
        document.getElementById('startBot').disabled = false;
        document.getElementById('stopBot').disabled = true;
        document.getElementById('startBot').style.display = 'inline-block';
        document.getElementById('stopBot').style.display = 'none';
        document.getElementById('forceTrade').style.display = 'none';
        
        this.addNotification('warning', 'Bot stopped');
        
        // Reset strategy state
        if (this.tradeType && this.tradeStrategies[this.tradeType]) {
            this.tradeStrategies[this.tradeType].reset();
        }
    }

    validateSettings() {
        if (!this.currentAccount) {
            this.addNotification('error', 'Please select an account');
            return false;
        }
        
        if (!this.currentMarket) {
            this.addNotification('error', 'Please select a market');
            return false;
        }
        
        if (!this.tradingMode) {
            this.addNotification('error', 'Please select a trading mode');
            return false;
        }
        
        if (!this.tradeType) {
            this.addNotification('error', 'Please select a trade type');
            return false;
        }
        
        return true;
    }

    // UI Update Methods
    updateAnalysisData() {
        const wins = this.tradeHistory.filter(trade => trade.isWin);
        const losses = this.tradeHistory.filter(trade => !trade.isWin);
        
        this.analysisData.totalTrades = this.tradeHistory.length;
        this.analysisData.winRate = this.tradeHistory.length > 0 ? 
            (wins.length / this.tradeHistory.length * 100).toFixed(1) : 0;
        
        if (wins.length > 0) {
            this.analysisData.avgWin = (wins.reduce((sum, trade) => sum + trade.profit, 0) / wins.length).toFixed(2);
        }
        
        if (losses.length > 0) {
            this.analysisData.avgLoss = Math.abs(losses.reduce((sum, trade) => sum + trade.stake, 0) / losses.length).toFixed(2);
        }
        
        this.analysisData.profitLoss = this.tradeHistory.reduce((sum, trade) => sum + trade.profit, 0);
        
        if (this.tradeHistory.length > 0) {
            const lastTrade = this.tradeHistory[this.tradeHistory.length - 1];
            this.analysisData.lastSignal = `${lastTrade.tradeType} (${lastTrade.isWin ? 'Won' : 'Lost'})`;
        }
        
        this.updateAnalysisDisplay();
    }

    updateAnalysisDisplay() {
        document.getElementById('win-rate').textContent = `${this.analysisData.winRate}%`;
        document.getElementById('avg-win').textContent = `$${this.analysisData.avgWin}`;
        document.getElementById('avg-loss').textContent = `$${this.analysisData.avgLoss}`;
        document.getElementById('last-signal').textContent = this.analysisData.lastSignal;
        document.getElementById('total-trades').textContent = this.analysisData.totalTrades;
        
        // Update P&L color
        const pnlElement = document.getElementById('account-pnl');
        pnlElement.textContent = `$${this.analysisData.profitLoss.toFixed(2)}`;
        
        if (this.analysisData.profitLoss > 0) {
            pnlElement.style.color = 'var(--success-color)';
        } else if (this.analysisData.profitLoss < 0) {
            pnlElement.style.color = 'var(--danger-color)';
        } else {
            pnlElement.style.color = 'var(--text-primary)';
        }
    }

    updateAccountDisplay() {
        document.getElementById('account-balance').textContent = `$${this.accountBalance.toFixed(2)}`;
        document.getElementById('account-equity').textContent = `$${this.accountBalance.toFixed(2)}`;
    }

    updateBotStatus(status, text) {
        const indicator = document.getElementById('status-indicator');
        const statusText = document.getElementById('bot-status');
        
        indicator.className = `status-indicator status-${status}`;
        statusText.textContent = text;
    }

    addNotification(type, message) {
        const notificationArea = document.getElementById('notification-area');
        const notification = document.createElement('div');
        
        const icons = {
            success: 'fas fa-check-circle',
            error: 'fas fa-exclamation-circle',
            warning: 'fas fa-exclamation-triangle',
            info: 'fas fa-info-circle'
        };
        
        notification.className = `notification ${type}`;
        notification.innerHTML = `
            <i class="${icons[type]}"></i>
            <span>${message}</span>
            <small style="margin-left: auto; opacity: 0.7;">${new Date().toLocaleTimeString()}</small>
        `;
        
        notificationArea.insertBefore(notification, notificationArea.firstChild);
        
        // Remove old notifications (keep only last 10)
        while (notificationArea.children.length > 10) {
            notificationArea.removeChild(notificationArea.lastChild);
        }
        
        // Auto remove notification after 10 seconds
        setTimeout(() => {
            if (notification.parentNode) {
                notification.style.opacity = '0';
                setTimeout(() => {
                    if (notification.parentNode) {
                        notification.parentNode.removeChild(notification);
                    }
                }, 300);
            }
        }, 10000);
    }

    clearLocalStorage() {
        const confirmed = confirm('Are you sure you want to clear all stored data? This action cannot be undone.');
        
        if (confirmed) {
            localStorage.removeItem('trading-bot-settings');
            localStorage.removeItem('trading-bot-history');
            
            // Reset data
            this.tradeHistory = [];
            this.analysisData = {
                winRate: 0,
                totalTrades: 0,
                avgWin: 0,
                avgLoss: 0,
                lastSignal: 'None',
                profitLoss: 0
            };
            
            // Reset UI
            document.getElementById('trade-type-select').value = '';
            document.getElementById('account-select').value = '';
            document.getElementById('market-select').value = '';
            document.getElementById('trading-mode-select').value = '';
            
            this.autoRun = false;
            const toggle = document.getElementById('auto-run-toggle');
            const status = document.getElementById('auto-run-status');
            toggle.classList.remove('active');
            status.textContent = 'Disabled';
            status.style.color = 'var(--text-secondary)';
            
            this.updateAnalysisDisplay();
            this.updateAccountDisplay();
            
            // Clear notifications
            document.getElementById('notification-area').innerHTML = '';
            
            this.addNotification('warning', 'All data cleared successfully');
        }
    }

    saveSettings() {
        const settings = {
            account: this.currentAccount,
            market: this.currentMarket,
            tradingMode: this.tradingMode,
            tradeType: this.tradeType,
            autoRun: this.autoRun
        };
        
        try {
            localStorage.setItem('trading-bot-settings', JSON.stringify(settings));
            localStorage.setItem('trading-bot-history', JSON.stringify(this.tradeHistory));
            
            // Debug logging
            console.log('Settings saved to localStorage:', settings);
            
            // Optional: Show brief visual confirmation
            this.showSaveConfirmation();
            
        } catch (error) {
            console.error('Error saving settings to localStorage:', error);
            this.addNotification('error', 'Failed to save settings');
        }
    }

    showSaveConfirmation() {
        // Create a brief visual confirmation that settings were saved
        const confirmElement = document.createElement('div');
        confirmElement.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: var(--success-color);
            color: white;
            padding: 8px 16px;
            border-radius: 4px;
            font-size: 12px;
            z-index: 10000;
            opacity: 0;
            transition: opacity 0.3s ease;
        `;
        confirmElement.innerHTML = '<i class="fas fa-check"></i> Settings Saved';
        
        document.body.appendChild(confirmElement);
        
        // Animate in
        setTimeout(() => confirmElement.style.opacity = '1', 10);
        
        // Animate out and remove
        setTimeout(() => {
            confirmElement.style.opacity = '0';
            setTimeout(() => {
                if (confirmElement.parentNode) {
                    confirmElement.parentNode.removeChild(confirmElement);
                }
            }, 300);
        }, 1500);
    }

    loadSettings() {
        try {
            const settings = JSON.parse(localStorage.getItem('trading-bot-settings') || '{}');
            const history = JSON.parse(localStorage.getItem('trading-bot-history') || '[]');
            
            console.log('Loading settings from localStorage:', settings);
            
            // Restore Trade Type
            if (settings.tradeType) {
                this.tradeType = settings.tradeType;
                const tradeTypeSelect = document.getElementById('trade-type-select');
                if (tradeTypeSelect) {
                    tradeTypeSelect.value = settings.tradeType;
                    console.log('Restored trade type:', settings.tradeType);
                }
            }
            
            // Restore Account
            if (settings.account) {
                this.currentAccount = settings.account;
                const accountSelect = document.getElementById('account-select');
                if (accountSelect) {
                    accountSelect.value = settings.account;
                    console.log('Restored account:', settings.account);
                }
            }
            
            // Restore Market
            if (settings.market) {
                this.currentMarket = settings.market;
                const marketSelect = document.getElementById('market-select');
                if (marketSelect) {
                    marketSelect.value = settings.market;
                    console.log('Restored market:', settings.market);
                }
            }
            
            // Restore Trading Mode
            if (settings.tradingMode) {
                this.tradingMode = settings.tradingMode;
                const tradingModeSelect = document.getElementById('trading-mode-select');
                if (tradingModeSelect) {
                    tradingModeSelect.value = settings.tradingMode;
                    console.log('Restored trading mode:', settings.tradingMode);
                }
            }
            
            // Restore Auto Run
            if (settings.autoRun) {
                this.autoRun = settings.autoRun;
                const toggle = document.getElementById('auto-run-toggle');
                const status = document.getElementById('auto-run-status');
                if (toggle && status) {
                    toggle.classList.add('active');
                    status.textContent = 'Enabled';
                    status.style.color = 'var(--success-color)';
                    console.log('Restored auto run:', settings.autoRun);
                }
            }
            
            // Restore history
            this.tradeHistory = history;
            this.updateAnalysisData();
            
            // Show confirmation that settings were loaded
            if (Object.keys(settings).length > 0) {
                setTimeout(() => {
                    this.addNotification('info', 'Settings restored from previous session');
                }, 1000);
            }
            
        } catch (error) {
            console.error('Error loading settings:', error);
            this.addNotification('warning', 'Could not restore previous settings');
        }
    }

    updateUI() {
        // Update theme from localStorage
        const savedTheme = localStorage.getItem('theme') || 'light';
        document.body.setAttribute('data-theme', savedTheme);
        
        const themeIcon = document.getElementById('theme-icon');
        const themeText = document.getElementById('theme-text');
        
        if (savedTheme === 'dark') {
            themeIcon.className = 'fas fa-sun';
            themeText.textContent = 'Light Mode';
        } else {
            themeIcon.className = 'fas fa-moon';
            themeText.textContent = 'Dark Mode';
        }
    }
}

// Trading Strategy Classes
class BaseStrategy {
    constructor(bot) {
        this.bot = bot;
        this.isWaitingForEntry = false;
        this.proposalData = null;
    }

    initialize() {
        this.isWaitingForEntry = true;
        console.log(`${this.constructor.name} initialized`);
    }

    reset() {
        this.isWaitingForEntry = false;
        this.proposalData = null;
    }

    processTick(tick, lastDigit) {
        // Override in subclasses
    }

    handleProposal(data) {
        // Override in subclasses
    }

    executeTrade(tradeParams) {
        if (!this.bot.webSocket || this.bot.webSocket.readyState !== WebSocket.OPEN) {
            this.bot.addNotification('error', 'WebSocket not connected');
            return;
        }

        const buyMessage = {
            buy: this.proposalData.proposal.id,
            price: this.bot.currentStake
        };

        this.bot.webSocket.send(JSON.stringify(buyMessage));
        this.isWaitingForEntry = false;
    }

    prepareNextTrade() {
        this.isWaitingForEntry = true;
    }
}

class EvenOddStrategy extends BaseStrategy {
    constructor(bot) {
        super(bot);
        this.requiredDigits = 10; // Analyze last 10 digits
    }

    processTick(tick, lastDigit) {
        if (!this.isWaitingForEntry || this.bot.recentDigits.length < this.requiredDigits) {
            return;
        }

        // Analyze recent digits for even/odd pattern
        const recentDigits = this.bot.recentDigits.slice(-this.requiredDigits);
        const evenCount = recentDigits.filter(d => d % 2 === 0).length;
        const oddCount = recentDigits.length - evenCount;
        
        let tradeDirection = null;
        
        if (this.bot.tradingMode === 'analyzing') {
            // Trade opposite to the dominant pattern
            tradeDirection = evenCount > oddCount ? 'ODD' : 'EVEN';
        } else if (this.bot.tradingMode === 'exponential') {
            // Trade with the trend
            tradeDirection = evenCount > oddCount ? 'EVEN' : 'ODD';
        }
        
        if (tradeDirection) {
            this.requestProposal(tradeDirection);
        }
    }

    requestProposal(direction) {
        const proposalMessage = {
            proposal: 1,
            amount: this.bot.currentStake,
            basis: "stake",
            contract_type: direction,
            currency: "USD",
            duration: 1,
            duration_unit: "t",
            symbol: this.bot.currentMarket
        };

        this.bot.webSocket.send(JSON.stringify(proposalMessage));
        this.bot.addNotification('info', `Requesting ${direction} proposal for $${this.bot.currentStake.toFixed(2)}`);
    }

    handleProposal(data) {
        if (data.proposal && this.isWaitingForEntry) {
            this.proposalData = data;
            this.executeTrade();
        }
    }
}

class OverUnderStrategy extends BaseStrategy {
    constructor(bot) {
        super(bot);
        this.requiredDigits = 10;
        this.isTradeActive = false;
        this.underProposal = null;
        this.overProposal = null;
    }

    processTick(tick, lastDigit) {
        if (!this.isWaitingForEntry || this.bot.recentDigits.length < this.requiredDigits) {
            return;
        }

        // Check for trigger condition (last digit = 5)
        if (lastDigit === 5) {
            this.prepareDualTrade();
        }
    }

    prepareDualTrade() {
        // Request proposals for both Under 4 and Over 5
        this.requestUnderProposal();
        this.requestOverProposal();
    }

    requestUnderProposal() {
        const proposalMessage = {
            proposal: 1,
            amount: this.bot.currentStake / 2, // Split stake between two trades
            basis: "stake",
            contract_type: "DIGITUNDER",
            barrier: "4",
            currency: "USD",
            duration: 1,
            duration_unit: "t",
            symbol: this.bot.currentMarket,
            req_id: "under_proposal"
        };

        this.bot.webSocket.send(JSON.stringify(proposalMessage));
    }

    requestOverProposal() {
        const proposalMessage = {
            proposal: 1,
            amount: this.bot.currentStake / 2, // Split stake between two trades
            basis: "stake",
            contract_type: "DIGITOVER",
            barrier: "5",
            currency: "USD",
            duration: 1,
            duration_unit: "t",
            symbol: this.bot.currentMarket,
            req_id: "over_proposal"
        };

        this.bot.webSocket.send(JSON.stringify(proposalMessage));
    }

    handleProposal(data) {
        if (!data.proposal || !this.isWaitingForEntry) return;

        if (data.req_id === "under_proposal") {
            this.underProposal = data;
        } else if (data.req_id === "over_proposal") {
            this.overProposal = data;
        }

        // Execute both trades when both proposals are ready
        if (this.underProposal && this.overProposal) {
            this.executeDualTrade();
        }
    }

    executeDualTrade() {
        // Execute Under 4 trade
        const underBuy = {
            buy: this.underProposal.proposal.id,
            price: this.bot.currentStake / 2
        };
        this.bot.webSocket.send(JSON.stringify(underBuy));

        // Execute Over 5 trade
        const overBuy = {
            buy: this.overProposal.proposal.id,
            price: this.bot.currentStake / 2
        };
        this.bot.webSocket.send(JSON.stringify(overBuy));

        this.bot.addNotification('info', `Dual trade executed: Under 4 & Over 5 ($${(this.bot.currentStake / 2).toFixed(2)} each)`);
        
        // Reset for next trade
        this.isWaitingForEntry = false;
        this.underProposal = null;
        this.overProposal = null;
    }
}

class DigitDifferStrategy extends BaseStrategy {
    constructor(bot) {
        super(bot);
        this.requiredDigits = 5;
    }

    processTick(tick, lastDigit) {
        if (!this.isWaitingForEntry || this.bot.recentDigits.length < this.requiredDigits) {
            return;
        }

        // Analyze last 5 digits to find most frequent digit
        const recentDigits = this.bot.recentDigits.slice(-this.requiredDigits);
        const digitCounts = {};
        
        recentDigits.forEach(digit => {
            digitCounts[digit] = (digitCounts[digit] || 0) + 1;
        });
        
        // Find most frequent digit
        let mostFrequentDigit = 0;
        let maxCount = 0;
        
        for (let digit in digitCounts) {
            if (digitCounts[digit] > maxCount) {
                maxCount = digitCounts[digit];
                mostFrequentDigit = parseInt(digit);
            }
        }
        
        // Trade "Differs" from most frequent digit if it appears 3+ times
        if (maxCount >= 3) {
            this.requestDifferProposal(mostFrequentDigit);
        }
    }

    requestDifferProposal(barrier) {
        const proposalMessage = {
            proposal: 1,
            amount: this.bot.currentStake,
            basis: "stake",
            contract_type: "DIGITDIFF",
            barrier: barrier.toString(),
            currency: "USD",
            duration: 1,
            duration_unit: "t",
            symbol: this.bot.currentMarket
        };

        this.bot.webSocket.send(JSON.stringify(proposalMessage));
        this.bot.addNotification('info', `Requesting Digit Differs ${barrier} proposal for $${this.bot.currentStake.toFixed(2)}`);
    }

    handleProposal(data) {
        if (data.proposal && this.isWaitingForEntry) {
            this.proposalData = data;
            this.executeTrade();
        }
    }
}

// Theme toggle function
function toggleTheme() {
    const body = document.body;
    const currentTheme = body.getAttribute('data-theme');
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    
    body.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    
    const themeIcon = document.getElementById('theme-icon');
    const themeText = document.getElementById('theme-text');
    
    if (newTheme === 'dark') {
        themeIcon.className = 'fas fa-sun';
        themeText.textContent = 'Light Mode';
    } else {
        themeIcon.className = 'fas fa-moon';
        themeText.textContent = 'Dark Mode';
    }
}

// Global functions for HTML event handlers
function toggleAutoRun() {
    bot.toggleAutoRun();
}

function startBot() {
    bot.startBot();
}

function stopBot() {
    bot.stopBot();
}

function forceTrade() {
    bot.forceTrade();
}

function clearLocalStorage() {
    bot.clearLocalStorage();
}

// Debug functions for testing localStorage (available in browser console)
function testLocalStorage() {
    if (bot) {
        bot.testLocalStorage();
    } else {
        console.log('Bot not initialized yet');
    }
}

function forceSaveSettings() {
    if (bot) {
        bot.forceSaveSettings();
    } else {
        console.log('Bot not initialized yet');
    }
}

function reloadSettings() {
    if (bot) {
        bot.reloadSettings();
    } else {
        console.log('Bot not initialized yet');
    }
}

function showCurrentSettings() {
    if (bot) {
        console.log('Current bot settings:', {
            tradeType: bot.tradeType,
            account: bot.currentAccount,
            market: bot.currentMarket,
            tradingMode: bot.tradingMode,
            autoRun: bot.autoRun
        });
        
        const stored = localStorage.getItem('trading-bot-settings');
        console.log('Stored in localStorage:', stored ? JSON.parse(stored) : 'None');
    } else {
        console.log('Bot not initialized yet');
    }
}

// Initialize the bot when the page loads
let bot;
document.addEventListener('DOMContentLoaded', () => {
    bot = new TradingBot();
});

// Handle page visibility change to pause/resume bot
document.addEventListener('visibilitychange', () => {
    if (document.hidden && bot && bot.isRunning) {
        bot.addNotification('warning', 'Bot paused - tab not visible');
    } else if (!document.hidden && bot && bot.isRunning) {
        bot.addNotification('info', 'Bot resumed - tab visible');
    }
});

// Export for potential use in other scripts
if (typeof module !== 'undefined' && module.exports) {
    module.exports = TradingBot;
}