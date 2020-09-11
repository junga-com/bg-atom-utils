
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
//         object already as the features that this polyfill is meant to provid. The idea is that if you also create a PR to make these
//         changes in the upstream project, eventually it will be baked into the upstram code and this will no logger be needed.
//    isTargetStillCompatibleWithThisPollyfill() : The derived class can override this function to return true/false to indicate if the
//         target object is still compatible with this polyfill. Its possible that the upstream code changes in a way that the polyfill
//         will no longer work.
//    static 'config' property : to add and remove config settings, put their definitions in this static variable of the derived class.
//         This is almost the same as the static config property of BGAtmomPlugin classes except the top level key names are absolute
//         and therefore can contain periods.
//    Methods....
//         In the derived class you can write methods for the target object. Use 'this.target' instead of 'this'. Add the name of the
//         method to the propsToReplace array passed to the super constructor.
//    Constructing The Derived Class : Create an instance of your derived class with the new operator and then call the install method.
//         You can provide features to install/uninstall based on a configuration settings or just do it in the global scope of the file.
export class PolyfillObjectMixin {
	constructor(target, propsToReplace) {
		this.name = this.constructor.name.replace(/Polyfill$/,'');
		this.target = target;
		this.propsToReplace = propsToReplace;
		console.assert(this.target, `parameter 'target' can not be null when constructing the PolyfillObjectMixin '${this.name}'`)
		this.config = new.target.config;
	}

	// The derived class should implement these
	doesTargetAlreadySupportFeature() {return false;}
	isTargetStillCompatibleWithThisPollyfill() {return true;}

	getStatus() {
		if (this.isInstalled())
			return PolyfillObjectMixin.sInstalled;
		else if (this.doesTargetAlreadySupportFeature())
			return PolyfillObjectMixin.sNotNeeded;
		else if (!this.isTargetStillCompatibleWithThisPollyfill())
			return PolyfillObjectMixin.sNoLongerCompatible;
		else
			return PolyfillObjectMixin.sUninstalled;
	}

	// returns true if the feature is available because either it is now natively supportted so that the polyfill is not needed
	// or the polyfill is already installed.
	isFeatureSupported() {
		const status = this.getStatus();
		return status == PolyfillObjectMixin.sNotNeeded
			|| status == PolyfillObjectMixin.sInstalled;
	}

	// make the install/uninstall state reflect the boolean value passed in
	enable(state) {
		if (state)
			this.install();
		else
			this.uninstall();
	}

	isInstalled() {return !!this.target[`polyfill_${this.name}`]}

	// extend the target object with the changes implemented with this class
	install() {
		console.assert(this.getStatus()!=PolyfillObjectMixin.sNoLongerCompatible, `PolyfillObjectMixin '${this.name}' can not be installed because the target Atom code has changed since it was written`);
		if (this.getStatus()!=PolyfillObjectMixin.sUninstalled) return;

		this.target[`polyfill_${this.name}`] = {}
		this.stateObj = this.target[`polyfill_${this.name}`];

		// TODO: make a copy of the original methods in the target with 'orig_' prepended so that the new method implementation can
		// call the original implementation if needed.
		for (const propName of this.propsToReplace) {
			this.moveProp(this.stateObj, this.target, propName);
			this.moveProp(this.target, this, propName);
		}

		// add config settings
		for (const configKey in this.config)
			atom.config.setSchema(configKey, this.config[configKey]);
	}

	// undo the extensions made by this class to the target object
	uninstall() {
		if (this.getStatus()!=PolyfillObjectMixin.sInstalled) return;
		for (const propName of this.propsToReplace) {
			this.moveProp(this.target, this.stateObj, propName);
		}

		delete this.target[`polyfill_${this.name}`];
		delete this.stateObj;

		// add config settings
		for (const configKey in this.config) {
			atom.config.removeSchema(configKey);
		}
	}

	// private helper function
	// this makes the dst have the same state for propName as the src does. This includes deleting propName if it does not exist
	// in the src
	moveProp(dst,src, propName) {
		// NOTE: Reflect.getOwnPropertyDescriptor ruturns null if propName is a function
		const srcDescr = Reflect.getOwnPropertyDescriptor(src, propName)
		const dstDescr = Reflect.getOwnPropertyDescriptor(dst, propName)
		if (dstDescr || Reflect.has(dst, propName))
			Reflect.deleteProperty(dst, propName);
		if (srcDescr)
			Reflect.defineProperty(dst, propName, srcDescr);
		if (Reflect.has(src, propName))
			Reflect.set(dst, propName, Reflect.get(src, propName))
	}
}

PolyfillObjectMixin.sNotNeeded          = Symbol('sNotNeeded');
PolyfillObjectMixin.sUninstalled        = Symbol('sUninstalled');
PolyfillObjectMixin.sNoLongerCompatible  = Symbol('sNoLongerCompatible');
PolyfillObjectMixin.sInstalled          = Symbol('sInstalled');
