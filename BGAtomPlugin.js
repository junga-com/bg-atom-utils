
import { Disposable, CompositeDisposable } from 'atom';
import { FirstParamOf } from './miscellaneous';


// BGAtomPlugin makes writing Atom plugin packages easier. 
// Atom Entry Points:
//    initialize:      maps to static PluginClass.Initialize()
//    activate(state)  maps to PluginClass.constructor()
//    deactivate()     maps to PluginClass.destroy()
//    serialize()      maps to PluginClass.serialize()
// Additional Entry Points:
//    PluginClass.lateActivate() -- if your class has this method it will be called after all packages have had a chance to activate.
//       when the package is activated via settings-view, this will still be called after the tick that the constructor is in settles
// Members:
//    lastSessionsState    : contains the deserialization state passed from the atom activate call
//    disposables          : an instance of CompositeDisposable to add things that need to be undone in destroy
//    addCommand()         : wrapper to atom.commands.add()
// Plugin Registry:
//    window.bgPlgins['my-plugin']  : other packages and user init.js can find your package's services dynamically 
// Example:
//     class MyPlugin extends BGAtomPlugin {
//       constructor('my-plugin', ...p) {
//         super(...p);
//         // constructor is called when Atom activates your package
//         // this.lastSessionsState contains the deserialization state
//         this.addCommand('my-plugin:doIt', ()=>alert('doing it!'))
//       }
//     }
//     export default BGAtomPlugin.Export(MyPlugin);
//
export class BGAtomPlugin {
	static Initialize() {
	}

	// usage: pkgName, lastSessionsState 
	constructor(...p) {
		this.pkgName = FirstParamOf('string', ...p);
		this.lastSessionsState = FirstParamOf('object', ...p);
		this.PluginClass = new.target;


		// subscriptions is a place to put things that need to be cleaned up on deativation
		this.disposables = new CompositeDisposable();
		// make an alias to support transitioning to this.disposables name
		this.subscriptions = this.disposables;

		this.registeredCommands = [];

		console.assert(!this.PluginClass.instance, 'Package plugin being constructed twice. Should be a singleton. pacakgeName='+this.pkgName);
		this.PluginClass.instance = this;
		BGAtomPlugin.plugins[this.pkgName] = this;

		// if the derived class declares a lateActivate method, invoke it from the onDidActivateInitialPackages event

		if (Reflect.has(this.PluginClass.prototype, 'lateActivate')) {
			if (atom.packages.initialPackagesActivated)
				setTimeout(()=>this.lateActivate(), 0);
			else
				this.disposables.add(atom.packages.onDidActivateInitialPackages(()=>{this.lateActivate();}));
		}
	}

	// A subclass can provide a lateActivate method and it will be called after all packages are activated
	//lateActivate(state) {}

	destroy() {
		this.disposables.dispose();
		this.PluginClass.instance = null
		delete BGAtomPlugin.plugins[this.pkgName];
	}

	serialize() {
		return ;
	}

	addCommand(name, callback) {
		this.registeredCommands.push(name);
		var obj = {}
		obj[name] = callback;
		this.disposables.add(atom.commands.add('atom-workspace', obj));
	}

	// Use this static method to export your MyPluginClass that extends BGAtomPlugin
	// export default BGAtomPlugin.Export(MyPluginClass)
	static Export(PluginClass) {
		return {
			initialize: (...p) => {PluginClass.Initialize(PluginClass);},
			activate:   (...p) => {new PluginClass(...p);},
			serialize:  (...p) => {return (PluginClass.instance) ? PluginClass.instance.serialize(...p) : {} },
			deactivate: (...p) => {return PluginClass.instance && PluginClass.instance.destroy(...p) },
			config:     PluginClass.config
		}
	}
}

BGAtomPlugin.plugins = {};
global.bgPlugins = BGAtomPlugin.plugins;
