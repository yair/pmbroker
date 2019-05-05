'use strict';
const l = require ('./log');
const u = require('./utils');
const assert = require('assert');

module.exports = class Act { // This is, manifestly, a class act

    constructor(action, config) {
        this.action = action;
        this.config = config;

        this.state = 'NEW'; // TODO: Shouldn't states be JS symbols?
        this.mname = action['mname'];
        this.prev_balance = action['previous_balance'];
        this.current_balance = action['previous_balance'];
        this.amount = action['amount'];
        this.remaining_amount = action['amount'];
        this.price = action['price'];
        this.type = action['type'];

        this.start = Date.now();
        this.timeout = config['TIMEOUT'];
        l.e('Constructor: setting active_order to null');
        this.active_order = null;
        this.prev_orders = [];
        this.exch = this.config['exch'];
        this.coin_name = this.exch.coin_name_from_market(this.mname); // why no work? singleton shenanigans? Let's dump ES6.
        
//        this.state = Object.getPrototypeOf(this).validate_act().bind(this);
        this.state = this.validate_act();//.bind(this);
//        this.canBeTriggered = function () { l.v('canBeTrig this=' + JSON.stringify(this)); return !this.verify_state(['NEW', 'INVALID', 'DONE']); }; // DONE: Reframe positively (WAIT or BLOCKED (or NEW! You opened the stream, you record it!))
        this.canBeTriggered = function () { return this.verify_state(['NEW', 'VALID', 'WAIT', 'BLOCKED']); }; // DONE: Reframe positively (WAIT or BLOCKED (or NEW! You opened the stream, you record it!))
        if (this.state == 'VALID') {

            this.trigger = (evs) => {

                l.d('Act triggered: ' + this.state + ' (' + JSON.stringify(this.active_order) + ')');
                if (!this.canBeTriggered()) {
                    l.w (this.mname + ': Triggered while in state ' + this.state);
                    return;
                }

                for (var ev in evs) {
                    this.handle_event(evs[ev]);
                }

                if (this.verify_state(['WAIT']) && this.exch.needs_fetch_balances) {
                    return this.fetch_balances();
                };

                if (this.verify_state(['WAIT'])) {
                    return this.update_order();
                }
/*
                if (this.state == 'VALID') {
                    l.d (this.mname + " triggered, but it's not yet its turn to run. Skipping"); // NO! We have to record all these things - it's the order book in there!
                    return;
                }
                if (!this.canBeTriggered()) {
                    assert('Triggered while not running nor about to run. State=' + this.state);
                }

                if (channelName || data || seq) {
                    this.pending_events.push({ 'channelName': channelName, 'data': data, 'seq': seq });
                }

//                if (this.state != 'BLOCKED') { l.v(this['mname'] + ': Triggered while blocked.'); return; }
                if (this.verify_state(['WAIT'])) {

                    this.handlePendingEvents(); // might switch to BLOCK
                    this.d(act.mname + ' triggered and unblocked.');
                } else {
                    assert(this.verify_state(['BLOCK']), 'invalid state ' + this.state);
                    this.d(act.mname + ' triggered but blocked.');
                }*/
            }

            this.exch.register_market(this.mname, this.trigger);
        }


        // Initialize all the things and validate everything is fine
        // ...
//        this.state = 'VALID';
        return this;
    }

    block() {
        l.d(this['mname'] + ': blocked');
        this.state = 'BLOCKED'; // TODO: Add timeout
    }

    unblock() {
        l.d(this.mname + ': unblocked');
        this.state = 'WAIT';
    }
//    this.verify_state = function (states) {
    verify_state(states) {

        for (i in states) {
            if (states[i] == this.state)
                return true;
        }
        l.v(this['mname'] + ' verify_state failed. Have ' + this['state'] + '. Wanted ' + JSON.stringify(states) + '. Stack: ' + new Error().stack);
        return false;
    }

    validate_act() {

//        if (!Object.getPrototypeOf(this).verify_state(['NEW'])) {
        if (!this.verify_state(['NEW'])) {
            l.e (this.mname + ': validate_act entered with wrong state: ' + this.state);
        }

        l.v('validate_act: this.exch=' + JSON.stringify(this.exch));
//        if (this.amount < this.exch.MINIMUM_ALT_TRADE ||
//            this.amount * this.price < this.exch.MINIMUM_BTC_TRADE) {
        if (//this.amount < this.exch.MINIMUM_ALT_TRADE ||
            this.amount * this.price < this.exch.MINIMUM_ALT_TRADE) {

            // This depends if this is a buy or a sale, but we should have balances now.
            // ... try really hard to find a way or else
            return 'INVALID';
        }
        return 'VALID';
    }

    run() {

//        if (!Object.getPrototypeOf(this).verify_state (['VALID']).bind(this)) { // There are two cases here, the benign do nothing, and the problematic we shouldn't be here.
        if (!this.verify_state(['VALID'])) { // There are two cases here, the benign do nothing, and the problematic we shouldn't be here.
            l.e ('run entered with wrong state: ' + this.state);
        } else {
            this.state = 'WAIT';
        }
    }

    fetch_balances() {
        this.block();
        this.exch.fetch_balances( () => {
            
            this.unblock();
            this.recalc_remaining_amount();
        } );
    }

    recalc_remaining_amount() {
        //TODO
    }

    update_order() {
        // confab needs bids, asks, action type, mname, start time, timeout, 
        // returns price, amount (why?), order type (limit/market)
        // Doesn't need polo, doesn't need config, doesn't need init. Just init on the stack when loaded and expose get_price.
        l.d(this.mname + ': updating the current order (' + JSON.stringify(this.active_order) + ')');
        var order = this.config.confabulator.calc_new_order(this.mname, this, this, this.remaining_amount)
        l.v('update_order: New order from confab: ' + JSON.stringify(order));
//        var price = this.config.confabulator.get_next_price(this);
//        if (this.active_orders.length > 0 && this.active_orders[0].
        if (this.active_order != null && u.are_close(this.active_order['rate'], order['rate'], this.exch.PRICE_RESOLUTION/2.) &&
                                         u.are_close(this.active_order['amount'], order['amount'], this.exch.PRICE_RESOLUTION*2.)) {
            l.d('update_order: Already have a ' + this.mname + ' ' + this.active_order.type + ' order of ' + order['amount'] + ' at ' + order['rate'] + '. (existing order=' + JSON.stringify(this.active_order) + '). Skipping update.');
        } else {
            l.d('update_order: New or changed ' + this.mname + ' ' + this.type + ' order of ' + order['amount'] + ' at ' + order['rate'] + '. Existing order is ' + JSON.stringify(this.active_order) + '.');
            order.amount = this.remaining_amount;
            this.block()
            if (this.active_order != null) {
                this.exch.replace_orders (this.active_order, order, (results) => { this.change_active_order(order, results); this.unblock(); });
            } else {
                this.exch.issue_new_order(order, (results) => { this.change_active_order(order, results); this.unblock(); });
            }
        }
    }

    /*async*/ change_active_order(new_order, results) {

/*                    if (parseFloat(body['amount']) < parseFloat(this.remaining_amount)) {
//                        this.remaining_amount = body['amount'];
                        l.d(mname + ': order amount reduced while moving, prolly a fill (' + this.remining_amount + ' => ' + body['amount'] + ').');
                        if (parseFloat(body('amount') < MINIMUM_ALT_TRADE)) {
                            this.remaining_amount = 0;
                            this.state = 'DONE';
                            new_active_order = null;
                        }
                    }*/
//                    return cb({ id: old_order['id'], 'rate': new_order['rate'], amount: body['amount'] });

        var price = parseFloat(new_order['rate']),
            amount = parseFloat(new_order['amount']);
        if (amount < parseFloat(this.remaining_amount)) {
            l.d(mname + ': order amount reduced while moving - a fill! (' + this.remining_amount + ' => ' + body['amount'] + ').'); // has to be?
            this.remaining_amount = mount;
            if (amount < MINIMUM_ALT_TRADE) {
                l.d(mname + ': Current amount too low. Trade is done.');
                this.remaining_amount = 0;
                this.state = 'DONE';
                this.prev_orders.push(this.active_order);
                l.e('change_active_order: Act done. setting active_order to null');
                this.active_order = null;
                return;
                // TODO: Should we cancel the current order? Should we wait for it? What do we do? What happens on a complete fill?
            } // TODO: make sure we're not left with nonzero sub-minimum leftovers
        }

        l.i(this.mname + ' order moved - ' + JSON.stringify(this.active_order) + ' => ' + JSON.stringify(new_order) + ' with results ' + JSON.stringify(results));
//        await(u.sleep(200)); Why was this a good idea?
        this.prev_orders.push (this.active_order);
        this.active_order = new_order;
        for (var kid in Object.keys(results)) {
            var k = Object.keys(results)[kid];
            this.active_order[k] = results[k];
            l.d('active_order[' + k + '] <= results[' + k + '] = ' + results[k]);
        }
        return this.active_order;
    }

    handle_event(ev) {
        l.v('handling even of type ' + ev['type'] + ': ' + JSON.stringify(ev));
        if (ev['type'] == 'orderBook') {
            this.ob_asks = ev['data']['asks'];
            this.ob_bids = ev['data']['bids'];
        } else if (ev['type'] == 'orderBookRemove') {
            delete this[ev['data']['type'] == 'ask' ? 'ob_asks' : 'ob_bids'][ev['data']['rate']];
        } else if (ev['type'] == 'orderBookModify') {
            this[ev['data']['type'] == 'ask' ? 'ob_asks' : 'ob_bids'][ev['data']['rate']] = ev['data']['amount'];
        } else if (ev['type'] == 'newTrade') {
//            for (var oid in Object.keys(this.active_orders)) {
            l.v('New trade event. ev=' + JSON.stringify(ev) + ',');
            l.v('ev[data]=' + JSON.stringify(ev['data']) + ',');
            l.v('ev[data][rate]=' + JSON.stringify(ev['data']['rate']) + ',');
            l.d('this.active_order=' + JSON.stringify(this.active_order));
            if (this.active_order != null &&
                ((this.type == 'Buy'  && parseFloat(ev['data']['rate']) >= parseFloat(this.active_order['rate'])) ||
                  this.type == 'Sell' && parseFloat(ev['data']['rate']) <= parseFloat(this.active_order['rate']))) {

                this.exch.needs_fetch_balances = true;
            }
        }
    }

/*    handlePendingEvents() {

        // event types:
        // - timer
        // - orderBook
        // - orderBookRemove
        // - orderBookModify
        // - newTrade
        
        // Ok. New approach -- updates can happen at any time, confabulation and execution only if we're in wait (and they block too!)
        // If they block too, they have to be performed serially. First they fetchy stuff (balances), then the ordery stuff.
//        Go over events. See if needed -- We need an event type enum, don't we? And handling flags?
        //        1. OB updates
        //        3. Update balances if trades performed suspected of overstepping ours (blocks)
        //        4. Check if new balances fetched
        //        5. Confabulate new orders (true if 1. or 4.)
        //        6. Check if newly confabulated orders are the same as existing ones and replace/move orders if not.
        //        7. Check if we're out of orders to execute (done).
//                    var new_orders = this.recalcOrders();        // Only if WAIT. Might we enter somekind of loop where this is not called?
//                    this.rep
    }*/
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
