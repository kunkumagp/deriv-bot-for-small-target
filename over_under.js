const accountSelectElement = document.getElementById("account_select");
let pingIntervalId;
const marketSelectElement = document.getElementById("market");

const resetBotButton = document.getElementById("resetBot");


let ws, apiToken, intervalId;
let isRunning = false;

let targetProfitPercentagePerSession = 0.5,
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

        setTimeout(() => {
            startWebSocket();
        }, 1000);
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

            if (wsResponse.msg_type === "history") {
                const digits = wsResponse.history.prices.map(p => Number(String(p).slice(-1)));
                const over1Count = digits.filter(d => d > 1).length;
                const probability = (over1Count / digits.length) * 100;

                console.log("Probability of last digit > 1:", probability.toFixed(2), "%");

                const lastDigits = digits.slice(-3); // last 3 digits
                if (probability >= 70) {
                    console.log("Condition met. Placing Over 1 trade...");
                    placeOUTrade(market); // enter Over 1
                } else {
                    console.log("Skipped trade. Probability too low:", probability.toFixed(2), "%");
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
                            timeInterval = 1 ;
                            // timeInterval = (getRandomNumber(60, 120) * 1000 );

                            if(lostCountInRow >= 2){
                                timeInterval = (getRandomNumber(180, 300) * 1000 );
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
                                runScriptForTrade();
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
    }
}



// ---------------------------------------------------------------------

const stakeChangeForOU = (status) => {
    if (status == "Loss") {
        stake = stake * martingaleMultiplier4;
    } else if (status == "Win") {
        stake = initialAmountPerTrade;
    }
};


function setAccData(accData) {

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
    const totalLostAmount = Number(localStorage.getItem('totalLostAmount'));
    if (!isNaN(totalLostAmount) && totalLostAmount < 0) {
        // Calculate stake to recover lost amount using martingale multiplier
        stake = Math.abs(totalLostAmount) * martingaleMultiplier4;
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