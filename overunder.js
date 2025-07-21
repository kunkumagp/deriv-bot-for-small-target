let ws, apiToken, intervalId;
let isRunning2 = false;
let decimalCount;

const marketArray2 = [
    { value: "R_10", name: "Volatility 10 Index" },
    // { value: "R_25", name: "Volatility 25 Index" },
    // { value: "R_50", name: "Volatility 50 Index" },
    // { value: "R_75", name: "Volatility 75 Index" },
    { value: "R_100", name: "Volatility 100 Index" },
];

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

marketArray2.forEach((item) => {
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

market = getRandomMarket(marketArray2, '');

botStart();


startBotButton.addEventListener('click', botStart);
resetBotButton.addEventListener('click', resetBot);

function botStart() {
    if (isRunning2) {
        // Stop the loop and close the WebSocket
        webSocketConnectionStop();
    } else {
        // Start the loop and open the WebSocket
        webSocketConnectionStart();
    }
}


function webSocketConnectionStart(){
    isRunning2 = true;
    console.log('WebSocket connection started.');
    setFlashNotification("WebSocket connection started", 0);
    startBotButton.innerHTML = "Script running....Stop WebSocket";
    startWebSocket()
    
};

function webSocketConnectionStop(){
    isRunning2 = false;
    clearInterval(intervalId); // Stop the interval loop
    weClose();
    console.log('WebSocket connection stopped.');
    setFlashNotification("WebSocket connection stopped", 0);
    startBotButton.innerHTML = "Start WebSocket";
};



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


            if (wsResponse.msg_type === "authorize") {
                console.log("Authorization successful.\n-----------------------------\n\n");
                setFlashNotification("Authorization successful", 0);



                if (wsResponse?.authorize?.balance !== undefined && wsResponse.authorize.balance !== null) {
                    
                    setAccountDetailsAndAcount(wsResponse.authorize, 2);

                    console.log("Start Analizing");
                    setFlashNotification("Start Analizing", 0);

                    requestTicksHistory(ws, market);
                    placeOverUnderTrade(stake); 
                    setTimeout(() => {
                        startTicks(ws, market);
                    }, 3000);

                } else if (wsResponse?.error?.code !== undefined && wsResponse.error.code === "WrongResponse") {
                    reload();
                }
            }

            if (wsResponse.msg_type === "history") {
                decimalCount = getMaxDecimalPlaces(wsResponse.history.prices);
                console.log('Decimal Count - ', decimalCount);

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
                }
            }

            if (wsResponse.msg_type === "tick") {
                let currentTick = parseFloat(wsResponse.tick.quote);

                // Check if the response contains the subscription ID
                if (wsResponse.subscription && wsResponse.subscription.id) {
                    subscriptionId = wsResponse.subscription.id; // Store the subscription ID
                    // console.log("Subscribed with ID:", subscriptionId);
                }

                let tickArrayCount;

                // if(lostCountInRow == 2){
                //     tickArrayCount = 3;
                // } else if(lostCountInRow == 1){
                //     tickArrayCount = 2;
                // } else if(currentLossAmount <= 0){
                //     tickArrayCount = 1;
                // }

                if(currentLossAmount < 0){
                    tickArrayCount = 2;
                } else {
                    tickArrayCount = 1;
                }

                storeTickData(currentTick, tickArrayCount);

                let tradeStatus = areLastDigitsUnderOrEqualTwo(tickHistory, tickArrayCount, decimalCount);
                console.log('tradeStatus - ',tradeStatus);

                if(tradeStatus){
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
                    stopTicks(ws);
    
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


                        setInfo(contract, profit);
                        // stakeChange(result, 3);
                        isTradeOpen = false;

                        if(profit < 0){
                            lostCountInRow = lostCountInRow + 1;
                        } else {
                            lostCountInRow = 0;

                            if(winTradeCount >= 10){
                                reload();
                            }
                        }

                        

                        if (currentLossAmount < 0) {

                            let timer = 0;
                            if(lostCountInRow >= 2){
                                timer = (getRandomNumber(1, 10) * 1000 );
                                stake = amountPutForTrading * 11;

                            } else if(lostCountInRow == 1){
                                timer = (getRandomNumber(1, 5) * 1000 );
                                stake = amountPutForTrading * 3;

                            }
                            placeOverUnderTrade(stake); 

                            setTimeout(() => {
                                startTicks(ws, market);
                            }, timer);

                        } else {
                            // stake = amountPutForTrading;
                            stake = (updatedAccountBalance * (2 / 100)).toFixed(2);

                            placeOverUnderTrade(stake); 
                            tickHistory = [];
                            // checkBalance();
                            startTicks(ws, market);
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

    const placeOverUnderTrade = (stake) => {
        newStake = Number(stake);
        const tradeRequest = {
            proposal: 1,
            amount: newStake.toFixed(2),
            basis: 'stake',
            contract_type: 'DIGITOVER',
            currency: 'USD',
            duration: 1,
            duration_unit: 't',
            symbol: market,
            barrier: 2
        };

        // Send the trade request to the WebSocket
        console.log('Sending Rise/Fall trade request:', tradeRequest);
        ws.send(JSON.stringify(tradeRequest));
    };


}

function newStake() {
    stake = (updatedAccountBalance * (amountPercentage / 100)).toFixed(2);
}


