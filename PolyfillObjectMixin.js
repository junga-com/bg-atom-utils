import { DependentsGragh } from 'bg-dom'

const MoveModes = {
	Normal      :'Normal',
	MakeBackup  :'MakeBackup',
	RemoveBackup:'RemoveBackup'
}

const States = {
	NoTarget            : 'sNoTarget',
	NotNeeded           : 'sNotNeeded',
	Uninstalled         : 'sUninstalled',
	NoLongerCompatible  : 'sNoLongerCompatible',
	Installed           : 'sInstalled'
}

// PolyfillObjectMixin provides a mechanism to manage changes to an existing global object at runtime. In an ideal world, these changes
// would be made to the object's Class code and submitted as a PR to the owning project but that does not always work and in any case
// it takes a while and produces dependencies on the underlying project's version. Using this class should go hand in hand with submitting
// a corresponding PR. This allows the feature to be used right away and other features to depend on it right away. If and when the
// PR is accepted and the underlying code is updated, the PolyfillObjectMixin::doesTargetAlreadySupportFeature() will return true
// and the dynamic patch will stop being applied.
//
// How To Use:
// Create a class that derives from PolyfillObjectMixin and implement the doesTargetAlreadySupportFeature and isTargetStillCompatibleWithThisPollyfill
// methods. Then add methods and properties to your class that you want to apply to the global object. In the super call of your constructor,
// list the names of all of these methods and properties in the propsToReplace array parameter.
// When the PolyfillObjectMixin is installed, it will add each named property or method, overwriting any that might exist in the original.
// API:
// This class is meant to be the base class of a class that represents some change to a global object controlled by another code
// project.
//    super(target, propsToReplace) : The derived class needs to call super with these two arguments
//         target          : this is the reference to the global object that will be exteended
//         propsToReplace  : this is an array of strings that list the properties and methods of the derived class that will be copied into
//                           the target class to extend it.
//    doesTargetAlreadySupportFeature() : The derived class can override this function to return true/false to indicate if the target
//         object already as the features that this polyfill is meant to provide. The idea is that if you also create a PR to make these
//         changes in the upstream project, eventually it will be baked into the upstram code and this will no logger be needed.
//    isTargetStillCompatibleWithThisPollyfill() : The derived class can override this function to return true/false to indicate if the
//         target object is still compatible with this polyfill. Its possible that the upstream code changes in a way that the polyfill
//         will no longer work.
//    static 'config' property : to add and remove config settings, put their definitions in this static variable of the derived class.
//         This is almost the same as the static config property of BGAtmomPlugin classes except the top level key names are absolute
//         and therefore can contain periods.
//    Methods....
//         You can write methods in the derived class that will be added to the polyfill target object when its installed.
//         You identify these methods (as opposed to normal methods of the polyfill) by listing them in the propsToReplace array passed
//         to the super constructor in your derived class constructor.
//         * in these methods, this.target is the 'this' point of the target object and 'this' is the 'this' point of the polyfill object.
//         * if you want to invoke the original implementation, use this.target.orig_<methodName>(...)
//    Constructing The Derived Class : Create an instance of your derived class with the new operator and then call the install method.
//         You can provide features to install/uninstall based on a configuration settings or just do it in the global scope of the file.
export class PolyfillObjectMixin {
	static get(polyfillClassName) {
		return PolyfillObjectMixin.instances.get(polyfillClassName);
	}

	static logStatus() {
		for (const [name,poly] of PolyfillObjectMixin.instances) {
			console.log(poly.name.padEnd(25)+': '+poly.getStatus());
		}
	}

	constructor(target, propsToReplace, configKey, pullRequest) {
		this.name = this.constructor.name.replace(/Polyfill$/,'');
		this.target = target;
		this.propsToReplace = propsToReplace;
		this.configKey = configKey;
		this.pullRequest = pullRequest;
		this.config = new.target.config;

		PolyfillObjectMixin.instances.set(new.target.name, this);

		if (this.configKey)
			atom.config.addDep(this.configKey, this, ({newValue})=>{this.enable(newValue)});
	}

	destroy() {
		deps.objectDestroyed(this);
	}

	// The derived class should implement these
	getTarget() {return this.target;} // this implementation does no harm. the derived class should override it
	doesTargetAlreadySupportFeature() {return false;}
	isTargetStillCompatibleWithThisPollyfill() {return true;}

	// this is typically used by the derived class to check to see if the target object code still has the structure that it expects
	existsInTarget(props) {
		if (!this.target) return false;
		if (typeof props == 'string') props = props.split(',');
		for (const prop of props)
			if (!this.target[prop])
				return false;
		return true;
	}

	getStatus() {
		if (!this.target)
			this.target = this.getTarget();

		if (!this.target)
			return States.NoTarget;
		else if (this.isInstalled())
			return States.Installed;
		else if (this.doesTargetAlreadySupportFeature())
			return States.NotNeeded;
		else if (!this.isTargetStillCompatibleWithThisPollyfill())
			return States.NoLongerCompatible;
		else
			return States.Uninstalled;
	}

	// returns true if the feature is available because either it is now natively supportted so that the polyfill is not needed
	// or the polyfill is already installed.
	isFeatureSupported() {
		const status = this.getStatus();
		return status == States.NotNeeded
			|| status == States.Installed;
	}

	// make the install/uninstall state reflect the boolean value passed in
	enable(state) {
		if (state)
			this.install();
		else
			this.uninstall();
	}

	// make the installed state reflect the config setting
	sync() {
		this.configKey && this.enable(atom.config.get(this.configKey))
	}

	isInstalled() {return this.target && !!this.target[`polyfill_${this.name}`]}

	// extend the target object with the changes implemented with this class
	install() {
		console.assert(this.getStatus()!=States.NoLongerCompatible, `PolyfillObjectMixin '${this.name}' can not be installed because the target Atom code has changed since it was written`);
		//console.assert(this.getStatus()!=States.NoTarget, `PolyfillObjectMixin '${this.name}' can not be installed because the target object does not exist`);
		if (this.getStatus()!=States.Uninstalled) return;

		this.target[`polyfill_${this.name}`] = {}
		this.stateObj = this.target[`polyfill_${this.name}`];

		// TODO: make a copy of the original methods in the target with 'orig_' prepended so that the new method implementation can
		// call the original implementation if needed.
		for (const propName of this.propsToReplace) {
			this.moveProp(this.stateObj, this.target, propName);
			this.moveProp(this.target,   this,        propName, MoveModes.MakeBackup);
		}

		// add config settings
		for (const configKey in this.config)
			atom.config.setSchema(configKey, this.config[configKey]);

		// broadcast that this object has changed
		deps.fire(this, States.Installed);
	}

	// undo the extensions made by this class to the target object
	uninstall() {
		if (this.getStatus()!=States.Installed) return;
		for (const propName of this.propsToReplace) {
			this.moveProp(this.target, this.stateObj, propName, MoveModes.RemoveBackup);
		}

		delete this.target[`polyfill_${this.name}`];
		delete this.stateObj;

		// add config settings
		for (const configKey in this.config) {
			atom.config.removeSchema(configKey);
		}

		// broadcast that this object has changed
		deps.fire(this, States.Uninstalled);
	}

	// private helper function
	// this makes the dst have the same state for propName as the src does. This includes deleting propName if it does not exist
	// in the src. Note that the order of dst and src is consistent with the comp sci tradition of assignment (i.e. dst=src)
	// Move Process:
	// This function moves a property in two steps so that the property will not be coerced and attributes are preserved.
	// Note that methods do not have descriptors so in that case the first step is skipped
	//    1) First it defines the property in the destination with the descriptor it gets from the source
	//    2) Second it copies the value
	// Params:
	//    <dst>     : the target object of the move that will have the property modified (copied or deleted)
	//    <src>     : the source object where the property will be copied from if it exists
	//    <propName>: the string name of the property to act on
	//    <mode>    : true -> make a backup of the dst property if it exists in 'orig_'+propName
	moveProp(dst,src, propName, mode=false) {
		// NOTE: Reflect.getOwnPropertyDescriptor ruturns null if propName is a function
		const backupPropName = 'orig_'+propName;
		const srcDescr = Reflect.getOwnPropertyDescriptor(src, propName)
		const dstDescr = Reflect.getOwnPropertyDescriptor(dst, propName)
		if (dstDescr || Reflect.has(dst, propName)) {
			if (mode==MoveModes.MakeBackup) {
				console.assert(!Reflect.has(dst, backupPropName), "It seems that multiple PolyfillObjectMixin are replacing the same property : polyfill="+this.name+", propName="+propName)
				dstDescr && Reflect.defineProperty(dst, backupPropName, dstDescr);
				Reflect.set(dst, backupPropName, Reflect.get(dst, propName))
			}
			Reflect.deleteProperty(dst, propName);
		}
		if (srcDescr)
			Reflect.defineProperty(dst, propName, srcDescr);
		if (Reflect.has(src, propName))
			Reflect.set(dst, propName, Reflect.get(src, propName))
		if (mode==MoveModes.RemoveBackup && Reflect.has(dst, backupPropName))
			Reflect.deleteProperty(dst, backupPropName);
	}
}

PolyfillObjectMixin.States = States;

if (typeof global.bg == 'undefined') global.bg = Object.create(null)
PolyfillObjectMixin.instances = new Map();
global.bg.PolyfillObjectMixin = PolyfillObjectMixin;
