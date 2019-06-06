'use strict';

const fs = require ('fs');
const moment = require('moment');
const argv = require('minimist')(process.argv.slice(2));
// const c = JSON.parse (fs.readFileSync (argv['c']));
const c = require('./' + argv['c']);
//console.log('Config: ' + JSON.stringify(c, null, 2));
const l = require ('./log');
const u = require('./utils');
const nijez = require('./nijez');
const Act = require('./act');
var Inotify = require('inotify').Inotify;
var inotify = new Inotify();
l.v('Using exchange ' + c['EXCHANGE']);
c['exch'] = require('./' + c['EXCHANGE']).get_instance(cb_exch_init_done);
//c['exch'] = import('./' + c['EXCHANGE']).get_instance();
c['confabulator'] = require('./rlexecConfabulator');
c['confabulator'].init(c, cb_confab_init_done);
var acts = [];

var confab_init_done = false,
    exch_init_done   = false;

function cb_exch_init_done()   { l.d('confab_cb'); global.exch_init_done   = true; go(); }
function cb_confab_init_done() { l.d('exch_cb'); global.confab_init_done = true; go(); }

function go() {

    l.d('exch_init_done = ' + global.exch_init_done + ' confab_init_done = ' + global.confab_init_done);
    if (!global.confab_init_done || !global.exch_init_done) return;
    l.d('2');

    if (fs.existsSync(c['VOLATILE_DIR'] + c['ORDERS_FN'])) {
        l.w('go: Consuming pre-existing ' + c['ORDERS_FN'] + ' file. Did we crash?');
        processOrders();
    } else {
        inotify.addWatch({
            path:       c['VOLATILE_DIR'],
            watch_for:  Inotify.IN_CLOSE_WRITE,
            callback:   function (event) {
                if (event.name == c['ORDERS_FN']) {
                    l.d(`${event.name} close detected. Will consume.`);
                    processOrders();
                }
            }
        });
        l.i('Up and listening for orders on ' + c['VOLATILE_DIR'] + c['ORDERS_FN']);
    }
}

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
        let actions = json['actions'];
        for (let aid in actions) {

            acts[aid] = new Act (actions[aid], c);
            l.d('act no. ' + aid + ' just created (' + acts[aid].type + ' ' + acts[aid].amount + ' ' + acts[aid].mname + '). state is ' + acts[aid].state);
        }
        /* var timer = */ setInterval (triggerAll, c['TIMER_PERIOD']);
//        setInterval (() => { l.e('Killed by watchdog.'); nijez.nijez('Killed by watchdog.'); process.exit(1); }, 1200000); // Watchdog
        setInterval (() => { u.crash('Killed by watchdog.'); }, 1200000);
        c['SALES_DONE'] = false;
        runAllSells (); //runAllBuys? Nijez summary? 
    });
}

function renameOrdersFile() {

    if (fs.existsSync(c['VOLATILE_DIR'] + c['ORDERS_FN'])) {
        fs.rename(c['VOLATILE_DIR'] + c['ORDERS_FN'],
                  c['VOLATILE_DIR'] + c['ORDERS_FN'] + ".pmb_bak-" + moment(Date.now()).utc().format("YYYYMMDDHHmmss"),
                  function (err) {
            if (err) {
                l.e(`${c['VOLATILE_DIR'] + c['ORDERS_FN']} failed to be moved: ` + err);
            } else {
                l.d(`${c['VOLATILE_DIR'] + c['ORDERS_FN']} moved.`);
            }
        });
    }
}

function runAllSells () {

    for (let aid in acts) {

        if (acts[aid]['type'] == 'Sell') {

            l.d('About to run act no. ' + aid + ' (' + acts[aid].type + ' ' + acts[aid].amount + ' ' + acts[aid].mname + ')');
            acts[aid].run();
        }
    }
}

function runAllBuys () {

    for (let aid in acts) {

        if (acts[aid]['type'] == 'Buy') {

            l.d('About to run act no. ' + aid + ' (' + acts[aid].type + ' ' + acts[aid].amount + ' ' + acts[aid].mname + ')');
            acts[aid].run();
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

    renameOrdersFile();
    summarizeRun();
    process.exit(0);
}

function triggerAllActs(type) {

    let ret = false;

    for (let aid in acts) {

        l.d('triggerAllActs for type ' + type + ': acts[' + aid + '][type]=' + acts[aid]['type'] + ' canBeTriggered=' + acts[aid].canBeTriggered());
        if (acts[aid]['type'] == type && acts[aid].canBeTriggered()) {

            l.d('triggerAllActs: Triggering act[' + aid + ']')
            acts[aid].trigger([]);
            ret = true;
        }
    }
    return ret;
}

function summarizeRun() {

    let nijezstr = '';
    for (let aid in acts) {
        l.d('Got nijez line after act was done: ' + acts[aid]['nijezline']);
        if (acts[aid]['nijezline'] != null && acts[aid]['nijezline'].length > 0) {
            nijezstr += acts[aid]['nijezline'] + '\n';
            acts[aid]['state'] = 'FINALIZED';
            // TODO: Tell act to delete hooks and release other resources. Remove (?) from array.
        } else {
            if (acts[aid]['state'] != 'INVALID') {
                l.w('Got an empty nijez line from a non invalid act.');
            }
        }
    }
    if (nijezstr.length > 0) { // This doesn't work. Why?
//        for (var bal in c['exch'].balances
        nijezstr += 'Total account value: ' + (1000. * c['exch'].portfolio_value()).toPrecision(6) + 'mB'; //.acc_balance;
        l.i('Emitting the following to nijez: ' + nijezstr);
        nijez.nijez(nijezstr);
    } else {
        l.d('pmbroker: No acts to report on. Will not nijez.');
    }
    l.d('Acts after run:' + JSON.stringify(acts, null, 2), '\n\n');
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
