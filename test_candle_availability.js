// We want to find a good estimate for how long it takes from the second a 5min candle closes until we can fetch it.
// We'll use the ETH market because right now it's the most liquid and we want to minimize 
// Actually maybe all is well - we're getting the candle that _ends_ at the end of our requested period, so it's kinda correct. :/

const fs = require ('fs');
const PoloniexAPI = require('poloniex-api-node');
var secrets = JSON.parse(fs.readFileSync ('poloniex_secrets.json', 'utf8'));
var api = new PoloniexAPI(secrets['key'], secrets['secret'], { nonce: () => Date.now() * 2000 });

var NUMITER = 5;
var DELAYS = [0, 5000, 10000, 15000, 20000, 25000, 30000, 35000, 40000, 45000, 50000, 55000, 60000];
var iterdone = false, iternum = 0;
var candletype = 300000.;
//var candletype = 60000.;
var results;

go();
async function go() {
for (var iter = 0; iter < NUMITER; iter++) {

    iterdone = false; 
    var delay_idx = 0;
    var next_candle_at = Math.ceil(Date.now() / candletype) * candletype;
    var time_to_next_candle = next_candle_at - Date.now();
    console.log('time_to_next_candle: ' + time_to_next_candle);
    await sleep(time_to_next_candle);
    for (var din = 0; din <= DELAYS.length; din++) {
        var delay = DELAYS[din];
        console.log('Current delay - ' + delay + 'ms and next delay - ' + DELAYS[din+1] + 'ms');
        var late = Date.now() - delay - next_candle_at;
        if (late < 0) {
            console.log('ERROR - Reached testpoint at negative too early by ' + late + 'ms');
            process.exit(1);
        }
        // api...
//        api.returnChartData(currencyPair, period, start, end [, callback])
        var start = (next_candle_at - 30 * candletype) / 1000,
            end   = next_candle_at / 1000;
        console.log('Good - only late by ' + late + 'ms. Requesting data from ' + start + ' to ' + end);
        api.returnChartData('BTC_ETH', 300, start, end, (error, body) => {
            if (error) {
                console.log('Oh noes! Got an error - ' + error);
                process.exit(1);
            }
            console.log('Got answer! And it is ' + body.pop()['date']);
        });
        var wait_for = next_candle_at - Date.now() + DELAYS[din+1];
        console.log('Sleeping for ' + wait_for + ' until ' + DELAYS[din+1] + ' testing point.');
        await sleep(wait_for);
    }
    process.exit(0);
}
}

//async function nap(ms) { await sleep(ms); }
async function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); };
/*
var id;
api.buy('BTC_ETH', 0.02, 0.06, false, false, false, (err, body) => {
    console.log('Buy results: ' + JSON.stringify(body));
    id = body['orderNumber'];
    api.moveOrder(id, 0.021, 0.06, false, false, (err, body) => {
        console.log('First move results: ' + JSON.stringify(body));
        id = body['orderNumber'];
        api.moveOrder(id, 0.022, 0.06, false, false, (err, body) => {
            console.log('Second move results: ' + JSON.stringify(body));
            id = body['orderNumber'];
        });
    });
});*/
