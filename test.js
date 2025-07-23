const market = 'frxEURUSD';
const apiToken = 'lkUxtOopvUhCpIX';

let predictedParity, actualNumber, previousNumber, subscriptionId;

const ws = new WebSocket("wss://ws.binaryws.com/websockets/v3?app_id=1089");

ws.onopen = function () {
    console.log("Connection open");
    getAuthentication(apiToken);
};

ws.onclose = function () {
    console.log("Connection closed");
    console.log("-----------------------------\n");
};

ws.onerror = function (err) {
    console.error("WebSocket error:", err);
};

ws.onmessage = function (event) {
    const wsResponse = JSON.parse(event.data);

    if (wsResponse != null) {
        if (wsResponse.msg_type === "authorize") {
            console.log("Authorization successful.\n-----------------------------\n");

            if (wsResponse?.authorize?.balance !== undefined && wsResponse.authorize.balance !== null) {
                requestTicksHistory(market);
            }
        }

        if (wsResponse.msg_type === "history") {
            const prices = wsResponse.history.prices;
            predictedParity = predictNextParity(prices);
            console.log("Predicted next last digit will be:", predictedParity);
            // startTicks(market);

            placeTrade();
        }

        if (wsResponse.msg_type === "tick") {
            if (wsResponse.subscription && wsResponse.subscription.id) {
                subscriptionId = wsResponse.subscription.id;
            }

            actualNumber = parseFloat(wsResponse.tick.quote);
            const lastDigit = getLastDigit(actualNumber);
            const actualParity = isEven(lastDigit) ? "even" : "odd";

            console.log("Current tick:", actualNumber);
            console.log("Last digit:", lastDigit);
            console.log("Actual parity:", actualParity);

            if (predictedParity === actualParity) {
                console.log("✅ Prediction is CORRECT");
            } else {
                console.log("❌ Prediction is WRONG");
            }

            stopTicks();

            setTimeout(() => {
                requestTicksHistory(market);
            }, 1000);
        }

        if (wsResponse.msg_type === "buy") {
            console.log("Trade Successful:", wsResponse);
        }
    }
};




function placeTrade() {
    const tradeRequest = {
        buy: 1,
        price: 1,
        parameters: {
            amount: 1,
            basis: "stake",
            contract_type: "CALL", // or "PUT"
            currency: "USD",
            duration: 15,
            duration_unit: "m",  // 5 minutes — known to work
            symbol: "frxEURUSD"
        }
    };

    console.log("Placing CALL contract on frxEURUSD for 5 minutes");
    ws.send(JSON.stringify(tradeRequest));
}




// Authenticate user
const getAuthentication = (apiToken) => {
    console.log("Authenticating....");
    ws.send(JSON.stringify({ authorize: apiToken }));
};

// Request tick history
const requestTicksHistory = (symbol) => {
    const ticksHistoryRequest = {
        ticks_history: symbol,
        end: 'latest',
        count: 100, // still fetch 100, we’ll use only last 20
        style: 'ticks'
    };
    ws.send(JSON.stringify(ticksHistoryRequest));
};

// Predict even/odd of the next last digit using only recent 20 digits
function predictNextParity(data) {
    const recentTicks = data.slice(-20); // Use last 20 prices
    const lastDigits = recentTicks.map(getLastDigit);

    const evenCount = lastDigits.filter(d => d % 2 === 0).length;
    const oddCount = lastDigits.length - evenCount;

    console.log("Even count (last 20):", evenCount);
    console.log("Odd count (last 20):", oddCount);

    const total = evenCount + oddCount;
    const evenRatio = evenCount / total;
    const oddRatio = oddCount / total;

    // If parity difference is very close (less than 5%), randomly pick
    if (Math.abs(evenRatio - oddRatio) < 0.05) {
        const randomGuess = Math.random() < 0.5 ? "even" : "odd";
        console.log("⚠ Close distribution — Random guess:", randomGuess);
        return randomGuess;
    }

    return evenCount > oddCount ? "even" : "odd";
}

// Extract the second digit after decimal
function getLastDigit(num) {
    const parts = num.toString().split(".");
    let decimalPart = parts[1] || "00";

    if (decimalPart.length === 1) {
        decimalPart += "0"; // e.g., .6 → .60
    }

    return parseInt(decimalPart[1], 10);
}

// Check if digit is even
function isEven(digit) {
    return digit % 2 === 0;
}

// Subscribe to live ticks
const startTicks = (market) => {
    ws.send(JSON.stringify({
        ticks: market,
        subscribe: 1,
    }));
};

// Unsubscribe
const stopTicks = () => {
    if (subscriptionId) {
        ws.send(JSON.stringify({
            forget: subscriptionId,
        }));
    }
};

