
export class BGTimer {
	constructor(prec) {
		this.prec = (prec!==undefined) ? prec : 3;
		this.startTime = null;
		this.lap   = null;
		this.ticks = [];
		this.tickAccumulation = 0.0;
		this.start();
	}

	start() {
		var current = process.hrtime.bigint();
		this.startTime = current;
		this.lap   = current;
		this.ticks = [];
		this.ticks.push({
			startTime: current,
			endTime: null,
			delta: null
		})
	}

	// call at the top of callbacks and after awaits
	tickStart() {
		this.ticks.push({
			startTime: process.hrtime.bigint(),
			endTime: null,
			delta: null
		})
	}
	// call at the end of callbacks and before awaits (just before they yield)
	tickEnd() {
		var tick = this.ticks[this.ticks.length-1];
		if (tick.endTime)
			console.log("BGTimer: error: tickEnd called without a matching tickStart/start");
		else {
			tick.endTime = process.hrtime.bigint();
			tick.delta = this.bgNanoToSec(tick.endTime-tick.startTime);
			this.tickAccumulation += tick.delta;
		}
	}

	get()   {return this.bgNanoToSec(process.hrtime.bigint() - this.startTime) }
	print(description, prec) {
		var prec = (prec!==undefined) ? prec : this.prec;
		console.log('total : '+this.get().toFixed(prec)+' : '+description);
	}

	lapGet()   {return this.bgNanoToSec(process.hrtime.bigint() - this.lap) }
	lapPrint(description, prec) {
		var prec = (prec!==undefined) ? prec : this.prec;
		var current = process.hrtime.bigint();
		var delta = this.bgNanoToSec(current - this.lap);
		this.lap = current;
		console.log('lap : '+delta.toFixed(prec)+' : '+description);
	}

	printDetails(description) {
		this.tickEnd();
		var total = this.get()
		var activePercent = this.tickAccumulation * 100.0 / total;
		console.log("BGTimer ended:"+description);
		console.log("   real elapsed  : "+total.toFixed(3));
		console.log("   active elapsed: "+this.tickAccumulation.toFixed(3));
		console.log("   % active      : "+activePercent.toFixed(0)+'%');
	}

	bgNanoToSec(nano) {
		var nano = nano.toString();
		while (nano.length < 10) nano = '0'+nano;
		var frac=nano.slice(-9);
		var sec=nano.slice(0, nano.length-9);
		return parseFloat(sec+'.'+frac);
	}
}
