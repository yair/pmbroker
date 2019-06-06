module.exports = {
    MINIMUM_TRADE: 0.0001,         // 10ksat @poloni
    MINIMUM_BTC_TRADE: 0.000001,   // 100sat @poloni
    PRICE_RESOLUTION: 0.00000001,  // 1sat @poloni
    PENDING_TIMEOUT: 15000,        // ms
    TIMER_PERIOD: 5000,            // ms
    LOG_STREAMS: false,
//    VOLATILE_DIR: '/home/yair/w/test_volatile/',
    VOLATILE_DIR: '/home/yair/w/volatile/',
    ORDERS_FN: 'orders.json',
    PAPER_TRADE: false, // Set orders on top of existing ones and don't execute
    BASEDIR: '/home/yair/w/dm_raw/sr/' + `${Math.floor(new Date() / 1000)}/`,
    EXCHANGE: 'poloniex',
}
