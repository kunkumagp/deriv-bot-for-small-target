const accountSelectElement = document.getElementById("account_select");
let pingIntervalId;
const marketSelectElement = document.getElementById("market");

const resetBotButton = document.getElementById("resetBot");


let ws, apiToken, intervalId;
let isRunning = false,
    tickSubscriptionId = null;

let targetProfitPercentagePerSession = 0.1,
    amountPercentagePerTrade = 0.1,
    initialAmountPerTrade,
    recentDigits = [],
    tradeInProgress = false,
    lastStakeAmount = null,
    matcherNumber = null,
    lossCountInRow = 0,
    maxDecimalLength = 0,
    targetProfitPerSession;

const probabilityCheckLength = 10;            // Ticks to check for digit frequency


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
// accountSelectElement.value = "lkUxtOopvUhCpIX";
apiToken = accountSelectElement.value;

let sessionProfit = 0;
let logMessage;

market = getRandomMarket(marketArray, '');
// market = "R_50";
marketSelectElement.value = market;

resetBotButton.addEventListener('click', resetBot);


// ---------------------------------------------------------------------


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
                        // console.log(balanceMessage);
                        setFlashNotification(balanceMessage, 0);
                        setAccData(wsResponse.authorize);
                        isRunning = true;

                        runScriptForTrade();

                    }
                    break;

                case "tick":
                    // Handle tick data
                    // console.log(wsResponse.tick.quote);
                    const lastDigit = test(maxDecimalLength, wsResponse.tick.quote);
                    // test(recentDigits, wsResponse.tick.quote);
                    // console.log("Last digit from price:", lastDigit);

                    getHistoricalTicks(market, 100, (lastDigits) => {
                        // Process historical last digits
                        const lastDigitProbabilities = getLastDigitProbabilities(lastDigits);
                        // console.log("Probabilities:", lastDigitProbabilities);
                        const lowestProbabilityNumber = getLowestProbabilityDigits(lastDigitProbabilities);
                        // console.log("Lowest probability digit(s):", lowestProbabilityNumber);

                        if (lowestProbabilityNumber.length === 1) {
                            matcherNumber = lowestProbabilityNumber[0];

                            // if(lastDigit.lastDigit == matcherNumber){
                            //     // console.log("Make the Trade");
                                
                                
                            // }

                            makeTheTrade(ws);
                            unsubscribeTicks();
                        }

                    });

                    // getHistoricalTicks(market, 100, (lastDigits) => {
                    //     // console.log("Historical Last Digits:", lastDigits);
                    //     // recentDigits = lastDigits;
                    //     console.log("Last digits list:", lastDigits);
                    //     const lastDigitData = test(lastDigits, lastDigits[lastDigits.length - 1]);
                    //     console.log("Last digit data:", lastDigitData);

                    //     const lastDigitProbabilities = getLastDigitProbabilities(lastDigits);
                    //     console.log("Probabilities:", lastDigitProbabilities);
                    //     const lowestProbabilityNumber = getLowestProbabilityDigits(lastDigitProbabilities);
                    //     console.log("Lowest probability digit(s):", lowestProbabilityNumber);
                    //     // console.log('lowestProbabilityNumber.length',lowestProbabilityNumber.length);
                        
                    //     if (lowestProbabilityNumber.length === 1) {
                    //         matcherNumber = lowestProbabilityNumber[0];
                    //         // console.log("🎯 Placing a Differ trade...");
                    //         // placeDifferTrade(market, matcherNumber);

                    //         console.log("matcherNumber:", matcherNumber);
                            

                    //         if(lastDigitData.lastDigit == matcherNumber){
                    //             console.log("Make the Trade");
                                
                    //             makeTheTrade(ws);
                    //             unsubscribeTicks();
                    //         }
                    //     }
                    // });


                    
                    break;

                case "proposal":
                    tradeProposal = wsResponse;
                        // subscribeTicks(market);

                    if(lossCountInRow > 0) {
                        subscribeTicks(market);
                    } else {
                        makeTheTrade(ws);
                    }
                    break;
                
                case "buy":
                    if (wsResponse.buy?.contract_id) {
                        lastTradeId = wsResponse.buy.contract_id;
                        updatedAccountBalance -= stake;
                        updateNewAccBalance();
                        tradeType = "Digit Differ"
                        setResultNotification(lastTradeId, tradeType, market, wsResponse.buy.buy_price);
                        setTimeout(() => fetchTradeDetails(ws, lastTradeId, 1), 500);
                    }
                    break;
                
                case "proposal_open_contract":
                    if (wsResponse.proposal_open_contract.contract_id === lastTradeId) {
                        const contract = wsResponse.proposal_open_contract;
                        if (contract.is_sold) {
                            updateDetails(contract);
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
                // Add more cases as needed
            }
        }

    };

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


// ====== GET LAST DIGIT PROBABILITIES ====== //
function getLastDigitProbabilities(ticks) {
  // Initialize counter for digits 0-9
  const counts = Array(10).fill(0);

  // Count occurrences of last digits
  ticks.forEach(price => {
    const lastDigit = parseInt(price.toString().slice(-1));
    counts[lastDigit]++;
  });

  // Convert to probabilities (percentage)
  const total = ticks.length;
  const probabilities = {};
  counts.forEach((count, digit) => {
    probabilities[digit] = total > 0 ? (count / total) * 100 : 0;
  });

  return probabilities;
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

    // if (recentDigits.length < probabilityCheckLength) {
    //     console.log("⚠️ Not enough ticks to decide.");
    //     return null;
    // }

    
    // Example usage:
    getHistoricalTicks(market, 100, (lastDigits) => {
        // console.log("Historical Last Digits:", lastDigits);
        recentDigits = lastDigits;


        const lastDigitProbabilities = getLastDigitProbabilities(lastDigits);
        // console.log("Probabilities:", lastDigitProbabilities);
        const lowestProbabilityNumber = getLowestProbabilityDigits(lastDigitProbabilities);
        // console.log("Lowest probability digit(s):", lowestProbabilityNumber);
        // console.log('lowestProbabilityNumber.length',lowestProbabilityNumber.length);
        
        if (lowestProbabilityNumber.length === 1) {
            matcherNumber = lowestProbabilityNumber[0];
            console.log("🎯 Placing a Differ trade...");
            placeDifferTrade(market, matcherNumber);

        } else {
            timeInterval = 2000;
            setTimer(timeInterval);
            setTimeout(runScriptForTrade, timeInterval);
        }
    });


}


// ====== GET LOWEST PROBABILITY DIGITS ====== //
function getLowestProbabilityDigits(probabilities) {
  const values = Object.values(probabilities);
  const min = Math.min(...values);

  // Return all digits that match the lowest probability
  return Object.keys(probabilities)
    .filter(digit => probabilities[digit] === min)
    .map(Number);
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




// ====== SET TRADE PARAMETERS ====== //
function setTradeParams(matcherNumber) {
    // Set trading parameters
    // stake = initialAmountPerTrade;
}

function changeStake(contract) {

    if(contract.status == "won") {
        // if (localStorage.getItem('lossRecovery') === 'true') {
        //     stake = contract.profit;
        //     localStorage.removeItem('lossRecovery');
        // } else {
        //     stake = contract.buy_price + contract.profit;
        //     if(stake > (initialAmountPerTrade * 2)) {
        //         stake = stake - initialAmountPerTrade;
        //     }
        // }
        
        stake = initialAmountPerTrade;
        
    } else {
        // market = getRandomMarket(marketArray, market);
        stake = (contract.buy_price * 11);
            // stake = initialAmountPerTrade;

    }

    // console.log('stake : ', stake);
    // console.log('initialAmountPerTrade : ', initialAmountPerTrade);

}

function placeDifferTrade(market, matcherNumber) {
    // Set trade parameters
    // setTradeParams(matcherNumber);


    if (!ws || ws.readyState !== WebSocket.OPEN) {
        console.log("⚠️ WebSocket is not open. Cannot place trade.");
        return;
    }

    if (tradeInProgress) {
        console.log("⚠️ Trade already in progress. Skipping new trade.");
        return;
    }

    // Decide contract type based on decision
    let contractType = "DIGITDIFF";

    stake = Number(stake);
    stake < 0.35 ? (stake = 0.35) : (stake = stake);

    // console.log('stake in placeTrade : ', stake);

    let tickCount = 1;

    const proposal = {
        proposal: 1,
        amount: stake.toFixed(2),               // your stake
        basis: "stake",              // basis type
        contract_type: contractType, // DIGITEVEN or DIGITODD
        currency: "USD",             // change if needed
        duration: tickCount,                 // 1 tick contract
        duration_unit: "t",
        symbol: market,               // the market symbol (e.g., "R_100")
        barrier: String(matcherNumber)   // digit 0-9 as string
    };

    console.log(`📤 Sending proposal: Digit Differ with stake $${stake.toFixed(2)} on ${market}`);

    ws.send(JSON.stringify(proposal));

    tradeInProgress = true; // Lock until result comes

}



// ====== AFTER CONTRACT CLOSE ====== //

function updateDetails(contract) {

    // console.log('contract = ',contract);

    let timeInterval = 1000;
    currentLossAmount = currentLossAmount + contract.profit;

    if(contract.status == "won") {
        // Update details for sold contract

        winTradeCount++;
        lossCountInRow = 0;


    } else {
        // Update details for lost contract

        lossTradeCount++;
        lossCountInRow++;

        stake = initialAmountPerTrade

        localStorage.setItem('lossRecovery', true);
        if (lossCountInRow >= 2) {
            timeInterval = getRandomNumber(1, 180) * 1000;
            // console.log('timeInterval : ', timeInterval);    
        }

    }

    changeStake(contract);


    let profit = contract.profit;

    currentProfitAmount += profit;
    updatedAccountBalance = initialAccountBalance + currentProfitAmount;
    updateNewAccBalance();

    

    setResultNotification(lastTradeId, tradeType, market, contract.buy_price, profit);
    // console.log(`[RESULT] Contract ID: ${lastTradeId}, Type: ${tradeType}, Market: ${market}, Stake: ${contract.buy_price}, Profit: ${profit}`);
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

    setFlashNotification('', 1);


    setTimer(timeInterval);
    setTimeout(() => {
        tradeInProgress = false; // Allow next trade
        runScriptForTrade();
    }, timeInterval); // wait 2-4 seconds before next trade

}





// ====== SYSTEM RESTART ====== //
function systemRestart() {
    location.reload();
}


// ====== GET LAST DIGIT FROM PRICE ====== //
function getLastDigitFromPrice(history, lastPrice) {
  if (!history || history.length === 0) {
    const str = lastPrice.toString();
    return { normalized: str, lastDigit: parseInt(str.slice(-1)) };
  }

  // Step 1: Count decimal lengths in history
  const decimalCounts = history.map(price => (price.toString().split('.')[1] || '').length);

  // Step 2: Find the majority decimal count
  const countMap = {};
  decimalCounts.forEach(dc => {
    countMap[dc] = (countMap[dc] || 0) + 1;
  });
  let majorityDecimal = 0;
  let maxCount = 0;
  for (const dc in countMap) {
    if (countMap[dc] > maxCount) {
      maxCount = countMap[dc];
      majorityDecimal = parseInt(dc);
    }
  }

  // Step 3: Pad lastPrice decimals to match majorityDecimal
  let [intPart, decPart = ''] = lastPrice.toString().split('.');
  while (decPart.length < majorityDecimal) {
    decPart += '0';
  }
  // ⚠️ If lastPrice already has more decimals than majorityDecimal, trim it
  if (decPart.length > majorityDecimal) {
    decPart = decPart.slice(0, majorityDecimal);
  }

  const normalizedStr = intPart + (majorityDecimal > 0 ? '.' + decPart : '');

  // Step 4: Get last digit (remove decimal point first)
  const lastDigit = parseInt((intPart + decPart).slice(-1), 10);

  return { normalized: normalizedStr, lastDigit };
}


function test(maxDecimalLength, lastPrice) {

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

