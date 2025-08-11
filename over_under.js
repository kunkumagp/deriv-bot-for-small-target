const accountSelectElement = document.getElementById("account_select");
const marketSelectElement = document.getElementById("market");

let ws, apiToken, intervalId;
let isRunning = false;

let targetProfitPercentagePerSession = 10,
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
marketSelectElement.value = "R_50";
apiToken = accountSelectElement.value;

let sessionProfit = 0;
let logMessage;

market = getRandomMarket(marketArray, '');



// ---------------------------------------------------------------------


startWebSocket();

function startWebSocket(){
    ws = new WebSocket("wss://ws.binaryws.com/websockets/v3?app_id=1089");
    
    ws.onopen = function () {
        console.log("Connection open");
        console.log(apiToken);

        getAuthentication(ws, apiToken);
    };

    ws.onclose = function () {
        console.log("Connection closed");
        console.log("-----------------------------\n");
        // tradesOn = false;
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

                    if (targetProfitPerSession > 0 && sessionProfit >= targetProfitPerSession) {
                        logMessage = 'Session target is completed.';
                        setFlashNotification(logMessage, 0);
                        console.log(logMessage);
                    } else {
                        // setFlashNotification("Start Trading", 0);
                        // console.log("Start Trading");
                        logMessage = 'Start Trading';
                        console.log(logMessage);
                        setFlashNotification(logMessage, 0);
                        placeOUTrade(market);
                    }


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

                        // setInfo(contract, profit);

                        updateDetails(contract, profit);

                        stakeChangeForOU(result);
                        isTradeOpen = false;


                        if (currentLossAmount < 0) {
                            // When Trade Loss

                            timeInterval = 0;
                            
                            if(lostCountInRow >= 2){
                                timeInterval = (getRandomNumber(3, 10) * 1000 );
                            }

                            setTimer(timeInterval);
                            setTimeout(() => {
                                placeOUTrade(market);
                            }, timeInterval);

                        } else {
                            // When Trade Win

                            localStorage.removeItem("currentLossAmount");
                            localStorage.removeItem("lossTradeCount");

                            if(currentProfitAmount >= targetProfitPerSession){
                                timeInterval = (getRandomNumber(300, 600) * 1000 );

                                setTimer(timeInterval);
                                setTimeout(() => {
                                    reload();
                                }, timeInterval);
                            } else {
                                placeOUTrade(market);
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

const stakeChangeForOU = (status) => {
    if (status == "Loss") {
        stake = stake * martingaleMultiplier3;
    } else if (status == "Win") {
        stake = initialAmountPerTrade;
    }
};


function setAccData(accData) {
    // console.log(accData);

    // Set Initial Account Balance
    initialAccountBalance = Number(accData.balance);
    setAccountInfo("initialAccountBalance", `$ ${initialAccountBalance}`);
    if(!localStorage.getItem('initialAccountBalance')){
        localStorage.setItem('initialAccountBalance', initialAccountBalance);
    }

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

    updatedAccountBalance = updatedAccountBalance + currentProfitAmount;

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
