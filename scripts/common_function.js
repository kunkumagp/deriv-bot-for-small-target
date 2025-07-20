let initialAccountBalance = 0,
    updatedAccountBalance = 0,
    newAccountBalance,
    amountPutForTrading,
    stake,
    targetAmount,
    dayTargetPercentage = 5,
    amountPercentage = 0.35,
    targetPercentage = 0.1,
    isTradeOpen = false,
    tradeProposal,
    lastTradeId,
    totalTradeCount = 0,
    tradeTypeDisplay,
    lostCountInRow = 0,
    winTradeCount = 0,
    totalProfitAmount = 0,
    lossTradeCount = 0,
    totalLossAmount = 0,
    currentProfitAmount = 0,
    currentLossAmount = 0,
    tradeType = "even",
    stopTimer = false,
    tickHistory = [],
    ldp = 2,
    isRunning = false
    ;

const now = new Date();

let martingaleMultiplier1 = 2.07112,
    martingaleMultiplier2 = 1.3;

const accounts = [
    { name: "KunkumaGP", value: "lkUxtOopvUhCpIX" },
    // { name: "KUNKUMAGP Real", value: "Y71P0GIOxz3YYvr" },
    { name: "Kunkuma Trading", value: "YbaIy3dD51g2eoO" },
    { name: "W H K G Prasanna 85", value: "iVOpdm24hBhw3JI" },
];

const marketArray = [
    { value: "R_10", name: "Volatility 10 Index" },
    { value: "R_25", name: "Volatility 25 Index" },
    { value: "R_50", name: "Volatility 50 Index" },
    { value: "R_75", name: "Volatility 75 Index" },
    { value: "R_100", name: "Volatility 100 Index" },
];

const getAuthentication = (ws, apiToken) => {
    setFlashNotification("Authenticating....", 0);
    console.log("Authenticating....");
    ws.send(JSON.stringify({ authorize: apiToken }));
};


const makeTheTrade = (ws) => {
    if (
        tradeProposal.proposal == undefined ||
        tradeProposal.proposal.id == undefined
    ) {
        isRunning = false;
        // webSocketConnectionStart();
    } else {
        let buyRequest = {
            buy: tradeProposal.proposal.id,
            price: tradeProposal.proposal.ask_price,
        };
        ws.send(JSON.stringify(buyRequest));
    }
};

const fetchTradeDetails = (ws, contractId) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        console.error("WebSocket is not open.");
        return;
    }

    const contractDetailsRequest = {
        proposal_open_contract: 1,
        contract_id: contractId,
    };

    ws.send(JSON.stringify(contractDetailsRequest));
};


const stakeChange = (status,customMartingaleMultiplier = null) => {
    if(customMartingaleMultiplier != null){
        martingaleMultiplier1 = customMartingaleMultiplier;
    }

    if (status == "Loss") {
        stake = stake * martingaleMultiplier1;
    } else if (status == "Win") {
        stake = amountPutForTrading;
    }
    console.log('status : ', status);
    console.log('stake : ',stake);

};

const requestTicksHistory = (ws, symbol) => {
    const ticksHistoryRequest = {
        ticks_history: symbol,
        end: 'latest',
        count: 2, // Increased count for a larger dataset (more ticks for better prediction)
        style: 'ticks'
    };
    ws.send(JSON.stringify(ticksHistoryRequest));
};

const startTicks = (ws, market) => {
    // signalMessage('Start ticking...');

    ws.send(JSON.stringify({
        ticks: market,
        subscribe: 1,
    }));
};

const stopTicks = (ws) => {
    ws.send(JSON.stringify({
        forget: subscriptionId, // Use the stored subscription ID
    }));
};


function setAccountDetailsAndAcount(account, customAmountPercentage = null ) {
    initialAccountBalance = Number(account.balance);
    newAccountBalance = initialAccountBalance;
    setAccountInfo("initialAccountBalance", `$ ${initialAccountBalance}`);

    targetAmount = (initialAccountBalance * (targetPercentage / 100)).toFixed(2);
    setAccountInfo("targetAmount", `$ ${targetAmount}`);

    if(customAmountPercentage != null){
        amountPercentage = customAmountPercentage;
    }

    amountPutForTrading = (initialAccountBalance * (amountPercentage / 100)).toFixed(2);
    setAccountInfo("amountPutForTrading", `$ ${amountPutForTrading}`);

    if(localStorage.getItem('date')){
        if(localStorage.getItem('date') != now.toLocaleDateString()){
            localStorage.setItem('date', now.toLocaleDateString());
            let datTargetAmount = (initialAccountBalance * (dayTargetPercentage / 100));
            localStorage.setItem('datTargetAmount', datTargetAmount);
            localStorage.setItem('datTargetCapital', (initialAccountBalance + datTargetAmount));
        }
    } else {
        localStorage.setItem('date', now.toLocaleDateString());
        let datTargetAmount = (initialAccountBalance * (dayTargetPercentage / 100));
        localStorage.setItem('datTargetAmount', datTargetAmount);
        localStorage.setItem('datTargetCapital', (initialAccountBalance + datTargetAmount));
    }


    if (Number(localStorage.currentLossAmount) != undefined && Number(localStorage.currentLossAmount) < 0) {
        stake = Math.abs(Number(localStorage.currentLossAmount)) * martingaleMultiplier2;
    } else {
        stake = amountPutForTrading;
    }

}


function setAccountDetailsForLossRecover(account) {
    if (Number(localStorage.currentLossAmount) != undefined && Number(localStorage.currentLossAmount) > 0) {
        stake = Math.abs(Number(localStorage.currentLossAmount)) * martingaleMultiplier2;
    } else {
        stake = amountPutForTrading;
    }

}

function placeTrade(prediction = null, duration = null) {
    if (isTradeOpen == false) {
        let tradeState;
        let tickCount = duration || getRandomNumber(5, 8);

        if (prediction != null) {
            if (prediction == "even") {
                tradeState = "DIGITEVEN";
            } else if (prediction == "odd") {
                tradeState = "DIGITODD";
            }
        } else {
            if (tradeType == "even") {
                tradeState = "DIGITEVEN";
                tradeType = "odd";
            } else if (tradeType == "odd") {
                tradeState = "DIGITODD";
                tradeType = "even";
            }
        }

        stake = Number(stake);
        stake < 0.35 ? (stake = 0.35) : (stake = stake);

        const tradeRequest = {
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

function runScript(prediction) {
    isRunning = true;
    placeTrade(prediction.prediction, prediction.duration);
}

// Improved EvenOddPredictor class with dynamic strategy weighting, confidence refinement,
// agreement boost, and post-trade performance tracking

class EvenOddPredictor {
    constructor() {
        this.history = [];
        this.patternLength = 5;
        this.minHistoryForPrediction = 20;
        this.maxDuration = 8;
        this.minDuration = 5;

        this.strategyStats = {
            "Basic Last Digit Analysis": { wins: 0, total: 0 },
            "Weighted Moving Average": { wins: 0, total: 0 },
            "Pattern Recognition": { wins: 0, total: 0 },
            "Machine Learning Simulation": { wins: 0, total: 0 }
        };
    }

    addTradeResult(tradeResult) {
        this.history.push(tradeResult);
        if (this.history.length > 500) {
            this.history.shift();
        }

        // Update strategy stats
        if (tradeResult.predictedBy) {
            tradeResult.predictedBy.forEach(pred => {
                this.updateStrategyStats(pred.strategy, pred.prediction === tradeResult.outcome);
            });
        }
    }

    updateStrategyStats(strategyName, wasCorrect) {
        if (!this.strategyStats[strategyName]) return;
        this.strategyStats[strategyName].total += 1;
        if (wasCorrect) this.strategyStats[strategyName].wins += 1;
    }

    getDynamicWeight(strategyName) {
        const stats = this.strategyStats[strategyName];
        if (!stats || stats.total === 0) return 0.25; // fallback
        return Math.max(stats.wins / stats.total, 0.1); // Avoid zero weight
    }

    async predictNext() {
        if (this.history.length < this.minHistoryForPrediction) {
            console.log("Insufficient data for prediction");
            return {
                prediction: Math.random() > 0.5 ? "even" : "odd",
                confidence: 0.5,
                duration: this.getRandomDuration(),
                message: "Using random prediction (insufficient data)"
            };
        }

        const basicPrediction = this.basicLastDigitAnalysis();
        const wmaPrediction = this.weightedMovingAverageStrategy();
        const patternPrediction = this.patternRecognition();
        const mlPrediction = await this.machineLearningPrediction();

        const predictions = [basicPrediction, wmaPrediction, patternPrediction, mlPrediction];

        let evenScore = 0;
        let oddScore = 0;
        let totalWeight = 0;

        predictions.forEach(pred => {
            const weight = this.getDynamicWeight(pred.strategy);
            if (pred.prediction === "even") {
                evenScore += pred.confidence * weight;
            } else {
                oddScore += pred.confidence * weight;
            }
            totalWeight += weight;
        });

        const finalPrediction = evenScore > oddScore ? "even" : "odd";
        let confidence = (finalPrediction === "even" ? evenScore : oddScore) / totalWeight;

        const agreementCount = predictions.filter(p => p.prediction === finalPrediction).length;
        if (agreementCount >= 3) confidence = Math.min(confidence + 0.1, 0.95);

        const duration = this.calculateOptimalDuration(finalPrediction);

        return {
            prediction: finalPrediction,
            confidence: confidence,
            duration: duration,
            strategies: predictions,
            message: "Combined prediction from multiple strategies"
        };
    }

    basicLastDigitAnalysis() {
        const lastDigits = this.history.map(t => t.digit);
        const digitCounts = Array(10).fill(0);
        lastDigits.forEach(digit => digitCounts[digit]++);

        let mostFrequentDigit = digitCounts.indexOf(Math.max(...digitCounts));
        const prediction = mostFrequentDigit % 2 === 0 ? "even" : "odd";
        const confidence = Math.min(0.5 + (digitCounts[mostFrequentDigit] / this.history.length) * 0.3, 0.85);

        return {
            strategy: "Basic Last Digit Analysis",
            prediction,
            confidence,
            digitStats: digitCounts
        };
    }

    weightedMovingAverageStrategy() {
        const weightedHistory = this.history.map((item, index) => {
            const weight = (index + 1) / this.history.length;
            return { ...item, weight };
        });

        let evenScore = 0;
        let oddScore = 0;
        let totalWeight = 0;

        weightedHistory.forEach(item => {
            if (item.outcome === "even") evenScore += item.weight;
            else oddScore += item.weight;
            totalWeight += item.weight;
        });

        const prediction = evenScore > oddScore ? "even" : "odd";
        const confidence = Math.max(0.5, (prediction === "even" ? evenScore : oddScore) / totalWeight);

        return {
            strategy: "Weighted Moving Average",
            prediction,
            confidence,
            recentBias: (evenScore - oddScore) / totalWeight
        };
    }

    patternRecognition() {
        const recentPattern = this.history.slice(-this.patternLength).map(t => t.outcome);
        let patternCount = 0;
        let patternMatchEven = 0;
        let patternMatchOdd = 0;

        for (let i = 0; i < this.history.length - this.patternLength; i++) {
            let match = true;
            for (let j = 0; j < this.patternLength; j++) {
                if (this.history[i + j].outcome !== recentPattern[j]) {
                    match = false;
                    break;
                }
            }
            if (match) {
                patternCount++;
                const next = this.history[i + this.patternLength].outcome;
                if (next === "even") patternMatchEven++;
                else patternMatchOdd++;
            }
        }

        if (patternCount > 0) {
            let confidence = Math.max(patternMatchEven, patternMatchOdd) / patternCount;
            if (patternCount > 10) confidence += 0.1;
            return {
                strategy: "Pattern Recognition",
                prediction: patternMatchEven > patternMatchOdd ? "even" : "odd",
                confidence: Math.min(confidence, 0.95),
                patternMatches: patternCount
            };
        }

        return this.basicLastDigitAnalysis();
    }

    async machineLearningPrediction() {
        const lastOutcome = this.history[this.history.length - 1].outcome;
        const secondLastOutcome = this.history.length > 1 ? this.history[this.history.length - 2].outcome : lastOutcome;

        let prediction;
        let confidence;

        if (lastOutcome === secondLastOutcome) {
            prediction = lastOutcome === "even" ? "odd" : "even";
            confidence = 0.65;
        } else {
            prediction = lastOutcome;
            confidence = 0.55;
        }

        return {
            strategy: "Machine Learning Simulation",
            prediction,
            confidence,
            analysis: "State-based prediction"
        };
    }

    calculateOptimalDuration(prediction) {
        const successfulTrades = this.history.filter(t => t.outcome === prediction && t.profit > 0);
        if (successfulTrades.length === 0) return this.getRandomDuration();

        const avgDuration = successfulTrades.reduce((sum, t) => sum + t.duration, 0) / successfulTrades.length;
        return Math.min(this.maxDuration, Math.max(this.minDuration, Math.round(avgDuration)));
    }

    getRandomDuration() {
        return Math.floor(Math.random() * (this.maxDuration - this.minDuration + 1)) + this.minDuration;
    }
}

const predictor = new EvenOddPredictor();



async function runPredictionAndTrade() {
    try {
        const prediction = await predictor.predictNext();
        console.log("Prediction Result:", prediction);
        runScript(prediction);
        return prediction;
    } catch (error) {
        console.error("Prediction error:", error);
        placeTrade();
        return null;
    }
}


function setAccountInfo(elementId, message) {
    document.getElementById(elementId).innerHTML = message;
}

function setFlashNotification(message, timeInSeconds) {
    $(".flash-notification").html(message);
    if (timeInSeconds > 0) {
        setTimeout(() => {
            $(".flash-notification").html("");
        }, timeInSeconds * 1000);
    }
}

function getRandomMarket(array, current) {
    let randomIndex;
    let randomMarket;

    do {
        randomIndex = Math.floor(Math.random() * array.length);
        randomMarket = array[randomIndex];
    } while (randomMarket === current);

    return randomMarket.value;
};

function setResultNotification(
    contractId,
    tradeTypeDisplay,
    market,
    stake,
    profit = null
) {
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
        $(".result-notification").prepend(`<span class="stake-info" id="${contractId}"><span class="detailt"><span>Contract ID : </span><span class="contract-info">${contractId}</span></span><span class="detailt"><span>Market : </span><span class="contract-info">${marketObj.name}</span></span><span class="detailt"><span>Type : </span><span class="contract-info">${tradeTypeDisplay}</span></span><span class="detailt"><span>Stake : </span><span class="contract-info">${stake}</span></span><span class="detailt"><span>Profit / Loss Amount : </span><span class="contract-info" id="${contractId}-profit"><span class="">-</span></span></span><span class="detailt"><span>Status : </span><span class="contract-info" id="${contractId}-status"><span class="">-</span></span></span></span>`);
    }
}


function setTickCountDown(tickCount, tick) {
    if (tickCount > tick) {
        setFlashNotification(`Trade will close in <span class="number">${tickCount - tick}</span> tick.`,0);
    } else if (tickCount == tick) {
        setFlashNotification(``, 0);
    }
}


function runPrediction() {
    runPredictionAndTrade().then(prediction => {
        if (prediction) {
            setFlashNotification(`Next trade: ${prediction.prediction.toUpperCase()} (${(prediction.confidence * 100).toFixed(1)}% confidence)`, 5);
        }
    });
}


function setInfo(contract, lastTradeProfit) {


    currentProfitAmount = currentProfitAmount + lastTradeProfit;
    currentLossAmount = currentLossAmount + lastTradeProfit;
    if(currentLossAmount >= 0){currentLossAmount = 0;}

    updatedAccountBalance = initialAccountBalance + currentProfitAmount;
    netProfit = updatedAccountBalance - initialAccountBalance;

    if (lastTradeProfit > 0) {
        winTradeCount = winTradeCount + 1;
        totalProfitAmount = totalProfitAmount + lastTradeProfit;
    } else if (lastTradeProfit < 0) {
        lossTradeCount = lossTradeCount + 1;
        totalLossAmount = totalLossAmount + lastTradeProfit;
    }

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

    console.log('initialAccountBalance : ', initialAccountBalance);
    console.log('updatedAccountBalance : ', updatedAccountBalance);
    setAccountInfo("updatedAccountBalance", `${updatedAccountBalanceDisplay}`);


    
    let netProfitDisplay = null;
    if (netProfit > 0) {
        netProfitDisplay = `<span class="green">$ ${netProfit.toFixed(2)}</span>`;
    } else if (netProfit < 0) {
        netProfitDisplay = `<span class="red">$ ${netProfit.toFixed(2)}</span>`;
    }
    setAccountInfo("net_profit", `${netProfitDisplay}`);


    
    let totalProfitAmountDisplay = null;
    if (totalProfitAmount < 0) {
        totalProfitAmountDisplay = `<span class="red">$ ${totalProfitAmount.toFixed(2)}</span>`;
    } else if (totalProfitAmount > 0) {
        totalProfitAmountDisplay = `<span class="green">$ ${totalProfitAmount.toFixed(2)}</span>`;
    } else {
        totalProfitAmountDisplay = `$ ${totalProfitAmount.toFixed(2)}`;
    }
    setAccountInfo("totalProfit", `${totalProfitAmountDisplay}`);



    let totalLossAmountDisplay = null;
    if (totalLossAmount < 0) {
        totalLossAmountDisplay = `<span class="red">$ ${totalLossAmount.toFixed(2)}</span>`;
    } else if (totalLossAmount > 0) {
        totalLossAmountDisplay = `<span class="green">$ ${totalLossAmount.toFixed(2)}</span>`;
    } else {
        totalLossAmountDisplay = `$ ${totalLossAmount.toFixed(2)}`;
    }
    setAccountInfo("totalLoss", `${totalLossAmountDisplay}`);



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


function reserParams() {
    currentProfitAmount = 0;
    currentLossAmount = 0;
    lostCountInRow = 0;

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

function reload() {
    location.reload();
}

function getRandomNumber(min, max) {
    if (min > max) {
        throw new Error("Min value must be less than or equal to Max value");
    }
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function setTimer(time) {
    let timeleft = time / 1000; // Convert milliseconds to seconds

    if (!isRunning) {
        timeleft = 0;
        stopTimer = true;
    }

    let timer = setInterval(function () {
        if (timeleft <= 0) {
            clearInterval(timer);
            setFlashNotification(``, 0);
        } else if (timeleft > 0 && !stopTimer) {
            let formattedTime = formatTime(timeleft);
            setFlashNotification(`Bot will run again in <span class="number">${formattedTime}</span>.`,0);
        }
        timeleft -= 1;
    }, 1000);
}


// Helper function to format time (hide hours & minutes if they are 0)
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

function weClose() {
    if (ws) {
        ws.close();
        ws = null;
    }
}


function resetBot() {
    localStorage.clear();
    reload();
}

function storeTickData(currentTick, tickCount) {
    // Push new tick value to history
    tickHistory.push(currentTick);

    // Keep only the last 2 ticks
    if (tickHistory.length > tickCount) {
      tickHistory.shift(); // remove oldest
    }

    // Optional: log or send to callback
    console.log("Tick history (last "+tickCount+"):", tickHistory);
}



function areLastDigitsUnderOrEqualTwo(tickArray, tickArrayCount) {
    if (!Array.isArray(tickArray) || tickArray.length !== tickArrayCount) {
      console.error("Input must be an array with exactly two numbers.");
      return false;
    }
  
    const getDecimalPlaces = (num) => {
      const parts = num.toString().split('.');
      return parts[1] ? parts[1].length : 0;
    };
  
    const lastDigits = tickArray.map(value => {
      const decimalPlaces = getDecimalPlaces(value);
    //   const fixed = decimalPlaces === 2 
    //     ? value.toFixed(2) + '0'      // force third decimal digit to 0
    //     : value.toFixed(3);           // leave as is for 3 decimals

    const fixed = decimalPlaces === 1 
        ? value.toFixed(1) + '0'      // force third decimal digit to 0
        : value.toFixed(2);           // leave as is for 3 decimals
  
      return parseInt(fixed[fixed.length - 1], 10); // last digit
    });
  
    console.log("Last digits:", lastDigits); 
    return lastDigits.every(d => d <= ldp);
  }


//   function areLastDigitsUnderOrEqualTwo(tickArray, tickArrayCount) {
//     if (!Array.isArray(tickArray) || tickArray.length !== tickArrayCount) {
//       console.error("Input must be an array with exactly two numbers.");
//       return false;
//     }
  
//     const getLastDigit = (num) => {
//       // Remove decimal point and get last digit
//       const numStr = num.toString().replace('.', '');
//       const lastChar = numStr[numStr.length - 1];
//       return parseInt(lastChar, 10);
//     };
  
//     const lastDigits = tickArray.map(getLastDigit);
  
//     console.log("Last digits:", lastDigits); // Optional for debugging
  
//     return lastDigits.every(d => d <= 2);
//   }
  
  
  

  function checkBalance(ws) {
    ws.send(JSON.stringify({
      balance: 1
    }));
  }

