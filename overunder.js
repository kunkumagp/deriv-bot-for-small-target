const WebSocket = require('ws');

const API_TOKEN = 'lkUxtOopvUhCpIX';
const SYMBOL = 'R_10'; // Volatility 10 Index
const STAKE = 1;
const LDP = 2;
const DURATION = 1; // 1 tick duration

let ws = new WebSocket('wss://ws.derivws.com/websockets/v3?app_id=1089');
let digits = [];
let authorized = false;

ws.onopen = () => {
    ws.send(JSON.stringify({ authorize: API_TOKEN }));
};

ws.onmessage = (msg) => {
    const data = JSON.parse(msg.data);

    if (data.msg_type === 'authorize') {
        authorized = true;
        console.log('✅ Authorized');
        subscribeTicks();
    }

    if (data.msg_type === 'tick') {
        handleTick(data.tick.quote);
    }

    if (data.msg_type === 'buy') {
        console.log(`🎯 Purchased contract: ${data.buy.contract_id}`);
    }

    if (data.msg_type === 'proposal') {
        if (data.proposal && data.proposal.id) {
            buyContract(data.proposal.id);
        }
    }
};

function subscribeTicks() {
    ws.send(JSON.stringify({
        ticks: SYMBOL,
        subscribe: 1
    }));
}

function handleTick(price) {
    const digit = parseInt(price.toString().slice(-1));
    digits.push(digit);
    if (digits.length > 20) digits.shift();

    const freq = Array(10).fill(0);
    digits.forEach(d => freq[d]++);

    const zeroOneRate = ((freq[0] + freq[1]) / digits.length) * 100;
    const digit2Rate = (freq[2] / digits.length) * 100;

    console.log(`Digit: ${digit} | 0/1: ${zeroOneRate.toFixed(1)}% | 2: ${digit2Rate.toFixed(1)}%`);

    if (digit === 0 || digit === 1) {
        if (zeroOneRate < 10 && digit2Rate > 20) {
            requestProposal();
        }
    }
}

function requestProposal() {
    ws.send(JSON.stringify({
        proposal: 1,
        amount: STAKE,
        basis: 'stake',
        contract_type: 'DIGITUNDER',
        currency: 'USD',
        duration: DURATION,
        duration_unit: 't',
        symbol: SYMBOL,
        barrier: LDP
    }));
}

function buyContract(proposalId) {
    ws.send(JSON.stringify({
        buy: proposalId,
        price: STAKE
    }));
}
