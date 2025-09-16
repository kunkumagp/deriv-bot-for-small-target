const accountSelectElement = document.getElementById("account_select");


let ws,
    tickSubscriptionId = null,
    amountPercentagePerTrade = 0.1,
    tradeInProgress = false,
    evenTradeProposal,
    oddTradeProposal,
    overUnderTradeProposal,
    oddBuyRequest,
    evenBuyRequest,
    overUnderBuyRequest,
    analyzingHistoryData = false,
    historyDataCount = 10,
    martingaleMultiplier = 2.8,
    isRunning = false,
    lostRecoveryMode = false,
    timeInterval = 1000;

accounts.forEach((item) => {
    const option = document.createElement("option");
    option.value = item.value;
    option.textContent = item.name;
    accountSelectElement.appendChild(option);
});

accountSelectElement.value = "lkUxtOopvUhCpIX";
apiToken = accountSelectElement.value;

// ====== WEB SOCKET FUNCTIONS ====== //

startWebSocketConnection();

function startWebSocketConnection() {
    ws = new WebSocket("wss://ws.binaryws.com/websockets/v3?app_id=1089");

    ws.onopen = function () {
        const wsMessage = "Connection open";
        setFlashNotification(wsMessage, 0);
        console.log(wsMessage);
        startPing(ws);
        getAuthentication(ws, apiToken);
    };

    ws.onclose = function () {
        const wsMessage = "Connection closed";
        setFlashNotification(wsMessage, 0);
        console.log(wsMessage);
        console.log("-----------------------------\n");
        stopPing();

        setTimeout(() => {
            startPing(ws);
        }, 10000);
    };

    ws.onerror = function (err) {
        const wsMessage = "Connection error : ";
        setFlashNotification(wsMessage, 0);
        console.error(wsMessage, err);
    };


    ws.onmessage = function (event) {

        const wsResponse = JSON.parse(event.data);
        if (!wsResponse) return;
        console.log('wsResponse : ', wsResponse);

        if (!wsResponse.error) {

            // Store subscription ID when we first get it
            if (wsResponse.msg_type === "tick" && wsResponse.subscription && !tickSubscriptionId) {
                tickSubscriptionId = wsResponse.subscription.id;
                console.log("✅ Tick subscription started:", tickSubscriptionId);
            }

            switch (wsResponse.msg_type) {
                case "authorize":
                    const logMessage = "Authorization successful.";
                    console.log(logMessage);
                    setFlashNotification(logMessage, 0);

                    if (wsResponse?.authorize?.balance !== undefined) {
                        const balanceMessage = `Your balance is: ${wsResponse.authorize.balance}`;
                        console.log(balanceMessage);
                        setFlashNotification(balanceMessage, 0);
                        setAccData(wsResponse.authorize);
                        market = getRandomMarket(marketArray, '');
                        // subscribeTicks(market);
                        processProposals();
                    }
                    break;

                case "tick":
                    break;

                case "proposal":

                    isRunning = false;

                    if (wsResponse.echo_req.contract_type == "DIGITODD") {
                        if (wsResponse.proposal == undefined || wsResponse.proposal.id == undefined) {
                            console.log("proposan is not valied!");
                        } else {
                            oddTradeProposal = wsResponse;
                            oddBuyRequest = {
                                buy: oddTradeProposal.proposal.id,
                                price: oddTradeProposal.proposal.ask_price,
                            };
                            // ws.send(JSON.stringify(oddBuyRequest));

                        }
                    }
                    if (wsResponse.echo_req.contract_type == "DIGITEVEN") {

                        if (wsResponse.proposal == undefined || wsResponse.proposal.id == undefined) {
                            console.log("proposan is not valied!");
                        } else {
                            evenTradeProposal = wsResponse;
                            evenBuyRequest = {
                                buy: evenTradeProposal.proposal.id,
                                price: evenTradeProposal.proposal.ask_price,
                            };
                            // ws.send(JSON.stringify(evenBuyRequest));
                        }
                    }

                    if (wsResponse.echo_req.contract_type == "DIGITOVER") {
                        if (wsResponse.proposal == undefined || wsResponse.proposal.id == undefined) {
                            console.log("proposan is not valied!");
                        } else {
                            lostRecoveryMode = true;
                            overUnderTradeProposal = wsResponse;
                            overUnderBuyRequest = {
                                buy: overUnderTradeProposal.proposal.id,
                                price: overUnderTradeProposal.proposal.ask_price,
                            };
                            // ws.send(JSON.stringify(evenBuyRequest));
                        }

                    }

                    // ✅ Call history only once, after both proposals received
                    if ((oddTradeProposal && evenTradeProposal) || overUnderTradeProposal) {
                        setTimer(1000);
                        setTimeout(() => {
                            getHistoryData(historyDataCount);
                        }, 1000);
                    } 

                    break;

                case "history":
                    console.log(123);

                    const lastDigitsNumbers = getLastDigits(wsResponse.history.prices);
                    console.log('Last Digits Numbers: ', lastDigitsNumbers);

                    const digitPercentages = getDigitPercentages(lastDigitsNumbers);
                    console.log('Digit Percentages: ', digitPercentages);


                    const predictionByPercentage = predictEvenOddByPercentages(digitPercentages);
                    console.log('Prediction By Percentage: ', predictionByPercentage);

                    const prediction = analyzeDigits(lastDigitsNumbers);
                    console.log('Prediction: ', prediction);

                    if(lostRecoveryMode){
                        const lastDigit = lastDigitsNumbers.slice(-1);
                        if(lastDigit[0] > 1){
                            tradeTypeDisplay = "DIGITOVER";
                            ws.send(JSON.stringify(overUnderBuyRequest));
                        } else {
                            setTimer(1000);
                            setTimeout(() => {
                                getHistoryData(historyDataCount); // retry after short delay
                            }, 1000);
                        }
                    } else {
                        if (predictionByPercentage.probability >= 52) {
                            if (predictionByPercentage.prediction == "Even") {
                                tradeTypeDisplay = "EVEN";
                                ws.send(JSON.stringify(evenBuyRequest));
                            } else if (predictionByPercentage.prediction == "Odd") {
                                tradeTypeDisplay = "ODD";
                                ws.send(JSON.stringify(oddBuyRequest));
                            }
                            setFlashNotification("Placing a trade", 0);
                        } else {
                            setTimer(1000);
                            setTimeout(() => {
                                getHistoryData(historyDataCount); // retry after short delay
                            }, 1000);
                        }
                    }

                    break;

                case "buy":

                    if (
                        wsResponse.buy == undefined ||
                        wsResponse.buy.contract_id == undefined
                    ) {
                        // placeTrade();
                    } else {
                        analyzingHistoryData = false;
                        lastTradeId = wsResponse.buy.contract_id;
                        totalTradeCount = totalTradeCount + 1;
                        isTradeOpen = true;
                        setResultNotification(
                            lastTradeId,
                            tradeTypeDisplay,
                            market,
                            wsResponse.buy.buy_price
                        );

                        console.log("Trade Successful:", wsResponse);
                        updatedAccountBalance = updatedAccountBalance - stake;
                        updateNewAccBalance();
                        // isRunning = true;
                        setTimer(500);
                        setTimeout(() => {
                            fetchTradeDetails(ws, lastTradeId);
                        }, 500);
                    }

                    break;

                case "proposal_open_contract":
                    if (wsResponse.proposal_open_contract.contract_id === lastTradeId) {
                        const contract = wsResponse.proposal_open_contract;
                        if (contract.is_sold) {

                            const profit = contract.profit;
                            const result = profit > 0 ? "Win" : "Loss";
                            updateDetails(contract, profit);
                            // applyMartingale(profit);

                            // stakeChangeForOU(result);
                            isTradeOpen = false;

                            evenTradeProposal = null;
                            oddTradeProposal = null;
                            evenBuyRequest = null;
                            oddBuyRequest = null;

                            if (currentLossAmount < 0) {
                                market = getRandomMarket(marketArray, market);
                                localStorage.setItem("totalLostAmount",currentLossAmount );


                                const nextStake = calculateMartingale(currentLossAmount, 1, "over");

                                // // console.log("Next stake:", nextStake);
                                console.log("Next stake:", Math.abs(nextStake.toFixed(2)));
                                if (result == "Loss") {
                                    stake = Math.abs(nextStake.toFixed(2));
                                } 

                                timeInterval = (getRandomNumber(20, 60) * 1000 );
                                setTimer(timeInterval);
                                setTimeout(() => {
                                    overUnderTrade(stake, 1)
                                }, timeInterval);

                                // if(lostCountInRow >= 2){
                                //     timeInterval = (getRandomNumber(20, 60) * 1000 );
                                //     setTimer(timeInterval);
                                //     setTimeout(() => {
                                //         overUnderTrade(stake, 1)
                                //     }, timeInterval);
                                // } else {
                                //     overUnderTrade(stake, 1)
                                // }
                                
                                
                            } else {
                                lostRecoveryMode = false;
                                if(updatedAccountBalance >= Number(localStorage.getItem('targetAccountBalancePerToday'))){
                                    const wsMessage = "Day target is completed!";
                                    setFlashNotification(wsMessage, 0);
                                    console.log(wsMessage);
                                } else {
                                    stake = initialAmountPerTrade;
                                    setTimer(1000);
                                    setTimeout(() => {
                                        processProposals();
                                    }, 1000);
                                }
                            }
                            
                        } else {
                            setTimer(1000);
                            setTimeout(() => {
                                setTickCountDown(
                                    contract.tick_count,
                                    contract.tick_stream.length
                                );
                                fetchTradeDetails(ws, lastTradeId);
                            }, 1000);
                        }
                    }
                    break;

                case "error":
                    break;

                default:
                    if (wsResponse.msg_type == "ping") {
                        console.log("Waiting....");
                    }
            }


        }

    }

}




// ====== GLOBAL FUNCTION ====== //
function setAccData(accData) {

    console.log('Account Data: ', accData);
    // Set Initial Account Balance

    let accountBalance = (Number(accData.balance) - 400);

    initialAccountBalance = accountBalance;
    setAccountInfo("initialAccountBalance", `$ ${initialAccountBalance.toFixed(2)}`);
    localStorage.setItem('initialAccountBalance', initialAccountBalance);

    // Set Updated Account Balance
    updatedAccountBalance = accountBalance;
    setAccountInfo("updatedAccountBalance", `$ ${updatedAccountBalance.toFixed(2)}`);

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
        console.log('Recovered lost amount after reload. New stake:', stake);
    } else {
        stake = initialAmountPerTrade;
    }

    setDayTarget();


}

function setDayTarget() {
    let targetAccountBalancePerToday = localStorage.getItem('targetAccountBalancePerToday');
    let date = localStorage.getItem('date');
    const today = new Date();
    const formatted = today.toISOString().split("T")[0];


    if (!targetAccountBalancePerToday && formatted !== date) {
        localStorage.setItem('targetAccountBalancePerToday', (initialAccountBalance * 2));
        localStorage.setItem('date', formatted);
    }
}


function processProposals() {

    if (!ws || ws.readyState !== WebSocket.OPEN) {
        console.log("⚠️ WebSocket is not open. Cannot place trade.");
        return;
    }

    if (tradeInProgress) {
        console.log("⚠️ Trade already in progress. Skipping new trade.");
        return;
    }

    stake = Number(stake);
    stake < 0.35 ? (stake = 0.35) : (stake = stake);

    let tickCount = 1;

    evenTrade(stake, tickCount);
    oddTrade(stake, tickCount);

}

function evenTrade(amount, ticks) {

    const evenProposal = {
        proposal: 1,
        amount: amount.toFixed(2),       // your stake
        basis: "stake",                 // basis type
        contract_type: "DIGITEVEN",     // DIGITEVEN or DIGITODD
        currency: "USD",                // change if needed
        duration: ticks,            // 1 tick contract
        duration_unit: "t",
        symbol: market                  // the market symbol (e.g., "R_100")
    };

    console.log(`📤 Sending proposal: 'EVEN' with stake $${amount.toFixed(2)} on ${market}`);
    ws.send(JSON.stringify(evenProposal));

}
function oddTrade(amount, ticks) {

    const oddProposal = {
        proposal: 1,
        amount: amount.toFixed(2),       // your stake
        basis: "stake",                 // basis type
        contract_type: "DIGITODD",     // DIGITEVEN or DIGITODD
        currency: "USD",                // change if needed
        duration: ticks,            // 1 tick contract
        duration_unit: "t",
        symbol: market                  // the market symbol (e.g., "R_100")
    };

    console.log(`📤 Sending proposal: 'ODD' with stake $${amount.toFixed(2)} on ${market}`);
    ws.send(JSON.stringify(oddProposal));

}

function overUnderTrade(amount, ticks) {

    amount = Number(amount);
    amount < 0.35 ? (amount = 0.35) : (amount = amount);

    const overUnderProposal = {
        proposal: 1,
        amount: amount.toFixed(2),
        basis: 'stake',
        contract_type: 'DIGITOVER',
        currency: 'USD',
        duration: 1,
        duration_unit: 't',
        symbol: market,
        barrier: 1
    };

    console.log(`📤 Sending proposal: 'DIGITOVER' with stake $${amount.toFixed(2)} on ${market}`);
    ws.send(JSON.stringify(overUnderProposal));

}


function getHistoryData(count) {
    analyzingHistoryData = true;
    // isRunning = true;

    // ✅ Step 1: Request last 100 ticks before trading
    ws.send(JSON.stringify({
        ticks_history: market,
        end: "latest",
        count: count,
        style: "ticks"
    }));
}

function applyMartingale(profit) {
    if (profit < 0) {
        stake = stake * martingaleMultiplier;
    } else {
        stake = initialAmountPerTrade;
    }
}


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