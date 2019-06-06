const l = require ('./log');
const nijez = require('./nijez');

module.exports = {

    are_close: function (a, b, distance) {
        if (parseFloat(a) - parseFloat(b) < parseFloat(distance) &&
            parseFloat(b) - parseFloat(a) < parseFloat(distance)) {
            return true;
        }
        return false;
    },

    sleep: function (ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    },

    getSortedOB: function (ob) {
 
        return Object.keys(ob).sort(function (a, b) { return a - b }).map(x => [x, ob[x]]);
    },

    midprice: function (market) {
//        console.log ('midprice: market=' + JSON.stringify (market));
        getSortedOB = module.exports['getSortedOB'];
//        console.log('midprice: mname=' + market['mname'] + ' bottom=' + getSortedOB(market['ob_bids']).reverse()[0][0] + ' top=' + getSortedOB(market['ob_asks'])[0][0]);
        ret = .5 * (parseFloat(getSortedOB(market['ob_bids']).reverse()[0][0]) + parseFloat(getSortedOB(market['ob_asks'])[0][0]));
        l.v('midprice: returning ' + ret);
        return ret;
//        return .5 * (getSortedOB(market['ob_bids']).reverse()[0][0] + getSortedOB(market['ob_asks'])[0][0]);
    },

    get_depth_price: function  (no_deeper_than, ob) {
        l.v ('get_depth_price: no_deeper_than = ' + no_deeper_than + 'alt');
        v = 0;
//        i = 0;
//        for ((price, volume) in ob) {
        for (order in ob) {
            price = ob[order][0];
            volume = ob[order][1];
//            i++;
            l.v('price = ' + price + 'bsat => v + volume = ' + v + 'altsat + ' + volume + 'altsat');
            if (parseFloat(v) + parseFloat(volume) > no_deeper_than) {
                return price;
            } else {
                v += parseFloat(volume);
            }
        }
        throw "OB depleted";
    },
    
    remove_self_from_ob: function (ob, act) {
        ret = JSON.parse (JSON.stringify (ob));
/*        for (oid in Object.keys(act['active_orders'])) {
            delete ret[Object.keys(act['active_orders'])[oid]];
            l.v(act['mname'] + ': removed self at ' + Object.keys(act['active_orders'])[oid] + ' from ob');
        }*/
        if (act.active_order != null) {
            delete ret[act.active_order.rate];
            l.v(act.mname + ': removed self at ' + act.active_order.rate);
        }
        return ret;
    },

    crash: function (errstr) {
        let s = Math.random().toString(36).substring(8) + ' ' + errstr;
        l.e(errstr + '\nStack: ' + new Error().stack);
        nijez.nijez(errstr);
        process.exit(1);
    },
};

