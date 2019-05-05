
// levels
// e - error
// w - warning
// i - info
// d - debug
// v - verbose

nl = {
    error: {
        n:  5,
        pref: '\x1b[38;2;255;63;191mERROR\x1b[0m: ',
    },
    warning: {
        n:  4,
        pref: '\x1b[38;2;255;255;0mWARNING\x1b[0m: ',
    },
    info: {
        n:  3,
        pref: "I: ",
    },
    debug: {
        n:  2,
        pref: "D: ",
    },
    verbose: {
        n:  1,
        pref: "V: ",
    },
};
    
var defaults = {

    min:    'debug',
    color:  false,
    level:  'info',
};

module.exports = {

    logger: function (payload, options) {

        opts = get_opts (options);
        lo = nl[opts['level']];


        if (lo['n'] < nl[opts['min']]['n']) {
            return;
        }

        console.log (lo['pref'] + payload);
    },

    e: function (p, o) { o = o || {}; o['level']='error'; module.exports['logger'](p, o); },
    w: function (p, o) { o = o || {}; o['level']='warning'; module.exports['logger'](p, o); },
    i: function (p, o) { o = o || {}; o['level']='info'; module.exports['logger'](p, o); },
    d: function (p, o) { o = o || {}; o['level']='debug'; module.exports['logger'](p, o); },
    v: function (p, o) { o = o || {}; o['level']='verbose'; module.exports['logger'](p, o); },
}

function get_opts (options) {

    var o = defaults;

    for (i in Object.keys(options)) {

        key = Object.keys(options)[i];
        o[key] = options[key];
    }

    return o;
}


