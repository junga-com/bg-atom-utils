import { Disposables } from './Disposables';
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
//    disposables          : an instance of Disposables to add things that need to be undone in destroy
//    addCommand()         : wrapper to atom.commands.add(). associates the commands with this plugin and unregisters them in deactivate
//    watchPackages()      : get notified when a package's activation state changes
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

	static get(pkgName) {return BGAtomPlugin.instances.get(pkgName)}

	static logStatus() {
		for (const [pkgName, plugin] of BGAtomPlugin.instances) {
			console.log(pkgName.padEnd(25)+": cmd registered="+plugin.registeredCommands.size);
		}
	}

	// usage: pkgName, lastSessionsState
	constructor(...p) {
		this.pkgName = FirstParamOf('string', ...p);
		this.lastSessionsState = FirstParamOf('object', ...p) || {};
		this.PluginClass = new.target;

		// subscriptions is a place to put things that need to be cleaned up on deativation
		this.disposables = new Disposables();
		// make an alias to support transitioning to this.disposables name

		// When the derived class uses our methods to create resources, they are tracked in these Maps and automatically disposed.
		this.registeredCommands = new DisposableMap();
		this.watchedPacakges    = new DisposableMap();
		this.watchedPreCmd      = new DisposableMap();
		this.watchedPostCmd     = new DisposableMap();

		console.assert(!this.PluginClass.instance, 'Package plugin being constructed twice. Should be a singleton. pacakgeName='+this.pkgName);
		this.PluginClass.instance = this;
		BGAtomPlugin.instances.set(this.pkgName, this);

		// if the derived class declares a lateActivate method, invoke it from the onDidActivateInitialPackages event

		if (Reflect.has(this.PluginClass.prototype, 'lateActivate')) {
			if (atom.packages.initialPackagesActivated) {
				setTimeout(()=>this.lateActivate(), 0);
			} else {
				this.disposables.add(atom.packages.onDidActivateInitialPackages(()=>{this.lateActivate();}));
			}
		}
	}

	// A subclass can provide a lateActivate method and it will be called after all packages are activated
	//lateActivate(state) {}

	destroy() {
		// this.registeredCommands.forEach(v=>v.dispose()); this.registeredCommands.clear();
		// this.watchedPacakges.forEach(v=>v.dispose());    this.watchedPacakges.clear();

		// remove all relationships involving this plugin
		deps.objectDestroyed(this);

		// if any direct member of the plugin object has a 'dispose' function, call it
		for (const name of Object.getOwnPropertyNames(this)) {
			const prop = this[name];
			if (prop && typeof prop == 'object' && typeof prop.dispose == 'function') {
				//console.log(`!!!found ${name} to dispose`);
				prop.dispose();
			}
		}

		this.PluginClass.instance = null
		delete BGAtomPlugin.instances.delete(this.pkgName);
	}

	serialize() {}

	// add to atom's command pallette
	// call this with a null callback to remove the command
	addCommand(name, callback) {
		const prevValue = this.registeredCommands.get(name);
		if (prevValue) {
			prevValue.dispose;
			this.registeredCommands.delete(name);
		}
		callback && this.registeredCommands.set(name, atom.commands.add('atom-workspace', {[name]:callback}));
	}


	// OBSOLETE: use atom.config.addDep(configKeySpec, obj2, callback) instead
	watchConfig(configKey, callback) {
		console.assert(false,"BGAtomPlugin::watchConfig is OBSOLETE: use atom.config.addDep(configKeySpec, obj2, callback) instead")
	}

	// callback gets invoked whenever a specified pkgName changes activation state. Callback is passed the name of the package and
	// a boolean indicating the current activation state.
	// call this with a null callback to stop watching
	watchPackage(pkgNames, callback) {
		typeof pkgNames == 'string' && (pkgNames = pkgNames.split(','));
		for (const pkgName of pkgNames) {
			const prevValue = this.watchedPacakges.get(pkgName);
			if (prevValue) {
				prevValue.dispose;
				this.watchedPacakges.delete(configKey)
			}
			callback && this.watchedPacakges.set(pkgName, {
				onAct: atom.packages.onDidActivatePackage(  (pkg)=>{if (pkgName==pkg.name) callback(pkg.name, true);}),
				onDea: atom.packages.onDidDeactivatePackage((pkg)=>{if (pkgName==pkg.name) callback(pkg.name, false);}),
				dispose: function () {this.onAct.dispose(); this.onDea.dispose()}
			});
		}
	}

	watchPreCommand(cmdSpec, callback) {
		typeof cmdSpec == 'string' && (cmdSpec = new RegExp(cmdSpec));
		const key = cmdSpec.toString();
		const prevValue = this.watchedPreCmd.get(key);
		if (prevValue) {
			prevValue.dispose;
			this.watchedPreCmd.delete(key)
		}
		callback && this.watchedPreCmd.delete(key, atom.commands.onWillDispatch((e)=>{if (cmdSpec.test(e.type)) callback(e.type,e);}));
	}

	watchPostCommand(cmdSpec, callback) {
		typeof cmdSpec == 'string' && (cmdSpec = new RegExp(cmdSpec));
		const key = cmdSpec.toString();
		const prevValue = this.watchedPostCmd.get(key);
		if (prevValue) {
			prevValue.dispose;
			this.watchedPostCmd.delete(key)
		}
		callback && this.watchedPostCmd.delete(key, atom.commands.onDidDispatch((e)=>{if (cmdSpec.test(e.type)) callback(e.type,e);}));
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
		this.forEach(v=>v.dispose());
		this.clear();
	}
}

if (typeof global.bg == 'undefined') global.bg = Object.create(null)
BGAtomPlugin.instances = new Map();
global.bg.BGAtomPlugin = BGAtomPlugin;
