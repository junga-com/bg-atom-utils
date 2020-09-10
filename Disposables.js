export class Disposables {
	constructor(...disposables) {
		this.cbs = [];
		this.add(disposables)
	}
	add(...disposables) {
		disposables = disposables.flat();
		this.cbs.concat(
			disposables.map((cb)=>{
				switch (typeof cb) {
					case 'function': return cb;
					case 'object':
						if (typeof cb.dispose == 'function') return cb.dispose;
						if (typeof cb.destroy == 'function') return cb.destroy;
					case 'null':
					case 'undefined': return undefined;
				}
				assert(false, 'Parameters passed to Disposable must be a function or an Object with a "dispose" or "destroy" method. parameter='+cb)
			})
		);
	}
	dispose() {
		var cb;
		while (cb = this.cbs.shift())
			cb();
	}
}
