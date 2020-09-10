
import assert from 'assert';
import { Component } from 'bg-atom-redom-ui';
import { Disposables } from './Disposables';


export class BGFeedbackDialog {
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
			this.buttons = this.el.querySelector('.meta .btn-toolbar');
			if (!this.buttons) {
				const meta = this.el.querySelector('.meta');
				this.buttons = new Component('$div.btn-toolbar').el;
				meta.appendChild(this.buttons);
				this.el.classList.add('has-buttons');
			}

			this.dialogDetailEl = this.el.querySelector('.detail-content');

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
	var disposables    = new Disposables();
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
	var targetEl = (target && target.getElement) ? target.getElement() : atom.workspace.getElement();
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
	(typeof uri == 'string') && (uri = new RegExp('^'+uri))
	const items = atom.workspace.getPaneItems();
	return items.find((item)=>{return uri.test(item.getURI())});
}

export function BGHideWorkspaceItemFromURI(uri) {
	(typeof uri == 'string') && (uri = new RegExp('^'+uri))
	const items = atom.workspace.getPaneItems();
	const item = items.find((item)=>{return uri.test(item.getURI())});
	return item && atom.workspace.hide(item.getURI());
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
