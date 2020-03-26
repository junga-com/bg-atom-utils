'use babel';

import { Disposable, CompositeDisposable } from 'atom';
// const Disposable = require('atom').Disposable;
// const CompositeDisposable = require('atom').CompositeDisposable;



export class BGAtomPlugin {
	foo = 'hi';
	constructor() {
		// subscriptions is a place to put things that need to be cleaned up on deativation
		this.disposables = new CompositeDisposable();
		// make an alias to support transitioning to this.disposables name
		this.subscriptions = this.disposables;
	}

	activate(state) {
		// if the derived class declares a lateActivate method, invoke it from the onDidActivateInitialPackages event
		if ('lateActivate' in this)
			this.disposables.add(atom.packages.onDidActivateInitialPackages(()=>{this.lateActivate();}));
	}

	deactivate() {
		this.disposables.dispose();
	}

	destroy() {
		this.deactivate();
	}

	serialize() {
		return ;
	}

	addCommand(name, callback) {
		var obj = {}
		obj[name] = callback;
		this.subscriptions.add(atom.commands.add('atom-workspace', obj));
	}
}

// module.exports.BGAtomPlugin = BGAtomPlugin
