const accountSelectElement = document.getElementById("account_select");
const marketSelectElement = document.getElementById("market");
const resetBotButton = document.getElementById("resetBot");


let pingIntervalId;

let ws, apiToken, intervalId;
// const { EMA, RSI, MACD } = technicalindicators;


let isRunning = false,
    tickSubscriptionId = null
    targetProfitPercentagePerSession = 0.1,
    amountPercentagePerTrade = 0.1,
    initialAmountPerTrade,
    tradeInProgress = false,
    lastStakeAmount = null,
    lossCountInRow = 0,
    maxDecimalLength = 0; 
let logMessage;


accounts.forEach((item) => {
    const option = document.createElement("option");
    option.value = item.value; // corrected
    option.textContent = item.name;
    accountSelectElement.appendChild(option);
});


marketArray.forEach((item) => {
    const option = document.createElement("option");
    option.value = item.value;
    option.textContent = item.name;
    marketSelectElement.appendChild(option);
});


market = getRandomMarket(marketArray, '');
// market = "R_50";
marketSelectElement.value = market;
resetBotButton.addEventListener('click', resetBot);


// Set the default selected account
accountSelectElement.value = "YbaIy3dD51g2eoO"; 
apiToken = accountSelectElement.value;


// Example: EMA
const emaValues = technicalindicators.EMA.calculate({
    period: 14,
    values: [1,2,3,4,5,6,7,8,9,10]
});
console.log('EMA:', emaValues);

// Example: RSI
const rsiValues = technicalindicators.RSI.calculate({
    period: 14,
    values: [1,2,3,4,5,6,7,8,9,10,11,12,13,14]
});
console.log('RSI:', rsiValues);


// --------------------------------------------------------------------------

startWebSocket();

function startWebSocket() {
    ws = new WebSocket("wss://ws.binaryws.com/websockets/v3?app_id=1089");

    ws.onopen = function () {
        console.log("Connection open");
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
        }, 1000);
    };

    ws.onerror = function (err) {
        console.error("WebSocket error:", err);
    };

    ws.onmessage = function (event) {
        const wsResponse = JSON.parse(event.data);
        if (!wsResponse) return;
        // console.log('wsResponse : ', wsResponse);

        if(!wsResponse.error){
            // Store subscription ID when we first get it
            if (wsResponse.msg_type === "tick" && wsResponse.subscription && !tickSubscriptionId) {
                tickSubscriptionId = wsResponse.subscription.id;
                console.log("✅ Tick subscription started:", tickSubscriptionId);
            }

            switch (wsResponse.msg_type) {
                case "authorize":
                    const logMessage = "Authorization successful.";
                    // console.log(logMessage);
                    setFlashNotification(logMessage, 0);
                    if (wsResponse?.authorize?.balance !== undefined) {
                        const balanceMessage = `Your balance is: ${wsResponse.authorize.balance}`;
                        setFlashNotification(balanceMessage, 0);
                        setAccData(wsResponse.authorize);
                        isRunning = true;
                        checkForTrades();
                    }
                    break;
            
                case "tick":
                    break;

                case "proposal":
                    break;

                case "buy":
                    break;

                case "proposal_open_contract":
                    break;
                default:
                    break;
            }
        }
    };
}

// ====== CHECK FOR TRADES ====== //
function checkForTrades(){
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
        let timeInterval = (getRandomNumber(10, 20) * 1000);
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


    // Check conditions for Rise and Fall trade

    getHistoricalTicks(market, 100, (lastDigits) => {
        console.log("Last Digits: ", lastDigits);
        const direction = getTradeDirection(lastDigits);

        if (direction && canPlaceRiseFallTrade(quote)) {
            placeRiseFallTrade(ws, market, direction);
        }
    });
};


// ====== PLACE RISE FALL TRADE ====== //
function placeRiseFallTrade(ws, market, direction) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    const tradeParams = {
        // Define your trade parameters here
        symbol: market,
        direction: direction,
        amount: stake,
        // Add any other necessary parameters
    };

    console.log('Placing Rise/Fall trade with params:', tradeParams);


    const ema = getEMA(prices, 14);
    const rsi = getRSI(prices, 14);
    const macd = getMACD(prices);

    console.log('EMA:', ema);
    console.log('RSI:', rsi);
    console.log('MACD:', macd);

    // ws.send(JSON.stringify({ buy: tradeParams }));
}


// ====== CAN PLACE RISE FALL TRADE ====== //
function canPlaceRiseFallTrade(quote) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    if (!isRunning || tradeInProgress) return false;
    if (updatedAccountBalance < stake) return false;
    if (previousTick === null) return false;
    if (tickSubscriptionSymbol !== market) return false;

    // Optional: pattern / probability check
    // if (!checkPattern()) return false;

    return true;
}

// ====== Start Ping ====== //
function startPing(ws) {
    // Send a ping every 30 seconds
    pingIntervalId = setInterval(() => {
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ ping: 1 }));
        }
    }, 10000);
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

// ====== CHANGE STAKE ====== //
function changeStake(contract) {

}

// ====== UPDATE DETAILS ====== //
function updateDetails(contract) {}


// ====== SYSTEM RESTART ====== //
function systemRestart() {
    location.reload();
}


// ====== GET HISTORICAL TICKS ====== //
function getHistoricalTicks(symbol, count = 50, callback) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            ticks_history: symbol,
            adjust_start_time: 1,
            count: count,
            end: "latest",
            style: "ticks"
        }));

        // Handle response
        ws.addEventListener("message", function onMessage(event) {
            const data = JSON.parse(event.data);
            if (data.msg_type === "history" && data.history) {
                ws.removeEventListener("message", onMessage); // prevent multiple triggers

                const prices = data.history.prices;

                // 🔹 Step 1: find max decimal length
                let maxDecimals = 0;
                prices.forEach(price => {
                    const parts = price.toString().split(".");
                    if (parts[1]) {
                        maxDecimals = Math.max(maxDecimals, parts[1].length);
                        maxDecimalLength = maxDecimals;
                        // console.log(`Max decimal length updated: ${maxDecimals}`);

                    }
                });

                // 🔹 Step 2: normalize and extract last digit
                const lastDigits = prices.map(price => {
                    let [intPart, decPart = ""] = price.toString().split(".");
                    decPart = decPart.padEnd(maxDecimals, "0"); // pad with zeros
                    const normalized = intPart + decPart;
                    return parseInt(normalized.slice(-1), 10);
                });

                callback(lastDigits);
            }
        });
    } else {
        console.log("⚠️ WebSocket is not open. Cannot fetch history.");
    }
}



// ====== GET LAST DIGIT FROM PRICE ====== //
function getLastDigitFromPrice(maxDecimalLength, lastPrice) {

  // Step 2: Convert lastPrice to string and ensure it has enough decimals
  let [integerPart, decimalPart] = String(lastPrice).split('.');
  decimalPart = decimalPart || '';
  if (decimalPart.length < maxDecimalLength) {
    decimalPart = decimalPart.padEnd(maxDecimalLength, '0');
  }

  // Step 3: Combine integer + decimal if needed (not really needed, just for clarity)
  const normalizedPrice = integerPart + (decimalPart ? '.' + decimalPart : '');

  // Step 4: Last digit is the last number in the decimal part (or 0 if no decimal)
  const lastDigit = decimalPart.length > 0 ? Number(decimalPart.slice(-1)) : 0;

  return {
    maxDecimalLength,
    lastPriceLength: decimalPart.length,
    normalizedPrice,
    lastDigit
  };
}



function getEMA(values, period = 14) {
    return technicalindicators.EMA.calculate({ values, period });
}

function getRSI(values, period = 14) {
    return technicalindicators.RSI.calculate({ values, period });
}

function getMACD(values, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
    return technicalindicators.MACD.calculate({
        values,
        fastPeriod,
        slowPeriod,
        signalPeriod,
        SimpleMAOscillator: false,
        SimpleMASignal: false
    });
}
