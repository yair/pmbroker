const fs = require('fs');

const NIJFN = '/home/yair/w/nijez/volatile/polotrader_'

module.exports = {

    nijez: function (p) {
        nfn = NIJFN + Date.now();
        fs.writeFile(nfn, p, (err) => {
            if (err) console.log("Failed to write '" + p + "' to " + nfn);
            else console.log("Successfully wrote '" + p + "' to " + nfn);
        });
    }
};

