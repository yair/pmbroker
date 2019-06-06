const fs = require('fs');

const NIJFN = '/home/yair/w/nijez/volatile/pmbroker_'

module.exports = {

    nijez: function (p) {
        nfn = NIJFN + Date.now();
        console.log('NijezLib: Writing ' + p + ' to ' + nfn);
        if (p.length <= 0 /*or p.indexOf('\n') != -1*/) {
//            console.log('Nijezlib: Got an empty string or contains a carriage return. Crashing.');
            console.log('Nijezlib: Got an empty string. Crashing.');
            process.exit(1);
        }
        fs.writeFileSync(nfn, p);/*, (err) => {
            if (err) console.log("Failed to write '" + p + "' to " + nfn);
            else console.log("Successfully wrote '" + p + "' to " + nfn);
        });*/
    }
};

