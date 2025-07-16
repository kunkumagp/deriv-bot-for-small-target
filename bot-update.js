let ws, apiToken, intervalId;
let isRunning2 = false;

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

accountSelectElement.value = "YbaIy3dD51g2eoO";
marketSelectElement.value = "R_100";
apiToken = accountSelectElement.value;

accountSelectElement.addEventListener("change", () => {
    apiToken = accountSelectElement.value;
});

market = getRandomMarket(marketArray, '');

// botStart();


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

            // console.log('wsResponse : ', wsResponse);

            if (wsResponse.msg_type === "authorize") {

                console.log("Authorization successful.\n-----------------------------\n\n");
                setFlashNotification("Authorization successful", 0);



                if (wsResponse?.authorize?.balance !== undefined && wsResponse.authorize.balance !== null) {
                    
                    setAccountDetailsAndAcount(wsResponse.authorize);

                    if (Number(localStorage.currentLossAmount) != undefined && Number(localStorage.currentLossAmount) < 0) {
                        setAccountDetailsForLossRecover(wsResponse.authorize);
                    } 

                    let datTargetCapital = localStorage.getItem('datTargetCapital');

                    if (datTargetCapital > 0 && initialAccountBalance >= datTargetCapital) {
                        setFlashNotification("Day target is done", 0);
                        console.log("Day target is done");
                    } else {
                        // Run prediction and trade
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
    
                    setTimeout(() => {
                        fetchTradeDetails(ws, lastTradeId);
                    }, 500);


                }
            }


            if (wsResponse.msg_type === "proposal_open_contract") {
                if (wsResponse.proposal_open_contract.contract_id === lastTradeId) {
                    const contract = wsResponse.proposal_open_contract;

                    // console.log('contract : ', contract);

                      const secondsToExpire = contract.expiry_time - contract.current_spot_time;
                    //   console.log(`Time left to expire: ${secondsToExpire} seconds`);


                    if (contract.is_sold){
                        const profit = contract.profit;
                        const result = profit > 0 ? "Win" : "Loss";
    
                        // Add to predictor history
                        const lastDigitMatch = contract.shortcode.match(/DIGIT(\d+)/);
                        if (lastDigitMatch) {
                            const lastDigit = parseInt(lastDigitMatch[1]);
                            predictor.addTradeResult({
                                digit: lastDigit,
                                outcome: profit > 0 ? tradeTypeDisplay.toLowerCase() : 
                                        (tradeTypeDisplay.toLowerCase() === 'even' ? 'odd' : 'even'),
                                duration: contract.duration,
                                profit: profit,
                                timestamp: Date.now()
                            });
                        }
    
                        setInfo(contract, profit);
                        stakeChange(result);
                        isTradeOpen = false;

                        if(profit < 0){
                            lostCountInRow = lostCountInRow + 1;
                        }

                        if (currentLossAmount < 0) {
                            // runPrediction();

                            localStorage.setItem("currentLossAmount", currentLossAmount);
                            localStorage.setItem("lossTradeCount", lossTradeCount);

                            // let newTime = (getRandomNumber(10, 15) * 60000 );
                            let newTime = (getRandomNumber(1, 5) * 1000 );
                            setTimer(newTime);
                            setTimeout(() => {
                                runPrediction();
                            }, newTime);

                        } else {
                            localStorage.removeItem("currentLossAmount");
                            localStorage.removeItem("lossTradeCount");
                            
                            if (currentProfitAmount >= targetAmount) {
                                let newTime = (getRandomNumber(1, 5) * 1000 );
                                // let newTime = (getRandomNumber(50, 70) * 60000 );
                                setTimer(newTime);
                                setTimeout(() => {
                                    reserParams();
                                    startWebSocket();
                                }, newTime);
                            } else {
                                runPrediction();
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