const accountSelectElement = document.getElementById("account_select");
const marketSelectElement = document.getElementById("market");
const resetBotButton = document.getElementById("resetBot");

let ws, apiToken;
let isRunning = false;

// ====== CONFIGURATION ====== //
const targetProfitPercentagePerSession = 2;  // % target for the session
const amountPercentagePerTrade = 0.35;        // % of account for base stake
const maxMartingaleSteps = 4;                 // Limit martingale steps
const maxSequenceLossPercent = 5;             // Stop if loss > 5% of account in one streak
// const probabilityCheckLength = 50;            // Ticks to check for digit frequency
const probabilityCheckLength = 10;            // Ticks to check for digit frequency

// For "Over 2" trades
const targetDigits = [3, 4, 5, 6, 7, 8, 9];

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

    ws.onclose = () => console.log("Connection closed");
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

// ====== MARTINGALE ====== //
function stakeChangeOU(status) {
    if (status === "Loss") {
        sequenceLossAmount += stake;
        if ((sequenceLossAmount / updatedAccountBalance) * 100 >= maxSequenceLossPercent) {
            console.log("⚠️ Max sequence loss reached. Stopping bot.");
            isRunning = false;
            return;
        }
        if (martingaleStep >= maxMartingaleSteps) {
            stake = initialAmountPerTrade;
            martingaleStep = 0;
        } else {
            stake *= martingaleMultiplier3;
            martingaleStep++;
        }
    } else {
        sequenceLossAmount = 0;
        martingaleStep = 0;
        if(currentProfitAmount < 0){
            stake = Math.abs(Number(currentProfitAmount)) * 1.6;
        } else {
            stake = initialAmountPerTrade;
        }

        console.log('new stake : ', stake);
    }
}

// ====== PROBABILITY FILTER: OVER 2 ====== //
function shouldTradeOver2() {
    console.log('recentDigits.length - ', recentDigits.length);
    console.log('probabilityCheckLength - ', probabilityCheckLength);
    if (recentDigits.length < probabilityCheckLength) return false;
    const freq = recentDigits.filter(d => targetDigits.includes(d)).length;
    const probability = (freq / probabilityCheckLength) * 100;
    console.log(`📊 Over 2 frequency: ${probability.toFixed(2)}%`);
    console.log(`maxDigitProbability: ${maxDigitProbability}%`);
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

    console.log('currentProfitAmount - ', currentProfitAmount);
    console.log('targetProfitPerSession - ', targetProfitPerSession);

    if (currentProfitAmount >= targetProfitPerSession) {
        console.log("✅ Session target reached.");

        let timeInterval = (getRandomNumber(10, 60) * 1000);
        setTimer(timeInterval);
        setTimeout(() => {
            systemRestart();
        }, timeInterval);
        // return;
    }

    if (!shouldTradeOver2()) {
        setTimeout(runScriptForTrade, 2000);
        return;
    }

    console.log("🎯 Placing Over 2 trade...");
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
    } else {
        maxDigitProbability = 80;
        lossTradeCount++;
        stakeChangeOU("Loss");
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


    setFlashNotification('',1);


    if (profit < 0) {
        timeInterval = (getRandomNumber(50, 80) * 1000 );
        setTimer(timeInterval);
        setTimeout(runScriptForTrade, timeInterval);
    } else {
        runScriptForTrade();
    }
}

function updateTickBufferStatus() {
    setFlashNotification(`Collecting ticks: ${recentDigits.length} / ${probabilityCheckLength}`, 0);
    if (recentDigits.length >= probabilityCheckLength) {
        setFlashNotification(" ✅ Ready to trade!", 0);
    }
}

function systemRestart() {
    location.reload();
}