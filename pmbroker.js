'use strict';

const fs = require ('fs');
const argv = require('minimist')(process.argv.slice(2));
const c = JSON.parse (fs.readFileSync (argv['c']));
const l = require ('./log');
const u = require('./utils');
const n = require('./nijez');
const Act = require('./act');
var Inotify = require('inotify').Inotify;
var inotify = new Inotify();
c['exch'] = require('./' + c['EXCHANGE']);
c['confabulator'] = require('./rlexecConfabulator');
c['confabulator'].init (c);
var acts = [];

inotify.addWatch({
    path:       c['VOLATILE_DIR'],
    watch_for:  Inotify.IN_CLOSE_WRITE,
    callback:   function (event) {
        if (event.name == c['ORDERS_FN']) {
            l.i(`${event.name} closed.`);
            processOrders();
        }
    }
});

l.i('Up and listening for orders on ' + c['VOLATILE_DIR'] + c['ORDERS_FN']);

function processOrders() {

//    let acts = [];
    let fn = c['VOLATILE_DIR'] + c['ORDERS_FN'];
    fs.readFile (fn, 'utf8', function (err, data) {

        if (err) {
            l.e(`Error reading file ${fn}: ${err}`);
            return;
        }
        l.d(c['ORDERS_FN'] + " dump: " + data);
        let json = JSON.parse(data);
        c['TIMEOUT'] = json['timeout'];
        var actions = json['actions'];
        for (i in actions) {

            acts[i] = new Act (actions[i], c);
        }
    }
    /* var timer = */ setInterval (triggerAll, c['TIMER_PERIOD']);
    c['SALES_DONE'] = false;
    runAllSells (); //runAllBuys? Nijez summary?
}

function runAllSells () {

    for (i in acts) {

        if (acts[i]['type'] == 'Sell') {

            acts[i].run();
        }
    }
}

function runAllBuys () {

    for (i in acts) {

        if (acts[i]['type'] == 'Buy') {

            acts[i].run();
        }
    }
}

function triggerAll () {

    if (triggerAllActs('Sell'))
        return;

    if (!c['SALES_DONE']) {

        c['SALES_DONE'] = true;
        runAllBuys();
    }

    if (triggerAllActs('Buy'))
        return;

    summarizeRun();
    process.exit(0);
}

function triggerAllActs(type) {

    let ret = false;

    for (i in acts) {

        if (acts[i]['type'] == type && acts[i].canBeTriggered()) {

            acts[i].trigger();
            ret = true;
        }
    }
    return ret;
}

function summarizeRun() {

    l.d('Acts after run:' + JSON.stringify(acts, null, 2));
}

// get config
// open listener
// wait for file
//
// When file arrives --
// create and verify acts
// init exchange streams
// loop over events and actions
// finalize
// exit
