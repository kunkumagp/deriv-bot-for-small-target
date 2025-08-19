// Persistent Trading Bot Template
// This template includes: start/stop, persistence, account details, trade summary, trade log, and log panel

const BOT_STORAGE_KEY = 'persistentBotState';
const ACCOUNT_STORAGE_KEY = 'persistentBotSelectedAccount';
const accounts = [
    { name: "KunkumaGP", value: "lkUxtOopvUhCpIX" },
    { name: "Kunkuma Trading", value: "YbaIy3dD51g2eoO" },
    { name: "W H K G Prasanna 85", value: "iVOpdm24hBhw3JI" },
    { name: "Zion Music 1985", value: "pfn80VW8Lexav5O" },
];
let selectedAccount = accounts[0].value;
let botRunning = false;
let trades = [];
let totalProfit = 0;
let totalLoss = 0;
let logs = [];

function log(message) {
    logs.push(message);
    document.getElementById('logs').textContent = logs.join('\n');
}

function exportLogsToExcel() {
    if (logs.length === 0) return;
    // Prepare CSV content
    let csvContent = 'data:text/csv;charset=utf-8,' + logs.map(l => '"' + l.replace(/"/g, '""') + '"').join('\n');
    // Filename with date-time
    const now = new Date();
    const filename = `logs_${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}_${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}${String(now.getSeconds()).padStart(2,'0')}.csv`;
    // Download
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function clearLogs() {
    logs = [];
    document.getElementById('logs').textContent = '';
    saveState();
}

function saveState() {
    localStorage.setItem(BOT_STORAGE_KEY, JSON.stringify({
        botRunning,
        trades,
        totalProfit,
        totalLoss,
        logs
    }));
    localStorage.setItem(ACCOUNT_STORAGE_KEY, selectedAccount);
}

function loadState() {
    const state = localStorage.getItem(BOT_STORAGE_KEY);
    if (state) {
        const data = JSON.parse(state);
        botRunning = data.botRunning;
        trades = data.trades;
        totalProfit = data.totalProfit;
        totalLoss = data.totalLoss;
        logs = data.logs || [];
    }
    const acc = localStorage.getItem(ACCOUNT_STORAGE_KEY);
    if (acc && accounts.some(a => a.value === acc)) {
        selectedAccount = acc;
    }
}

function updateAccountSelect() {
    const select = document.getElementById('accountSelect');
    select.innerHTML = '';
    accounts.forEach(acc => {
        const option = document.createElement('option');
        option.value = acc.value;
        option.textContent = acc.name;
        if (acc.value === selectedAccount) option.selected = true;
        select.appendChild(option);
    });
    select.onchange = function() {
        selectedAccount = select.value;
        saveState();
        updateAccountDetails();
    };
}

let ws = null;
let accountBalance = 0;

function getAuthentication(apiToken) {
    log("Authenticating....");
    ws.send(JSON.stringify({ authorize: apiToken }));
}

function fetchAccountBalance(accountValue) {
    if (ws) {
        ws.close();
    }
    ws = new WebSocket('wss://ws.derivws.com/websockets/v3?app_id=1089');
    ws.onopen = function() {
        getAuthentication(accountValue);
    };
    ws.onmessage = function(event) {
        const data = JSON.parse(event.data);
        if (data.msg_type === 'authorize') {
            ws.send(JSON.stringify({ balance: 1 }));
        } else if (data.msg_type === 'balance') {
            accountBalance = data.balance.balance;
            updateAccountDetailsDisplay();
        } else if (data.error) {
            log('Error: ' + data.error.message);
            accountBalance = 0;
            updateAccountDetailsDisplay();
        }
    };
    ws.onerror = function(e) {
        log('WebSocket error');
        accountBalance = 0;
        updateAccountDetailsDisplay();
    };
}

function updateAccountDetailsDisplay() {
    const acc = accounts.find(a => a.value === selectedAccount);
    document.getElementById('accountDetails').textContent = `Account: ${acc ? acc.name : 'Unknown'} | Balance: $${accountBalance}`;
}

function updateAccountDetails() {
    fetchAccountBalance(selectedAccount);
}

function updateSummary() {
    document.getElementById('totalPL').textContent = `Total Profit: $${totalProfit} | Total Loss: $${totalLoss}`;
}

function updateTradesTable() {
    const table = document.getElementById('tradesTable');
    table.innerHTML = '';
    trades.forEach(trade => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${trade.id}</td>
            <td>${trade.market}</td>
            <td>${trade.type}</td>
            <td>${trade.stake}</td>
            <td style="color:${trade.result === 'profit' ? 'green' : 'red'}">${trade.result}</td>
            <td style="color:${trade.result === 'profit' ? 'green' : 'red'}">$${trade.amount}</td>
        `;
        table.appendChild(row);
    });
}

function startBot() {
    if (botRunning) return;
    botRunning = true;
    log('Bot started');
    saveState();
    // Simulate trades for demo
    simulateTrade();
}

function stopBot() {
    if (!botRunning) return;
    botRunning = false;
    log('Bot stopped');
    saveState();
}

function simulateTrade() {
    if (!botRunning) return;
    // Simulate a trade every 3 seconds
    setTimeout(() => {
        if (!botRunning) return;
        const trade = {
            id: Date.now(),
            market: 'R_100',
            type: Math.random() > 0.5 ? 'CALL' : 'PUT',
            stake: 1,
            result: Math.random() > 0.5 ? 'profit' : 'loss',
            amount: Math.random() > 0.5 ? 0.95 : -1
        };
        trades.push(trade);
        if (trade.result === 'profit') {
            totalProfit += trade.amount;
        } else {
            totalLoss += Math.abs(trade.amount);
        }
        log(`Trade ${trade.id}: ${trade.result.toUpperCase()} $${trade.amount}`);
        updateTradesTable();
        updateSummary();
        saveState();
        simulateTrade();
    }, 3000);
}

// Event listeners
window.onload = function() {
    loadState();
    updateAccountSelect();
    updateAccountDetails();
    updateSummary();
    updateTradesTable();
    document.getElementById('logs').textContent = logs.join('\n');
    if (botRunning) {
        simulateTrade();
    }
    document.getElementById('startBtn').onclick = startBot;
    document.getElementById('stopBtn').onclick = stopBot;
    document.getElementById('exportLogsBtn').onclick = exportLogsToExcel;
    document.getElementById('clearLogsBtn').onclick = clearLogs;
};
