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

    let acts = [];
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
    runAllSells (acts); //runAllBuys? Nijez summary?
}

function runAllSells (acts) {

    for (i in acts) {

        if (acts[i]['type'] == 'Sell') {

            acts[i].run();
        }
    }
}

function runAllBuys (acts) {

    for (i in acts) {

        if (acts[i]['type'] == 'Buy') {

            acts[i].run();
        }
    }
}

function triggerAll (acts) {
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
