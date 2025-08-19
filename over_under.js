// --- Bot State ---
let initialAccountBalance = 0,
    updatedAccountBalance = 0,
    stake,
    targetProfitPerSession = 0,
    initialAmountPerTrade = 0,
    amountPercentagePerTrade = 0.1,
    targetProfitPercentagePerSession = 1,
    isTradeOpen = false,
    lastTradeId,
    totalTradeCount = 0,
    lostCountInRow = 0,
    winTradeCount = 0,
    totalProfitAmount = 0,
    lossTradeCount = 0,
    totalLossAmount = 0,
    currentProfitAmount = 0,
    currentLossAmount = 0,
    stopTimer = false;

const martingaleMultiplier = 1; // Not used, stake recovery is custom

const accounts = [
    { name: "KunkumaGP", value: "lkUxtOopvUhCpIX" },
    { name: "Kunkuma Trading", value: "YbaIy3dD51g2eoO" },
    { name: "W H K G Prasanna 85", value: "iVOpdm24hBhw3JI" },
    { name: "Zion Music 1985", value: "pfn80VW8Lexav5O" },
];

const marketArray = [
    { value: "R_10", name: "Volatility 10 Index" },
    { value: "R_25", name: "Volatility 25 Index" },
    { value: "R_50", name: "Volatility 50 Index" },
    { value: "R_75", name: "Volatility 75 Index" },
    { value: "R_100", name: "Volatility 100 Index" },
];

// --- DOM Elements ---
const accountSelectElement = document.getElementById("account_select");
const marketSelectElement = document.getElementById("market");
const resetBotButton = document.getElementById("resetBot");

let ws, apiToken;
let isRunning = false;

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

let market = "R_50";

resetBotButton.addEventListener('click', resetBot);

// --- WebSocket & Trading Logic ---
startWebSocket();

function startWebSocket(){
    ws = new WebSocket("wss://ws.binaryws.com/websockets/v3?app_id=1089");
    ws.onopen = function () {
        getAuthentication(ws, apiToken);
    };
    ws.onclose = function () {
        console.log("Connection closed");
    };
    ws.onerror = function (err) {
        console.error("WebSocket error:", err);
    };
    ws.onmessage = function (event) {
        const wsResponse = JSON.parse(event.data);
        if (!wsResponse) return;
        if (wsResponse.msg_type === "authorize") {
            if (wsResponse?.authorize?.balance !== undefined && wsResponse.authorize.balance !== null) {
                setAccData(wsResponse.authorize);
                runScriptForTrade();
            }
        }
        if (wsResponse.msg_type === "proposal") {
            tradeProposal = wsResponse;
            makeTheTrade(ws);
        }
        if (wsResponse.msg_type === "buy") {
            if (wsResponse.buy && wsResponse.buy.contract_id) {
                lastTradeId = wsResponse.buy.contract_id;
                totalTradeCount++;
                isTradeOpen = true;
                setResultNotification(lastTradeId, "Digit Over", market, wsResponse.buy.buy_price);
                updatedAccountBalance -= stake;
                updateNewAccBalance();
                setTimeout(() => { fetchTradeDetails(ws, lastTradeId); }, 500);
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
                    let timeInterval = 0;
                    if (result === "Loss") {
                        if (lostCountInRow === 1) {
                            // First loss: 60-90 seconds
                            timeInterval = getRandomNumber(60, 90) * 1000;
                        } else if (lostCountInRow >= 2) {
                            // Two losses in a row: 180-300 seconds
                            timeInterval = getRandomNumber(180, 300) * 1000;
                        }
                        setTimer(timeInterval);
                        setTimeout(() => { runScriptForTrade(); },imeInterval);
                    } else {
                        if(currentProfitAmount >= targetProfitPerSession){
                            timeInterval = getRandomNumber(300, 600) * 1000;
                            setTimer(timeInterval);
                            setTimeout(() => { reload(); }, timeInterval);
                        } else {
                            runScriptForTrade();
                        }
                    }
                } else {
                    setTimeout(() => {
                        setTickCountDown(contract.tick_count, contract.tick_stream.length);
                        fetchTradeDetails(ws, lastTradeId);
                    }, 1000);
                }
            }
        }
    }
}

function getAuthentication(ws, apiToken) {
    ws.send(JSON.stringify({ authorize: apiToken }));
}

function ensureWebSocketOpen() {
    if (!ws || ws.readyState === WebSocket.CLOSING || ws.readyState === WebSocket.CLOSED) {
        startWebSocket();
    }
}

function makeTheTrade(ws) {
    ensureWebSocketOpen();
    if (!tradeProposal?.proposal?.id) return;
    ws.send(JSON.stringify({
        buy: tradeProposal.proposal.id,
        price: tradeProposal.proposal.ask_price,
    }));
}

function fetchTradeDetails(ws, contractId) {
    ensureWebSocketOpen();
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ proposal_open_contract: 1, contract_id: contractId }));
}

function runScriptForTrade() {
    ensureWebSocketOpen();
    if (isTradeOpen) return;
    isRunning = true;
    placeOUTrade(market);
}

function placeOUTrade(market) {
    ensureWebSocketOpen();
    if (isTradeOpen) return;
    stake = Number(stake);
    if (stake < 0.35) stake = 0.35;
    ws.send(JSON.stringify({
        proposal: 1,
        amount: stake.toFixed(2),
        basis: 'stake',
        contract_type: 'DIGITOVER',
        currency: 'USD',
        duration: 1,
        duration_unit: 't',
        symbol: market,
        barrier: 2
    }));
}

// --- Stake Recovery ---
const stakeChangeForOU = (status) => {
    if (status === "Loss") {
        lostCountInRow++;
        stake = parseFloat(initialAmountPerTrade) + Math.abs(currentLossAmount);
    } else if (status === "Win") {
        lostCountInRow = 0;
        stake = parseFloat(initialAmountPerTrade);
    }
};

// --- Account & UI Helpers ---
function setAccData(accData) {
    initialAccountBalance = Number(accData.balance);
    updatedAccountBalance = initialAccountBalance;
    setAccountInfo("initialAccountBalance", `$ ${initialAccountBalance}`);
    targetProfitPerSession = (initialAccountBalance * (targetProfitPercentagePerSession / 100)).toFixed(2);
    setAccountInfo("targetProfitPerSession", `$ ${targetProfitPerSession}`);
    initialAmountPerTrade = (initialAccountBalance * (amountPercentagePerTrade / 100)).toFixed(2);
    setAccountInfo("initialAmountPerTrade", `$ ${initialAmountPerTrade}`);
    stake = initialAmountPerTrade;
}

function updateDetails(contract, lastTradeProfit) {
    if(lastTradeProfit > 0){
        winTradeCount++;
        lostCountInRow = 0;
        totalProfitAmount += lastTradeProfit;
    } else {
        lossTradeCount++;
        lostCountInRow++;
        totalLossAmount += lastTradeProfit;
    }
    currentProfitAmount += lastTradeProfit;
    currentLossAmount += lastTradeProfit;
    if(currentLossAmount >= 0){currentLossAmount = 0;}
    updatedAccountBalance = initialAccountBalance + currentProfitAmount;
    updateNewAccBalance();
    setResultNotification(lastTradeId, "Digit Over", market, contract.buy_price, lastTradeProfit);
    setAccountInfo("totalTradeCount", `${totalTradeCount}`);
    setAccountInfo("winCount", `${winTradeCount}`);
    setAccountInfo("lossCount", `${lossTradeCount}`);
    setAccountInfo("updatedAccountBalance", updatedAccountBalance > initialAccountBalance ? `<span class=\"green\">$ ${updatedAccountBalance.toFixed(2)}</span>` : `<span class=\"red\">$ ${updatedAccountBalance.toFixed(2)}</span>`);
    setAccountInfo("net_profit", updatedAccountBalance - initialAccountBalance > 0 ? `<span class=\"green\">$ ${(updatedAccountBalance - initialAccountBalance).toFixed(2)}</span>` : `<span class=\"red\">$ ${(updatedAccountBalance - initialAccountBalance).toFixed(2)}</span>`);
    setAccountInfo("currentProfitAmount", currentProfitAmount < 0 ? `<span class=\"red\">$ ${currentProfitAmount.toFixed(2)}</span>` : `<span class=\"green\">$ ${currentProfitAmount.toFixed(2)}</span>`);
    setAccountInfo("currentLossAmount", currentLossAmount < 0 ? `<span class=\"red\">$ ${currentLossAmount.toFixed(2)}</span>` : `<span class=\"green\">$ ${currentLossAmount.toFixed(2)}</span>`);
}

function setAccountInfo(elementId, message) {
    document.getElementById(elementId).innerHTML = message;
}

function setResultNotification(contractId, tradeTypeDisplay, market, stake, profit = null) {
    const marketObj = marketArray.find((item) => item.value === market);
    // const capitalizedTradeType = tradeType.charAt(0).toUpperCase() + tradeType.slice(1);

    const element = document.getElementById(contractId);

    if (element) {
        let newClassName = null;
        let status = null;

        if (profit >= 0) {
            newClassName = "green";
            status = "WIN";
        } else if (profit < 0) {
            newClassName = "red";
            status = "LOSS";
        }

        const profitElement = document.getElementById(contractId + "-profit");
        const statusElement = document.getElementById(contractId + "-status");

        if (profitElement) {
            const spanElement = profitElement.querySelector("span"); // Select the <span> inside the parent element
            if (spanElement) {
                spanElement.className = newClassName; // Set the class
                spanElement.innerHTML = profit; // Set the inner HTML
            } else {
                console.log("No <span> element found inside the parent element.");
            }
        } else {
            console.log("Parent element not found.");
        }

        if (statusElement) {
            const spanElement = statusElement.querySelector("span"); // Select the <span> inside the parent element
            if (spanElement) {
                spanElement.className = newClassName; // Set the class
                spanElement.innerHTML = status; // Set the inner HTML
            } else {
                console.log("No <span> element found inside the parent element.");
            }
        } else {
            console.log("Parent element not found.");
        }
    } else {
        console.log('marketObj : ', marketObj);
        $(".result-notification").prepend(`<span class="stake-info" id="${contractId}"><span class="detailt"><span>Contract ID : </span><span class="contract-info">${contractId}</span></span><span class="detailt"><span>Market : </span><span class="contract-info">${marketObj.name}</span></span><span class="detailt"><span>Type : </span><span class="contract-info">${tradeTypeDisplay}</span></span><span class="detailt"><span>Stake : </span><span class="contract-info">${stake}</span></span><span class="detailt"><span>Profit / Loss Amount : </span><span class="contract-info" id="${contractId}-profit"><span class="">-</span></span></span><span class="detailt"><span>Status : </span><span class="contract-info" id="${contractId}-status"><span class="">-</span></span></span></span>`);
    }
}

function setTimer(time) {
    let timeleft = time / 1000;
    if (!isRunning) { timeleft = 0; stopTimer = true; }
    let timer = setInterval(function () {
        if (timeleft <= 0) {
            clearInterval(timer);
            setFlashNotification(``, 0);
        } else if (timeleft > 0 && !stopTimer) {
            let formattedTime = formatTime(timeleft);
            setFlashNotification(`Bot will run again in <span class=\"number\">${formattedTime}</span>.`,0);
        }
        timeleft -= 1;
    }, 1000);
}

function formatTime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    let timeString = "";
    if (hours > 0) timeString += `${hours} h `;
    if (minutes > 0) timeString += `${minutes} m `;
    if (secs > 0 || timeString === "") timeString += `${secs} s`;
    return timeString.trim();
}

function reload() { location.reload(); }
function getRandomNumber(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function resetBot() { localStorage.clear(); reload(); }
function updateNewAccBalance() {
    setAccountInfo("updatedAccountBalance", updatedAccountBalance > initialAccountBalance ? `<span class=\"green\">$ ${updatedAccountBalance.toFixed(2)}</span>` : `<span class=\"red\">$ ${updatedAccountBalance.toFixed(2)}</span>`);
}
function setFlashNotification(message, timeInSeconds) {
    $(".flash-notification").html(message);
    if (timeInSeconds > 0) {
        setTimeout(() => { $(".flash-notification").html(""); }, timeInSeconds * 1000);
    }
}
function setTickCountDown(tickCount, tick) {
    if (tickCount > tick) {
        setFlashNotification(`Trade will close in <span class=\"number\">${tickCount - tick}</span> tick.`,0);
    } else if (tickCount == tick) {
        setFlashNotification(``, 0);
    }
}