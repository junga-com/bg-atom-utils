'use babel';

export class BGAtomView {
	constructor() {
		// Create root element
		this.rootElement = el('div.bg-toolPanel');

		// this implements the onDomReady virtual method
		this._onLoadCB = atom.workspace.onDidAddPaneItem((e) => {
			if (e.item === this) {
				this.onDomReady()
				this._onLoadCB.dispose()
				delete this._onLoadCB
			}
		});
	}

	// override this to finish construction after atom has added your getElement() into the DOM 
	onDomReady() {}

	getElement() {return this.rootElement;}

}
