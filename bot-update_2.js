let ws, apiToken, intervalId;
let isRunning2 = false;

let targetProfitAmountPerTrade,
    targetProfitPercentagePerTrade = 0.1,
    initialAmountPerTrade,
    amountPercentagePerTrade = 0.35,
    targetProfitPercentagePerDay = 10,
    targetProfitAmountPerDay,
    targetProfitPercentagePerSession = 2,
    targetProfitAmountPerSession,
    targetCapitalForDay,
    timeInterval = 0
;


const accountSelectElement = document.getElementById("account_select");
const marketSelectElement = document.getElementById("market");


const resetBotButton = document.getElementById("resetBot");
const startBotButton = document.getElementById("startBot");


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
marketSelectElement.value = "R_100";
apiToken = accountSelectElement.value;

accountSelectElement.addEventListener("change", () => {
    apiToken = accountSelectElement.value;
});

market = getRandomMarket(marketArray, '');


startWebSocket();

function startWebSocket() {
    ws = new WebSocket("wss://ws.binaryws.com/websockets/v3?app_id=1089");

    ws.onopen = function () {
        console.log("Connection open");
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

            // console.log('wsResponse : ', wsResponse);

            if (wsResponse.msg_type === "authorize") {

                console.log("Authorization successful.\n-----------------------------\n\n");
                setFlashNotification("Authorization successful", 0);



                if (wsResponse?.authorize?.balance !== undefined && wsResponse.authorize.balance !== null) {

                    // Set Account Details and trading Data
                    setAccData(wsResponse.authorize);

                    if (targetCapitalForDay > 0 && initialAccountBalance >= targetCapitalForDay) {
                        setFlashNotification("Day target is done", 0);
                        console.log("Day target is done");
                    } else {
                        // setFlashNotification("Start Trading", 0);
                        // console.log("Start Trading");

                        console.log("Run prediction and trade");
                        setFlashNotification("Run prediction and trade", 0);
                        runPrediction();
                        
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

                    if (wsResponse.buy.shortcode.includes("DIGITEVEN")) {
                        tradeTypeDisplay = "Even";
                    } else if (wsResponse.buy.shortcode.includes("DIGITODD")) {
                        tradeTypeDisplay = "Odd";
                    }

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

                        stakeChangeNew(result);
                        isTradeOpen = false;


                        if (currentLossAmount < 0) {
                            // When Trade Loss

                            localStorage.setItem("currentLossAmount", currentLossAmount);
                            localStorage.setItem("lossTradeCount", lossTradeCount);

                            timeInterval = (getRandomNumber(1, 15) * 1000 );
                            setTimer(timeInterval);
                            setTimeout(() => {
                                // runPrediction();
                            }, timeInterval);

                        } else {
                            // When Trade Win

                            localStorage.removeItem("currentLossAmount");
                            localStorage.removeItem("lossTradeCount");

                            if (currentProfitAmount >= targetProfitAmountPerSession) {
                                timeInterval = (getRandomNumber(30, 90) * 1000 );

                                setTimer(timeInterval);
                                setTimeout(() => {
                                    reload();
                                }, timeInterval);
                                
                            } else {
                                // runPrediction();
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
    };

}


function setAccData(accData) {
    console.log(accData);

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
    targetProfitAmountPerTrade = (initialAccountBalance * (targetProfitPercentagePerTrade / 100)).toFixed(2);
    setAccountInfo("targetProfitAmountPerTrade", `$ ${targetProfitAmountPerTrade}`);

    // Set Target Profit Amount Per Trade
    initialAmountPerTrade = (initialAccountBalance * (amountPercentagePerTrade / 100)).toFixed(2);
    setAccountInfo("initialAmountPerTrade", `$ ${initialAmountPerTrade}`);

    // Set Target Profit Amount Per Day
    targetProfitAmountPerDay = (initialAccountBalance * (targetProfitPercentagePerDay / 100)).toFixed(2);
    localStorage.setItem('targetProfitAmountPerDay', targetProfitAmountPerDay);

    // Set Target Profit Amount Per Session
    targetProfitAmountPerSession = (initialAccountBalance * (targetProfitPercentagePerSession / 100)).toFixed(2);
    localStorage.setItem('targetProfitAmountPerSession', targetProfitAmountPerSession);


    


    if(!localStorage.getItem('date')){
        // Set New Date
        localStorage.setItem('date', now.toLocaleDateString());

        // Set Target Capital For Day
        targetCapitalForDay = (Number(initialAccountBalance) + Number(targetProfitAmountPerDay));
        localStorage.setItem('targetCapitalForDay', targetCapitalForDay);

    } else {
        if(localStorage.getItem('date') != now.toLocaleDateString()){
            // Set New Date
            localStorage.setItem('date', now.toLocaleDateString());
            
            // Set Target Capital For Day
            targetCapitalForDay = (Number(initialAccountBalance) + Number(targetProfitAmountPerDay));
            localStorage.setItem('targetCapitalForDay', targetCapitalForDay);
        }
    }


    stake = initialAmountPerTrade;
}

const stakeChangeNew = (status) => {
    if (status == "Loss") {
        stake = stake * martingaleMultiplier1;
    } else if (status == "Win") {
        stake = initialAmountPerTrade;
    }
};

function updateDetails(contract, lastTradeProfit) {

    console.log(contract);
    console.log(lastTradeProfit);

    // If Trade Win
    if(lastTradeProfit > 0){
        winTradeCount = winTradeCount + 1;
        lostCountInRow = 0;
        totalProfitAmount = totalProfitAmount + lastTradeProfit;

        updatedAccountBalance = updatedAccountBalance + stake + lastTradeProfit;

    } else {
        lossTradeCount = lossTradeCount + 1;
        lostCountInRow = lostCountInRow + 1;
        totalLossAmount = totalLossAmount + lastTradeProfit;

        updatedAccountBalance = updatedAccountBalance + lastTradeProfit;

    }

    netProfit = updatedAccountBalance - initialAccountBalance;


    console.log('-------------------------------------');
    console.log('updatedAccountBalance : ', updatedAccountBalance);
    console.log('netProfit : ', netProfit);
    console.log('-------------------------------------');


    
}