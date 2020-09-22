import { PolyfillObjectMixin }        from './PolyfillObjectMixin'
import { ArrangeParamsByType,
		 FirstParamOf }               from './miscellaneous'
import { Disposables }                from './Disposables'
import { BGPromise }                  from './bg-promise';
import { BGFeedbackDialog }           from './BGFeedbackDialog'
import { exec, spawn, execSync }      from 'child_process';


export class AtomPackageManagerPolyfill extends PolyfillObjectMixin {
	constructor() {
		super(
			atom.packages,
			['PackageState','_normalizePkgNameSpec','_isPkgNameSpecAMatch','onDidPackageStateChange',
			 'addDep','removeDep','addDep_activated','removeDep_activated','addDep_deactivated','removeDep_deactivated',
			 'addDep_initialPackagesActivated','removeDep_initialPackagesActivated','addDep_initialPackagesLoaded','removeDep_initialPackagesLoaded',
			 'installPackage'
			]
		);

		this.PackageState = {
			Activated: 'activated',
			Deactivated: 'deactivated',
			NotInstalled: 'notInstalled'
		}
	}

	getTarget() {return atom.packages;}
	doesTargetAlreadySupportFeature() {return !!this.targetonDidPackageStateChange;}
	isTargetStillCompatibleWithThisPollyfill() {return true;}


	//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
	// Polyfill Methods...
	// These methods are writtien in the context of the target object and will be dynamically added to that object when this polyfill
	// is installed.  If the name matches an existing method of the target object, it will be replaced and the original will be
	// available as orig_<methodName>
	// The 'this' pointer of these methods will be the target object, not the polyfill object when they are invoked.

	// TODO: move bg-packageManager.js packageInstall code to here

	// pkgNameSpec can be a RegExp or an Array of exact names
	// if its a string, assume its a comma separated list of exact names and convert it to an array.
	// the caller should use /<regex>/ syntax to specify a RegExp
	_normalizePkgNameSpec(pkgNameSpec) {
		if (typeof pkgNameSpec == 'string')
			pkgNameSpec = pkgNameSpec.split(',');
		return pkgNameSpec;
	}

	// pkgNameSpec can be a RegExp or an Array of exact names or null
	// null matches everything
	// if its a string, assume its a comma separated list of exact names and convert it to an array.
	// the caller should use /<regex>/ syntax to specify a RegExp
	_isPkgNameSpecAMatch(pkgNameSpec, pkgName) {
		if (!pkgNameSpec)
			return true;
		if (typeof pkgNameSpec == 'string')
			pkgNameSpec = pkgNameSpec.split(',');
		if (Array.isArray(pkgNameSpec))
			return pkgNameSpec.includes(pkgName);
		if (typeof pkgNameSpec == 'object' && pkgNameSpec instanceof RegExp)
			return pkgNameSpec.test(pkgName);
	}


	// This integrates the atom.packages object with the DependentsGragh system.
	// Its a wrapper over deps.add({obj:atom.packages,channel:pkgNameSpec}, obj2, callback) that handles registering the native config
	// watcher callaback to call deps.fire and implement a default callback that recognizes and prefers onPackageChangedState over
	// onDepChanged method.
	// Params:
	//    <pkgNameSpec> : a regex that matches package names to report changes on.
	//    <obj2>     : the target object that depends on these package states.
	//    <callback> : the optional callback to be invoked to notify <obj2>.
	//                 callback(newState, pkgName, pkg)
	//                 default: the first of these methods on <obj2> that exists will be invoked.
	//                    <obj2>.onPackageChangedState(newState, pkgName, pkg)
	//                    <obj2>.onDepChanged({obj:atom.packages,channel:<pkgNameSpec>}, newState, pkgName, pkg)
	addDep(pkgNameSpec, obj2, callback) {
		pkgNameSpec=this._normalizePkgNameSpec(pkgNameSpec);
		const channel = pkgNameSpec;

		const cnode = deps.add({obj:this,channel}, obj2, callback);

		// if we just created the cnode, register the callback to fire changes to this channel
		if (cnode.isNew()) {
			cnode.defaultTargetMethodName = 'onPackageChangedState';
			cnode.disposables.add(this.onDidActivatePackage((pkg)=>{
				if (this._isPkgNameSpecAMatch(pkgNameSpec, pkg.name))
					deps.fire({obj:this,channel}, this.PackageState.Activated, pkg.name, pkg)
			}));
			cnode.disposables.add(this.onDidDeactivatePackage((pkg)=>{
				if (this._isPkgNameSpecAMatch(pkgNameSpec, pkg.name))
					deps.fire({obj:this,channel}, this.PackageState.Deactivated, pkg.name, pkg)
			}));
		}
	}
	// undo a call to addDep
	removeDep(pkgNameSpec, obj2) {
		pkgNameSpec=this._normalizePkgNameSpec(pkgNameSpec);
		const channel = pkgNameSpec;
		deps.remove({obj:this,channel}, obj2);
	}

	// callback(pkgName, pkg)
	// <obj2>.onPackageActivated(pkgName, pkg)
	addDep_activated(pkgNameSpec, obj2, callback) {
		pkgNameSpec=this._normalizePkgNameSpec(pkgNameSpec);
		const channel = pkgNameSpec+".activated";

		const cnode = deps.add({obj:this,channel}, obj2, callback);

		// if we just created the cnode, register the callback to fire changes to this channel
		if (cnode.isNew()) {
			cnode.defaultTargetMethodName = 'onPackageActivated';
			cnode.disposables.add(this.onDidActivatePackage((pkg)=>{
				if (this._isPkgNameSpecAMatch(pkgNameSpec, pkg.name))
					deps.fire({obj:this,channel}, pkg.name, pkg)
			}));
		}
	}
	// undo a call to addDep
	removeDep_activated(pkgNameSpec, obj2) {
		pkgNameSpec=this._normalizePkgNameSpec(pkgNameSpec);
		const channel = pkgNameSpec+".activated";
		deps.remove({obj:this,channel}, obj2);
	}


	// callback(pkgName, pkg)
	// <obj2>.onPackageDeactivated(pkgName, pkg)
	addDep_deactivated(pkgNameSpec, obj2, callback) {
		pkgNameSpec=this._normalizePkgNameSpec(pkgNameSpec);
		const channel = pkgNameSpec+".deactivated";

		const cnode = deps.add({obj:this,channel}, obj2, callback);

		// if we just created the cnode, register the callback to fire changes to this channel
		if (cnode.isNew()) {
			cnode.defaultTargetMethodName = 'onPackageDeactivated';
			cnode.disposables.add(this.onDidDeactivatePackage((pkg)=>{
				if (this._isPkgNameSpecAMatch(pkgNameSpec, pkg.name))
					deps.fire({obj:this,channel}, pkg.name, pkg)
			}));
		}
	}
	// undo a call to addDep
	removeDep_deactivated(pkgNameSpec, obj2) {
		pkgNameSpec=this._normalizePkgNameSpec(pkgNameSpec);
		const channel = pkgNameSpec+".deactivated";
		deps.remove({obj:this,channel}, obj2);
	}


	// callback()
	// <obj2>.onInitialPackagesActivated()
	addDep_initialPackagesActivated(obj2, callback) {
		const channel = "initialPackagesActivated";

		const cnode = deps.add({obj:this,channel}, obj2, callback);

		// if we just created the cnode, register the callback to fire changes to this channel
		if (cnode.isNew()) {
			cnode.defaultTargetMethodName = 'onInitialPackagesActivated';
			cnode.disposables.add(this.onDidActivateInitialPackages(()=>{deps.fire({obj:this,channel})}));
		}
	}
	// undo a call to addDep
	removeDep_initialPackagesActivated(obj2) {
		const channel = "initialPackagesActivated";
		deps.remove({obj:this,channel}, obj2);
	}



	// callback()
	// <obj2>.onInitialPackagesLoaded()
	addDep_initialPackagesLoaded(obj2, callback) {
		const channel = "initialPackagesLoaded";

		const cnode = deps.add({obj:this,channel}, obj2, callback);

		// if we just created the cnode, register the callback to fire changes to this channel
		if (cnode.isNew()) {
			cnode.disposables.add(this.onDidLoadInitialPackages(()=>{deps.fire({obj:this,channel})}));
			cnode.defaultTargetMethodName = 'onInitialPackagesLoaded';
		}
	}
	// undo a call to addDep
	removeDep_initialPackagesLoaded(obj2) {
		const channel = "initialPackagesLoaded";
		deps.remove({obj:this,channel}, obj2);
	}




	// callback(package, atom.packages.PackageState)
	onDidPackageStateChange(pkgNameSpec, callback) {
		pkgNameSpec=this._normalizePkgNameSpec(pkgNameSpec);
		const disposables = new Disposables();
		disposables.add(atom.packages.onDidActivatePackage((pkg)=>{
			if (this._isPkgNameSpecAMatch(pkgNameSpec, pkg.name))
				callback(this.PackageState.Activated, pkg.name, pkg);
		}));
		disposables.add(atom.packages.onDidDeactivatePackage((pkg)=>{
			if (this._isPkgNameSpecAMatch(pkgNameSpec, pkg.name))
				callback(pkg, this.PackageState.Deactivated, pkg.name, pkg);
		}));
		return disposables;
	}

	// Install one or more Atom pacakges so that their features are available inside Atom. It uses apmInstall to do the work.
	// Features:
	//     * can accept a single pkgName, a comma separated list of pkgNames, or an array of pkgNames
	//     * prompts the user for confirmation by default.
	//     * shows progress and informs the user of success or failure.
	// It is not an error to call this function when the package is already installed or activated.
	// Note that this initial implementation will launch one apm for each packageName all at once. If this is used to install many
	// packages, we would want to use a worker queue pattern to limit the simultaneous apm runs. Also, the confirmation dialog will need
	// display the long list better.
	//
	// Async Pattern:
	// This function returns a promise so that it can be used with await in async functions and/or the caller can pass in onAllFinishedCB
	// and/or onPkgFinishedCB. onAllFinishedCB is equivalent to waiting for the promise but onPkgFinishedCB gives the caller access to additional
	// information. The author might want to use await to tell when all packages are ready (or catch the exception if any can not be installed)
	// and also provide onPkgFinishedCB to provide feedback as pkgs finish installing.
	//
	// Return Value:
	//    <promise> : On success, there is no information returned but the promise or onAllFinishedCB callback lets you know when its done.
	//
	// Params:
	//    <packageNames>:string|Array<string> : one or more package names to install. A string input can have comma separated names.
	//    <onAllFinishedCB>(err) : optional callback that is called after all <packageNames> has been attempted. On success, err is falsey
	//                             This method also returns a promise so the caller can use that (.then.. or await) instead of onAllFinishedCB.
	//    <onPkgFinishedCB>(pkgName, err, stdout, stderr) : optional callback that is called after each <packageName> is installed or
	//                           failed to install. This function already gives the user feedback on each package success/failure so this
	//                           is not typically needed.
	//    <confirmPromt>:true|false : controls whether the user is prompted to confirm installation.  If false, the installation will
	//                           start right away.
	//    <extraButtons>:object : extra buttons to display in the confirmation prompt. These can offer alternatives to installing the packages
	//             such as configuring the system so that the packages are not needed.
	//             See https://flight-manual.atom.io/api/v1.45.0/NotificationManager/#instance-addInfo
	installPackage(packageNames, {onAllFinishedCB, onPkgFinishedCB, confirmPromt=true, extraButtons=[], ...p}) {
		var pkgInstaller = new PkgInstaller(packageNames, {onAllFinishedCB, onPkgFinishedCB, confirmPromt, extraButtons, ...p})
		return pkgInstaller.prom
	}
}



// PkgInstaller provides a dialog workflow for the user to interact with the installation process. The user can be given the option
// to approve the installation, choose an alternative to installation, or refuse the installation. Once the installation is started
// the user sees the progress and results when finsished.
class PkgInstaller {
	constructor(packageNames, {onAllFinishedCB, onPkgFinishedCB, confirmPromt=true, extraButtons=[]}) {
		this.packageNames = (typeof packageNames == 'string') ? packageNames.split(',') : packageNames;
		this.prom = new BGPromise();
		this.onAllFinishedCB = onAllFinishedCB;
		this.onPkgFinishedCB = onPkgFinishedCB;
		this.extraButtons    = extraButtons;

		if (confirmPromt)
			this.confirmInstallation()
		else
			this.installPkgs()
	}

	// This opens a dialog with the user giving them several choices represented in the buttons parameter. Each choice must lead to
	// this.prom being resolved or rejected. Install -> this.installPkgs(), do nothing -> this.endWithoutInstalling(), extraButtons -> <something> + this.endWithoutInstalling
	confirmInstallation() {
		// fixup the provided extra buttons to call this.endWithoutInstalling after they do their work
		for (const button of this.extraButtons) {
			let upstreamCB = button.onDidClick;
			button.onDidClick = (...p)=>{upstreamCB(...p); this.endWithoutInstalling()}
		}
		this.confirmDlg = atom.notifications.addWarning(
			`The feature you are accessing requires that the the following package(s) be installed.`,
			{	dismissable: true,
				icon: 'cloud-download',
				detail: this.packageNames.join(', '),
				description: "How do you want to proceed?",
				buttons: [
					{text:'Install package(s)', onDidClick:()=>{this.installPkgs(); }},
					...this.extraButtons,
					{text:'Do nothing for now', onDidClick:()=>{this.endWithoutInstalling();}}
				]
			}
		);
	}

	installPkgs() {
		try {
			this.confirmDlg && this.confirmDlg.dismiss();

			this.feedbackDlg = new BGFeedbackDialog("Installing Packages", {
				dismissable: true,
				icon: 'cloud-download',
				status: this.packageNames.join(', '),
			});

			// launch apm install for each pkgName, keeping track of
			this.pkgsPendingCount = this.packageNames.length
			this.pkgsSuccessList = [];
			this.pkgsFailList = [];

			for (const pkgName of this.packageNames) {
				apmInstall(pkgName,
					// success callback of one apmInstall invocation
					(stdout, stderr)=> {
						this.pkgsSuccessList.push(pkgName);
						this.onOnePkgFinish(pkgName, 0, stdout, stderr)
					},
					// fail callback of one apmInstall invocation
					(err, stdout, stderr)=> {
						this.pkgsFailList.push(pkgName);
						this.onOnePkgFinish(pkgName, err, stdout, stderr)
					}
				)
			}
		} catch(e) {
			this.feedbackDlg && this.feedbackDlg.dismiss();
			this.prom.reject(e);
		}
	}

	onOnePkgFinish(pkgName, err, stdout, stderr) {
		this.pkgsPendingCount--;
		this.onPkgFinishedCB && this.onPkgFinishedCB(pkgName, err, stdout, stderr);

		this.feedbackDlg.update({
			status: `
				<div class="pkgList" style="${(!this.pkgsPendingCount)?'display:none':''}">
					<span class="badge ">${this.pkgsPendingCount}</span>
					package installations in progress.<br/><br/>
				</div>
				<div class="pkgList" style="${(!this.pkgsSuccessList.length)?'display:none':''}">
					<span class="badge badge-success">${this.pkgsSuccessList.length} </span>
					packages were installed successfully.
					<div>${this.pkgsSuccessList.join(', ')}</div>
				</div>
				<div class="pkgList" style="${(!this.pkgsFailList.length)?'display:none':''}">
					<span class="badge badge-error">${this.pkgsFailList.length} </span>
					packages failed to install.
					<div>${this.pkgsFailList.join(', ')}</div>
				</div>
			`,
			current: this.pkgsSuccessList.length + this.pkgsFailList.length,
			goal:    this.packageNames.length
		})

		if (this.pkgsPendingCount <= 0) {
			this.feedbackDlg.update({title:'Finished Installing Packages', buttons:[
				{text:'Dismiss', onDidClick:()=>{this.feedbackDlg.dismiss(); }}
			]});
			this.feedbackDlg.hideProgress()

			this.onAllFinishedCB && this.onAllFinishedCB(this.pkgsSuccessList, this.pkgsFailList)
			if (this.pkgsFailList.length > 0) {
				this.prom.reject()
			} else {
				setTimeout(()=>this.feedbackDlg.dismiss(), 2000)
				this.prom.resolve()
			}
		}
	}

	endWithoutInstalling() {
		this.confirmDlg && this.confirmDlg.dismiss();
		this.prom.reject('user opted not to install');
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




new AtomPackageManagerPolyfill().install();
