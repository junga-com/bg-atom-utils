import { FirstParamOf, Disposables, RegisterGlobalService, RegisterPackage } from 'bg-dom'

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
//    disposables          : an instance of Disposables to add things that need to be undone in destroy
//    addCommand()         : wrapper to atom.commands.add(). associates the commands with this plugin and unregisters them in deactivate
// Plugin Registry:
//    window.bgPlgins['my-plugin']  : other packages and user init.js can find your package's services dynamically
// Example:
//     class MyPlugin extends BGAtomPlugin {
//       constructor(state) {
//         super(my-plugin, state, __filename);
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

	static get(pkgName) {return BGAtomPlugin.instances.get(pkgName)}

	static logStatus() {
		for (const [pkgName, plugin] of BGAtomPlugin.instances) {
			console.log(pkgName.padEnd(25)+": cmd registered="+plugin.registeredCommands.size);
		}
	}

	// usage: pkgName, lastSessionsState
	constructor(pkgName, lastSessionsState, moduleFilename) {
		this.pkgName = pkgName;
		this.lastSessionsState = lastSessionsState || {};
		this.moduleFilename = moduleFilename;
		this.PluginClass = new.target;

		RegisterPackage(this.moduleFilename);

		// subscriptions is a place to put things that need to be cleaned up on deativation
		this.disposables = new Disposables();
		// make an alias to support transitioning to this.disposables name

		// When the derived class uses our methods to create resources, they are tracked in these Maps and automatically disposed.
		this.registeredCommands = new DisposableMap();
		this.watchedPreCmd      = new DisposableMap();
		this.watchedPostCmd     = new DisposableMap();

		console.assert(!this.PluginClass.instance, 'Package plugin being constructed twice. Should be a singleton. pacakgeName='+this.pkgName);
		this.PluginClass.instance = this;
		bg.BGAtomPlugin.instances.set(this.pkgName, this);

		// if the derived class declares a lateActivate method, invoke it from the onDidActivateInitialPackages event

		if (Reflect.has(this.PluginClass.prototype, 'lateActivate')) {
			if (atom.packages.initialPackagesActivated) {
				setTimeout(()=>this.lateActivate(), 0);
			} else {
				atom.packages.addDep_initialPackagesActivated(this,()=>{this.lateActivate();});
			}
		}
	}

	// A subclass can provide a lateActivate method and it will be called after all packages are activated
	//lateActivate(state) {}

	destroy() {
		// !!! Note: Disposables.DisposeOfMembers(this) iterates over all members to call dispose() or destroy() so we dont call
		// this.disposables.dispose directly

		// if any direct member of this plugin object has a 'dispose' or 'destroy' function, call it
		Disposables.DisposeOfMembers(this);

		// remove all relationships involving this plugin
		deps.objectDestroyed(this);

		this.PluginClass.instance = null
		delete bg.BGAtomPlugin.instances.delete(this.pkgName);
	}

	serialize() {}

	// add to atom's command pallette
	addCommand(name, callback) {this.registeredCommands.set(name, atom.commands.add('atom-workspace', {[name]:callback}));}
	removeCommand(name)        {this.registeredCommands.delete(name);}


	watchPreCommand(cmdSpec, callback) {
		typeof cmdSpec == 'string' && (cmdSpec = new RegExp(cmdSpec));
		const key = cmdSpec.toString();
		this.watchedPreCmd.set(key, atom.commands.onWillDispatch((e)=>{if (cmdSpec.test(e.type)) callback(e.type,e);}));
	}

	watchPostCommand(cmdSpec, callback) {
		typeof cmdSpec == 'string' && (cmdSpec = new RegExp(cmdSpec));
		const key = cmdSpec.toString();
		this.watchedPostCmd.set(key, atom.commands.onDidDispatch((e)=>{if (cmdSpec.test(e.type)) callback(e.type,e);}));
	}


	// Use this static method to export your MyPluginClass that extends BGAtomPlugin
	// usage: export default BGAtomPlugin.Export(MyPluginClass)
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

// helper class to manage containers of resorces that we need to dispose of when deactivated
class DisposableMap extends Map {
	dispose() {
		this.forEach((v)=>{
			if (v && typeof v.dispose == 'function')
				v.dispose;
		});
		this.clear();
	}
	set(key, value) {
		const prevValue = this.get(key);
		if (prevValue && typeof prevValue.dispose == 'function')
			prevValue.dispose;
		value && super.set(key, value);
	}
	delete(key) {
		const prevValue = this.get(key);
		if (prevValue && typeof prevValue.dispose == 'function')
			prevValue.dispose;
		super.delete(key);
	}
}


// create a global API for BGPlugins. This is particularly useful in the dev console and init.js file
RegisterGlobalService('1.0.0', null,            'bg',           ()=>{return Object.create(null)});
RegisterGlobalService('1.0.0', global.bg,       'BGAtomPlugin', ()=>{return BGAtomPlugin});
RegisterGlobalService('1.0.0', bg.BGAtomPlugin, 'instances',    ()=>{return new Map()});
BGAtomPlugin.instances = bg.BGAtomPlugin.instances;
