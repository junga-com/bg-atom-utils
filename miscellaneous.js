
import assert from 'assert';
import { CompositeDisposable } from 'atom';
import { el, list, mount, setAttr, text } from 'redom';
import { Component } from 'bg-atom-redom-ui';
import { apmInstall, BGPromise } from './procCntr';


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
//    <void> : On success, there is no information returned but the promise or onAllFinishedCB callback lets you know when its done.
//
// Params:
//    <packageNames>:string|Array<string> : one or more package names to install. A string input can have comma separated names.
//    <onAllFinishedCB>(err) : optional callback that is called after all <packageNames> has been attempted. On success, err is falsey
//    <onPkgFinishedCB>(pkgName, err, stdout, stderr) : optional callback that is called after each <packageName> is installed or 
//                           failed to install. 
//    <confirmPromt>:true|false : controls whether the user is prompted to confirm installation.  
//    <extraButtons>:object : extra buttons to display in the confirmation prompt. These can offer alternatives to installing the packages
//             such as configuring the system so that the packages are not needed. 
//             See https://flight-manual.atom.io/api/v1.45.0/NotificationManager/#instance-addInfo 
export async function PackageInstall(packageNames, {onAllFinishedCB, onPkgFinishedCB, confirmPromt=true, extraButtons=[]}) {
	var pkgInstaller = new PkgInstaller(packageNames, {onAllFinishedCB, onPkgFinishedCB, confirmPromt, extraButtons})

	return pkgInstaller.prom
}



class PkgInstaller {
	constructor(packageNames, {onAllFinishedCB, onPkgFinishedCB, confirmPromt=true, extraButtons=[]}) {
		this.packageNames = (typeof packageNames == 'string') ? packageNames.split(',') : packageNames;
		this.prom = new BGPromise();
		this.onAllFinishedCB = onAllFinishedCB;
		this.onPkgFinishedCB = onPkgFinishedCB;
		this.extraButtons       = extraButtons;

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



class BGFeedbackDialog {
	constructor(title, params) {
		this.type = params.type || 'info';
		if (!params.detail) params.detail = ' ';
		switch (this.type) {
			case 'success': this.dialogBox = atom.notifications.addSuccess(title, params); break;
			case 'info':    this.dialogBox = atom.notifications.addInfo(title, params);    break;
			case 'warn':    this.dialogBox = atom.notifications.addWarning(title, params); break;
			case 'warning': this.dialogBox = atom.notifications.addWarning(title, params); break;
			case 'error':   this.dialogBox = atom.notifications.addError(title, params);   break;
			default:        assert(false,`unknown type ${this.type}`);                     break;
		}

		try {
			this.statusArea = new Component('statusArea:$div')
			this.progressBar = new Component('progressBar:$progress')

			// The caller can specify status,current, and goal in addition to atom notification options
			this.update(params)

			this.el = atom.views.getView(this.dialogBox).element;
			this.el.classList.add('BGFeedbackDialog');
			this.title = this.el.querySelector('.message');
console.log('this.title=',this.title);
			this.buttons = this.el.querySelector('.meta .btn-toolbar');
console.log('this.buttons=',this.buttons);
			if (!this.buttons) {
				const meta = this.el.querySelector('.meta');
				this.buttons = new Component('$div.btn-toolbar').el;
				meta.appendChild(this.buttons);
				this.el.classList.add('has-buttons');
			}
console.log('this.buttons=',this.buttons);

			this.dialogDetailEl = this.el.querySelector('.detail-content');
window.dlg = this
window.dlgEl = atom.views.getView(this.dialogBox).element
console.log({dlgEl:window.dlgEl, dialogDetailEl:this.dialogDetailEl});

			Component.mount(this.dialogDetailEl, [
				this.statusArea,
				this.progressBar
			])
		} catch(e) {
			this.dialogBox.dismiss();
			throw e;
		}
	}

	update({title, status, current, goal, buttons}) {
		if (title != null)   this.setTitle(title)
		if (status != null)  this.setStatus(status)
		if (current != null) this.setCurrent(current)
		if (goal != null)    this.setGoal(goal)
		if (buttons != null) this.setButtons(buttons)

		if ((status == null) && (current == null) && (goal == null))
			this.setCurrent('++')
	}

	setTitle(title) {
		this.title.innerText = title
	}

	setStatus(status) {
		this.statusArea.setLabel(status)
	}

	hideProgress() {
		this.progressBar.el.style.display = 'none'
	}

	setGoal(goal) {
		this.progressBar.el.max = goal
	}

	setCurrent(current) {
		if (!this.progressBar.el.max)
			return
		if (typeof current == "string") {
			if (/[-+][0-9]+/.test(current))
				this.progressBar.el.value += current;
			else if (current == "++")
				this.progressBar.el.value++;
			else if (current == "--")
				this.progressBar.el.value--;
			else 
				this.progressBar.el.value = 0+current;
		} else if (typeof current == "number")
			this.progressBar.el.value = current;
	}

	setButtons(buttons) {
		this.buttons.innerHTML = ''
		for (const button of buttons) {
			this.buttons.appendChild(new Component('$a.btn '+button.text, {
				className: `btn-${this.type} ${button.className}`,
				href: '#',
				onclick: button.onDidClick
			}).el)
		}
	}

	dismiss() {
		this.dialogBox.dismiss()
	}
}

// This makes it easy to follow the active/deactive state of one or more packages that you depend on.
// Params:
//    packageNames  : a comma separated string or array of package names.
//    callback(pkgName, isActive) : callback function to handle the envent. isActive will be true if it was just activated and 
//                    false if it was just deactivated.
export function OnDependentPackageStateChange(packageNames, callback) {
	if (typeof packageNames == 'string') packageNames = packageNames.split(',');
	atom.packages.onDidActivatePackage((pkg)=>{
		if (packageNames.includes(pkg.name))
			callback(pkg.name, true);
	});
	atom.packages.onDidDeactivatePackage((pkg)=>{
		if (packageNames.includes(pkg.name))
			callback(pkg.name, false);
	});
}


export function bgAsyncSleep(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

export function FirstParamOf(type, ...params) {
	if (typeof type == 'string')
		// check for builtin types against this string value
		for (var param of params) {
			if (typeof param == type)
				return param
		}
	else
		// assume type is a class to check against
		for (var param of params) {
			if (typeof param == 'object' && param instanceof type)
				return param
		}
	return undefined;
}


// var [keyContainer, configKeyRegex, callback] = ArrangeParamsByType(arguments, 'string', RegExp, 'function');
export function ArrangeParamsByType(params, ...types) {
	var results = new Array(types.length);
	eachParam: for (var i=0; i<params.length; i++) {
		const paramType = typeof params[i];
		for (var j=0; j<types.length; j++) {
			if ((typeof types[j] == 'string' && paramType == types[j]) 
			  || (typeof types[j] != 'string') && params[i] instanceof types[j] ) {
				results[j] = params[i];
				continue eachParam;
			}
		}
		results.push(params[i])
	}
	return results;
}



// Returns an array of configuration keys that are known at this time.
// The results can be filtered by a specifying a keyContainer string and or a configKeyRegex RegExp. 
// Params:
//    keyContainer:string   : example: 'editor.invisibles'. Only keys in the given container are returned. The default is all keys. 
//                            This is a '.' separated list of names starting with the package name then optionally followed by
//                            one or more config object container names. Each name must be an exact match. No wildcards or regex.
//                            If any name does not match, an empty array is returned.
//    configKeyRegex:RegExp : example: /^bg-/. If given, only keys matching this regex are returns.
// Usage:
//    form1: GetConfigKeys(<keyContainer:string> [, <configKeyRegex:RegExp>])
//    form2: GetConfigKeys(<configKeyRegex:RegExp> [, <keyContainer:string>])
export function GetConfigKeys($keyContainer, $configKeyRegex) {
	var keyContainer   = FirstParamOf('string',   $keyContainer, $configKeyRegex);
	var configKeyRegex = FirstParamOf(RegExp,     $keyContainer, $configKeyRegex);

	var outKeys = [];
	function recurseObj(obj, prefix = '', filterRegex=null) {
		var keys = Object.keys(obj)
		keys.reduce( (outputKeys, curCfgItem) => {
			const pre = prefix.length ? prefix + '.' : '';
			if ((typeof obj[curCfgItem] === 'object') && ! Array.isArray(obj[curCfgItem]))
				outputKeys.concat(recurseObj(obj[curCfgItem], pre + curCfgItem, filterRegex));
			else {
                if (!filterRegex || filterRegex.test(pre + curCfgItem))
    				outputKeys.push(pre + curCfgItem);
			}
			return outputKeys;
			}
			, outKeys
		);
	}
	var cfgToSearch = atom.config.getAll()[0].value;

	if (keyContainer) {
		for (const name of keyContainer.split('.')) {
			if (!(name in cfgToSearch))
				return outKeys;
			cfgToSearch = cfgToSearch[name];
		}
	}

	recurseObj(cfgToSearch, keyContainer, configKeyRegex)
	return outKeys
}

// Usage:
//    form1: OnDidChangeAnyConfig(<keyContainer:string> [, <configKeyRegex:RegExp>], <callback:function>)
//    form2: OnDidChangeAnyConfig(<configKeyRegex:RegExp> [, <keyContainer:string>], <callback:function>)
export function OnDidChangeAnyConfig(keyContainer, configKeyRegex, callback) {
	var [keyContainer, configKeyRegex, callback] = ArrangeParamsByType(arguments, 'string', RegExp, 'function');
	var disposables    = new CompositeDisposable();
	var keys = GetConfigKeys(keyContainer, configKeyRegex);
	assert(keys.length < 100, 'Registering callbacks on large sets of configuration keys (>100) is not supported');
	for (const name of keys)
		disposables.add(atom.config.onDidChange(name, {}, (e)=>{callback(name, e)}));
	return disposables;
}

// DispatchCommand invokes <cmd> in the current active target environment. 
// The active WorkspaceItem is used if it exists, other wise atom.workspace is used. 
export function DispatchCommand(cmd) {
	var target = atom.workspace.getActivePaneItem();
	var targetEl = target ? target.getElement() : atom.workspace.getElement();
	atom.commands.dispatch(targetEl, cmd);
}

export function BGRemoveKeybindings(sourceRegex, keystrokeRegex, selectorRegex, commandRegex) {
	if (typeof sourceRegex == 'object' && sourceRegex.sourceRegex)
		({sourceRegex, keystrokeRegex, selectorRegex, commandRegex} = sourceRegex);
	// TODO: since this uses an undocumented features of atom.keymaps, add gaurds and report failure well
	var removedCount = 0;
	var filePath
	atom.keymaps.keyBindings = atom.keymaps.keyBindings.filter( 
		(binding)=>{
			const matched =
			 	   (!sourceRegex    || sourceRegex.test(binding.source))
				&& (!keystrokeRegex || keystrokeRegex.test(binding.keystrokes[0]))
				&& (!selectorRegex  || selectorRegex.test(binding.selector))
				&& (!commandRegex   || commandRegex.test(binding.command));
			if (matched) {
				removedCount++;
				filePath = binding.source;
			}
			// negate the result b/c we return false only for the ones we matched. All other will stay in the keymap so should be true
			return (matched) ? false : true;
		}
	);
	atom.keymaps.emitter.emit('did-reload-keymap', {
	  path: filePath
	});
	return removedCount;
}


// This return the WorkspaceItem with the given uri if it is open. Otherwise it returns false. It will not open a uri.
export function BGFindWorkspaceItemFromURI(uri) {
	const items = atom.workspace.getPaneItems();
	return items.find((item)=>{return item.getURI() == 'atom://config'});
}


// OBSOLETE: use BGFeedbackDialog
// export class BGFeedbackView {
// 	constructor() {
// 		// Create root element
// 		this.rootElement = el('div.atom-cyto-message', "here, baby");
// 		mount(document.body, this.rootElement);
// 
// 		this.modalPanel = atom.workspace.addModalPanel({
// 			item: this.rootElement,
// 			visible: true
// 		});
// 	}
// 
// 	setMessage(data) {
// 		this.rootElement.textContent = data;
// 	}
// 
// 	isVisible() {this.modalPanel.isVisible()}
// 	show()      {this.modalPanel.show()}
// 	hide()      {this.modalPanel.hide()}
// 	destroy()   {this.modalPanel.destroy();}
// 
// 	serialize() {}
// }
