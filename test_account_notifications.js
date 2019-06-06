const PoloniexAPI = require('poloniex-api-node');
const fs = require ('fs');
var secrets = JSON.parse(fs.readFileSync ('poloniex_secrets.json', 'utf8'));
var api = new PoloniexAPI(secrets['key'], secrets['secret'], { nonce: () => Date.now() * 2000 });
api.openWebSocket();
api.subscribe('accountNotifications');
api.on('message', (channelName, data) => {
    if (channelName === 'accountNotifications') {
//        console.log(`account notifications update: ${JSON.stringify(data}`);
        console.log('accnotif ' + Date.now() + ': ' + JSON.stringify(data));
    }
});
