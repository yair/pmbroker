const PoloniexAPI = require('poloniex-api-node');
var secrets = JSON.parse(fs.readFileSync ('poloniex_secrets.json', 'utf8'));
var api = new PoloniexAPI(secrets['key'], secrets['secret'], { nonce: () => Date.now() * 2000 });
var id;
api.buy('BTC_ETH', 0.02, 0.06, false, false, false, (err, body) => {
    print('Buy results: ' + JSON.stringify(body));
    id = body['orderNumber'];
});
api.moveOrder(id, 0.021, 0.06, false, false, (err, body) => {
    print('First move results: ' + JSON.stringify(body));
    id = body['orderNumber'];
}
api.moveOrder(id, 0.022, 0.06, false, false, (err, body) => {
    print('Second move results: ' + JSON.stringify(body));
    id = body['orderNumber'];
}
