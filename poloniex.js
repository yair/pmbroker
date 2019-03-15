const fs = require('fs');
const PoloniexAPI = require('poloniex-api-node');
const l = require ('./log');

class Poloniex {

    constructor() {

        if (!Poloniex.instance) { // singleton init

            this._state = 'SETUP';
            this.MINIMUM_ALT_TRADE = 0.0001;     // 10k(alt)sat @poloni
            this.MINIMUM_BTC_TRADE = 0.000001;   // 100(bit)sat @poloni
            this.PRICE_RESOLUTION = 0.00000001;  // 1sat @poloni
            this.PENDING_TIMEOUT = 15000;        // ms
            this.PAPER_TRADE = true;
            this.markets = {};
            this.balances = {};
            this.fetching_balances = false;      // Do we need a timeout on this?

            this._secrets - JSON.parse(fs.readFileSync ('poloniex_secrets.json', 'utf8'));
            this._api = new PoloniexAPI(secrets['key'], secrets['secret'], { nonce: () => Date.now() * 2000 });
            this._api.on('message', this.handle_message);
            this._api.on('open', this.open);
            this._api.on('close', this.close);
            this._api.on('error', (error) => { l.e('Poloniex ERROR: ' + error) });
            this._api.on('heartbeat', () => { l.d('Poloniex heartbeat') });
            this._api.openWebSocket({ version: 2 });
            this.fetch_balances();

            this._state = 'READY';
            Poloniex.instance = this;
        }

        return Poloniex.instance;
    }

    register_market(mname, trigger) {

        this.markets[mname] = { 'trigger': trigger };
        this._api.subscribe(mname);
    }

    fetch_balances (cb=null) {

        if (!this.fetching_balances) {

            this.fetching_balances = true;
            this._api.returnCompleteBalances("exchange", function (err, balances) => {

                if (err) { l.e ('Error fetching balances: ' + err); }
                this.balances = balances;
                this.fetching_balances = false;
                if (cb) { cb(); }
            });
        }
    }

    handle_message(channelName, data, seq) {

        for (const mname in this.markets) {
            if (channelName == mname) {
                return this.markets[channelName](channelName, data, seq); // We might want to normalize stuff here.
            }
        }
        l.w('Unhandled message in unrecognized channel ' + channelName + '. data=' + data + ', seq=' + seq);
    }

    open(err, body) {
        if (err) {
            console.log (err)
        }
    }

    close(reason, details) {
        console.log ('connection closed. reason: ' + reason + ' details: ' + details);
    }

    coin_name_from_market(mname) {

        if (market == 'USDT_BTC') {
            return 'USDT';
        } else {
            return market.substring(4);
        }
    }
};

const instance = new Poloniex();
Object.freeze(instance);
export default instance;

