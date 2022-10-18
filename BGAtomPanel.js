import { Component, Disposables, FireDOMTreeEvent } from 'bg-dom';

const defaultBGAtomPanelOptions = {
}


export class BGAtomPanel extends Component {
	constructor(plugin, name,  location, isVisible, priority, options, ...p) {
		super(...p, '$div.bg-toolPanel', {root:true});
		this.name  = name;
		this.plugin  = plugin;
		this.location  = location;
		this.priority  = priority;
		this.options = Object.assign({}, defaultBGAtomPanelOptions, options) || {};

		this.plugin.panelsByName.set(this.name,this);

		FireDOMTreeEvent(this, 'onPreConnected');

		var createOpts = {}
		createOpts.item = this;
		createOpts.visible = isVisible;
		createOpts.priority = this.priority;

		switch (location) {
			case 'top'   : this.panel = atom.workspace.addTopPanel(createOpts);     break;
			case 'bottom': this.panel = atom.workspace.addBottomPanel(createOpts);  break;
			case 'right' : this.panel = atom.workspace.addRigthPanel(createOpts);   break;
			case 'left'  : this.panel = atom.workspace.addLeftPanel(createOpts);    break;
		}
	}

	// Atom calls destroy on views when the user closes its tab so in BGAtomPanel, destroy is really the "close" behavior which a
	// particular type of view may or may not want to destroy the view. If the view required work to produce, it can stay in the
	// plugin cache after being closed and then if its re-openned, it can use the cached instance
	destroy() {
		this.plugin.panelsByName.deleteBypass(this.uri);
		// workspace registers a callback on 'destroyed' channel to remove the item from the pane. Must call b4 we destroy our deps.
		deps.fire({obj:this,channel:'destroyed'});
		super.destroy();
		delete(this.paneContainer);
		delete(this.pane);
		delete(this.plugin);
	}


	// the derived class can override on* methods to make it respond to various events. They should call super.on<name> in case
	// the super class defines behavior also

	onConnected() {
		if (!this._doneLateCtor) {
			this._doneLateCtor = true;
			this.constructAfterConnected && this.constructAfterConnected();

			// implement the onResize method for derived classes
			if (this.pane && this.onResize) {
				this.disposables.add(this.pane.onDidChangeFlexScale((e) => {this.onResize(e)}));
				this.disposables.add(this.pane.onDidChangeActiveItem((e) => {this.onResize(e)}));
			}
			if (this.onResize)
				this._addWinListener('resize', (ev) => this.onResize(ev));
		}
		this.pane = atom.workspace.paneForURI(this.uri);
		this.paneContainer = atom.workspace.paneContainerForItem(this);
	}
	onDisconnected() {
		this.pane = atom.workspace.paneForURI(this.uri);
		this.paneContainer = atom.workspace.paneContainerForItem(this);
	}

	//constructAfterConnected() {}
	//onResize(e) {}
	//onFocus(e)  {}

	// these are the methods that are called Atom workspace
	getElement()          {return this.el;}
	getURI()              {return this.uri;}
	getLocation()         {return this.location;}
	getPreferredHeight()  {return this.preferredHeight}
	getPreferredWidth()   {return this.preferredWidth}

	// common actions on views
	show() {this.panel.show();}
	hide() {this.panel.hide();}
	toggle() { (this.panel.isVisible())? this.hide() : this.show()}

	// helper function to add window.addEventListener's with a disposable registered
	// TODO: maybe this should be in atom.workspace.addDep_domEvent(eventName, obj2, callback)
	_addWinListener(eventName, callback) {
		window.addEventListener(eventName, callback);
		this.disposables.add(new Disposables(() => window.removeEventListener(eventName, callback)));
	}
}
