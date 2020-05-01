
// This is a Promise compatible class that allows a function to support both Promise and callback patterns. I find functions written
// to the real Promise class to be hard to follow because the algorithms needs to be written inside the Promise constructor. This
// allows a bit more declarative coding style. 
// The difference between this and Promise is that it has a default constructor and explict resolve() and reject() methods that can
// be called explicitly
// This opens the BGPromise up to using it like an IPC semaphore-like semantics with the await statement. 
export class BGPromise {
	constructor() {
		this.state = BGPromise.pending;
		this.onResolvedCBList = [];
		this.onRejectedCBList  = [];
		this.firedResolveCBList = [];
		this.firedRejectedCBList =[];
		this.seenResolveCBs = new Set();
		this.seenRejectCBs = new Set();
		this.p = null;
	}

	resolve(...p) {
		this.state = BGPromise.resolved;
		this.p = p;
		return this._checkForFire();
	}

	reject(...p) {
		this.state = BGPromise.rejected;
		this.p = p;
		return this._checkForFire();
	}

	then(onResolvedCB, onRejectedCB) {
		if (typeof onResolvedCB == 'BGPromise') {
			var prom = onResolvedCB;
			prom.onResolvedCBList.map((cb)=>{this._addCallbacks(cb,null)})
			prom.onRejectedCBList.map((cb)=>{this._addCallbacks(null,cb)})
		} else {
			this._addCallbacks(onResolvedCB, onRejectedCB)
		}
		return this._checkForFire();
	}

	finally(onFinishedOneWayOrAnother) {
		this._addCallbacks(onFinishedOneWayOrAnother, onFinishedOneWayOrAnother)
		return this._checkForFire();
	}

	// The concept of resetting is new to this type of promise. This base class can be reset manually to reuse it but the reall 
	// use-case is the BGRepeatablePromise derived class that automatically resets after each resolve. This allows using it in a
	// loop with await that 'wakes' up each time the promise is resolved. 
	reset() {
		// if we have been resolved or rejected but noone has received those results, we do not reset because we dont want to loose
		// those results. 
		if (this.state != BGPromise.pending && this.firedResolveCBList.length+this.firedRejectedCBList.length>0) {
			this._checkForFire(); // make sure any new cb are drained into the fired* arrays
			switch (this.state) {
				case BGPromise.resolved: this.onResolvedCBList = this.firedResolveCBList; this.firedResolveCBList = []; break;
				case BGPromise.rejected: this.onRejectedCB = this.firedRejectedCBList; this.firedRejectedCBList = []; break;
			}
			this.p = null;
			this.state = BGPromise.pending
		}
	}

	_addCallbacks(onResolvedCB, onRejectedCB) {
		if (onResolvedCB && ! (onResolvedCB.toString() in this.seenResolveCBs)) {
			this.onResolvedCBList.push(onResolvedCB);
			this.seenResolveCBs.add(onResolvedCB.toString())
		}
		if (onRejectedCB && ! (onRejectedCB.toString() in this.seenRejectCBs)) {
			this.onRejectedCBList.push(onRejectedCB);
			this.seenRejectCBs.add(onRejectedCB.toString())
		}
	}

	_checkForFire() {
		switch (this.state) {
			case BGPromise.resolved: if (this.onResolvedCBList.length > 0) this._doResolve(); break;
			case BGPromise.rejected: if (this.onRejectedCBList.length > 0) this._doReject(); break;
		}
		return this
	}

	_doResolve() {
		for (const cb of this.onResolvedCBList) {
			cb(...this.p)
		};
		this.firedResolveCBList.concat(this.onResolvedCBList); this.onResolvedCBList=[];
	}

	_doReject() {
		for (const cb of this.onRejectedCBList) {
			cb(...this.p)
		};
		this.firedRejectedCBList.concat(this.onRejectedCBList); this.onRejectedCBList=[];
	}
}

BGPromise.pending = Symbol('pending')
BGPromise.resolved = Symbol('resolved')
BGPromise.rejected = Symbol('rejected')

export class BGRepeatablePromise extends BGPromise {
	resolve(...p) {
		super.resolve(...p)
		this.p = null;
		this.state = BGPromise.pending;
	}
}
