const accountSelectElement = document.getElementById("account_select");
const resetBotButton = document.getElementById("resetBot");


// ====== CONFIGURATION ====== //
const targetProfitPercentagePerSession = 1;  // % target for the session
const amountPercentagePerTrade = 0.35;        // % of account for base stake
// const probabilityCheckLength = 50;            // Ticks to check for digit frequency
const probabilityCheckLength = 5;            // Ticks to check for digit frequency

let isRunning = false,
    tickSubscriptionId = null,
    recentDigits = [],
    tradeInProgress = false,
    lastStakeAmount = null,
    consecutiveLosses = 0,
    consecutiveLossAmount = 0;


accounts.forEach((item) => {
    const option = document.createElement("option");
    option.value = item.value;
    option.textContent = item.name;
    accountSelectElement.appendChild(option);
});

accountSelectElement.value = "lkUxtOopvUhCpIX";
resetBotButton.addEventListener('click', resetBot);

apiToken = accountSelectElement.value;


// ----------------------------------------------------------------------

startWebSocket();

function startWebSocket(){
    ws = new WebSocket("wss://ws.binaryws.com/websockets/v3?app_id=1089");

    ws.onopen = function () {
        console.log("Connection open");
        console.log(apiToken);
        getAuthentication(ws, apiToken);
        startPing(ws); // Start pinging to keep connection alive
    };

    ws.onclose = function () {
        console.log("Connection closed");
        console.log("-----------------------------\n");
        stopPing(); // Stop pinging when connection closes
        // tradesOn = false;

        setTimeout(() => {
            startWebSocket();
        }, 50000);
    };

    ws.onerror = function (err) {
        console.error("WebSocket error:", err);
    };


    ws.onmessage = function (event) {
        const wsResponse = JSON.parse(event.data);
        if (!wsResponse) return;
        console.log('wsResponse : ', wsResponse);

        if(!wsResponse.error){
            // Store subscription ID when we first get it
            if (wsResponse.msg_type === "tick" && wsResponse.subscription && !tickSubscriptionId) {
                tickSubscriptionId = wsResponse.subscription.id;
                console.log("✅ Tick subscription started:", tickSubscriptionId);
            }

            switch (wsResponse.msg_type) {
                case "authorize":
                    // Handle authorize message
                    const logMessage = "Authorization successful.";
                    console.log(logMessage);
                    setFlashNotification(logMessage, 0);
                    if (wsResponse?.authorize?.balance !== undefined) {
                        const balanceMessage = `Your balance is: ${wsResponse.authorize.balance}`;
                        console.log(balanceMessage);
                        setFlashNotification(balanceMessage, 0);
                        setAccData(wsResponse.authorize);
                        market = getRandomMarket(marketArray, '');
                        subscribeTicks(market);
                    }
                    break;
                case "tick":
                    // Handle tick message
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
                        setResultNotification(lastTradeId, tradeType, market, wsResponse.buy.buy_price);
                        setTimeout(() => fetchTradeDetails(ws, lastTradeId, 1), 500);
                    }
                    break;
                case "proposal_open_contract":
                    if (wsResponse.proposal_open_contract.contract_id === lastTradeId) {
                        const contract = wsResponse.proposal_open_contract;
                        if (contract.is_sold) {
                            updateDetails(contract, contract.profit);
                        } else {
                            // Keep retrying until contract is sold
                            setTimeout(() => fetchTradeDetails(ws, lastTradeId, 1), 1000);
                        }
                    }
                    break;
                case "error":
                    // Handle error message
                    break;
                default:
                    if (wsResponse.msg_type == "ping") {
                        console.log("Waiting....");
                    }
            }

        }
    };

};

// ====== Start Ping ====== //
function startPing(ws) {
    // Send a ping every 30 seconds
    pingIntervalId = setInterval(() => {
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ ping: 1 }));
        }
    }, 30000);
}

// ====== Stop Ping ====== //
function stopPing() {
    if (pingIntervalId) {
        clearInterval(pingIntervalId);
        pingIntervalId = null;
    }
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

// ====== SUBSCRIBE TICKS ====== //
function subscribeTicks(symbol) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ ticks: symbol }));
    } else {
        console.log("⚠️ WebSocket is not open. Cannot subscribe to ticks.");
    }
}

// ====== UNSUBSCRIBE TICKS ====== //
function unsubscribeTicks() {
    if (tickSubscriptionId) {
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ forget: tickSubscriptionId }));
            console.log("🛑 Tick subscription cancelled:", tickSubscriptionId);
        } else {
            console.log("⚠️ WebSocket is not open. Cannot unsubscribe.");
        }
        tickSubscriptionId = null;
    } else {
        console.log("⚠️ No active tick subscription to cancel.");
    }
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

// ====== UPDATE TICK BUFFER STATUS ====== //
function updateTickBufferStatus() {
    setFlashNotification(`Collecting ticks: ${recentDigits.length} / ${probabilityCheckLength}`, 11);
    if (recentDigits.length >= probabilityCheckLength) {
        setFlashNotification(" ✅ Ready to trade!", 10);
    }
}

// ====== TRADE LOOP ====== //
function runScriptForTrade() {
    if (!isRunning) return;

    // Prevent placing new trade if another trade is in progress
    if (tradeInProgress) {
        console.log("⏳ Waiting for current trade to finish...");
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
        stopPing();
        setTimer(timeInterval);
        setTimeout(systemRestart, timeInterval);
        return;
    }


    if (!ws || ws.readyState !== WebSocket.OPEN) {
        console.log("⚠️ WebSocket is not open. Waiting to reconnect...");
        setTimeout(runScriptForTrade, 2000);
        return;
    }


    const decision = decideBestTrade();
    console.log('Decision : ', decision);


    if (decision === "EVEN") {
        console.log("🎯 Placing EVEN trade...");
        placeEvenOddTrade(market, "EVEN");
    } else if (decision === "ODD") {
        console.log("🎯 Placing ODD trade...");
        placeEvenOddTrade(market, "ODD");
    } else {
        console.log(11111);
        
        setTimeout(runScriptForTrade, 2000); // wait for more data
    }
}


function decideBestTrade() {
    if (recentDigits.length < probabilityCheckLength) {
        console.log("⚠️ Not enough ticks to decide.");
        return null;
    }

    // Count even/odd frequencies
    const counts = { even: 0, odd: 0 };
    for (let d of recentDigits) {
        if (d % 2 === 0) counts.even++;
        else counts.odd++;
    }

    const evenProb = counts.even / recentDigits.length;
    const oddProb = counts.odd / recentDigits.length;

    console.log(`Digits analyzed: ${recentDigits.join(", ")}`);
    console.log(`Even: ${counts.even} (${(evenProb*100).toFixed(1)}%) | Odd: ${counts.odd} (${(oddProb*100).toFixed(1)}%)`);

    // Decision rule
    if (evenProb > oddProb) {
        return "EVEN";
    } else if (oddProb > evenProb) {
        return "ODD";
    } else {
        console.log("⚖️ Equal probability — skipping trade.");
        return null; // no clear edge
    }
}

// ====== PLACE EVEN/ODD TRADE ====== //
function placeEvenOddTrade(symbol, decision) {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        console.log("⚠️ WebSocket is not open. Cannot place trade.");
        return;
    }

    if (tradeInProgress) {
        console.log("⚠️ Trade already in progress. Skipping new trade.");
        return;
    }

    // Decide contract type based on decision
    let contractType = null;
    if (decision === "EVEN") {
        contractType = "DIGITEVEN";
    } else if (decision === "ODD") {
        contractType = "DIGITODD";
    } else {
        console.log("⚠️ Invalid decision:", decision);
        return;
    }

    stake = Number(stake);
    stake < 0.35 ? (stake = 0.35) : (stake = stake);

    let tickCount = 1;

    if(currentLossAmount < 0 && lossTradeCount >= 2){
        tickCount = getRandomNumber(5, 8);
    }


    const proposal = {
        proposal: 1,
        amount: stake.toFixed(2),               // your stake
        basis: "stake",              // basis type
        contract_type: contractType, // DIGITEVEN or DIGITODD
        currency: "USD",             // change if needed
        duration: 1,                 // 1 tick contract
        duration_unit: "t",
        symbol: symbol               // the market symbol (e.g., "R_100")
    };

    console.log(`📤 Sending proposal: ${decision} with stake $${stake.toFixed(2)} on ${symbol}`);

    ws.send(JSON.stringify(proposal));

    tradeInProgress = true; // Lock until result comes
}

// ====== AFTER CONTRACT CLOSE ====== //
function updateDetails(contract, profit) {
    // 1. Update all trade result information and UI first
    if (profit > 0) {
        winTradeCount++;
        stakeChangeOU("Win");
        tradeLoss = false;
        consecutiveLosses = 0;
        consecutiveLossAmount = 0;
        cooldownTimer = (getRandomNumber(1, 10) * 1000);
    } else {
        maxDigitProbability = 80;
        lossTradeCount++;
        stakeChangeOU("Loss");
        tradeLoss = true;
        consecutiveLosses++;
        consecutiveLossAmount += profit;
        cooldownTimer = (getRandomNumber(50, 70) * 1000);
    }

    currentProfitAmount += profit;
    updatedAccountBalance = initialAccountBalance + currentProfitAmount;
    updateNewAccBalance();

    setResultNotification(lastTradeId, tradeType, market, contract.buy_price, profit);
    console.log(`[RESULT] Contract ID: ${lastTradeId}, Type: ${tradeType}, Market: ${market}, Stake: ${contract.buy_price}, Profit: ${profit}`);
    setTimer(1000);
    setTimeout(() => {
        const el = document.getElementById(lastTradeId);
        if (!el) {
            console.warn(`[RESULT-FALLBACK] Notification element missing for contract ${lastTradeId}, forcing creation.`);
            setResultNotification(lastTradeId, tradeType, market, contract.buy_price, profit);
        }
    }, 1000);

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

    localStorage.setItem('currentLossAmount', currentLossAmount);
    let currentLossAmountDisplay = null;
    if (currentLossAmount < 0) {
        currentLossAmountDisplay = `<span class="red">$ ${currentLossAmount.toFixed(2)}</span>`;
    } else if (currentLossAmount > 0) {
        currentLossAmountDisplay = `<span class="green">$ ${currentLossAmount.toFixed(2)}</span>`;
    } else {
        currentLossAmountDisplay = `$ ${currentLossAmount.toFixed(2)}`;
    }
    setAccountInfo("currentLossAmount", `${currentLossAmountDisplay}`);

    // 2. Now handle cooldowns, recovery, and delays
    if (profit <= 0) {
        unsubscribeTicks();
        // If two consecutive losses, trigger cooldown and record total loss
        if (consecutiveLosses >= 2) {
            // let cooldownMs = getRandomNumber(120, 180) * 1000; // 2-3 minutes
            let cooldownMs = getRandomNumber(10, 15) * 1000; // 2-3 minutes
            cooldownTimer = cooldownMs;
            localStorage.setItem('consecutiveLossAmount', consecutiveLossAmount);
            console.log(`[COOLDOWN] Two losses in a row. Cooldown for ${cooldownMs/1000} seconds. Total to recover: $${consecutiveLossAmount}`);
            setTimer(cooldownMs);
            setTimeout(() => {
                currentLossAmount = consecutiveLossAmount;
                consecutiveLosses = 0;
                consecutiveLossAmount = 0;
                localStorage.setItem('currentLossAmount', currentLossAmount);
                runScriptForTrade();
            }, cooldownMs);
            tradeInProgress = false;
            return;
        }
        if (!isRunning && cooldownTimer) {
            console.log("⛔ Trade skipped — cooldown active.");
            tradeInProgress = false;
            return;
        }
    }

    // If in recovery mode, use recovery stake
    if (currentLossAmount < 0) {
        stake = Math.abs(currentLossAmount); // Try to recover full loss in one trade
        console.log(`[RECOVERY] Using recovery stake: $${stake}`);
    } else {
        stake = initialAmountPerTrade;
    }
    if (currentLossAmount >= 0) {
        localStorage.setItem('currentLossAmount', 0);
    }

    setFlashNotification('', 1);

    if (!isRunning && cooldownTimer) {
        console.log("⏸ Waiting for cooldown before next trade...");
        tradeInProgress = false;
        return;
    }

    setTimer(cooldownTimer);
    setTimeout(() => {
        tradeInProgress = false; // Allow next trade
        runScriptForTrade();
        subscribeTicks(market);
    }, cooldownTimer);

}


// ====== UPDATED MARTINGALE / LOSS CONTROL ====== //
function stakeChangeOU(status) {

    if (status === "Loss") {
        consecutiveLosses++;
        console.log(`❌ Loss recorded. Consecutive Losses: ${consecutiveLosses}`);

        // Normal loss handling (if under loss streak limit)
        currentLossAmount += stake;
        stake *= martingaleMultiplier1;
        console.log(`📉 New Stake: $${stake.toFixed(2)}`);

    } else if (status === "Win") {
        console.log("✅ Win recorded. Resetting loss streak.");
        consecutiveLosses = 0;
        currentLossAmount = 0;

        if (currentProfitAmount < 0) {
            console.log("🔄 In overall loss → using safe recovery stake.");
            stake = calculateSafeRecoveryStake();
        } else {
            stake = initialAmountPerTrade;
            console.log(`🔹 Back to base stake: $${stake.toFixed(2)}`);
        }
    }
}


// ====== SAFE RECOVERY CALCULATION ====== //
function calculateSafeRecoveryStake() {
    const targetRecovery = Math.abs(currentProfitAmount) * 0.5; // recover 50% per trade
    const safeStake = Math.min(targetRecovery * 1.2, initialAmountPerTrade * 3); // max 3x base stake
    console.log(`📊 Recovery Plan → Total Loss: $${Math.abs(currentProfitAmount).toFixed(2)}, Target Recovery: $${targetRecovery.toFixed(2)}, Stake: $${safeStake.toFixed(2)}`);
    return Number(safeStake.toFixed(2));
}

// ====== SYSTEM RESTART ====== //
function systemRestart() {
    location.reload();
}