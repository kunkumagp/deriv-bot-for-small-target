const accountSelectElement = document.getElementById("account_select");
const marketSelectElement = document.getElementById("market");
const tradingModeSelectElement = document.getElementById("trading_mode");
const autoRunSelectElement = document.getElementById("auto_run");
const startBotButton = document.getElementById("startBot");
const resetBotButton = document.getElementById("resetBot");
const reStartBotButton = document.getElementById("reStartBot");
const params = new URLSearchParams(window.location.search);

let userTokenByUrl = null,
    webSocket = null,
    spareAmount = 0,
    initialAmountPerTrade = 0,
    nextTradeStake = 0,
    targetProfitPerSession = 0,
    marketAnalysisComplete = false,
    marketHistoryData = {},
    analysisProgress = 0,
    totalMarketsToAnalyze = 0,
    martingaleMultiplyr = 4, // Multiplier for Martingale recovery
    tradingMode = "analyzing", // "analyzing" or "expansion"
    // Dual Trading System Variables
    tradingActive = false,
    // Martingale System Variables
    baseStakeAmount = 0,
    currentStakeAmount = 0,
    martingaleActive = false,
    consecutiveLosses = 0,
    totalAccumulatedLoss = 0, // Track total losses for recovery calculation
    maxStakeLimit = 0, // Will be set to 10% of initial balance
    maxConsecutiveLosses = 5, // Stop Martingale after 5 consecutive losses
    proposalsReady = false,
    underFourProposal = null,
    overFiveProposal = null,
    tickSubscriptionActive = false,
    waitingForTrigger = false,
    activeTrades = [],
    tickDuration = 1,
    tradingCycleCount = 0,
    // Dual trade pair tracking
    currentDualTradePair = {
        underTrade: null,
        overTrade: null,
        isComplete: false
    }
    ;


const marketArray2 = [
    { value: "R_10", name: "Volatility 10 Index", interval: 2000 },
    { value: "1HZ10V", name: "Volatility 10 ( 1s ) Index", interval: 1000 },
    { value: "1HZ15V", name: "Volatility 15 ( 1s ) Index", interval: 1000 },
    { value: "R_25", name: "Volatility 25 Index", interval: 2000 },
    { value: "1HZ25V", name: "Volatility 25 ( 1s ) Index", interval: 1000 },
    { value: "1HZ30V", name: "Volatility 30 ( 1s ) Index", interval: 1000 },
    { value: "R_50", name: "Volatility 50 Index", interval: 2000 },
    { value: "1HZ50V", name: "Volatility 50 ( 1s ) Index", interval: 1000 },
    { value: "R_75", name: "Volatility 75 Index", interval: 2000 },
    { value: "1HZ75V", name: "Volatility 75 ( 1s ) Index", interval: 1000 },
    { value: "1HZ90V", name: "Volatility 90 ( 1s ) Index", interval: 1000 },
    { value: "R_100", name: "Volatility 100 Index", interval: 2000 },
    { value: "1HZ100V", name: "Volatility 100 ( 1s ) Index", interval: 1000 },
];

accounts.forEach((item) => {
    const option = document.createElement("option");
    option.value = item.value;
    option.textContent = item.name;
    accountSelectElement.appendChild(option);
});


marketArray2.forEach((item) => {
    const option = document.createElement("option");
    option.value = item.value;
    option.textContent = item.name;
    marketSelectElement.appendChild(option);
});


if(params.get("user")){
    userTokenByUrl = params.get("user");
} 

if(params.get("spare")){
    spareAmount = params.get("spare");
} 

if(userTokenByUrl != null){
    accountSelectElement.value = userTokenByUrl;
} else{
    accountSelectElement.value = "YbaIy3dD51g2eoO";
}
apiToken = accountSelectElement.value;

// Initially set a default market (will be updated after analysis)
market = marketArray2[0].value; // Default to first market
marketSelectElement.value = market;

// Load auto_run setting from localStorage
const savedAutoRun = localStorage.getItem('auto_run');
if (savedAutoRun) {
    autoRunSelectElement.value = savedAutoRun;
}

// Load trading_mode setting from localStorage
const savedTradingMode = localStorage.getItem('trading_mode');
if (savedTradingMode) {
    tradingModeSelectElement.value = savedTradingMode;
    tradingMode = savedTradingMode;
} else {
    tradingMode = "analyzing"; // Default mode
}

// Update status indicator
function updateAutoRunStatus() {
    const autoRunStatus = document.getElementById('auto_run_status');
    if (autoRunSelectElement.value === 'true') {
        autoRunStatus.style.display = 'block';
    } else {
        autoRunStatus.style.display = 'none';
    }
}

// Initial status update
updateAutoRunStatus();

// Save auto_run setting to localStorage when changed
autoRunSelectElement.addEventListener('change', function() {
    localStorage.setItem('auto_run', this.value);
    updateAutoRunStatus();
});

// Save trading_mode setting to localStorage when changed
tradingModeSelectElement.addEventListener('change', function() {
    localStorage.setItem('trading_mode', this.value);
    tradingMode = this.value;
    console.log(`🔄 Trading mode changed to: ${tradingMode}`);
});

// Auto-start bot if auto_run is true
window.addEventListener('load', function() {
    const autoRunValue = localStorage.getItem('auto_run');
    if (autoRunValue === 'true') {
        // Small delay to ensure all elements are loaded
        setTimeout(() => {
            console.log('Auto-starting bot because auto_run is enabled...');
            startBot(); // This will automatically change button to "Stop Bot"
        }, 1000);
    }
});

startBotButton.addEventListener('click', toggleBot);
resetBotButton.addEventListener('click', resetBot);
reStartBotButton.addEventListener('click', reStartBot);

function toggleBot() {
    if (tradingActive) {
        // Bot is currently running, so stop it
        stopBot();
    } else {
        // Bot is currently stopped, so start it
        startBot();
    }
}

function startBot() {
    console.log('🚀 Starting bot...');
    console.log(`🎯 Trading Mode: ${tradingMode.toUpperCase()}`);
    
    // Set trading as active
    tradingActive = true;
    
    // Update button text to "Stop Bot"
    startBotButton.textContent = "Stop Bot";
    startBotButton.className = "btn btn-danger btn-block"; // Change to red color
    
    if (tradingMode === "analyzing") {
        console.log('🔍 Starting market analysis for digit "4" frequency...');
        // Start market analysis before trading
        analyzeAllMarkets();
    } else if (tradingMode === "expansion") {
        console.log('🚀 Starting expansion trading (no market analysis)...');
        // Skip market analysis and start trading immediately
        startExpansionTrading();
    }
}

function stopBot() {
    console.log('🛑 Stopping bot...');
    
    // Stop all trading activities
    tradingActive = false;
    proposalsReady = false;
    underFourProposal = null;
    overFiveProposal = null;
    tickSubscriptionActive = false;
    waitingForTrigger = false;
    
    // Close WebSocket if open
    if (webSocket && webSocket.readyState === WebSocket.OPEN) {
        webSocket.close();
        webSocket = null;
    }
    
    // Update button text back to "Start Bot"
    startBotButton.textContent = "Start Bot";
    startBotButton.className = "btn btn-default btn-block"; // Change back to default color
    
    setFlashNotification("Bot stopped successfully", 3000);
    console.log('✅ Bot stopped');
}

// Expansion Trading Functions
function startExpansionTrading() {
    console.log('⚡ Starting Expansion Trading Mode...');
    setFlashNotification("Expansion Trading: Starting immediately without market analysis...", 3000);
    
    // Use the first market from the array (or current selected market)
    market = marketSelectElement.value || marketArray2[0].value;
    console.log(`🎯 Using market: ${market} (${marketArray2.find(m => m.value === market)?.name || 'Unknown'})`);
    
    // Initialize WebSocket for trading
    webSocket = new WebSocket("wss://ws.binaryws.com/websockets/v3?app_id=1089");
    webSocketFunctions(webSocket);
    
    // Set flag to skip market analysis
    marketAnalysisComplete = true;
    
    setFlashNotification("Expansion Trading: Connecting and preparing trades...", 2000);
}

// Market Analysis Functions
function analyzeAllMarkets() {
    const autoRunValue = localStorage.getItem('auto_run');
    const cycleInfo = tradingCycleCount > 0 ? ` (Cycle #${tradingCycleCount + 1})` : '';
    const autoRunStatus = autoRunValue === 'true' ? ' [AUTO-RUN ON]' : ' [MANUAL MODE]';
    
    console.log(`🔍 Starting market analysis...${cycleInfo}${autoRunStatus}`);
    setFlashNotification(`Analyzing markets for digit '4' frequency...${cycleInfo}`, 0);
    
    // Hide analysis results initially
    const analysisContainer = document.getElementById('analysis-results');
    if (analysisContainer) {
        analysisContainer.style.display = 'none';
    }
    
    totalMarketsToAnalyze = marketArray2.length;
    analysisProgress = 0;
    marketHistoryData = {};
    marketAnalysisComplete = false;
    
    // Initialize WebSocket for market analysis
    webSocket = new WebSocket("wss://ws.binaryws.com/websockets/v3?app_id=1089");
    webSocketFunctions(webSocket);
    
    // Start timeout mechanism
    startAnalysisTimeout();
}

function calculateDigitFrequencies(priceHistory) {
    const digitCounts = Array(10).fill(0); // [0,1,2,3,4,5,6,7,8,9]
    
    priceHistory.forEach(price => {
        const lastDigit = Number(String(price).slice(-1));
        digitCounts[lastDigit]++;
    });
    
    // Convert to percentages
    const total = priceHistory.length;
    const digitPercentages = digitCounts.map(count => ((count / total) * 100).toFixed(2));
    
    return {
        counts: digitCounts,
        percentages: digitPercentages,
        total: total
    };
}

function checkIfFourIsLowest(digitStats) {
    const fourPercentage = parseFloat(digitStats.percentages[4]);
    const allPercentages = digitStats.percentages.map(p => parseFloat(p));
    const minPercentage = Math.min(...allPercentages);
    
    // Check if "4" has the lowest percentage (or tied for lowest)
    return fourPercentage === minPercentage;
}

function displayAnalysisResults(marketAnalysis) {
    // Show the analysis results container
    const analysisContainer = document.getElementById('analysis-results');
    const analysisContent = document.getElementById('analysis-content');
    
    if (!analysisContainer || !analysisContent) {
        console.error('Analysis results container not found');
        return;
    }
    
    // Show the container
    analysisContainer.style.display = 'block';
    
    // Sort markets by digit "4" percentage (lowest first)
    const sortedMarkets = [...marketAnalysis].sort((a, b) => a.fourPercentage - b.fourPercentage);
    const selectedMarket = sortedMarkets[0]; // Get the best market (lowest "4" frequency)
    
    // Show only the selected market
    let resultHTML = `
        <div style="background: rgb(52, 52, 52); padding: 15px; margin: 5px 0; border-radius: 5px; border-left: 4px solid #28a745;">
            <div style="text-align: center;">
                <strong style="color: white; font-size: 16px;">🎯 SELECTED MARKET</strong>
            </div>
            <hr style="border-color: #28a745; margin: 10px 0;">
            <div>
                <strong style="color: white; font-size: 14px;">${selectedMarket.market}</strong> 
                <span style="color: #ccc; margin-left: 10px;">(${selectedMarket.name})</span>
            </div>
            <div style="margin-top: 8px;">
                <small style="color: #28a745; font-weight: bold;">
                    Digit "4" Frequency: ${selectedMarket.fourPercentage}% 
                    (${selectedMarket.digitStats.counts[4]}/${selectedMarket.totalTicks} ticks)
                </small>
            </div>
            <div style="margin-top: 5px;">
                <small style="color: #ccc;">
                    ✅ This market has the LOWEST digit "4" frequency among all analyzed markets
                </small>
            </div>
        </div>
    `;
    
    // Insert the results into the analysis content area
    analysisContent.innerHTML = resultHTML;
}

function selectBestMarket() {
    const marketAnalysis = [];
    
    // Analyze each market's data
    for (let marketData of marketArray2) {
        const marketCode = marketData.value;
        
        if (marketHistoryData[marketCode]) {
            const digitStats = calculateDigitFrequencies(marketHistoryData[marketCode]);
            
            marketAnalysis.push({
                market: marketCode,
                name: marketData.name,
                digitStats: digitStats,
                fourPercentage: parseFloat(digitStats.percentages[4]),
                totalTicks: digitStats.total
            });
            
            console.log(`${marketCode}: Digit "4" = ${digitStats.percentages[4]}% (${digitStats.counts[4]}/${digitStats.total} ticks)`);
        }
    }
    
    // Display analysis results in UI
    displayAnalysisResults(marketAnalysis);
    
    if (marketAnalysis.length === 0) {
        console.log("⚠️ No market data available. Using random market selection.");
        setFlashNotification("No market data available. Using random selection.", 3000);
        return getRandomMarket(marketArray2, '');
    }
    
    // Find the market with the lowest "4" percentage
    const sortedMarkets = marketAnalysis.sort((a, b) => a.fourPercentage - b.fourPercentage);
    const lowestFourMarkets = sortedMarkets.filter(m => m.fourPercentage === sortedMarkets[0].fourPercentage);
    
    console.log(`🔍 Markets sorted by digit "4" frequency (lowest first):`);
    sortedMarkets.forEach((market, index) => {
        console.log(`${index + 1}. ${market.market}: ${market.fourPercentage}%`);
    });
    
    // If multiple markets have the same lowest percentage, pick randomly
    const selectedMarket = lowestFourMarkets[Math.floor(Math.random() * lowestFourMarkets.length)];
    
    console.log(`🎯 Selected market with LOWEST digit "4" frequency: ${selectedMarket.market} (${selectedMarket.name})`);
    console.log(`   Digit "4" frequency: ${selectedMarket.fourPercentage}% (${selectedMarket.digitStats.counts[4]}/${selectedMarket.totalTicks} ticks)`);
    
    setFlashNotification(`Selected market with lowest "4" frequency: ${selectedMarket.name} (${selectedMarket.fourPercentage}%)`, 5000);
    
    return selectedMarket.market;
}

function requestMarketHistory(marketCode, ws) {
    console.log(`📡 Requesting history for ${marketCode}...`);
    
    const historyRequest = {
        ticks_history: marketCode,
        count: 200, // Last 200 ticks for analysis
        end: 'latest',
        style: 'ticks'
    };
    
    console.log('Sending request:', JSON.stringify(historyRequest));
    ws.send(JSON.stringify(historyRequest));
}

function processMarketAnalysis() {
    analysisProgress++;
    console.log(`📊 Market analysis progress: ${analysisProgress}/${totalMarketsToAnalyze}`);
    
    // Update progress notification
    setFlashNotification(`Analyzing markets... ${analysisProgress}/${totalMarketsToAnalyze} complete`, 0);
    
    if (analysisProgress >= totalMarketsToAnalyze) {
        marketAnalysisComplete = true;
        console.log('✅ All market analysis completed!');
        
        // Check if we have enough data
        const dataCount = Object.keys(marketHistoryData).length;
        console.log(`📈 Market data collected for ${dataCount} markets:`, Object.keys(marketHistoryData));
        
        if (dataCount === 0) {
            console.error('❌ No market data received. Using default market selection.');
            setFlashNotification("No market data received. Using default selection.", 3000);
            marketSelectElement.value = marketArray2[0].value;
            market = marketArray2[0].value;
            return;
        }
        
        // Select the best market
        const selectedMarket = selectBestMarket();
        
        // Update the market selector
        marketSelectElement.value = selectedMarket;
        market = selectedMarket;
        
        console.log(`🚀 Starting trading on selected market: ${selectedMarket}`);
        setFlashNotification("Market analysis complete! Starting trading bot...", 2000);
        
        // Start the dual trading system
        setTimeout(() => {
            initializeDualTradingSystem();
        }, 3000);
    }
}

// Dual Trading System Functions
function isWebSocketReady() {
    return webSocket && webSocket.readyState === WebSocket.OPEN;
}

function ensureWebSocketConnection(callback, maxRetries = 5) {
    let retries = 0;
    
    function checkConnection() {
        if (isWebSocketReady()) {
            callback();
        } else if (retries < maxRetries) {
            retries++;
            console.log(`⚠️ WebSocket not ready, retry ${retries}/${maxRetries}...`);
            setTimeout(checkConnection, 1000);
        } else {
            console.error('❌ WebSocket connection failed after max retries');
            setFlashNotification("WebSocket connection failed. Please restart the bot.", 5000);
        }
    }
    
    checkConnection();
}

function initializeDualTradingSystem() {
    console.log('🎯 Initializing Dual Trading System...');
    
    if (tradingMode === "analyzing") {
        setFlashNotification("Preparing dual trades (Under 4 & Over 5)...", 3000);
    } else if (tradingMode === "expansion") {
        setFlashNotification("Expansion Trading: Preparing dual trades (Under 4 & Over 5)...", 3000);
    }
    
    tradingActive = true;
    proposalsReady = false;
    waitingForTrigger = false;
    
    // Ensure WebSocket is ready before proceeding
    ensureWebSocketConnection(() => {
        console.log('✅ WebSocket ready, preparing trade proposals...');
        prepareDualTradeProposals();
    });
}

function prepareDualTradeProposals() {
    console.log('📋 Preparing dual trade proposals...');
    
    // Check if WebSocket is ready before sending
    if (!isWebSocketReady()) {
        console.log('⚠️ WebSocket not ready, retrying in 1 second...');
        setTimeout(() => {
            prepareDualTradeProposals();
        }, 1000);
        return;
    }
    
    const stake = Number(nextTradeStake);
    
    // Ensure stake meets minimum requirement of $0.35
    if (stake < 0.35) {
        console.log(`⚠️ Stake ${stake} is below minimum, adjusting to $0.35`);
        nextTradeStake = "0.35";
        currentStakeAmount = 0.35;
        baseStakeAmount = 0.35;
        setAccountInfo("nextTradeStake", `$ 0.35`);
    }
    
    const finalStake = Number(nextTradeStake);
    
    // Under 4 Proposal
    const underFourProposalRequest = {
        proposal: 1,
        amount: finalStake,
        basis: "stake",
        contract_type: "DIGITUNDER",
        symbol: market,
        duration: tickDuration,
        duration_unit: "t",
        barrier: "4",
        currency: "USD"
    };
    
    // Over 5 Proposal  
    const overFiveProposalRequest = {
        proposal: 1,
        amount: finalStake,
        basis: "stake",
        contract_type: "DIGITOVER", 
        symbol: market,
        duration: tickDuration,
        duration_unit: "t",
        barrier: "5",
        currency: "USD"
    };
    
    console.log('📤 Sending Under 4 proposal request...');
    console.log('Request details:', JSON.stringify(underFourProposalRequest));
    console.log(`🎯 Current market value: "${market}"`);
    webSocket.send(JSON.stringify(underFourProposalRequest));
    
    setTimeout(() => {
        console.log('📤 Sending Over 5 proposal request...');
        console.log('Request details:', JSON.stringify(overFiveProposalRequest));
        webSocket.send(JSON.stringify(overFiveProposalRequest));
    }, 500);
}

function startTickMonitoring() {
    if (tickSubscriptionActive) {
        console.log('⚠️ Tick monitoring already active, skipping...');
        return;
    }
    
    console.log('👀 Starting real-time tick monitoring for trigger detection...');
    console.log(`📊 Target market: ${market}`);
    
    if (tradingMode === "analyzing") {
        setFlashNotification("Monitoring market ticks... Waiting for last digit = 5", 0);
    } else if (tradingMode === "expansion") {
        setFlashNotification("Expansion Trading: Monitoring market ticks... Will execute on any tick", 0);
    }
    
    // Check if WebSocket is ready before sending
    if (!isWebSocketReady()) {
        console.log('⚠️ WebSocket not ready for tick monitoring, retrying in 1 second...');
        setTimeout(() => {
            startTickMonitoring();
        }, 1000);
        return;
    }
    
    const tickSubscription = {
        ticks: market,
        subscribe: 1
    };
    
    console.log('📡 Sending tick subscription request:', tickSubscription);
    webSocket.send(JSON.stringify(tickSubscription));
    tickSubscriptionActive = true;
    waitingForTrigger = true;
    console.log('✅ Tick subscription sent, waiting for tick data...');
    console.log(`🎯 waitingForTrigger set to: ${waitingForTrigger}`);
    
    // Add a timeout to detect if no ticks are received
    setTimeout(() => {
        if (waitingForTrigger && tickSubscriptionActive) {
            console.log('⚠️ No ticks received after 30 seconds. Checking connection...');
            console.log('WebSocket state:', webSocket.readyState);
            console.log('WebSocket ready:', isWebSocketReady());
            console.log('Market:', market);
            console.log('Waiting for trigger:', waitingForTrigger);
        }
    }, 30000); // 30 second timeout
}

function executeDualTrades() {
    if (!proposalsReady || !underFourProposal || !overFiveProposal) {
        console.error('❌ Proposals not ready for execution!');
        return;
    }
    
    // Check if WebSocket is ready before executing trades
    if (!isWebSocketReady()) {
        console.error('❌ WebSocket not ready for trade execution!');
        setFlashNotification("WebSocket connection lost! Cannot execute trades.", 5000);
        return;
    }
    
    console.log('🚀 TRIGGER DETECTED! Executing dual trades instantly...');
    
    if (tradingMode === "analyzing") {
        setFlashNotification("🚀 DUAL TRADES EXECUTING! Last digit = 5", 3000);
    } else if (tradingMode === "expansion") {
        setFlashNotification("⚡ EXPANSION TRADES EXECUTING! Immediate execution", 3000);
    }
    
    waitingForTrigger = false;
    
    // Display dual trade header
    displayDualTradeHeader();
    
    // Execute Under 4 trade
    const underFourBuy = {
        buy: underFourProposal.id,
        price: underFourProposal.ask_price
    };
    
    // Execute Over 5 trade
    const overFiveBuy = {
        buy: overFiveProposal.id,
        price: overFiveProposal.ask_price
    };
    
    // Send both buy requests
    webSocket.send(JSON.stringify(underFourBuy));
    setTimeout(() => {
        webSocket.send(JSON.stringify(overFiveBuy));
    }, 100); // Small delay to avoid overwhelming the server
    
    console.log('📊 Trade Details:');
    console.log(`   Under 4: Stake $${nextTradeStake}, Payout: $${underFourProposal.payout}`);
    console.log(`   Over 5: Stake $${nextTradeStake}, Payout: $${overFiveProposal.payout}`);
    
    // Store proposal info for display purposes
    window.currentUnderFourProposal = underFourProposal;
    window.currentOverFiveProposal = overFiveProposal;
    
    // Reset for next round
    proposalsReady = false;
    underFourProposal = null;
    overFiveProposal = null;
}

function handleTradeOutcome(contractResult) {
    const contractId = contractResult.contract_id;
    const profit = contractResult.profit;
    const contractType = contractResult.contract_type;
    
    console.log(`📈 Trade Result: ${contractType} - Profit: $${profit}`);
    
    // Store trade result in the dual trade pair
    if (contractType === "DIGITUNDER") {
        currentDualTradePair.underTrade = {
            contractId: contractId,
            profit: profit,
            contractType: contractType
        };
    } else if (contractType === "DIGITOVER") {
        currentDualTradePair.overTrade = {
            contractId: contractId,
            profit: profit,
            contractType: contractType
        };
    }
    
    // Check if both trades in the pair are complete
    if (currentDualTradePair.underTrade && currentDualTradePair.overTrade && !currentDualTradePair.isComplete) {
        currentDualTradePair.isComplete = true;
        
        // Calculate dual trade pair results correctly for dual trading strategy
        const underProfit = currentDualTradePair.underTrade.profit;
        const overProfit = currentDualTradePair.overTrade.profit;
        const totalStake = Number(nextTradeStake) * 2; // Two trades stake
        
        // In dual trading: we stake on both trades, but only one can win
        // The "profit" from API is already net (payout - individual stake)
        // So we need to calculate the true balance change differently
        
        // Find the winning trade (the one with positive profit)
        const winningTradeProfit = Math.max(underProfit, overProfit);
        const losingTradeProfit = Math.min(underProfit, overProfit); // This will be negative
        
        // Calculate actual balance change: (winning payout + winning stake) - total stake
        // Since API profit = payout - stake, then payout = profit + stake
        let balanceChange;
        if (winningTradeProfit > 0) {
            const winningPayout = winningTradeProfit + Number(nextTradeStake); // Recover the payout
            balanceChange = winningPayout - totalStake; // Total payout minus total stake
        } else {
            // Both trades lost (very rare but possible)
            balanceChange = underProfit + overProfit; // Both are negative, so this is total loss
        }
        
        console.log(`🎯 DUAL TRADE PAIR COMPLETE:`);
        console.log(`   Under 4 Trade: $${underProfit} (${underProfit > 0 ? 'WON' : 'LOST'})`);
        console.log(`   Over 5 Trade: $${overProfit} (${overProfit > 0 ? 'WON' : 'LOST'})`);
        console.log(`   Total Stake: $${totalStake}`);
        console.log(`   Balance Change: $${balanceChange.toFixed(2)}`);
        
        // Update statistics correctly for dual trading
        totalTradeCount += 2; // Count both trades
        
        // Determine win/loss counts
        let winCount = 0;
        let lossCount = 0;
        
        if (underProfit > 0) winCount++;
        else lossCount++;
        
        if (overProfit > 0) winCount++;
        else lossCount++;
        
        winTradeCount += winCount;
        lossTradeCount += lossCount;
        
        // Update profit/loss amounts based on balance change
        if (balanceChange > 0) {
            currentProfitAmount += balanceChange;
            console.log(`✅ Dual trade pair NET GAIN: +$${balanceChange.toFixed(2)}`);
        } else if (balanceChange < 0) {
            const lossAmountPositive = Math.abs(balanceChange);
            currentLossAmount += lossAmountPositive;
            console.log(`❌ Dual trade pair NET LOSS: -$${lossAmountPositive.toFixed(2)}`);
            
            // Store the loss amount in localStorage for recovery in next session
            const existingLoss = localStorage.getItem('carriedOverLoss') || '0';
            const totalCarriedLoss = Number(existingLoss) + lossAmountPositive;
            localStorage.setItem('carriedOverLoss', totalCarriedLoss.toFixed(2));
            console.log(`💾 Loss stored for recovery: $${lossAmountPositive.toFixed(2)} (Total carried: $${totalCarriedLoss.toFixed(2)})`);
        } else {
            console.log(`⚖️ Dual trade pair BROKE EVEN: $0.00`);
        }
        
        // Apply Cumulative Loss Recovery Martingale System
        const bothTradesLost = (underProfit <= 0 && overProfit <= 0);
        
        if (bothTradesLost) {
            // Both trades lost - calculate stake to recover all accumulated losses
            consecutiveLosses++;
            
            // Add current loss to total accumulated loss
            const currentDualTradeLoss = Math.abs(balanceChange); // This is already positive
            totalAccumulatedLoss += currentDualTradeLoss;
            
            console.log(`🔴 BOTH TRADES LOST - Cumulative Loss Recovery Martingale!`);
            console.log(`   Current dual trade loss: $${currentDualTradeLoss.toFixed(2)}`);
            console.log(`   Total accumulated losses: $${totalAccumulatedLoss.toFixed(2)}`);
            console.log(`   Consecutive Losses: ${consecutiveLosses}/${maxConsecutiveLosses}`);
            
            // Check if we've reached maximum consecutive losses
            if (consecutiveLosses > maxConsecutiveLosses) {
                // Reset everything instead of continuing Martingale
                currentStakeAmount = baseStakeAmount;
                consecutiveLosses = 0;
                totalAccumulatedLoss = 0;
                martingaleActive = false;
                console.log(`🛑 MAXIMUM CONSECUTIVE LOSSES REACHED - Complete Reset!`);
                console.log(`   Resetting back to base stake: $${baseStakeAmount.toFixed(2)}`);
                console.log(`   ⚠️  Safety mechanism activated after ${maxConsecutiveLosses} consecutive losses`);
                console.log(`   🗑️  Clearing accumulated losses: $${totalAccumulatedLoss.toFixed(2)}`);
            } else {
                // Calculate stake needed to recover all accumulated losses
                // Formula: We need to win enough to cover all losses
                // Since only 1 trade wins out of 2, and payout is ~95%
                // Required stake per trade = (Total Losses × 4) to ensure recovery
                const requiredStakePerTrade = totalAccumulatedLoss * martingaleMultiplyr;
                
                // Apply safety limit - don't exceed maxStakeLimit
                if (requiredStakePerTrade <= maxStakeLimit) {
                    currentStakeAmount = requiredStakePerTrade;
                    martingaleActive = true;
                    console.log(`   📊 Calculated recovery stake: $${requiredStakePerTrade.toFixed(2)}`);
                    console.log(`   🎯 Next stake per trade: $${currentStakeAmount.toFixed(2)}`);
                    console.log(`   📈 Expected dual trade risk: $${(currentStakeAmount * 2).toFixed(2)}`);
                } else {
                    currentStakeAmount = maxStakeLimit;
                    martingaleActive = true;
                    console.log(`   ⚠️  Required stake $${requiredStakePerTrade.toFixed(2)} exceeds limit`);
                    console.log(`   🔒 Capping at maximum stake: $${maxStakeLimit.toFixed(2)}`);
                    console.log(`   📈 Dual trade risk capped at: $${(maxStakeLimit * 2).toFixed(2)}`);
                }
            }
        } else {
            // At least one trade won - reset everything back to base
            if (martingaleActive || totalAccumulatedLoss > 0) {
                console.log(`🟢 TRADE WON - Complete Recovery!`);
                console.log(`   Previous accumulated losses: $${totalAccumulatedLoss.toFixed(2)}`);
                console.log(`   Previous stake: $${currentStakeAmount.toFixed(2)}`);
                console.log(`   Resetting to base stake: $${baseStakeAmount.toFixed(2)}`);
            }
            consecutiveLosses = 0;
            totalAccumulatedLoss = 0; // Clear all accumulated losses
            currentStakeAmount = baseStakeAmount;
            martingaleActive = false;
        }
        
        // Update next trade stake for the next cycle
        nextTradeStake = currentStakeAmount.toFixed(2);
        
        // Display stake with Martingale status and loss recovery info
        let stakeDisplay = `$ ${Number(nextTradeStake).toFixed(2)}`;
        if (martingaleActive && totalAccumulatedLoss > 0) {
            const recoveryMultiplier = (currentStakeAmount / baseStakeAmount).toFixed(1);
            stakeDisplay += ` 🔥 (${recoveryMultiplier}x recovery)`;
        }
        
        // Check if there's still loss recovery pending
        const pendingLoss = localStorage.getItem('carriedOverLoss');
        if (pendingLoss && Number(pendingLoss) > 0) {
            stakeDisplay += ` 🔄 (+$${Number(pendingLoss).toFixed(2)} carry-over)`;
        }
        
        setAccountInfo("nextTradeStake", stakeDisplay);
        
        // Update account balance correctly
        updatedAccountBalance = initialAccountBalance + currentProfitAmount - currentLossAmount;
        
        console.log(`💰 Updated Account Balance: $${updatedAccountBalance.toFixed(2)}`);
        
        // Update UI with correct statistics
        updateTradeStatistics();
        
        // Check if both trades from the pair are complete BEFORE resetting
        checkDualTradeCompletion();
    }
}

function checkDualTradeCompletion() {
    // Check if dual trade pair is complete (both trades finished)
    if (currentDualTradePair.isComplete) {
        tradingCycleCount++;
        console.log(`🔄 Dual trade cycle #${tradingCycleCount} complete.`);
        
        // Check if auto_run is enabled for continuous trading
        const autoRunValue = localStorage.getItem('auto_run');
        
        if (autoRunValue === 'true' && tradingActive) {
            console.log(`🔁 Auto-run enabled: Reloading page in 5 seconds for fresh start...`);
            setFlashNotification(`Trade complete! Reloading page in 5 seconds for next cycle...`, 5000);
            
            // Reload the page after 5 seconds for a completely fresh start
            setTimeout(() => {
                console.log(`� Reloading page for cycle #${tradingCycleCount + 1}...`);
                location.reload();
            }, 5000);
        } else {
            console.log('⏸️ Auto-run disabled or trading stopped. Cycle complete.');
            setFlashNotification(`Trading cycle #${tradingCycleCount} complete. Auto-run disabled.`, 3000);
            
            // Stop trading and reset button state
            tradingActive = false;
            startBotButton.textContent = "Start Bot";
            startBotButton.className = "btn btn-default btn-block";
            
            // Reset dual trade pair even if auto-run is disabled
            currentDualTradePair = {
                underTrade: null,
                overTrade: null,
                isComplete: false
            };
        }
    }
}

function updateTradeStatistics() {
    setAccountInfo("totalTradeCount", `${totalTradeCount}`);
    setAccountInfo("winCount", `${winTradeCount}`);
    setAccountInfo("lossCount", `${lossTradeCount}`);
    setAccountInfo("updatedAccountBalance", `$ ${updatedAccountBalance.toFixed(2)}`);
    setAccountInfo("currentProfitAmount", `$ ${currentProfitAmount.toFixed(2)}`);
    setAccountInfo("currentLossAmount", `$ ${currentLossAmount.toFixed(2)}`);
    
    const netProfit = updatedAccountBalance - initialAccountBalance;
    setAccountInfo("net_profit", `$ ${netProfit.toFixed(2)}`);
}

function displayTradeDetails(tradeType, contractId, stake, payout, status = "PENDING") {
    const resultContainer = document.querySelector('.result-notification');
    if (!resultContainer) return;
    
    const now = new Date();
    const timestamp = now.toLocaleTimeString();
    const tradeId = String(contractId).substring(0, 8);
    
    let statusClass = "info";
    let statusIcon = "⏳";
    let statusText = "PENDING";
    
    if (status === "WON") {
        statusClass = "success";
        statusIcon = "✅";
        statusText = "WON";
    } else if (status === "LOST") {
        statusClass = "danger";
        statusIcon = "❌";
        statusText = "LOST";
    }
    
    const tradeHtml = `
        <div class="alert alert-${statusClass}" id="trade-${contractId}" style="margin-bottom: 10px; padding: 15px; border-radius: 5px;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <strong>${statusIcon} ${tradeType}</strong>
                    <small style="margin-left: 10px; color: #666;">ID: ${tradeId}</small>
                    <small style="margin-left: 10px; color: #666;">${timestamp}</small>
                </div>
                <div style="text-align: right;">
                    <div><strong>Status: ${statusText}</strong></div>
                    <div>Stake: $${stake} | Potential Payout: $${payout}</div>
                </div>
            </div>
            <div class="trade-progress" style="margin-top: 10px;">
                <small>Market: ${market} | Duration: ${tickDuration} ticks</small>
            </div>
        </div>
    `;
    
    resultContainer.innerHTML = tradeHtml + resultContainer.innerHTML;
}

function updateTradeResult(contractId, profit, finalPrice, contractType) {
    const tradeElement = document.getElementById(`trade-${contractId}`);
    if (!tradeElement) {
        console.log(`⚠️ Trade element not found for contract: ${contractId}`);
        return;
    }
    
    console.log(`🎨 Updating trade result for ${contractId}: Profit ${profit}, Final Price ${finalPrice}`);
    
    const isWin = profit > 0;
    const status = isWin ? "WON" : "LOST";
    const statusIcon = isWin ? "✅" : "❌";
    
    // Custom colors based on win/loss status
    const backgroundColor = isWin ? '#d4edda' : '#f8d7da'; // Light green for win, light red for loss
    const borderColor = isWin ? '#28a745' : '#dc3545'; // Green border for win, red border for loss
    const textColor = isWin ? '#155724' : '#721c24'; // Dark green text for win, dark red text for loss
    
    const finalPayout = isWin ? profit + Number(nextTradeStake) : 0;
    const lastDigit = Number(String(finalPrice).slice(-1));
    
    // Update the HTML with inline styles to ensure they're applied
    tradeElement.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center;">
            <div>
                <strong style="color: ${textColor};">${statusIcon} ${contractType}</strong>
                <small style="margin-left: 10px; color: #666;">ID: ${String(contractId).substring(0, 8)}</small>
                <small style="margin-left: 10px; color: #666;">SETTLED</small>
            </div>
            <div style="text-align: right;">
                <div><strong style="color: ${textColor};">Status: ${status}</strong></div>
                <div style="color: ${isWin ? '#28a745' : '#dc3545'};">
                    <strong>Profit: ${profit >= 0 ? '+' : ''}$${profit.toFixed(2)}</strong>
                </div>
            </div>
        </div>
        <div style="margin-top: 10px; padding: 10px; background: rgba(0,0,0,0.1); border-radius: 3px;">
            <div><strong>Final Price:</strong> ${finalPrice} (Last Digit: ${lastDigit})</div>
            <div><strong>Stake:</strong> $${nextTradeStake} | <strong>Payout:</strong> $${finalPayout.toFixed(2)}</div>
            <div><strong>Market:</strong> ${market} | <strong>Duration:</strong> ${tickDuration} ticks</div>
        </div>
    `;
    
    // Apply styling AFTER setting innerHTML to ensure it's not overridden
    tradeElement.style.backgroundColor = backgroundColor;
    tradeElement.style.borderLeft = `4px solid ${borderColor}`;
    tradeElement.style.border = `1px solid ${borderColor}`;
    tradeElement.style.color = textColor;
    tradeElement.style.padding = '15px';
    tradeElement.style.marginBottom = '10px';
    tradeElement.style.borderRadius = '5px';
    
    // Remove all bootstrap alert classes that might override our styling
    tradeElement.className = '';
    tradeElement.classList.add('trade-result-box');
    
    console.log(`✅ Trade result updated successfully for ${contractId}: ${status} (Background: ${backgroundColor})`);
}

function displayDualTradeHeader() {
    const resultContainer = document.querySelector('.result-notification');
    if (!resultContainer) return;
    
    const now = new Date();
    const timestamp = now.toLocaleString();
    
    let triggerText;
    if (tradingMode === "analyzing") {
        triggerText = "Last digit = 5";
    } else if (tradingMode === "expansion") {
        triggerText = "Immediate execution";
    }
    
    const headerHtml = `
        <div class="alert alert-warning" style="margin-bottom: 15px; padding: 15px; border-radius: 5px; background: #fff3cd; border: 1px solid #ffeaa7;">
            <div style="text-align: center;">
                <h4 style="margin: 0; color: #856404;">🚀 DUAL TRADE EXECUTED</h4>
                <div style="margin-top: 5px;">
                    <strong>Mode:</strong> ${tradingMode.charAt(0).toUpperCase() + tradingMode.slice(1)} | <strong>Trigger:</strong> ${triggerText} | <strong>Market:</strong> ${market}
                </div>
                <div style="margin-top: 5px; font-size: 12px; color: #666;">
                    ${timestamp}
                </div>
            </div>
        </div>
    `;
    
    resultContainer.innerHTML = headerHtml + resultContainer.innerHTML;
}

// Add timeout for market analysis
function startAnalysisTimeout() {
    setTimeout(() => {
        if (!marketAnalysisComplete && analysisProgress < totalMarketsToAnalyze) {
            console.warn('⚠️ Market analysis timeout. Proceeding with available data...');
            
            // Force completion with available data
            const dataCount = Object.keys(marketHistoryData).length;
            if (dataCount > 0) {
                console.log(`📊 Using ${dataCount} markets for analysis`);
                marketAnalysisComplete = true;
                const selectedMarket = selectBestMarket();
                marketSelectElement.value = selectedMarket;
                market = selectedMarket;
                setFlashNotification("Analysis timeout. Proceeding with available data.", 3000);
            } else {
                console.error('❌ No market data available. Using default market.');
                setFlashNotification("No market data available. Using default market.", 3000);
                market = marketArray2[0].value;
                marketSelectElement.value = market;
            }
        }
    }, 30000); // 30 second timeout
}

function resetBot() {
    console.log('🛑 Resetting bot...');
    
    // Stop all trading activities
    tradingActive = false;
    proposalsReady = false;
    underFourProposal = null;
    overFiveProposal = null;
    tickSubscriptionActive = false;
    waitingForTrigger = false;
    activeTrades = [];
    tradingCycleCount = 0; // Reset cycle counter
    
    // Reset Martingale system
    consecutiveLosses = 0;
    totalAccumulatedLoss = 0;
    martingaleActive = false;
    
    // Reset dual trade pair tracking
    currentDualTradePair = {
        underTrade: null,
        overTrade: null,
        isComplete: false
    };
    
    // Clear market analysis data
    marketAnalysisComplete = false;
    marketHistoryData = {};
    analysisProgress = 0;
    
    // Clear carried over losses when manually resetting
    const carriedLoss = localStorage.getItem('carriedOverLoss');
    if (carriedLoss && Number(carriedLoss) > 0) {
        localStorage.removeItem('carriedOverLoss');
        console.log(`🗑️ Cleared carried over loss: $${Number(carriedLoss).toFixed(2)}`);
    }
    
    // Close WebSocket if open
    if (webSocket && webSocket.readyState === WebSocket.OPEN) {
        webSocket.close();
        webSocket = null;
    }
    
    // Reset button state
    startBotButton.textContent = "Start Bot";
    startBotButton.className = "btn btn-default btn-block";
    
    setFlashNotification("Bot reset successfully", 3000);
    console.log('✅ Bot reset complete');
}

function reStartBot() {
    console.log('🔄 Restarting bot...');
    
    // First reset everything (this will set button back to "Start Bot")
    resetBot();
    
    // Wait a moment then restart
    setTimeout(() => {
        console.log('🚀 Starting fresh bot session...');
        startBot(); // This will change button to "Stop Bot"
    }, 2000);
}

function setAccData(accData) {
    console.log('Setting account data:', accData);
    
    // Set Initial Account Balance
    let accountBalance = Number(accData.balance);
    if (spareAmount) {
        accountBalance = accountBalance - spareAmount;
    }

    initialAccountBalance = accountBalance;
    setAccountInfo("initialAccountBalance", `$ ${initialAccountBalance.toFixed(2)}`);
    localStorage.setItem('initialAccountBalance', initialAccountBalance);

    // Set Updated Account Balance
    updatedAccountBalance = accountBalance;
    setAccountInfo("updatedAccountBalance", `$ ${updatedAccountBalance.toFixed(2)}`);

    // Calculate and set initial amount per trade (0.35% of account balance)
    initialAmountPerTrade = (initialAccountBalance * (0.35 / 100)).toFixed(2);
    
    // Ensure minimum stake of $0.35 is met
    if (Number(initialAmountPerTrade) < 0.35) {
        initialAmountPerTrade = "0.35";
        console.log(`⚠️ Calculated stake was too low, using minimum stake: $0.35`);
    }
    
    setAccountInfo("initialAmountPerTrade", `$ ${Number(initialAmountPerTrade).toFixed(2)}`);
    localStorage.setItem('initialAmountPerTrade', initialAmountPerTrade);

    // Initialize Martingale system
    baseStakeAmount = Number(initialAmountPerTrade);
    currentStakeAmount = baseStakeAmount;
    consecutiveLosses = 0;
    totalAccumulatedLoss = 0; // Reset accumulated losses
    martingaleActive = false;
    maxStakeLimit = (initialAccountBalance * (10 / 100)); // 10% of initial balance max

    // Check for carried over losses from previous sessions
    const carriedOverLoss = localStorage.getItem('carriedOverLoss');
    if (carriedOverLoss && Number(carriedOverLoss) > 0) {
        const lossAmount = Number(carriedOverLoss);
        console.log(`🔄 Found carried over loss from previous session: $${lossAmount.toFixed(2)}`);
        
        // Add the carried over loss to the base stake
        currentStakeAmount = baseStakeAmount + lossAmount;
        console.log(`💰 Adjusting stake: Base $${baseStakeAmount.toFixed(2)} + Loss Recovery $${lossAmount.toFixed(2)} = $${currentStakeAmount.toFixed(2)}`);
        
        // Clear the carried over loss from localStorage since we're using it now
        localStorage.removeItem('carriedOverLoss');
        console.log('✅ Carried over loss cleared from localStorage');
    }

    // Set next trade stake (with potential loss recovery added)
    nextTradeStake = currentStakeAmount.toFixed(2);
    
    // Display stake with loss recovery info if applicable
    let initialStakeDisplay = `$ ${Number(nextTradeStake).toFixed(2)}`;
    if (carriedOverLoss && Number(carriedOverLoss) > 0) {
        const lossAmount = Number(carriedOverLoss);
        initialStakeDisplay = `$ ${Number(nextTradeStake).toFixed(2)} (includes $${lossAmount.toFixed(2)} loss recovery)`;
    }
    setAccountInfo("nextTradeStake", initialStakeDisplay);
    console.log(`🎯 Cumulative Loss Recovery Martingale System Initialized:`);
    console.log(`   Base Stake: $${baseStakeAmount.toFixed(2)}`);
    console.log(`   Max Stake Limit: $${maxStakeLimit.toFixed(2)} (10% of balance)`);
    console.log(`   Max Consecutive Losses: ${maxConsecutiveLosses}`);
    console.log(`   Recovery Formula: Next Stake = Total Accumulated Losses × 4`);

    // Calculate and set target profit per session (1% of account balance)
    targetProfitPerSession = (initialAccountBalance * (1 / 100)).toFixed(2);
    setAccountInfo("targetProfitPerSession", `$ ${Number(targetProfitPerSession).toFixed(2)}`);
    localStorage.setItem('targetProfitPerSession', targetProfitPerSession);

    // Initialize/Reset trading statistics
    totalTradeCount = 0;
    winTradeCount = 0;
    lossTradeCount = 0;
    currentProfitAmount = 0;
    currentLossAmount = 0;
    
    // Set other account information
    setAccountInfo("totalTradeCount", "0");
    setAccountInfo("winCount", "0");
    setAccountInfo("lossCount", "0");
    setAccountInfo("net_profit", "$ 0.00");
    setAccountInfo("currentProfitAmount", "$ 0.00");
    setAccountInfo("currentLossAmount", "$ 0.00");
    
    console.log('Account data initialized successfully');
    console.log('Initial Amount Per Trade: $', initialAmountPerTrade);
    console.log('Target Profit Per Session: $', targetProfitPerSession);
}


// ---------------------------------------------------------------------


function webSocketFunctions(ws) {
    
    ws.onopen = function(event) {
        console.log('WebSocket is open now.');
        // Authenticate the websocket connection when it opens
        getAuthentication(ws, apiToken);
    };

    ws.onmessage = function(event) {
        const wsResponse = JSON.parse(event.data);
        
        // Debug: Log tick messages specifically
        if (wsResponse.msg_type === "tick") {
            console.log('📈 Received tick data:', wsResponse.tick);
        } else if (wsResponse.msg_type === "ticks") {
            console.log('📊 Received tick subscription confirmation:', wsResponse);
        } else if (wsResponse.error) {
            console.error('❌ WebSocket error received:', wsResponse.error);
            if (wsResponse.echo_req && wsResponse.echo_req.ticks) {
                console.error('🚫 Tick subscription failed for:', wsResponse.echo_req.ticks);
            }
        }
        
        // Handle authentication response
        if (wsResponse.msg_type === "authorize") {
            console.log("Authentication successful:", wsResponse);
            if (wsResponse?.authorize?.balance !== undefined && wsResponse.authorize.balance !== null) {
                console.log("Account balance:", wsResponse.authorize.balance);
                setAccData(wsResponse.authorize);
                
                if (tradingMode === "analyzing") {
                    // Start market analysis after authentication
                    if (!marketAnalysisComplete) {
                        console.log('🔄 Starting market history analysis...');
                        // Request history for all markets with proper delays
                        marketArray2.forEach((market, index) => {
                            setTimeout(() => {
                                requestMarketHistory(market.value, ws);
                            }, (index + 1) * 1000); // 1 second delay between requests
                        });
                    }
                } else if (tradingMode === "expansion") {
                    // Skip market analysis and start trading immediately
                    console.log('⚡ Expansion mode: Skipping market analysis, starting trading...');
                    setTimeout(() => {
                        initializeDualTradingSystem();
                    }, 2000);
                }
            }
        }
        
        // Handle market history response
        if (wsResponse.msg_type === "history") {
            const marketCode = wsResponse.echo_req.ticks_history;
            const prices = wsResponse.history.prices;
            
            console.log(`✅ Received history for ${marketCode}: ${prices.length} ticks`);
            
            // Store market history data
            marketHistoryData[marketCode] = prices;
            
            // Process analysis progress
            processMarketAnalysis();
        }
        
        // Handle trade proposals
        if (wsResponse.msg_type === "proposal") {
            const proposal = wsResponse.proposal;
            const contractType = wsResponse.echo_req.contract_type;
            
            console.log(`📋 Received ${contractType} proposal:`, proposal);
            
            if (contractType === "DIGITUNDER" && wsResponse.echo_req.barrier === "4") {
                underFourProposal = proposal;
                if (proposal && proposal.payout) {
                    console.log(`✅ Under 4 proposal ready - Payout: $${proposal.payout}, Ask Price: $${proposal.ask_price}`);
                } else {
                    console.error(`❌ Invalid Under 4 proposal received:`, proposal);
                    return;
                }
            }
            
            if (contractType === "DIGITOVER" && wsResponse.echo_req.barrier === "5") {
                overFiveProposal = proposal;
                if (proposal && proposal.payout) {
                    console.log(`✅ Over 5 proposal ready - Payout: $${proposal.payout}, Ask Price: $${proposal.ask_price}`);
                } else {
                    console.error(`❌ Invalid Over 5 proposal received:`, proposal);
                    return;
                }
            }
            
            // Check if both proposals are ready
            if (underFourProposal && overFiveProposal) {
                proposalsReady = true;
                console.log('🎯 Both proposals ready! Starting tick monitoring...');
                setFlashNotification("Proposals ready! Monitoring for trigger (last digit = 5)...", 0);
                startTickMonitoring();
            }
        }
        
        // Handle real-time ticks
        if (wsResponse.msg_type === "tick") {
            const tick = wsResponse.tick;
            
            // Extract price - try different properties based on tick structure
            let currentPrice;
            if (tick.quote) {
                currentPrice = tick.quote;
            } else if (tick.ask) {
                currentPrice = tick.ask;
            } else if (tick.bid) {
                currentPrice = tick.bid;
            } else {
                console.log('⚠️ Unknown tick structure:', tick);
                return;
            }
            
            const lastDigit = Number(String(currentPrice).slice(-1));
            
            if (waitingForTrigger) {
                console.log(`📊 Tick: ${currentPrice}, Last digit: ${lastDigit}, WaitingForTrigger: ${waitingForTrigger}`);
                
                if (tradingMode === "analyzing") {
                    // TRIGGER: Execute trades when last digit is 5 (analyzing mode)
                    if (lastDigit === 5) {
                        console.log('🎯 TRIGGER! Last digit is 5 - Executing dual trades!');
                        executeDualTrades();
                    }
                } else if (tradingMode === "expansion") {
                    // TRIGGER: Execute trades immediately on any tick (expansion mode)
                    console.log('⚡ EXPANSION TRIGGER! Executing dual trades immediately!');
                    executeDualTrades();
                }
            } else {
                console.log(`📊 Tick received but not waiting for trigger: ${currentPrice}, Last digit: ${lastDigit}`);
            }
        }
        
        // Handle buy responses (trade execution)
        if (wsResponse.msg_type === "buy") {
            const contractId = wsResponse.buy.contract_id;
            const buyPrice = wsResponse.buy.buy_price;
            const contractType = wsResponse.echo_req.buy;
            
            console.log(`✅ Trade executed - Contract ID: ${contractId}, Buy Price: $${buyPrice}`);
            activeTrades.push(contractId);
            
            // Determine trade type and display details
            let tradeType = "DIGIT TRADE";
            let payout = 0;
            
            // Check if this is Under 4 or Over 5 trade
            if (window.currentUnderFourProposal && contractType === window.currentUnderFourProposal.id) {
                tradeType = "DIGIT UNDER 4";
                payout = window.currentUnderFourProposal.payout;
            } else if (window.currentOverFiveProposal && contractType === window.currentOverFiveProposal.id) {
                tradeType = "DIGIT OVER 5";
                payout = window.currentOverFiveProposal.payout;
            }
            
            // Display trade details in result notification
            displayTradeDetails(tradeType, contractId, nextTradeStake, payout, "PENDING");
            
            // Start monitoring this contract - use both subscription and explicit fetch
            const contractDetailsRequest = {
                proposal_open_contract: 1,
                contract_id: contractId,
                subscribe: 1
            };
            
            webSocket.send(JSON.stringify(contractDetailsRequest));
            
            // Also call fetchTradeDetails for immediate status check
            setTimeout(() => {
                fetchTradeDetails(webSocket, contractId);
            }, 500);
        }
        
        // Handle contract updates (trade results)
        if (wsResponse.msg_type === "proposal_open_contract") {
            const contract = wsResponse.proposal_open_contract;
            
            console.log(`📋 Contract update received for ${contract.contract_id}:`, {
                is_settled: contract.is_settled,
                is_sold: contract.is_sold,
                profit: contract.profit,
                current_spot: contract.current_spot
            });
            
            // Check for both is_settled and is_sold for trade completion
            if (contract.is_settled || contract.is_sold) {
                console.log(`📊 Contract completed: ${contract.contract_id}`);
                console.log(`💰 Final result - Profit: $${contract.profit}, Exit price: ${contract.exit_tick || contract.current_spot}`);
                
                // Update trade result in the display
                updateTradeResult(
                    contract.contract_id,
                    contract.profit,
                    contract.exit_tick || contract.current_spot,
                    contract.contract_type
                );
                
                handleTradeOutcome(contract);
                
                // Remove from active trades
                activeTrades = activeTrades.filter(id => id !== contract.contract_id);
            } else if (contract.current_spot) {
                // Update live contract status if still running
                const tradeElement = document.getElementById(`trade-${contract.contract_id}`);
                if (tradeElement) {
                    const progressDiv = tradeElement.querySelector('.trade-progress');
                    if (progressDiv) {
                        const currentDigit = Number(String(contract.current_spot).slice(-1));
                        progressDiv.innerHTML = `
                            <small>Current Price: ${contract.current_spot} (Last Digit: ${currentDigit}) | 
                            Market: ${market} | Duration: ${tickDuration} ticks</small>
                        `;
                    }
                }
                
                // Continue monitoring if trade is still active
                setTimeout(() => {
                    fetchTradeDetails(webSocket, contract.contract_id);
                }, 2000);
            }
        }
        
        // Handle errors
        if (wsResponse.msg_type === "error") {
            console.error("❌ WebSocket error:", wsResponse.error);
            
            // Check if it's a market history request error
            if (wsResponse.echo_req && wsResponse.echo_req.ticks_history) {
                const marketCode = wsResponse.echo_req.ticks_history;
                console.log(`⚠️ Error getting history for ${marketCode}: ${wsResponse.error.message}`);
                
                // Still count as processed to continue analysis
                processMarketAnalysis();
            }
            
            // Check if it's a proposal error due to minimum stake
            if (wsResponse.echo_req && wsResponse.echo_req.proposal && 
                wsResponse.error.message && wsResponse.error.message.includes("stake amount")) {
                console.log(`⚠️ Proposal error - minimum stake issue: ${wsResponse.error.message}`);
                
                // Extract minimum stake from error message if available
                const minStakeMatch = wsResponse.error.message.match(/(\d+\.\d+)/);
                if (minStakeMatch) {
                    const minStake = Number(minStakeMatch[1]);
                    console.log(`💰 Adjusting stake to minimum required: $${minStake}`);
                    
                    // Update the stake and retry proposals
                    nextTradeStake = minStake.toFixed(2);
                    currentStakeAmount = minStake;
                    baseStakeAmount = minStake;
                    
                    setAccountInfo("nextTradeStake", `$ ${Number(nextTradeStake).toFixed(2)}`);
                    
                    // Retry preparing proposals with the corrected stake
                    setTimeout(() => {
                        console.log('🔄 Retrying proposals with corrected stake...');
                        prepareDualTradeProposals();
                    }, 2000);
                } else {
                    setFlashNotification("Proposal failed due to stake requirements. Please check minimum stake.", 5000);
                }
            }
        }
    };

    ws.onclose = function(event) {
        console.log('WebSocket is closed now.');
    };

    ws.onerror = function(error) {
        console.error('WebSocket error observed:', error);
    };
}
