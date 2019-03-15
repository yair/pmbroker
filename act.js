// person.js
'use strict';
//

module.exports = class Act {

    constructor(action, config) {
        this.action = action;
        this.config = config;

        this._state = 'NEW';
        this.mname = action['mname'];
        this.prev_balance = action['previous_balance'];
        this.current_balance = action['previous_balance'];
        this.amount = action['amount'];
        this.price = action['price'];
        this.type = action['type'];

        this.start = Date.now();
        this.timeout = config['TIMEOUT'];
        this.active_orders = {};
        this.exch = c['exch'];
        this.coin_name = this.exch.coin_name_from_market(this.mname);
        
        this._state = this.validate_act();
        if (this._state = 'VALID') {

            this.init_stream();
        }


        // Initialize all the things and validate everything is fine
        // ...
//        this._state = 'VALID';
    }

    verifyState(states) {

        for (i in states) {
            if (states[i] == this._state)
                return true;
        }
        return false;
    }

    validate_act() {

        if (!verifyState(['NEW'])) {
            l.e ('validate_act entered with wrong state: ' + this._state);
        }

        if (this.amount < exch.MINIMUM_ALT_TRADE ||
            this.amount * this.price < exch.MINIMUM_BTC_TRADE) {

            // This depends if this is a buy or a sale, but we should have balances now.
            // ... try really hard to find a way or else
            return 'INVALID';
        }
        return 'VALID';
    }

    run() {

        if (!verifyState (['VALID'])) { // There are two cases here, the benign do nothing, and the problematic we shouldn't be here.
            l.e ('run entered with wrong state: ' + this._state);
        }

        this._state = 'WAIT';
    }

    trigger() {

        if (verifyState([FETCH_BALANCES])) { return; }
        
    }
}

/*                mname: action['mname'],
                prev_balance: action['previous_balance'],
                current_balance: action['previous_balance'],
                total_amount: action['amount'],
                price: action['price'],
                type: action['type'],
                start: Date.now(),
                timeout: timeout,
                active_orders: {},

                amount_changed: 0,
                trades: [],
                triggerRunning: false,
                done: false,
                exch_trades: {},
                fetching_balances: false,
                pending_add: {},
                pending_remove: {},
                pending_timestamp: 0,
                order_archive: [],
                market_order: false,
                coin_name: coin_name_from_market (action['mname']),
                btc_balance: Number.POSITIVE_INFINITY,*/


//           this.firstName = firstName;
//                  this.lastName = lastName;
//                     }
//
//                        display() {
//                               console.log(this.firstName + " " + this.lastName);
//                                  }
//                                  }
