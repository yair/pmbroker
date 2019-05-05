// 'use strict';

const fs = require('fs');
const PoloniexAPI = require('poloniex-api-node');
const l = require ('./log');
const CircularJSON = require('circular-json');

module.exports = (function () { // Closure based singleton
 
	var inst;

	function init() { // The privates
 
//		inst.state = 'SETUP';
		var PENDING_TIMEOUT = 15000;        // ms
		var PAPER_TRADE = false;
        if (PAPER_TRADE) {
            var pt_id = 0; // TODO: increment and set into orders where needed.
        }
		var markets = {};
		var balances = {};
//		inst.fetching_balances = false;      // Do we need a timeout on this? // Isn't that part of the state machine?

		var secrets = JSON.parse(fs.readFileSync ('poloniex_secrets.json', 'utf8'));
		var api = new PoloniexAPI(secrets['key'], secrets['secret'], { nonce: () => Date.now() * 2000 });
		api.on('message', on_message);
		api.on('open', () =>  { l.i ('WebSocket stream open') });
		api.on('close', on_close);
		api.on('error', (error) => { l.e('Poloniex ERROR: ' + error) });
		api.on('heartbeat', () => { l.v('Poloniex heartbeat') });
		api.openWebSocket({ version: 2 });
        api.subscribe('accountNotifications');
		//cancel_all_orders_and_fetch_balances(); Why can't private functions call public ones?
//		inst.state = 'READY';
 
        function normalize_message(channelName, data, seq) {

            var evs = [];

            for (var item in data) {

                evs.push (data[item]);
            }
            return evs;
        }

    	function on_message(channelName, data, seq) {

	        for (const mname in markets) {
	            if (channelName == mname) {
                    l.d('Polo: calling trigger on ' + channelName + ' channel Websocket update');
	                return markets[channelName]['trigger'](normalize_message(channelName, data, seq));
	            }
	        }
	        l.w('Unhandled message in unrecognized channel ' + channelName + '. data=' + data + ', seq=' + seq);
	    }

	    function on_open() {
            l.i ('WebSocket stream open');
	    }

	    function on_close(reason, details) {
	        l.i ('connection closed. reason: ' + reason + ' details: ' + details);
	    }

        function handle_error(e) {
            l.d("*** POLO ERROR: " + JSON.stringify(e) + " Stack: " + new Error().stack);
            // process.exit(1);
            // Exit prog on some of the errors (e.g., 403 unauthorized)
            // Other actions on other errors (e.g. reduce trade size on in sufficient funds)
            //
        }
/*
    // Singleton
 
    // Private methods and variables
    function privateMethod(){
        console.log( "I am private" );
    }
 
    var privateVariable = "Im also private";
 
    var privateRandomNumber = Math.random();*/
 
	    return { // The publics
 
            'MINIMUM_ALT_TRADE': 0.0001,      // 10k(alt)sat @poloni
    		'MINIMUM_BTC_TRADE': 0.000001,    // 100(bit)sat @poloni
		    'PRICE_RESOLUTION':  0.00000001,  // 1sat @poloni

            'needs_fetch_balances': true,

	    	coin_name_from_market: function (mname) {

		        if (market == 'USDT_BTC') {
		            return 'USDT';
		        } else {
		            return market.substring(4);
		        }
		    },

	    	register_market: function (mname, trigger) {

		        markets[mname] = { 'trigger': trigger };
		        api.subscribe(mname);
                l.d('Polo: register_market: ' + mname + ' registered. Trigger attached, market websocket stream opened.');
		    },

            fetch_balances: function (cb=null) {

//            l.e('inst before fetching balances: ' + JSON.stringify(inst));
//	        if (!function.fetching_balances) { // Really? Isn't all locking done on the act level?

//	            this.fetching_balances = true;
                this.needs_fetch_balances = false;
                l.d('Polo: About to fetch balances.');
    			api.returnCompleteBalances("exchange", function (err, balances) {

    				if (err) { l.e ('Error fetching balances: ' + err); handle_error(err); }
                    l.d('Polo: Balances fetched.');
    				balances = balances;
//                l.e('inst after fetching balances: ' + CircularJSON.stringify(inst));
//                this.fetching_balances = false;
                    if (cb) { cb(); }
                });
//        }
    	    },

            cancel_all_orders_and_fetch_balances: function (cb=null) { //TODO
    			return this.fetch_balances(cb);
    		},

            cancel_order(order, cb) {
                if (PAPER_TRADE) {
                    l.w('Polo ' + order['mname'] + ': PAPER_TRADE. Would have canceled old order ' + JSON.stringify(order) + '.');
                    return cb(null);
                } else {
                    l.d('Polo ' + order['mname'] + ': cancelling order ' + JSON.stringify(order));
//                    api.cancelOrder(order['orderNumber'], (success, amount, message) => {
                    api.cancelOrder(order['orderNumber'], (err, body) => {
                        if (err != null || body['success'] != 1) {
                            l.e('Polo ' + order['mname'] + ': Failed to cancel order. err=' + JSON.stringify(err) + ' body=' + JSON.stringify(body));
                            handle_error(err);
                            // This might mean complete execution, time to fetch balances.
                            return cb(order);
                        }
                        l.d('Polo ' + order['mname'] + ': order no. ' + order['orderNumber'] + ' cancelled successfully.');
                        return cb(null);
                    });
                }
            },

            close_and_reopen: function (old_order, new_order, cb) {
                // TODO: if we really wanna use this fuglinaciousness, we should make sure we're not in a submin partial situation, or we'll fail and lose access to our coins.

                this.cancel_order(old_order, (remaining_order) => {
                    if (remaining_order != null) {
                        l.e('Polo ' + old_order['mname'] + ': Failed to cancel old order. Will not issue a new one. In fact, let\'s just end it here.');
                        process.exit(1);
                    }
                    return this.issue_new_order(new_order, cb);
                });
            },

            replace_orders: function (old_order, new_order, cb) {

                const broken_move = true; // Poloniex, Goddamn

                if (PAPER_TRADE) {
                    l.w(old_order.mname + ' PAPER_TRADE. Would have moved old order ' + JSON.stringify(old_order) + ' to new order ' + JSON.stringify(new_order));
                    return cb(old_order); // TODO: inject progressive fake id
                } else {

                    if (broken_move)
                        return this.close_and_reopen(old_order, new_order, cb);

//                api.moveOrder(old_order['id'], new_order['rate'], new_order['amount'], false, false, (success, amount, msg) => {
                    l.d('Polo: About to move order in ' + new_order['mname'] + ' (no. ' + old_order['orderNumber'] + ' rate=' + new_order['rate'] + ' amount=' + new_order['amount']);
//                    api.moveOrder(old_order['id'], new_order['rate'], new_order['amount'], false, false, (err, body) => {
                    api.moveOrder(old_order['orderNumber'], new_order['rate'], new_order['amount'], false, false, (err, body) => {

                        if (err) {
                            l.e('Failed to move order no. ' + old_order['orderNumber'] + ': err=' + err + ' body=' + JSON.stringify(body));
                            l.d('Bringing in standing orders to see how come we failed to move the order');
                            api.returnOpenOrders(new_order['mname'], (err, body) => {
                                if (err) {
                                    l.e('Failed to fetch open orders in ' + new_order['mname'] + '. err=' + err + ' body=' + JSON.stringify(body));
                                }
                                l.d('Got open orders in ' + new_order['mname'] + ': ' + JSON.stringify(body));
                            });
                            handle_error(err);
                            return cb(old_order);
                        }
                        l.d('Polo: Order moved in ' + new_order['mname']);
                        var new_active_order = JSON.parse(JSON.stringify(old_order));
                        new_active_order['rate'] = new_order['rate'];
                        new_active_order['amount'] = body['amount'];
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
                        return cb(new_active_order);
                    });
                }
            },

            issue_new_order: function (order, cb) {

                if (order['type'] == 'Buy') {
//                    api.buy(currencyPair, rate, amount, fillOrKill, immediateOrCancel, postOnly [, callback])
                    if (PAPER_TRADE) {
                        l.w('issue_new_order: ' + order['mname'] + ' PAPER_TRADE. Would have bought ' + JSON.stringify(order));
                        return cb(order);
                    } else {
                        l.d('Polo: About to place a buy order in ' + order['mname']);
                        api.buy(order.mname, order.rate, order.amount, false, false, false, (err, body) => {
                            if (err) {
                                l.e('Failed to issue buy order ' + JSON.stringify(order) + ': err=' + err + ' body=' + body);
                                handle_error(err);
                                return cb(null);
                            }
                            l.d('Polo: Buy order placed in ' + order['mname']);
                            return cb(body);
                        });
                    }
                } else {
                    if (PAPER_TRADE) {
                        l.w('issue_new_order: ' + order.mname + ' PAPER_TRADE. Would have sold ' + JSON.stringify(order));
                        return cb(order);
                    } else {
                        l.d('Polo: About to place a sell order in ' + order['mname']);
                        api.sell(order.mname, order.rate, order.amount, false, false, false, (err, body) => {
                            if (err) {
                                l.e('Failed to issue sell order ' + JSON.stringify(order) + ': err=' + err + ' body=' + body);
                                handle_error(err);
                                return cb(null);
                            }
                            l.d('Polo: Sell order placed in ' + order['mname']);
                            return cb(body);
                        });
                    }
                }
            },


            // sr polo methods --
            // - returnCompleteBalances
            // - returnTradeHistory
            // - returnOpenOrders
            // - cancelOrder
            // - buy
            // - sell
            // - moveOrder
/*
      // Public methods and variables
      publicMethod: function () {
        console.log( "The public can see me!" );
      },
 
      publicProperty: "I am also public",
 
      getRandomNumber: function() {
        return privateRandomNumber;
      }
*/ 
		};
 
	};

	return {
 
    // Get the Singleton instance if one exists
    // or create one if it doesn't
	    get_instance: function () {		// Why do we need this? Can't we just return the instance from the main?
//l.e('get_instance: inst=' + JSON.stringify(inst));
			if ( !inst) {
//			if (inst == {}) {
		        inst= init();
                l.d('get_instance: poloniex singleton initialized - ' + JSON.stringify(inst));
			}
			return inst;
		}
	};
})();
/*
// const fs = require('fs');
const fs = import fs;
//const PoloniexAPI = require('poloniex-api-node');
const PoloniexAPI = import('poloniex-api-node');
//const l = require ('./log');
const l = import('./log');

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

    get_instance () {

        return this;
    }

    register_market(mname, trigger) {

        this.markets[mname] = { 'trigger': trigger };
        this._api.subscribe(mname);
    }

    fetch_balances (cb=null) {

        if (!this.fetching_balances) {

            this.fetching_balances = true;
            this._api.returnCompleteBalances("exchange", function (err, balances) {

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
*/
