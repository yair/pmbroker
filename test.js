'use strict';
class cl {
    constructor () { console.log ('c'); this.b();
        this.d = () => { console.log('d'); this.b(); console.log('including private: ' + Object.getOwnPropertyNames(this)); };
    }
    a () { console.log ('a') };
    b () { this.a(); console.log('including private: ' + Object.getOwnPropertyNames(this) + ' and prototype: ' + Object.getOwnPropertyNames(Object.getPrototypeOf(this))); };
    
}

var  o = new cl();
o.b();
o.d();
console.log(JSON.stringify(o));
console.log('only public: ' + Object.getOwnPropertyNames(o));
