const accountSelectElement = document.getElementById("account_select");
let pingIntervalId;
const marketSelectElement = document.getElementById("market");
const resetBotButton = document.getElementById("resetBot");
const reStartBotButton = document.getElementById("reStartBot");
const overUnderDigitSelect = document.getElementById("over_under_digits");




let ws, apiToken, intervalId;
let isRunning = false;
let selectedOverUnderDigit;
let buyRequest = null;
let lostRecoveryMode = false;
let lowDigitArray = [];
let targetProfitForDay;



let targetProfitPercentagePerSession = 0.07,
amountPercentagePerTrade = 0.1,
initialAmountPerTrade,
targetProfitPerSession;

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


overUnderDigitArray.forEach((item) => {
    const option = document.createElement("option");
    option.value = item.digit;
    option.textContent = item.name;
    overUnderDigitSelect.appendChild(option);
});

// overUnderDigitSelect.value = "2";


const selectedOverUnderDigitStored = localStorage.hasOwnProperty("selectedOverUnderDigit") ? localStorage.getItem("selectedOverUnderDigit") : null;

if(
    selectedOverUnderDigitStored && 
    (
        selectedOverUnderDigitStored !== "undefined" || 
        selectedOverUnderDigitStored !== null || 
        selectedOverUnderDigitStored !== "" || 
        selectedOverUnderDigitStored !== undefined
    )
){
    selectedOverUnderDigit = JSON.parse(selectedOverUnderDigitStored);
    overUnderDigitSelect.value = selectedOverUnderDigit.digit;
} else {
    overUnderDigitSelect.value = "2";
    selectedOverUnderDigit = overUnderDigitArray.find(
        (item) => item.name === overUnderDigitSelect.value
    );
}




// listen for user changes
overUnderDigitSelect.addEventListener("change", (e) => {
    selectedOverUnderDigit = overUnderDigitArray.find(
        (item) => item.digit === e.target.value
    );
    console.log("Selected:", selectedOverUnderDigit);
    localStorage.setItem("selectedOverUnderDigit", JSON.stringify(selectedOverUnderDigit));
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

reStartBotButton.addEventListener('click', reStartBot);


// ---------------------------------------------------------------------

startWebSocket();


function startWebSocket(){
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

        if(isRunning){
            setTimeout(() => {
                startWebSocket();
            }, 1000);
        }
    };

    ws.onerror = function (err) {
        console.error("WebSocket error:", err);
    };

    ws.onmessage = function (event) {
        // if(isWithinTimeRange()){
            wsResponse = JSON.parse(event.data);

            if (wsResponse != null) {
                console.log('wsResponse : ',wsResponse);

                if (wsResponse.msg_type === "authorize") {
                    console.log("Authorization successful.\n-----------------------------\n\n");
                    setFlashNotification("Authorization successful", 0);

                    if (wsResponse?.authorize?.balance !== undefined && wsResponse.authorize.balance !== null) {
                        // Set Account Details and trading Data
                        if(!lostRecoveryMode){
                            setAccData(wsResponse.authorize);

                        }
                        placeOUTrade(market, selectedOverUnderDigit); 


                    } else if (wsResponse?.error?.code !== undefined && wsResponse.error.code === "WrongResponse") {
                        reload();
                    }
                }

                if (wsResponse.msg_type === "history") {
                    const lastDigitsNumbers = getLastDigits(wsResponse.history.prices);
                    const digitPercentages = getDigitPercentages(lastDigitsNumbers);
                    const targetDigit = Number(selectedOverUnderDigit.digit);
                    const overCount = lastDigitsNumbers.filter(d => d > selectedOverUnderDigit.digit).length;
                    const probability = (overCount / lastDigitsNumbers.length) * 100;
                    const lastDigits = lastDigitsNumbers.slice(-3);

                    // build range [0..targetDigit]
                    const range = Array.from({ length: targetDigit + 1 }, (_, i) => i);
                    // get last value of digits
                    // console.log("Last 3 digits:", lastDigits);
                    setFlashNotification("Analizing....", 0);

                    // console.log("Last 2 digits:", lastDigits);
                    // console.log("Probability of last digit >", selectedOverUnderDigit.digit, ":", probability.toFixed(2), "%");
                    // console.log("isMatch", isMatch);
                    // console.log("Is in range?", isInRange);
                    // console.log("percentages : ", digitPercentages);
                    // console.log("maxDigit", maxDigit);

                    console.log('range : ',range);


                    let markovPrediction = predictByMarkov(lastDigitsNumbers)
                    console.log("Markov Prediction:", predictByMarkov(lastDigitsNumbers));

                    // Convert to numbers (remove % and parse as float)
                    const values = markovPrediction.probabilities.map(p => parseFloat(p));

                    const maxValue = Math.max(...values);
                    const maxIndex = values.indexOf(maxValue);

                    console.log("Max Percentage:", maxValue + "%");
                    console.log("Index:", maxIndex);


                    const isInRange = range.includes(markovPrediction.bestDigit) ? true : false;
                    console.log('isInRange : ',isInRange);
                    // console.log('maxDigit : ',maxDigit);
                    console.log('------------------------------');
                    console.log('');

                    lowDigitArray.push(markovPrediction.bestDigit);
                    if(lowDigitArray.length >= 5){
                        reload();
                    }

                    if(!isInRange || (currentLossAmount < 0 && isInRange)){
                        console.log("Condition met. Placing Over ", selectedOverUnderDigit.digit, " trade...");
                        setFlashNotification("Placing a trade", 0);
                        ws.send(JSON.stringify(buyRequest));

                    } else {
                        setTimeout(() => {
                            runScriptForTrade(); // retry after short delay
                        }, 500);
                    }
                    
                }


                if (wsResponse.msg_type === "proposal") {
                    if (
                        updatedAccountBalance > 0 &&
                        wsResponse.echo_req.amount > updatedAccountBalance
                    ) {
                        // webSocketConnectionStop();
                        console.log("Web socket connection lost");
                        setFlashNotification("Web socket connection lost", 0);

                        console.log("lostRecoveryMode: ", lostRecoveryMode);

                        if (lostRecoveryMode) {
                            startWebSocket();
                        }

                    } else {
                        tradeProposal = wsResponse;
                        // makeTheTrade(ws);
                        if (
                            tradeProposal.proposal == undefined ||
                            tradeProposal.proposal.id == undefined
                        ) {
                            isRunning = false;
                            // webSocketConnectionStart();
                        } else {
                            buyRequest = {
                                buy: tradeProposal.proposal.id,
                                price: tradeProposal.proposal.ask_price,
                            };
                            console.log('buyRequest : ',buyRequest);
                            runScriptForTrade();

                        }
                    }
                }

                if (wsResponse.msg_type === "buy") {
                    if (
                        wsResponse.buy == undefined ||
                        wsResponse.buy.contract_id == undefined
                    ) {
                        // placeTrade();
                    } else {
                        lastTradeId = wsResponse.buy.contract_id;
                        totalTradeCount = totalTradeCount + 1;
                        isTradeOpen = true;
                        tradeTypeDisplay = "Digit Over";
                        setResultNotification(
                            lastTradeId,
                            tradeTypeDisplay,
                            market,
                            wsResponse.buy.buy_price
                        );
        
                        console.log("Trade Successful:", wsResponse);
                        automation = true;
                        updatedAccountBalance = updatedAccountBalance - stake;
                        updateNewAccBalance();
        
                        setTimeout(() => {
                            fetchTradeDetails(ws, lastTradeId);
                        }, 500);
                    }
                }

                if (wsResponse.msg_type === "proposal_open_contract") {
                    if (wsResponse.proposal_open_contract.contract_id === lastTradeId) {
                        const contract = wsResponse.proposal_open_contract;

                        if (contract.is_sold){
                            const profit = contract.profit;
                            const result = profit > 0 ? "Win" : "Loss";
                            updateDetails(contract, profit);
                            stakeChangeForOU(result);
                            isTradeOpen = false;
                            

                            if (currentLossAmount < 0) {
                                localStorage.setItem("totalLostAmount",currentLossAmount );
                                placeOUTrade(market, selectedOverUnderDigit); 


                                // When Trade Loss
                                // timeInterval = 1 ;
                                // timeInterval = (getRandomNumber(60, 120) * 1000 );
                                timeInterval = (getRandomNumber(1, 10) * 1000 );

                                if(lostCountInRow >= 5){
                                    webSocketConnectionStop();
                                    setFlashNotification("Too many losses in a row. Stopping bot.", 1);
                                    // timeInterval = (getRandomNumber(90, 600) * 1000 );
                                } else if(lostCountInRow >= 4){
                                    // webSocketConnectionStop();
                                    // setFlashNotification("Too many losses in a row. Stopping bot.", 1);
                                    timeInterval = (getRandomNumber(120, 600) * 1000 );
                                } else if(lostCountInRow >= 3){
                                    market = getRandomMarket(marketArray, market);
                                    // webSocketConnectionStop();
                                    // setFlashNotification("Too many losses in a row. Stopping bot.", 1);
                                    timeInterval = (getRandomNumber(60, 120) * 1000 );
                                } else if(lostCountInRow >= 2){
                                    timeInterval = (getRandomNumber(10, 60) * 1000 );
                                }
                               
                                setTimer(timeInterval);
                                setTimeout(() => {
                                    runScriptForTrade();
                                }, timeInterval);
                            } else {
                                // When Trade Win
                                localStorage.removeItem("currentLossAmount");
                                localStorage.removeItem("lossTradeCount");
                                // localStorage.removeItem('totalLostAmount');
                                if(currentLossAmount >= 0){
                                    localStorage.removeItem('totalLostAmount');
                                }

                                // if(currentProfitAmount >= targetProfitPerSession){
                                if(winTradeCount > 0 && currentLossAmount >= 0){
                                    if(initialAccountBalance >= Number(localStorage.getItem('targetAccountBalancePerToday'))){
                                        let message = "Day target has been achieved. Rest for the day.";
                                        setFlashNotification(message, 0);
                                        console.log(message);
                                    } else {
                                        // timeInterval = (getRandomNumber(120, 180) * 1000 );
                                        timeInterval = (getRandomNumber(1, 10) * 1000 );
                                        setTimer(timeInterval);
                                        setTimeout(() => {
                                            reload();
                                        }, timeInterval);
                                    }
                                   
                                } else {
                                    placeOUTrade(market, selectedOverUnderDigit); 

                                    timeInterval = (getRandomNumber(1, 10) * 1000 );
                                    setTimer(timeInterval);
                                    setTimeout(() => {
                                        runScriptForTrade();
                                    }, timeInterval);
                                }
                            }
                            console.log("-----------------------------------\n New Trade \n");

                        } else {
                            setTimeout(() => {
                                setTickCountDown(
                                    contract.tick_count,
                                    contract.tick_stream.length
                                );
                                fetchTradeDetails(ws, lastTradeId);
                            }, 1000);
                        }
                    }
                }


            }
        // }
    };
}

function runScriptForTrade() {
    isRunning = true;
    // placeOUTrade(market);

    // ✅ Step 1: Request last 100 ticks before trading
    ws.send(JSON.stringify({
        ticks_history: market,
        end: "latest",
        count: 1000,
        style: "ticks"
    }));
}


function weClose(){
    if (ws) {
        ws.close();
        ws = null;
    }
}


function reStartBot() {
    lostRecoveryMode = true;
    webSocketConnectionStart();
}

function webSocketConnectionStart(){
    isRunning = true;
    console.log('WebSocket connection started.');
    startWebSocket()
    
};

function webSocketConnectionStop(){
    stopPing();
    isRunning = false;
    clearInterval(intervalId); // Stop the interval loop
    weClose();
    console.log('WebSocket connection stopped.');
};


function startPing(ws) {
    // Send a ping every 30 seconds
    pingIntervalId = setInterval(() => {
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ ping: 1 }));
        }
    }, 10000);
}

function stopPing() {
    if (pingIntervalId) {
        clearInterval(pingIntervalId);
        pingIntervalId = null;
    }
}



// ---------------------------------------------------------------------

const stakeChangeForOU = (status) => {

    const nextStake = calculateMartingale(currentLossAmount, selectedOverUnderDigit, "over");

    // console.log("Next stake:", nextStake);
    console.log("Next stake:", Math.abs(nextStake.toFixed(2)));
    if (status == "Loss") {
        stake = Math.abs(nextStake.toFixed(2));
    } else if (status == "Win") {
        stake = initialAmountPerTrade;
    }
};


function setAccData(accData) {

    // Set Initial Account Balance

    let accountBalance = (Number(accData.balance) - 400);

    initialAccountBalance = accountBalance;
    setAccountInfo("initialAccountBalance", `$ ${initialAccountBalance.toFixed(2)}`);
    localStorage.setItem('initialAccountBalance', initialAccountBalance);

    // if(!localStorage.getItem('initialAccountBalance')){
    //     localStorage.setItem('initialAccountBalance', initialAccountBalance);
    // }

    // Set Updated Account Balance
    updatedAccountBalance = accountBalance;
    setAccountInfo("updatedAccountBalance", `$ ${updatedAccountBalance.toFixed(2)}`);


    // Set Target Profit Amount Per Trade
    targetProfitPerSession = (initialAccountBalance * (targetProfitPercentagePerSession / 100)).toFixed(2);
    // targetProfitPerSession = targetProfitPercentagePerSession;
    setAccountInfo("targetProfitPerSession", `$ ${Number(targetProfitPerSession).toFixed(2)}`);
    localStorage.setItem('targetProfitPerSession', targetProfitPerSession);

    // Set Target Profit Amount Per Trade
    initialAmountPerTrade = (initialAccountBalance * (amountPercentagePerTrade / 100)).toFixed(2);
    // initialAmountPerTrade = amountPercentagePerTrade;
    setAccountInfo("initialAmountPerTrade", `$ ${Number(initialAmountPerTrade).toFixed(2)}`);
    localStorage.setItem('initialAmountPerTrade', initialAmountPerTrade);



     // Recover lost amount after reload if present in localStorage
    let totalLostAmountFromLocalStorage = Number(localStorage.getItem('totalLostAmount'));

    console.log('totalLostAmount from localStorage:', totalLostAmountFromLocalStorage);
    
    if (!isNaN(totalLostAmountFromLocalStorage) && totalLostAmountFromLocalStorage < 0) {
        // Calculate stake to recover lost amount using martingale multiplier
        stake = Math.abs(totalLostAmountFromLocalStorage) * martingaleMultiplier3;
        // Optionally, clear the lost amount after setting stake
        // localStorage.removeItem('totalLostAmount');
        lostRecoveryMode = true;
        console.log('Recovered lost amount after reload. New stake:', stake);
    } else {
        stake = initialAmountPerTrade;
    }

    setDayTarget();

}


function updateDetails(contract, lastTradeProfit) {

    // If Trade Win
    if(lastTradeProfit > 0){
        winTradeCount = winTradeCount + 1;
        lostCountInRow = 0;
        totalProfitAmount = totalProfitAmount + lastTradeProfit;
    } else {
        lossTradeCount = lossTradeCount + 1;
        lostCountInRow = lostCountInRow + 1;
        totalLossAmount = totalLossAmount + lastTradeProfit;
    }

    currentProfitAmount = currentProfitAmount + lastTradeProfit;
    currentLossAmount = currentLossAmount + lastTradeProfit;
    if(currentLossAmount >= 0){currentLossAmount = 0;}

    updatedAccountBalance = initialAccountBalance + currentProfitAmount;

    netProfit = updatedAccountBalance - initialAccountBalance;
    updateNewAccBalance();


    // console.log('-------------------------------------');
    // console.log('updatedAccountBalance : ', updatedAccountBalance);
    // console.log('netProfit : ', netProfit);
    // console.log('-------------------------------------');

    setResultNotification(
        lastTradeId,
        tradeType,
        market,
        contract.buy_price,
        lastTradeProfit
    );

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


    
}



function isWithinTimeRange() {
    const now = new Date();
    const hour = now.getHours(); // Get current hour (0-23)
    let returnValue = false
    if(hour >= 5 && hour < 18) {
        returnValue = true
    }

    return returnValue;
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


function calculateMartingale(lostAmount, selectedOverUnderDigit, type = "over") {
    // pick correct payout %
    const payoutPercentage = type === "over" 
        ? selectedOverUnderDigit.over_payout_percentage 
        : selectedOverUnderDigit.under_payout_percentage;

    if (!payoutPercentage || payoutPercentage <= 0) {
        throw new Error("Invalid payout percentage");
    }

    // required stake
    const stake = (lostAmount * 1.5) / (payoutPercentage / 100);

    return Number(stake.toFixed(2)); // round to 2 decimals
}


// if 0.12 / 0.35, then 0.35 / x 



function predictOverUnder(history, options = {}) {
  const { wFreq = 0.5, wTrans = 0.5, threshold = 0.5 } = options;

  if (!Array.isArray(history) || history.length < 2) {
    throw new Error("History must be an array with at least 2 digits");
  }

  const A = new Set([0, 1, 2]);
  const N = history.length;

  // Unconditional frequency
  const counts = Array(10).fill(0);
  history.forEach(d => counts[d]++);
  const freqA = (counts[0] + counts[1] + counts[2]) / N;

  // Transition probability given last digit
  const C = Array.from({ length: 10 }, () => Array(10).fill(0));
  for (let i = 0; i < history.length - 1; i++) {
    C[history[i]][history[i + 1]]++;
  }
  const last = history[history.length - 1];
  const rowTotal = C[last].reduce((a, b) => a + b, 0) || 1;
  const transNum = C[last][0] + C[last][1] + C[last][2];
  const pTransA = transNum / rowTotal;

  // Combined probability
  const pCombined = freqA * wFreq + pTransA * wTrans;

  // Final prediction
  const prediction = pCombined >= threshold ? "under" : "over";

  return { prediction };
}

function getDigitPercentages(digits) {
  const counts = Array(10).fill(0);

  // Count occurrences
  digits.forEach(d => counts[d]++);

  const total = digits.length;

  // Convert to percentages (as numbers, no "%")
  const percentages = counts.map(c => Number(((c / total) * 100).toFixed(2)));

  // Return as object { digit: percentage }
  return Object.fromEntries(counts.map((_, i) => [i, percentages[i]]));
}



function getLastDigits(numbers) {
    const decimalCount = getMajorityDecimalCount(numbers).majorityDecimalPlaces;

  return numbers.map(num => {
    const str = getLastDigit(num, decimalCount).toString();               // convert number to string
    const lastChar = str[str.length - 1];     // take last character
    return parseInt(lastChar, 10);            // convert back to number
  });
}


function getLastDigit(num, decimals = 3) {
  // force fixed decimals, so 5976.31 becomes "5976.310"
  const str = num.toFixed(decimals);
  return parseInt(str[str.length - 1], 10);
}

function getMajorityDecimalCount(numbers) {
  const counts = {};

  for (const num of numbers) {
    // Convert to string, split decimals
    const str = num.toString();
    const decimalPart = str.includes('.') ? str.split('.')[1] : '';
    const decimalCount = decimalPart.length;

    // Count occurrences of each decimal length
    counts[decimalCount] = (counts[decimalCount] || 0) + 1;
  }

  // Find the decimal length with max frequency
  let majorityCount = null;
  let maxFrequency = 0;

  for (const [decimals, frequency] of Object.entries(counts)) {
    if (frequency > maxFrequency) {
      maxFrequency = frequency;
      majorityCount = decimals;
    }
  }

  return {
    majorityDecimalPlaces: Number(majorityCount),
    counts
  };
}


function isDigitInRange(selectedDigit, lastNumbers) {
  // Create all numbers from 0 up to selectedDigit
  const validDigits = Array.from({ length: selectedDigit + 1 }, (_, i) => i);

  // Check if any of these digits exist in the range
//   const inRange = validDigits.some(d => range.includes(d));

  // Optionally, check against last number(s)
  const lastMatch = lastNumbers.some(num => validDigits.includes(num));

  return { lastMatch };
}


function setDayTarget() {
    let targetAccountBalancePerToday = localStorage.getItem('targetAccountBalancePerToday');
    let date = localStorage.getItem('date');
    const today = new Date();
    const formatted = today.toISOString().split("T")[0];


    if(!targetAccountBalancePerToday && formatted !== date){
        localStorage.setItem('targetAccountBalancePerToday', (initialAccountBalance * 2));
        localStorage.setItem('date', formatted);
    }
}