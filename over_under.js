const accountSelectElement = document.getElementById("account_select");
const marketSelectElement = document.getElementById("market");
const resetBotButton = document.getElementById("resetBot");

let ws, apiToken;
let isRunning = false;

// ====== CONFIGURATION ====== //
const targetProfitPercentagePerSession = 1;  // % target for the session
const amountPercentagePerTrade = 0.35;        // % of account for base stake
const maxMartingaleSteps = 4;                 // Limit martingale steps
const maxSequenceLossPercent = 5;             // Stop if loss > 5% of account in one streak
// const probabilityCheckLength = 50;            // Ticks to check for digit frequency
const probabilityCheckLength = 10;            // Ticks to check for digit frequency

// For "Over 2" trades
const targetDigits = [3, 4, 5, 6, 7, 8, 9];

// ====== NEW LOSS CONTROL VARIABLES ====== //
let consecutiveLosses = 0;
const maxConsecutiveLosses = 3;   // Stop after 3 losses in a row
const cooldownMinutes = 5;        // Cooldown after max loss streak
let cooldownTimer = null;

let cooldownCountToday = 0;       // Track how many cooldowns today
const maxCooldownsPerDay = 2;     // Stop bot for the day after this many cooldowns
let dailyStopTriggered = false;   // Flag to block trades for the rest of the day

let tradeInProgress = false;     // Prevents multiple simultaneous trades
let lastStakeAmount = null;      // Stores last used stake for comparison


// ====== RUNTIME VARIABLES ====== //
let minDelayAfterLoss = 60 * 1000;          // 1 min cooldown after loss streak
let maxDigitProbability = 70;                // Max % occurrence to allow a trade
let targetProfitPerSession = 0;
let initialAmountPerTrade = 0;
let martingaleStep = 0;
let sequenceLossAmount = 0;
let recentDigits = [];
let sessionProfit = 0;
let market = "R_50";
let tradeLoss = false;

// ====== POPULATE UI ====== //
accounts.forEach((item) => {
    const option = document.createElement("option");
    option.value = item.value;
    option.textContent = item.name;
    accountSelectElement.appendChild(option);
});

marketArray.forEach((item) => {
    const option = document.createElement("option");
    option.value = item.value;
    option.textContent = item.name;
    marketSelectElement.appendChild(option);
});

accountSelectElement.value = "YbaIy3dD51g2eoO";
marketSelectElement.value = market;
apiToken = accountSelectElement.value;

resetBotButton.addEventListener('click', resetBot);

// ====== START WEBSOCKET ====== //
startWebSocket();

function startWebSocket() {
    ws = new WebSocket("wss://ws.binaryws.com/websockets/v3?app_id=1089");

    ws.onopen = () => {
        console.log("Connection open");
        getAuthentication(ws, apiToken);
    };

    ws.onclose = () => {
        console.log("Connection closed");
        subscribeTicks(market);
    }
    ws.onerror = (err) => console.error("WebSocket error:", err);

    ws.onmessage = (event) => {
        const wsResponse = JSON.parse(event.data);
        if (!wsResponse) return;

        switch (wsResponse.msg_type) {
            case "authorize":
                console.log("Authorization successful.");
                setFlashNotification("Authorization successful", 0);
                if (wsResponse?.authorize?.balance !== undefined) {
                    setAccData(wsResponse.authorize);
                    subscribeTicks(market);
                    // Don't start trading immediately, wait until tick buffer is ready
                }
                break;

            case "tick":
                recordLastDigit(wsResponse.tick.quote);

                // Start trading automatically when tick buffer is ready
                if (!isRunning && recentDigits.length >= probabilityCheckLength) {
                    isRunning = true;
                    console.log("✅ Tick buffer ready. Starting trade loop...");
                    runScriptForTrade();
                }
                break;

            case "proposal":
                tradeProposal = wsResponse;
                makeTheTrade(ws);
                break;

            case "buy":
                if (wsResponse.buy?.contract_id) {
                    lastTradeId = wsResponse.buy.contract_id;
                    updatedAccountBalance -= stake;
                    updateNewAccBalance();
                    setResultNotification(lastTradeId, 'Digit Over', market, wsResponse.buy.buy_price);
                    setTimeout(() => fetchTradeDetails(ws, lastTradeId), 500);
                }
                break;

            case "proposal_open_contract":
                if (wsResponse.proposal_open_contract.contract_id === lastTradeId) {
                    const contract = wsResponse.proposal_open_contract;
                    if (contract.is_sold) {
                        updateDetails(contract, contract.profit);
                    } else {
                        setTimeout(() => fetchTradeDetails(ws, lastTradeId), 1000);
                    }
                }
                break;

            case "tick":
                recordLastDigit(wsResponse.tick.quote);
                break;
        }
    }
}

// ====== SUBSCRIBE TICKS ====== //
function subscribeTicks(symbol) {
    ws.send(JSON.stringify({ ticks: symbol }));
}

// ====== SAFE RECOVERY CALCULATION ====== //
function calculateSafeRecoveryStake() {
    const targetRecovery = Math.abs(currentProfitAmount) * 0.5; // recover 50% per trade
    const safeStake = Math.min(targetRecovery * 1.2, initialAmountPerTrade * 3); // max 3x base stake
    console.log(`📊 Recovery Plan → Total Loss: $${Math.abs(currentProfitAmount).toFixed(2)}, Target Recovery: $${targetRecovery.toFixed(2)}, Stake: $${safeStake.toFixed(2)}`);
    return Number(safeStake.toFixed(2));
}


// ====== UPDATED MARTINGALE / LOSS CONTROL ====== //
function stakeChangeOU(status) {
    if (dailyStopTriggered) {
        console.log("⛔ Daily stop is active. No trades will be placed until tomorrow.");
        isRunning = false;
        return;
    }

    if (status === "Loss") {
        consecutiveLosses++;
        console.log(`❌ Loss recorded. Consecutive Losses: ${consecutiveLosses}`);

        // Check loss streak limit
        if (consecutiveLosses >= maxConsecutiveLosses) {
            cooldownCountToday++;
            console.log(`🚨 ${maxConsecutiveLosses} consecutive losses — entering cooldown for ${cooldownMinutes} min (Cooldown count today: ${cooldownCountToday})`);

            if (cooldownCountToday >= maxCooldownsPerDay) {
                dailyStopTriggered = true;
                console.log("🛑 Maximum cooldowns reached today — stopping bot for the rest of the day.");
                isRunning = false;
                return;
            }

            isRunning = false;
            cooldownTimer = setTimeout(() => {
                console.log("✅ Cooldown finished. Resuming bot with safe recovery stake...");
                consecutiveLosses = 0;
                stake = calculateSafeRecoveryStake();
                isRunning = true;
                runScriptForTrade();
            }, cooldownMinutes * 60 * 1000);

            return;
        }

        // Normal loss handling (if under loss streak limit)
        sequenceLossAmount += stake;
        if ((sequenceLossAmount / updatedAccountBalance) * 100 >= maxSequenceLossPercent) {
            console.log("⚠️ Max sequence loss reached. Stopping bot.");
            isRunning = false;
            return;
        }

        stake *= martingaleMultiplier3;
        martingaleStep++;
        console.log(`📉 Martingale Step ${martingaleStep} → New Stake: $${stake.toFixed(2)}`);

    } else if (status === "Win") {
        console.log("✅ Win recorded. Resetting loss streak.");
        consecutiveLosses = 0;
        sequenceLossAmount = 0;
        martingaleStep = 0;

        if (currentProfitAmount < 0) {
            console.log("🔄 In overall loss → using safe recovery stake.");
            stake = calculateSafeRecoveryStake();
        } else {
            stake = initialAmountPerTrade;
            console.log(`🔹 Back to base stake: $${stake.toFixed(2)}`);
        }
    }
}


// ====== PROBABILITY FILTER: OVER 2 ====== //
function shouldTradeOver2() {
    console.log('recentDigits : ', recentDigits);

    if (recentDigits.length < probabilityCheckLength) return false;
    const freq = recentDigits.filter(d => targetDigits.includes(d)).length;
    const probability = (freq / probabilityCheckLength) * 100;
    console.log(`📊 Over 2 frequency: ${probability.toFixed(2)}%`);
    return probability >= maxDigitProbability;
}

// ====== RECORD DIGITS ====== //
function recordLastDigit(quote) {
    const digit = parseInt(quote.toString().slice(-1));
    recentDigits.push(digit);
    if (recentDigits.length > probabilityCheckLength) {
        recentDigits.shift();
    }
    updateTickBufferStatus();  // update the countdown display
}

// ====== TRADE LOOP ====== //
function runScriptForTrade() {
    if (!isRunning) return;

    // Prevent placing new trade if another trade is in progress
    if (tradeInProgress) {
        console.log("⏳ Waiting for current trade to finish...");
        setTimeout(runScriptForTrade, 2000);
        return;
    }

    // Prevent repeating stake amount unless it's the initial amount
    if (lastStakeAmount !== null && stake === lastStakeAmount && stake !== initialAmountPerTrade) {
        console.log(`⚠️ Skipping trade — stake $${stake.toFixed(2)} was used last time.`);
        setTimeout(runScriptForTrade, 2000);
        return;
    }

    if (currentProfitAmount >= targetProfitPerSession) {
        console.log("✅ Session target reached.");
        let timeInterval = (getRandomNumber(10, 60) * 1000);
        setTimer(timeInterval);
        setTimeout(systemRestart, timeInterval);
        return;
    } else if (!shouldTradeOver2()) {
        setTimeout(runScriptForTrade, 2000);
        return;
    }

    console.log("🎯 Placing Over 2 trade...");
    tradeInProgress = true; // Mark trade as active
    lastStakeAmount = stake; // Save stake before placing trade
    placeOUTrade(market);
}

// ====== ACCOUNT SETUP ====== //
function setAccData(accData) {
    initialAccountBalance = Number(accData.balance);
    updatedAccountBalance = initialAccountBalance;

    targetProfitPerSession = Number((initialAccountBalance * (targetProfitPercentagePerSession / 100)).toFixed(2));
    initialAmountPerTrade = Number((initialAccountBalance * (amountPercentagePerTrade / 100)).toFixed(2));
    stake = initialAmountPerTrade;

    setAccountInfo("initialAccountBalance", `$ ${initialAccountBalance}`);
    setAccountInfo("updatedAccountBalance", `$ ${updatedAccountBalance}`);
    setAccountInfo("targetProfitPerSession", `$ ${targetProfitPerSession}`);
    setAccountInfo("initialAmountPerTrade", `$ ${initialAmountPerTrade}`);

    localStorage.setItem('initialAccountBalance', initialAccountBalance);
    localStorage.setItem('targetProfitPerSession', targetProfitPerSession);
    localStorage.setItem('initialAmountPerTrade', initialAmountPerTrade);
}

// ====== AFTER CONTRACT CLOSE ====== //
function updateDetails(contract, profit) {
    if (profit > 0) {
        winTradeCount++;
        stakeChangeOU("Win");
        tradeLoss = false
    } else {
        maxDigitProbability = 80;
        lossTradeCount++;
        stakeChangeOU("Loss");
        tradeLoss = true;


        // If bot is cooling down, stop here
        if (!isRunning && cooldownTimer) {
            console.log("⛔ Trade skipped — cooldown active.");
            return;
        }
    }

    currentProfitAmount += profit;
    updatedAccountBalance = initialAccountBalance + currentProfitAmount;
    updateNewAccBalance();

    setResultNotification(lastTradeId, 'Digit Over', market, contract.buy_price, profit);

    setAccountInfo("totalTradeCount", `${totalTradeCount}`);
    setAccountInfo("winCount", `${winTradeCount}`);
    setAccountInfo("lossCount", `${lossTradeCount}`);

    let updatedAccountBalanceDisplay = null;
    if (updatedAccountBalance > initialAccountBalance) {
        updatedAccountBalanceDisplay = `<span class="green">$ ${updatedAccountBalance.toFixed(2)}</span>`;
    } else if (updatedAccountBalance < initialAccountBalance) {
        updatedAccountBalanceDisplay = `<span class="red">$ ${updatedAccountBalance.toFixed(2)}</span>`;
    }
    setAccountInfo("updatedAccountBalance", `${updatedAccountBalanceDisplay}`);

    netProfit = updatedAccountBalance - initialAccountBalance;

    let netProfitDisplay = null;
    if (netProfit > 0) {
        netProfitDisplay = `<span class="green">$ ${netProfit.toFixed(2)}</span>`;
    } else if (netProfit < 0) {
        netProfitDisplay = `<span class="red">$ ${netProfit.toFixed(2)}</span>`;
    }
    setAccountInfo("net_profit", `${netProfitDisplay}`);

    let currentProfitAmountDisplay = null;
    if (currentProfitAmount < 0) {
        currentProfitAmountDisplay = `<span class="red">$ ${currentProfitAmount.toFixed(2)}</span>`;
    } else if (currentProfitAmount > 0) {
        currentProfitAmountDisplay = `<span class="green">$ ${currentProfitAmount.toFixed(2)}</span>`;
    } else {
        currentProfitAmountDisplay = `$ ${currentProfitAmount.toFixed(2)}`;
    }
    setAccountInfo("currentProfitAmount", `${currentProfitAmountDisplay}`);

    let currentLossAmountDisplay = null;
    if (currentLossAmount < 0) {
        currentLossAmountDisplay = `<span class="red">$ ${currentLossAmount.toFixed(2)}</span>`;
    } else if (currentLossAmount > 0) {
        currentLossAmountDisplay = `<span class="green">$ ${currentLossAmount.toFixed(2)}</span>`;
    } else {
        currentLossAmountDisplay = `$ ${currentLossAmount.toFixed(2)}`;
    }
    setAccountInfo("currentLossAmount", `${currentLossAmountDisplay}`);

    setFlashNotification('', 1);

    // Don't schedule trades during cooldown
    if (!isRunning && cooldownTimer) {
        console.log("⏸ Waiting for cooldown before next trade...");
        return;
    }

    if (profit < 0) {
        timeInterval = (getRandomNumber(50, 70) * 1000);
        setTimer(timeInterval);
        setTimeout(runScriptForTrade, timeInterval);
    } else {
        runScriptForTrade();
    }
    tradeInProgress = false; // Allow next trade

}

function updateTickBufferStatus() {
    // if (!tradeLoss){
        setFlashNotification(`Collecting ticks: ${recentDigits.length} / ${probabilityCheckLength}`, 11);
        if (recentDigits.length >= probabilityCheckLength) {
            setFlashNotification(" ✅ Ready to trade!", 0);
        }
    // }

}

function systemRestart() {
    location.reload();
}