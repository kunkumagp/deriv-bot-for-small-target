const accountSelectElement = document.getElementById("account_select");
let pingIntervalId;
const marketSelectElement = document.getElementById("market");

const resetBotButton = document.getElementById("resetBot");


let ws, apiToken, intervalId;
let isRunning = false;
let timeInterval;
 

let targetProfitPercentagePerSession = 1,
amountPercentagePerTrade = 0.35,
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


accountSelectElement.value = "lkUxtOopvUhCpIX";
marketSelectElement.value = "R_50";
apiToken = accountSelectElement.value;

let sessionProfit = 0;
let logMessage;

market = getRandomMarket(marketArray, 'R_50');
// market = "R_50"s;

resetBotButton.addEventListener('click', resetBot);


// ---------------------------------------------------------------------
// Martingale control
const maxMartingaleSteps = 4; // Change to 5 if you want
let martingaleStepCount = 0;


startWebSocket();


function startPing(ws) {
    // Send a ping every 30 seconds
    pingIntervalId = setInterval(() => {
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ ping: 1 }));
        }
    }, 30000);
}

function stopPing() {
    if (pingIntervalId) {
        clearInterval(pingIntervalId);
        pingIntervalId = null;
    }
}

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
        wsResponse = JSON.parse(event.data);

        if (wsResponse != null) {
            console.log('wsResponse : ',wsResponse);

            if (wsResponse.msg_type === "authorize") {
                console.log("Authorization successful.\n-----------------------------\n\n");
                setFlashNotification("Authorization successful", 0);

                if (wsResponse?.authorize?.balance !== undefined && wsResponse.authorize.balance !== null) {
                    // Set Account Details and trading Data
                    setAccData(wsResponse.authorize);
                    let targetProfitPerSession = localStorage.getItem('targetProfitPerSession');
                    runScriptForTrade();
                } else if (wsResponse?.error?.code !== undefined && wsResponse.error.code === "WrongResponse") {
                    reload();
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
                    setResultNotification(
                        lastTradeId,
                        tradeType,
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
                        stakeChangeEventOdd(result);
                        isTradeOpen = false;

                        console.log('currentLossAmount : ',currentLossAmount);

                        if (currentLossAmount < 0) {
                            localStorage.setItem("currentLossAmount",currentLossAmount );
                            // timeInterval = (getRandomNumber(150, 300) * 1000 );
                            // timeInterval = (getRandomNumber(60, 90) * 1000 );

                            if(lostCountInRow >= 3){
                                timeInterval = (getRandomNumber(150, 300) * 1000 );
                                market = getRandomMarket(marketArray, market);

                                setTimer(timeInterval);
                                setTimeout(() => {
                                    runScriptForTrade();
                                }, timeInterval);
                            } else if(lostCountInRow >= 1){
                                timeInterval = (getRandomNumber(1, 150) * 1000 );
                                setTimer(timeInterval);
                                setTimeout(() => {
                                    runScriptForTrade();
                                }, timeInterval);
                            }

                            // setTimer(timeInterval);
                            // setTimeout(() => {
                            //     runScriptForTrade();
                            // }, timeInterval);
                        } else {
                            // When Trade Win
                            localStorage.removeItem("currentLossAmount");
                            localStorage.removeItem("lossTradeCount");

                            console.log('targetProfitPerSession : ',targetProfitPerSession);
                            console.log('currentProfitAmount : ',currentProfitAmount);
                            

                            if(currentProfitAmount >= targetProfitPerSession){
                                // timeInterval = (getRandomNumber(120, 180) * 1000 );
                                timeInterval = (getRandomNumber(12, 18) * 1000 );
                                console.log('target cover . timeInterval : ', timeInterval);
                                setTimer(timeInterval);
                                setTimeout(() => {
                                    reload();
                                }, timeInterval);
                            } else {
                                runScriptForTrade();
                            }
                        }
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
    }
}



// ---------------------------------------------------------------------

// Called after each trade finishes
const stakeChangeEventOdd = (status) => {
    if (status === "Loss") {
        // Increase stake using multiplier
        stake = Number(stake) * martingaleMultiplier1;
        console.log(`Loss detected → Increasing stake to: ${stake}`);
    } else if (status === "Win") {
        // Reset stake back to initial
        stake = Number(initialAmountPerTrade);
        console.log(`Win detected → Reset stake to initial: ${stake}`);
    }
};


function setAccData(accData) {
    // console.log(accData);

    // Set Initial Account Balance
    initialAccountBalance = Number(accData.balance);
    setAccountInfo("initialAccountBalance", `$ ${initialAccountBalance}`);
    localStorage.setItem('initialAccountBalance', initialAccountBalance);

    // if(!localStorage.getItem('initialAccountBalance')){
    //     localStorage.setItem('initialAccountBalance', initialAccountBalance);
    // }

    // Set Updated Account Balance
    updatedAccountBalance = initialAccountBalance;
    setAccountInfo("updatedAccountBalance", `$ ${updatedAccountBalance}`);


    // Set Target Profit Amount Per Trade
    targetProfitPerSession = (initialAccountBalance * (targetProfitPercentagePerSession / 100)).toFixed(2);
    setAccountInfo("targetProfitPerSession", `$ ${targetProfitPerSession}`);
    localStorage.setItem('targetProfitPerSession', targetProfitPerSession);

    // Set Target Profit Amount Per Trade
    initialAmountPerTrade = (initialAccountBalance * (amountPercentagePerTrade / 100)).toFixed(2);
    setAccountInfo("initialAmountPerTrade", `$ ${initialAmountPerTrade}`);
    localStorage.setItem('initialAmountPerTrade', initialAmountPerTrade);



    stake = initialAmountPerTrade;

    // Recover lost amount after reload if present in localStorage
    let currentLossAmount = Number(localStorage.getItem('currentLossAmount'));
    console.log('currentLossAmount : ',currentLossAmount);
    
    if (!isNaN(currentLossAmount) && currentLossAmount < 0) {
        // Calculate stake to recover lost amount using martingale multiplier
        stake = Math.abs(currentLossAmount) * martingaleMultiplier2;
        // Optionally, clear the lost amount after setting stake
        localStorage.removeItem('currentLossAmount');
        console.log('Recovered lost amount after reload. New stake:', stake);
    }
}


function updateDetails(contract, lastTradeProfit) {

    // console.log(contract);
    // console.log(lastTradeProfit);

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


function placeEvenOddTrade() {
    if (isTradeOpen == false) {
        // Pick even or odd randomly for this trade
        const prediction = getRandomEvenOdd();
        let tradeState;
        let tickCount = 1; // Use 1 tick for fast trades
        let tradeRequest;

        if (prediction === "even") {
            tradeState = "DIGITEVEN";
        } else {
            tradeState = "DIGITODD";
        }

        if(lostCountInRow >= 2){
            // market = getRandomMarket(marketArray, market);
            tickCount = getRandomNumber(1, 10);
        }

        stake = Number(stake);
        if (stake < 0.35) stake = 0.35;

        tradeRequest = {
            proposal: 1,
            amount: stake.toFixed(2),
            basis: "stake",
            contract_type: tradeState,
            currency: "USD",
            duration: tickCount,
            duration_unit: "t",
            symbol: market,
        };

        tradesOn = true;
        onTradeCount = 1;
        console.log("Sending trade request with prediction:", tradeRequest);
        ws.send(JSON.stringify(tradeRequest));
    }
}

function runScriptForTrade() {
    isRunning = true;
    placeEvenOddTrade(market);
}

function getRandomEvenOdd() {
    return Math.random() < 0.5 ? "even" : "odd";
}