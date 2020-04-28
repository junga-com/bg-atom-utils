
import { exec, spawn, execSync }          from 'child_process';

// This is a Promise compatible class that allows a function to support both Promise and callback patterns. I find functions written
// to the real Promise class to be hard to follow because the algorithms needs to be written inside the Promise constructor. This
// allows a bit more declarative coding style. 
// The difference between this and Promise is that it has a default constructor and explict resolve() and reject() methods. 
export class BGPromise {
	constructor() {
		this.state = 'pending';
		this.onFulfilled = [];
		this.onRejected  = [];
	}
	resolve(...p) {
		this.state = 'resolved';
		this.p = p;
		return this.fire();
	}
	reject(...p) {
		this.state = 'rejected';
		this.p = p;
		return this.fire();
	}
	then(onFulfilled, onRejected) {
		if (typeof onFulfilled == 'BGPromise') {
			var prom = onFulfilled;
			this.onFulfilled.push(prom.onFulfilled);
			this.onRejected.push( prom.onRejected);
		} else {
			this.onFulfilled.push(onFulfilled);
			this.onRejected.push( onRejected);
		}
		return this.fire();
	}
	finally(onFinishedOneWayOrAnother) {
		if (typeof onFulfilled == 'BGPromise') {
			var prom = onFulfilled;
			this.onFulfilled.push(prom.onFulfilled);
			this.onRejected.push( prom.onRejected);
		} else {
			this.onFulfilled.push(onFinishedOneWayOrAnother);
			this.onRejected.push( onFinishedOneWayOrAnother);
		}
		return this.fire();
	}
	fire() {
		switch (this.state) {
			case 'resolved': for (const cb of this.onFulfilled) {cb(...this.p)}; break;
			case 'rejected': for (const cb of this.onRejected)  {cb(...this.p)}; break;
		}
		return this
	}
}

// Install an Atom pacakge so that it is active inside Atom. It uses apm cli tool to install the package locally if needed and then
// activates it within Atom so that the packages features should become available as soon as the onInstalledCB callback is invoked.
// This function returns a promise so that it can be used with await in async function and/or the caller can pass in onInstalledCB
// and/or onFailedCB. 
// It is not an error to call this function when the package is already installed or activated. 
// Async Pattern:
//    This is a dual mode async function. You can use the promise it returns or pass it callbacks. 
// Return Value:
//    <pkgInfoInfo> : an object with information about the pkg that was installed. This is the --json output of apm 
//                    note that old versions of apm do not support --json in which case the string output of apm is returned
export function apmInstall(pkgName, onInstalledCB, onFailedCB) {
	var prom = new BGPromise()

	if (global.atom && atom.packages.isPackageActive(pkgName))
		setTimeout(()=>{
			onInstalledCB && onInstalledCB({allreadyActivated: true})
			prom.resolve({allreadyActivated:true});
		},1)


	var cmd = `${GetApmPath()} install ${pkgName} --json`;
	let apmProc = exec(cmd, (err, stdout, stderr) => {
		if (err) {
			onFailedCB && onFailedCB(err, stdout, stderr)
			prom.reject(err, stdout, stderr);
		} else {
			// old apm's do not support the --json flag so ignore json parse failures
			try {var packageInfo = JSON.parse(stdout)[0];} catch (err) {var packageInfo = stdout}

			if (global.atom)
				atom.packages.activatePackage(pkgName).then(()=>{
					onInstalledCB && onInstalledCB(packageInfo, stderr)
					prom.resolve(packageInfo, stderr);
				});
			else {
				onInstalledCB && onInstalledCB(packageInfo, stderr)
				prom.resolve(packageInfo, stderr);
			}
		}
	});
	return prom
}

// If this is ran from a script, outside the atom enironment, it will return 'apm' and rely on it being in the path. 
function GetApmPath() {
	if (global.atom)
		return atom.packages.getApmPath()
	else
		return 'apm'
}
