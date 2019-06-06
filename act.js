'use strict';
const l = require ('./log');
const u = require('./utils');
const assert = require('assert');
const moment = require('moment');

module.exports = class Act { // This is, manifestly, a class act

    constructor(action, config) {
        this.action = action;
        this.config = config;
        this.exch = this.config['exch'];

        this.state = 'NEW'; // TODO: Shouldn't states be JS symbols?
        this.mname = action['mname'];
        this.coin_name = this.exch.coin_name_from_market(this.mname); // why no work? singleton shenanigans? Let's dump ES6.
        this.prev_balance = action['previous_balance'];
        this.current_balance = action['previous_balance'];
        this.reference_price = action['price'];
        this.type = action['type'];
        this.orig_amount = action['amount'];
        this.amount = this.orig_amount;
        this.inibalance = this.exch.balance(this.coin_name);

        this.start = Date.now();
        this.timeout = config['TIMEOUT'];
        this.active_order = null;
        this.prev_orders = [];
        
//        this.state = Object.getPrototypeOf(this).validate_act().bind(this);
        this.state = this.validate_act();//.bind(this);
//        this.amount = this.massage_initial_amount(this.orig_amount);
        this.remaining_amount = this.amount;
        if (this.type == 'Sell') {
//            if (this.exch.balances[this.coin_name]['available'] - orig_amount < this.exch.MINIMUM_ALT_TRADE)
            if (this.exch.balance([this.coin_name]) - this.orig_amount < this.exch.MINIMUM_ALT_TRADE) {
                l.i(this.mname + ' act init: Increasing amount to full balance because remainder would have been sub minimum.');
                this.remaining_amount = this.exch.balances[this.coin_name]['available']; // Don't leave sub-min-trade coins behind. Should do the same for one of the buys.
            }
            if (this.exch.balance([this.coin_name]) < this.amount) {
                l.e(this.mname + ' act init: Trying to sell more than we have. Probably crashed after a partial. Skipping this act.');
                this.state = 'INVALID';
            }
        }
        //return this.orig_amount;
/*        this.amount = ((oa, exch, cn, type) => {
            if (type == 'Sell') {
                if (exch.balances[this.coin_name]['available'] - orig_amount < exch.MINIMUM_ALT_TRADE)
                    return exch.balances[cn]['available'];
            }
        }) (this.orig_amount, this.exch, this.coin_name, this.type);*/
        this.act_acc_notifs = [];
        this.trades = [];
//        this.canBeTriggered = function () { l.v('canBeTrig this=' + JSON.stringify(this)); return !this.verify_state(['NEW', 'INVALID', 'DONE']); }; // DONE: Reframe positively (WAIT or BLOCKED (or NEW! You opened the stream, you record it!))
        this.canBeTriggered = function () { return this.verify_state(['NEW', 'VALID', 'WAIT', 'BLOCKED']); }; // DONE: Reframe positively (WAIT or BLOCKED (or NEW! You opened the stream, you record it!))

/*        this.massage_initial_amount = function (orig_amount) {
            if (this.type == 'Sell') {
                if (this.exch.balances[this.coin_name]['available'] - orig_amount < this.exch.MINIMUM_ALT_TRADE)
                    return this.exch.balances[this.coin_name]['available'];
            }
            return this.orig_amount;
        };*/

        if (this.state == 'VALID') {

            this.trigger = (evs) => {

                l.d('Act triggered at ' + moment(Date.now()).utc().format("YYYYMMDDHHmmss") + ': ' + this.state + ' (' + JSON.stringify(this.active_order) + ')');
                if (!this.canBeTriggered()) {
                    l.w (this.mname + ': Triggered while in state ' + this.state);
                    return;
                }

                for (var ev in evs) {
                    this.handle_event(evs[ev]);
                }

/*                if (this.verify_state(['WAIT']) && this.exch.needs_fetch_balances) {
                    return this.fetch_balances();
                };*/ // We no longer fetch balances mid-act. Got accnotif for that. :)

                if (this.verify_state(['WAIT'])) { // This precludes both BLOCKED and MARKET
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

            this.update_orders = (old_order, new_order, new_trades) => { //TODO: rename either this or update_order

                l.d(this.mname + ' update_orders called at ' + moment(Date.now()).utc().format("YYYYMMDDHHmmss"));
                this.act_acc_notifs.push({ 'old_order': old_order, 'new_order': new_order, 'new_trades': new_trades, 'timestamp': Date.now() });
                for (let ntid in new_trades)
                    this.trades.push(new_trades[ntid]);
                
                if (this.verify_state(['BLOCKED'])) {
                    l.d(this['mname'] + ': Got update_orders while state=BLOCKED. Unblocking.');
                    this.unblock();
                } else if (this.verify_state(['WAIT'])) {
                    l.d(this['mname'] + ': Got update_orders while state=WAIT. Okay.');
                } else {
                    u.crash(this['mname'] + ': Got update_orders while in state=' + this['state'] + '. Crashing.');
/*                    let errstr = this['mname'] + ': Got update_orders while in state=' + this['state'] + '. Crashing.';
                    l.e(errstr);
                    nijez.nijez(errstr);
                    process.exit(1);*/
                }
                if (old_order != null && new_order == null) { // Order updated without moving, i.e. parital limit exec.
                    l.d(this['mname'] + ': update_orders - only old_order not null. This is a partial fill.');
                    if (new_trades == []) {
                        u.crash(this['mname'] + ': update_orders - only old_order not null and there are no new trades. Crashing.');
/*                        let errstr = this['mname'] + ': update_orders - only old_order not null and there are no new trades. Crashing.';
                        l.e(errstr);
                        nijez.nijez(errstr);
                        process.exit(1);*/
                    }
                    var new_remam = parseFloat(this.remaining_amount);
                    new_trades.map( (t) => { new_remam -= parseFloat(t['amount']); } );
                    l.d(this.mname + ': Calced new remaining amount: ' + new_remam + '. old_order remaining amount: ' + old_order['amount']);
                    l.d(this.mname + ': Got a limit order partial fill. Reducing amount from ' + this.remaining_amount + ' to ' + new_remam + '.');
                    this.remaining_amount = new_remam;
                    return;

//                    l.e(this['mname'] + ': update_orders - both orders are null. Crashing.');
//                    process.exit(1);
                }
/*                if (old_order == null && new_order == null) {
                    l.d(this['mname'] + ': update_orders - both orders are null. This is a partial fill.'); // TODO: How can this be a partial with no old? Market?
                    if (new_trades == []) {
                        l.e(this['mname'] + ': update_orders - both orders are null and there are no new trades. Crashing.');
                        process.exit(1);
                    }
                    var new_remam = parseFloat(this.remaining_amount);
                    new_trades.map( (t) => { new_remam -= parseFloat(t['amount']); } );
                    l.d(this.mname + ': Got a limit order partial fill. Reducing amount from ' + this.remaining_amount + ' to ' + new_remam + '.');
                    this.remaining_amount = new_remam;
                    return;

//                    l.e(this['mname'] + ': update_orders - both orders are null. Crashing.');
//                    process.exit(1);
                }*/
                if (old_order == null) {
                    if (this['active_order'] != null) {
                        u.crash(this['mname'] + ': update_orders - Got initial order but active_order isn\'t null. Crashing. accnotifs are ' + JSON.stringify(this.act_acc_notifs));
/*                        let errstr = this['mname'] + ': update_orders - Got initial order but active_order isn\'t null. Crashing. accnotifs are ' + JSON.stringify(this.act_acc_notifs);
                        l.e(errstr);
                        nijez.nijez(errstr);
                        process.exit(1);*/
                    }
                    l.d(this['mname'] + ': Act is now fully alive. Initial order: ' + JSON.stringify(new_order));
                    this.active_order = new_order;


                    // Archive prev active order, and inject rlexec_state into new order
                }
                if (new_order == null) { // This is wrong. We are not necessarily done. Did we get an orderUpdate? We did. Trying to return if both null.
                    l.d(this['mname'] + ': Act is done. Wrapping up.'); // DONE
                    this.state = 'DONE';
                    return this.finalize();
                    //process.exit(1);
                }
                // Move order.
                if (old_order != null && old_order['orderNumber'] != this.active_order['orderNumber']) {
                    u.crash(this['mname'] + ': Mismatch between current active order id (' + this.active_order['orderNumber'] + ') and order id from delete notif (' + old_order['orderNumber'] + '). Crashing.');
/*                    let errstr = this['mname'] + ': Mismatch between current active order id (' + this.active_order['orderNumber'] + ') and order id from delete notif (' + old_order['orderNumber'] + '). Crashing.';
                    l.e(errstr);
                    nijez.nijez(errstr);
                    process.exit(1);*/
                }
                this['active_order'] = new_order;
//                if (new_order != null && new_trades != []) { // partial fill of a market order.
                if (new_order != null && new_trades.length > 0) { // partial fill of a market order.
                    var new_remam = parseFloat(this.remaining_amount);
                    new_trades.map( (t) => { new_remam -= parseFloat(t['amount']); } );
                    l.d(this.mname + ': Got a market order partial fill. Reducing amount from ' + this.remaining_amount + ' to ' + new_remam + '.');
                    this.remaining_amount = new_remam;
                }
            }

            this.exch.register_market(this.mname, this.trigger, this.update_orders);
        }


        // Initialize all the things and validate everything is fine
        // ...
//        this.state = 'VALID';
        return this;
    }

	toStr() { return this.state + ' ' + this.type + ' ' + this.orig_amount.toPrecision(4) + ' ' + this.coin_name };

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
            this.orig_amount * this.reference_price < this.exch.MINIMUM_ALT_TRADE) { // TODO: Think maybe we need to get a better estimate for this.

            // This depends if this is a buy or a sale, but we should have balances now.
            // ... try really hard to find a way or else
            l.i('validate_act: ' + this['type'] + ' ' + this['orig_amount'] + ' ' + this['coin_name'] + ' is below exchange minimum trade size (' + this.orig_amount * this.reference_price + ' < ' + this.exch.MINIMUM_ALT_TRADE + ')');
			l.i(this.toStr() + ': Setting state to INVALID.');
            return 'INVALID';
        }
        return 'VALID';
    }

    run() {

//        if (!Object.getPrototypeOf(this).verify_state (['VALID']).bind(this)) { // There are two cases here, the benign do nothing, and the problematic we shouldn't be here.
        if (!this.verify_state(['VALID'])) { // There are two cases here, the benign do nothing, and the problematic we shouldn't be here.
            l.e(this.toStr() + ': run entered with wrong state: ' + this.state);
			l.e(new Error().stack);
        } else {
            this.state = 'WAIT';
        }
    }

/*    fetch_balances() {    // We no longer fetch balances mid-act.
        this.block();
        this.exch.fetch_balances( () => {
            
            this.unblock();
            this.recalc_remaining_amount();
        } );
    }*/

    recalc_remaining_amount() {
        //TODO - delete this func.
    }

    update_order() {
        // confab needs bids, asks, action type, mname, start time, timeout, 
        // returns price, amount (why?), order type (limit/market)
        // Doesn't need polo, doesn't need config, doesn't need init. Just init on the stack when loaded and expose get_price.
        l.d(this.mname + ': updating the current order (' + JSON.stringify(this.active_order) + ') to amount=' + this.remaining_amount);
        var order = this.config.confabulator.calc_new_order(this.mname, this, this, this.remaining_amount)
        if (order.market_order) {
            l.i(this.mname + ': Switching to MARKET state (from ' + this.state + ')');
            this.state='MARKET';
        }
        l.v('update_order: New order from confab: ' + JSON.stringify(order));
//        var price = this.config.confabulator.get_next_price(this);
//        if (this.active_orders.length > 0 && this.active_orders[0].
        if (this.active_order != null && u.are_close(this.active_order['rate'], order['rate'], this.exch.PRICE_RESOLUTION / 2.) &&
                                         u.are_close(this.active_order['amount'], order['amount'], this.exch.PRICE_RESOLUTION * 2.)) {
            l.d('update_order: Already have a ' + this.mname + ' ' + this.active_order.type + ' order of ' + order['amount'] + ' at ' + order['rate'] + '. (existing order=' + JSON.stringify(this.active_order) + '). Skipping update.');
        } else {
            l.d('update_order: New or changed ' + this.mname + ' ' + this.type + ' order of ' + order['amount'] + ' at ' + order['rate'] + '. Existing order is ' + JSON.stringify(this.active_order) + '.');
            order.amount = this.remaining_amount;
			if (this.type == 'Buy') {
                let available_btc = parseFloat(this.exch.balance('BTC'));
                l.d('balance = ' + JSON.stringify(this.exch.balance('BTC')) + ' available = ' + JSON.stringify(this.exch.balance('BTC')['available']));
                if (this.active_order != null)
                    available_btc += parseFloat(this.active_order['rate']) * parseFloat(this.active_order['amount']); // old price
                let can_buy = available_btc / order['rate'] - this.exch.PRICE_RESOLUTION; // new price
                if (can_buy < order.amount) {
                    l.i('Cannot afford the full ' + order.amount.toPrecision(6) + this.coin_name + '. Reducing amount to ' + can_buy.toPrecision(6));
                    order.amount = can_buy;
                } else {
                    l.d('Can afford ' + can_buy.toPrecision(6) + this.coin_name + ' so ' + order.amount.toPrecision(6) + ' is no problem.');
                }
            }
            this.block()
            if (this.active_order != null) {
//                this.exch.replace_orders (this.active_order, order, (results) => { this.change_active_order(order, results); this.unblock(); }); // no need no more
                this.exch.replace_orders (this.active_order, order, (results) => { l.d(this.mname + ' update order: replace_orders returned.'); });
            } else {
//                this.exch.issue_new_order(order, (results) => { this.change_active_order(order, results); this.unblock(); }); // no need no more
                this.exch.issue_new_order(order, (results) => { l.d(this.mname + ' update order: issue_new_order returned.'); });
            }
        }
    }

    /*async*/ change_active_order(new_order, results) {
        u.crash(order['mname'] + ': change_active_order called. How come?');
//        process.exit(1);

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
            } // TODO: make sure we're not left with nonzero sub-minimum leftovers (done?)
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
        } else if (ev['type'] == 'newTrade') { // Skip this and only handle accnotif's new trade events? Then we _know_ it's ours.
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

    finalize() {
        // What do we want to see in Nijez? Amount traded, average price, final amount. So we need all trade data and initial balance.
        // Format: B 0.4239ZEC at 0.008943(now 0.4329) - Create that 4 sig digit rounding func.
        var acc=0, pracc=0;
        for (let tid in this.trades) {
            acc += parseFloat(this.trades[tid]['amount']);
            pracc += parseFloat(this.trades[tid]['amount']) * parseFloat(this.trades[tid]['rate']);
            l.d('acc = ' + acc + ' pracc = ' + pracc);
        }
        var avgprice = pracc / acc;
        var finibalance;
        if (this.type == 'Sell')
            finibalance = parseFloat(this.inibalance) - acc;
        else
            finibalance = parseFloat(this.inibalance) + acc;
        l.d('finibalance = ' + finibalance + ' avgprice = ' + avgprice + ' acc = ' + acc);
        this.nijezline = this.type.substring(0, 1) + ': ' + acc.toPrecision(4) + this.coin_name + ' at ' + avgprice.toPrecision(4) + ' (now ' + finibalance.toPrecision(4) + '=' + (1000.*finibalance*avgprice).toPrecision(4) + 'mB)';


//        notify_nijez(); // both are done higher up.
//        dump_act();
        // Also, if we had to nijez about any acts, nijez a total summary. I'd like to dump some data into a database as well for easy charting.
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
