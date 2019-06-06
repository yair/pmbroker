// 'use strict';

const fs = require('fs');
const PoloniexAPI = require('poloniex-api-node');
const l = require ('./log');
const CircularJSON = require('circular-json');
const u = require('./utils');

var initialized_cb = null;

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
        var order_lut = {};
        var acc_balance = 0.;
        var accnotifs = [];
//		inst.fetching_balances = false;      // Do we need a timeout on this? // Isn't that part of the state machine?

        var balances_fetched = false,
            websocket_open   = false,
            accnotif_registered = false
            strays_cancelled = false;

        function init_done() { return balances_fetched && websocket_open && accnotif_registered && strays_cancelled; }

		var secrets = JSON.parse(fs.readFileSync ('poloniex_secrets.json', 'utf8'));
		var api = new PoloniexAPI(secrets['key'], secrets['secret'], { nonce: () => Date.now() * 2000 });
		api.on('message', on_message);
		api.on('open', () =>  {
            l.i ('WebSocket stream open')
            websocket_open = true;
            l.d('balances_fetched=' + balances_fetched + ' websocket_open='+websocket_open + 'accnotif_registered=' + accnotif_registered + 'strays_cancelled=' + strays_cancelled);
//            if (balances_fetched && websocket_open && accnotif_registered && strays_cancelled) initialized_cb();
            if (init_done()) initialized_cb();
        });

		api.on('close', on_close);
//		api.on('error', (error) => { l.e('Poloniex ERROR: ' + error) });
		api.on('error', (error) => { u.crash('Poloniex ERROR: ' + error) });
		api.on('heartbeat', () => { l.v('Poloniex heartbeat') });
		api.openWebSocket({ version: 2 });
        api.subscribe('accountNotifications');
//		cancel_all_orders_and_fetch_balances(); // Why can't private functions call public ones? This needs to be solved because with accnotif we won't be fetching balances again. Nah, fetching open orders only works on a per-market basis. Let's hope we don't crash, cancel stray orders at the end and hope we're getting a clean slate on startup. :/
        // "XEM":{"available":"2.61408745","onOrders":"0.00000000","btcValue":"0.00002964"}
        fetch_balances( (b) => {
            l.i('Poloniex balances fetched');
            l.v('Fetched Balances: ' + JSON.stringify(b));
            balances = b;
            if (cancel_strays(b))
                strays_cancelled = true;
            Object.values(balances).map( (b) => { acc_balance += parseFloat(b['btcValue']); } );
            l.d('Polo: Total account value is ' + (1000. * acc_balance).toPrecision(6) + 'mB');
            balances_fetched = true;
            l.d('balances_fetched=' + balances_fetched + ' websocket_open='+websocket_open + 'accnotif_registered=' + accnotif_registered + 'strays_cancelled=' + strays_cancelled);
//            if (balances_fetched && websocket_open && accnotif_registered && strays_cancelled) initialized_cb();
            if (init_done()) initialized_cb();
        });
//		inst.state = 'READY';
 
        function fetch_balances(cb=null) {

//            l.e('inst before fetching balances: ' + JSON.stringify(inst));
//	        if (!function.fetching_balances) { // Really? Isn't all locking done on the act level?

//	            this.fetching_balances = true;
//                this.needs_fetch_balances = false;
            l.d('Polo: About to fetch balances.');
            api.returnCompleteBalances("exchange", function (err, _balances) {

                if (err) { u.crash('Error fetching balances: ' + err); }
//                if (err) { l.e ('Error fetching balances: ' + err); handle_error(err); }
                l.d('Polo: Balances fetched.'); //: ' + JSON.stringify(_balances));

                l.d('Polo: BTC balance: ' + JSON.stringify(_balances['BTC']));
                balances = _balances;
//                l.e('inst after fetching balances: ' + CircularJSON.stringify(inst));
//                this.fetching_balances = false;
                if (cb) { cb(balances); }       // TODO: We can tell here if there're any stray orders and cancel them!
            });
//        }
        }

        function cancel_strays(b) {

            let ret = true; // meaning no strays found
            // "onOrders":"0.00000000"
            for (let aid in Object.keys(b)) {
                let a = Object.keys(b)[aid];
//                l.d('scanning ' + a + ' => ' + JSON.stringify(b[a]));
                if (b[a]['onOrders'] != "0.00000000") {
                    l.w('Polo: Found stray orders in market ' + a + ': ' + JSON.stringify(b[a]));
                    ret = false;
                }
            }
            if (ret) return ret;

            l.i('Polo: Cancelling stray orders.');

            api.returnOpenOrders('all', (err, body) => {

                if (err) { u.crash('Error fetching balances: ' + err); }
//                if (err) { l.e ('Error fetching balances: ' + err); handle_error(err); }

                var strays_to_be_cancelled = 0,
                    strays_actually_cancelled = 0;

                for (let mid in Object.keys(body)) {
                    let m = Object.keys(body)[mid];
                    if (body[m] == []) continue;
                    l.d('Polo: stray orders in market ' + m + ': ' + JSON.stringify(body[m]));

                    for (let oid in body[m]) {
                        let o = body[m][oid];
                        l.d('Polo: Cancelling order ' + m + ': ' + JSON.stringify(o));
                        strays_to_be_cancelled++;
                        api.cancelOrder(o['orderNumber'], (err, body) => {

                            if (err) { u.crash('Polo: Error cancelling order ' + m + ': ' + JSON.stringify(o) + ': ' + err); }
//                            if (err) { l.e ('Polo: Error cancelling order ' + m + ': ' + JSON.stringify(o) + ': ' + err); handle_error(err); }

                            strays_actually_cancelled++;

                            l.d('Polo: Order ' + strays_actually_cancelled + '/' + strays_to_be_cancelled + ' cancelled: ' + m + ': ' + JSON.stringify(o));

                            if (strays_to_be_cancelled == strays_actually_cancelled) {
                                l.d('Polo: Done cancelling (' + strays_actually_cancelled + ') strays.');
                                strays_cancelled = true;
                                l.d('balances_fetched=' + balances_fetched + ' websocket_open='+websocket_open + 'accnotif_registered=' + accnotif_registered + 'strays_cancelled=' + strays_cancelled);
//                                if (balances_fetched && websocket_open && accnotif_registered && strays_cancelled) initialized_cb();
                                if (init_done()) initialized_cb();
                            }
                        });
                    }
                }
            });

            return ret;
        }

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
            if (channelName == 'accountNotifications') { // Need to handle all of them here. Can we trust these to arrive before command callback? I don't want to remove the lock before we're updated. :/
                return handle_account_notification(data);
            }
	        l.w('Unhandled message in unrecognized channel ' + channelName + '. data=' + data + ', seq=' + seq);
	    }

	    function on_open() {
            l.i ('WebSocket stream open');
	    }

	    function on_close(reason, details) {
	        l.i ('connection closed. reason: ' + reason + ' details: ' + details);
	    }

/*        function handle_error(e) {  // TODO: deprecated by u.crash()
            l.d("*** POLO ERROR: " + JSON.stringify(e) + " Stack: " + new Error().stack); // TODO: nijez and exit
            // process.exit(1);
            // Exit prog on some of the errors (e.g., 403 unauthorized)
            // Other actions on other errors (e.g. reduce trade size on in sufficient funds)
            //
        }*/

        function handle_account_notification(data) {
            l.d('New accountNotification message: ' + JSON.stringify(data));
            accnotifs.push(data);
            if ( data == 'subscriptionSucceeded') {
                l.i("Poloniex: Account Notification stream open.");
                accnotif_registered = true;
            l.d('balances_fetched=' + balances_fetched + ' websocket_open='+websocket_open + 'accnotif_registered=' + accnotif_registered + 'strays_cancelled=' + strays_cancelled);
//                if (balances_fetched && websocket_open && accnotif_registered && strays_cancelled) initialized_cb();
                if (init_done()) initialized_cb();
            } else {
                var new_order = null, old_order = null, mname = null, new_trades = [];
                for (var did in data) {
                    datum = data[did];
                    if ('wallet' in datum['data'] && datum['data']['wallet'] == 'margin') {
                        l.d('Polo Accnotif: This is about margin wallets. Will silently return.');
                        return;
                    }
                    switch (datum['type']) {
                        case 'balanceUpdate':
                            l.d('Polo: BTC balance: ' + JSON.stringify(balances['BTC'])); // Why can't we access this?!
                            l.d('Polo Accnotif: updating balance balances[' + datum['data']['currency'] + '][\'available\']');
                            l.d('Polo Accnotif: Said balance record is ' + JSON.stringify(balances[datum['data']['currency']]));
                            var new_balance = parseFloat(balances[datum['data']['currency']]['available']) + parseFloat(datum['data']['amount']);
//                            l.d('Polo Accnotif: balance update. Modifying ' + datum['data']['currency'] + ' by ' + datum['data']['amount'] + ' (from ' + balances[datum['data']['currency']]['available'] + ' to ' + (parseFloat(balances[datum['data']['currency']]['available']) + parseFloat(datum['data']['amount'])) + ')');
                            l.d('Polo Accnotif: balance update. Modifying ' + datum['data']['currency'] + ' by ' + datum['data']['amount'] + ' (from ' + balances[datum['data']['currency']]['available'] + ' to ' + new_balance + ')');
                            balances[datum['data']['currency']]['available'] = new_balance; // TODO: If we need this at all, change onOrders as well.
                            break;
                        case 'newLimitOrder':
                            // We get these both on new orders and on order move. Then it is most important because it contains the new ID.
                            l.i('Polo Accnotif: Got new limit order: ' + JSON.stringify(datum['data']));
                            new_order = datum['data'];
                            mname = datum['data']['currencyPair'];
                            order_lut[new_order['orderNumber']] = mname;
                            break;
                        case 'orderUpdate':
                            // We get these on moves and partials, then it contains the _old_ id, and on execution. In both cases the amount is 0 (even on partials?)
                            if (datum['data']['amount'] != 0) {
                                l.d('Polo Accnotif: Got a non-zero amount orderUpdate. This is a partial fill of a limit order.');
//                                l.e('Polo Accnotif: Got a non-zero amount orderUpdate. Dunno how to handle this, so I\'ll crash: ' + JSON.stringify(datum['data']));
//                                process.exit(1);
                            }
                            l.d('Polo Accnotif: Got an old order to delete: ' + JSON.stringify(datum['data']));
                            old_order = datum['data'];
                            if (old_order['currencyPair'] != null) {
                                mname = order_lut[old_order['orderNumber']] = old_order['currencyPair']
                            } else if (order_lut[old_order['orderNumber']] != null) {
                                mname = order_lut[old_order['orderNumber']];
                            } else {
                                if (!init_done()) {
                                    l.d('Got an orderUpdate actNotif but we do not know which market it belongs to, prolly a stray since in init.');
                                } else {
                                    u.crash('Got an orderUpdate actNotif but we do not know which market it belongs to. ' + old_order['orderNumber']);
/*                                    l.e('Got an orderUpdate actNotif but we do not know which market it belongs to. ' + old_order['orderNumber']);
                                    handle_error();
                                    process.exit(1);*/
                                }
                            }
//                                if (mname == null)
//                                    l.e('Got an order update;
//                            mname = order_lut[old_order['orderNumber']];
                            break;
                        case 'newTrade':
                            l.d('PoloAccnotif: *** NEW TRADE ***. Yay!: ' + JSON.stringify(datum['data'])); // DONE: Use this data to recalc remining amount! (and no need to do, I think)
/*                            if (new_trade != null) {
                                l.e('Polo: Seems we can get more than one new trade per notification. Crashing now. Please change scalar to an array.');
                                process.exit(1);
                            }*/
                            new_trades.push(datum['data']);
                            break;
                        default:
                            u.crash('PoloAccnotif: Unknown message type received. datum=' + JSON.stringify(datum));
/*                            l.e('PoloAccnotif: Unknown message type received. datum=' + JSON.stringify(datum));
                            process.exit(1);*/
                            break;
                    }
                }
                if (new_order == null && old_order == null) {
                    l.d('Polo Accnotif: Got neither old nor new orders. Not pinging act.');
                    return;
                }
                if (mname != null) {
                    l.d('PoloAccnotif: returning --');
                    l.d('PoloAccnotif: old=' + JSON.stringify(old_order));
                    l.d('PoloAccnotif: new=' + JSON.stringify(new_order));
                    l.d('PoloAccnotif: trades=' + JSON.stringify(new_trades));
    	            return markets[mname]['update_orders'](old_order, new_order, new_trades);
                } else {
                    l.d('PoloAccnotif: Notif without mname. No one to notify.');
//                    process.exit(1);
                }
            }
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
                    l.d('coin_name_from_market: ' + mname + ' => ' + mname.substring(4));
		            return mname.substring(4);
		        }
		    },

            balance: function (cname) {
                l.d('Polo: Fetching balance for ' + cname + ': ' + JSON.stringify(balances[cname]));
                return balances[cname]['available'] + balances[cname]['onOrders'];
            },

            portfolio_value: function () {
/*                var tot=0;
                for (var balance in balances) {
                    tot += balance
                }*/
                return acc_balance;
            },

	    	register_market: function (mname, trigger, update_orders) {

		        markets[mname] = { 'trigger': trigger, 'update_orders': update_orders };
		        api.subscribe(mname);
                l.d('Polo: register_market: ' + mname + ' registered. Trigger and update_orders attached, market websocket stream opened.');
		    },

/*            fetch_balances: function (cb=null) {

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
    	    },*/

/*            cancel_all_orders_and_fetch_balances: function (cb=null) { //TODO

                api.
    			return this.fetch_balances(cb);
    		},*/

            cancel_order(order, cb) {   //TODO: DEL
                u.crash('Polo ' + order['mname'] + ': cancel_order called. How come?');
/*                l.e('Polo ' + order['mname'] + ': cancel_order called. How come?');
                process.exit(1);*/
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

            close_and_reopen: function (old_order, new_order, cb) {     //TODO: DEL
                u.crash('Polo ' + order['mname'] + ': close_and_reopen called. How come?');
/*                l.e('Polo ' + order['mname'] + ': close_and_reopen called. How come?');
                process.exit(1);*/
                // TODO: if we really wanna use this fuglinaciousness, we should make sure we're not in a submin partial situation, or we'll fail and lose access to our coins.

                this.cancel_order(old_order, (remaining_order) => {
                    if (remaining_order != null) {
                        u.crash('Polo ' + old_order['mname'] + ': Failed to cancel old order. Will not issue a new one. In fact, let\'s just end it here.');
/*                        l.e('Polo ' + old_order['mname'] + ': Failed to cancel old order. Will not issue a new one. In fact, let\'s just end it here.');
                        process.exit(1);*/
                    }
                    return this.issue_new_order(new_order, cb);
                });
            },

            replace_orders: function (old_order, new_order, cb) { // TODO: DEL

                const broken_move = false; // Poloniex, Goddamn. Nah, it's prolly me.
                l.e('Why are we in replace orders?');

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
                            u.crash('Failed to issue buy order ' + JSON.stringify(order) + ': err=' + err + ' body=' + body);
/*                            if (err) {
                                l.e('Failed to issue buy order ' + JSON.stringify(order) + ': err=' + err + ' body=' + body);
                                handle_error(err);
                                return cb(null);
                            }*/
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
                            u.crash('Failed to issue sell order ' + JSON.stringify(order) + ': err=' + err + ' body=' + body);
/*                            if (err) {
                                l.e('Failed to issue sell order ' + JSON.stringify(order) + ': err=' + err + ' body=' + body);
                                handle_error(err);
                                return cb(null);
                            }*/
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
	    get_instance: function (cb) {		// Why do we need this? Can't we just return the instance from the main?
            initialized_cb = cb;
//l.e('get_instance: inst=' + JSON.stringify(inst));
			if (!inst) {
//			if (inst == {}) {
		        inst = init();
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
