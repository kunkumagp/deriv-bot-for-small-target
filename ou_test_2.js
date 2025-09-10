const accountSelectElement = document.getElementById("account_select");
let pingIntervalId;
const marketSelectElement = document.getElementById("market");
const resetBotButton = document.getElementById("resetBot");
const reStartBotButton = document.getElementById("reStartBot");
const overUnderDigitSelect = document.getElementById("over_under_digits");




let ws, apiToken, intervalId;
let isRunning = false;
let selectedOverUnderDigit;

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
                        setAccData(wsResponse.authorize);
                        runScriptForTrade();
                        // subscribeTicks(market);

                    } else if (wsResponse?.error?.code !== undefined && wsResponse.error.code === "WrongResponse") {
                        reload();
                    }
                }

                if (wsResponse.msg_type === "history") {
                    console.log('Selected Over/Under Digit:', selectedOverUnderDigit);

                    const digits = wsResponse.history.prices.map(p => Number(String(p).slice(-1)));
                    const overCount = digits.filter(d => d > selectedOverUnderDigit.digit).length;
                    const probability = (overCount / digits.length) * 100;
                    const lastDigits = digits.slice(-3); // last 3 digits
                    // ensure both sides are numbers before comparing
                    const isMatch = lastDigits.includes(Number(selectedOverUnderDigit.digit));

                    console.log("Digit:", selectedOverUnderDigit.digit);
                    console.log("Found in lastDigits?", isMatch);
                    // get last value of digits
                    const lastValue = digits[digits.length - 1];
                    console.log("Last 3 digits:", lastDigits);
                    console.log("Probability of last digit >", selectedOverUnderDigit.digit, ":", probability.toFixed(2), "%");

                    if ((probability >= 70 && !isMatch) || (probability < 70 && isMatch)) {
                        console.log("Condition met. Placing Over ", selectedOverUnderDigit.digit, " trade...");
                        placeOUTrade(market, selectedOverUnderDigit); 
                    } else {
                        setTimeout(() => {
                            runScriptForTrade(); // retry after short delay
                        }, 1000);
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
                    } else {
                        tradeProposal = wsResponse;
                        makeTheTrade(ws);
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
                                    timeInterval = (getRandomNumber(90, 600) * 1000 );
                                } else if(lostCountInRow >= 3){
                                    market = getRandomMarket(marketArray, market);
                                    timeInterval = (getRandomNumber(20, 90) * 1000 );
                                } else if(lostCountInRow >= 2){
                                    timeInterval = (getRandomNumber(1, 20) * 1000 );
                                }
                               
                                setTimer(timeInterval);
                                setTimeout(() => {
                                    runScriptForTrade();
                                }, timeInterval);
                            } else {
                                // When Trade Win
                                localStorage.removeItem("currentLossAmount");
                                localStorage.removeItem("lossTradeCount");
                                localStorage.removeItem('totalLostAmount');

                                if(currentProfitAmount >= targetProfitPerSession){
                                    // timeInterval = (getRandomNumber(120, 180) * 1000 );
                                    timeInterval = (getRandomNumber(1, 10) * 1000 );
                                    setTimer(timeInterval);
                                    setTimeout(() => {
                                        reload();
                                    }, timeInterval);
                                } else {
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

    let accountBalance = (Number(accData.balance)-200);

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



    stake = initialAmountPerTrade;

    // Recover lost amount after reload if present in localStorage
    const totalLostAmount = Number(localStorage.getItem('totalLostAmount'));
    if (!isNaN(totalLostAmount) && totalLostAmount < 0) {
        // Calculate stake to recover lost amount using martingale multiplier
        stake = Math.abs(totalLostAmount) * martingaleMultiplier3;
        // Optionally, clear the lost amount after setting stake
        localStorage.removeItem('totalLostAmount');
        console.log('Recovered lost amount after reload. New stake:', stake);
    }
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