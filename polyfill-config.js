import { PolyfillObjectMixin }        from 'bg-dom'
import { ArrangeParamsByType, FirstParamOf,Disposables,ChannelNode }  from 'bg-dom'

// these local definitions were brought in from atom's config.js for the _splitKeyPath method
const ESCAPED_DOT = /\\\./g
// the atom config.js version of isPlainObject needs _ underscore library
function isPlainObject(value) {
	return (typeof value == 'object') &&
			!Array.isArray(value) &&
			!(value.constructor.name == 'Color');
}


export class AtomConfigPolyfill extends PolyfillObjectMixin {
	constructor() {
		super(
			atom.config,
			['existsSchema','removeSchema','addDep','removeDep','onDidChangeAny','getConfigKeys',
			 '_splitKeyPath','_normalizeParams'
			]
		);
	}

	getTarget() {return atom.config;}
	doesTargetAlreadySupportFeature() {return !!this.target.addDep;}
	isTargetStillCompatibleWithThisPollyfill() {return true;}


	//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
	// Polyfill Methods...
	// These methods are writtien in the context of the target object and will be dynamically added to that object when this polyfill
	// is installed.  If the name matches an existing method of the target object, it will be replaced and the original will be
	// available as orig_<methodName>
	// The 'this' pointer of these methods will be the target object, not the polyfill object when they are invoked.

	// return true if a schema exists at keyPath
	existsSchema(keyPath) {
		// this implementation is a copy of getSchema (circa 2020-09) where I replaced each return statement with true/false.
		// I could not use getSchema to test for existence because when schema.additionalProperties != false (dont know what that
		// does) getSchema returns {type: 'any'} which, I think could be a real entry (although minimal)
		const keys = this._splitKeyPath(keyPath);
		let { schema } = this;
		for (let key of keys) {
			let childSchema;
			if (schema.type === 'object') {
				childSchema =
				schema.properties != null ? schema.properties[key] : undefined;
				if (childSchema == null) {
					if (isPlainObject(schema.additionalProperties)) {
						childSchema = schema.additionalProperties;
					} else if (schema.additionalProperties === false) {
						return false;
					} else {
						return false;
					}
				}
			} else {
				return false;
			}
			schema = childSchema;
		}
		return true;
	}


	// atom's config object does not include a way to remove a config item dynamically so we add one. This is the complement to setSchema()
	removeSchema(baseKeyPath, name) {
		let keys = baseKeyPath.replace('\\.','\b');
		keys = keys.split('.');
		keys = keys.map((s)=>{return s.replace('\b', '\\.')});
		if (!name) {
			var keyPath = baseKeyPath;
			name = keys.pop();
		} else {
			var keyPath = baseKeyPath + '.' + name;
		}
		let baseSchema = this.schema;
		let defaultSettingsBase = this.defaultSettings;
		for (let key of keys) {
			baseSchema.type = 'object';
			if (baseSchema.properties == null) {
				baseSchema.properties = {};
			}
			const { properties } = baseSchema;
			if (properties[key] == null) {
				properties[key] = {};
			}
			baseSchema = properties[key];

			if (defaultSettingsBase) {
				defaultSettingsBase = defaultSettingsBase[key];
			}
		}

		this.unset(keyPath);
		delete baseSchema.properties[name];
		delete defaultSettingsBase[name];
		this.resetSettingsForSchemaChange();
	}

	// This integrates the atom.config object with the DependentsGraph system.
	// Its a simple wrapper over deps.add({obj:atom.config,channel:configKeySpec}, obj2, callback)
	// Params:
	//    <configKeySpec> : identifies the schema keys that <obj2> is dependent on. The source of the deps relation is
	//                 {obj:atom.config,channel:configKeySpec}. See atom.config.getConfigKeys for the complete syntax supported.
	//                 This can be a RegExp, a string or an object with keys 'configContainer' and 'configKeyRegex'
	//    <obj2>     : the target object that depends on this keyPath. If <callback> is null, <obj2>.onConfigChanged(...) will be called
	//                 or  <obj2>.onDepChanged(...) if onConfigChanged does not exist. Even if <callback> is provided, <obj2> is
	//                 used to identify the 'subscription'.
	//                    <obj2>.onConfigChanged({key,oldValue,newValue})
	//                    <obj2>.onDepChanged(atom.config, {key,oldValue,newValue})
	//    <callback> : the optional callback to be invoked to notify <obj>.  If its not specifed then the first of
	//                 <obj2>.onConfigChanged or <obj2>.onDepChanged that exists will be invoked.
	// See Also:
	//    atom.config.getConfigKeys
	addDep(   configKeySpec, obj2, callback) {deps.add(    {obj:this,channel:configKeySpec}, obj2, callback);}
	removeDep(configKeySpec, obj2)           {deps.remove( {obj:this,channel:configKeySpec}, obj2);}


	// internal helper function
	_normalizeParams(...p) {
		var configContainer, configKeyRegex, callback;
		if (typeof p[0] == 'object' && p[0].configContainer || p[0].configKeyRegex) {
			configContainer = p[0].configContainer;
			configKeyRegex = p[0].configKeyRegex;
			callback = FirstParamOf('function', ...p);
		} else
			[configContainer, configKeyRegex, callback] = ArrangeParamsByType(arguments, 'string',RegExp, 'function');
		return {configContainer, configKeyRegex, callback};
	}

	// this is a vital behavior that atom.config does not expose. They hide it away in a key-path-helpers npm. I copied it here
	// with an underscore prepended so that enxtension code can access it without loading a package
	_splitKeyPath (keyPath) {
	  if (keyPath == null) return []

	  var startIndex = 0, keyPathArray = []
	  for (var i = 0, len = keyPath.length; i < len; i++) {
	    var char = keyPath[i]
	    if (char === '.' && (i === 0 || keyPath[i - 1] !== '\\')) {
	      keyPathArray.push(keyPath.substring(startIndex, i).replace(ESCAPED_DOT, '.'))
	      startIndex = i + 1
	    }
	  }
	  keyPathArray.push(keyPath.substr(startIndex, keyPath.length).replace(ESCAPED_DOT, '.'))

	  return keyPathArray
	}

	// Returns an array of configuration keys that are known at this time.
	// The results can be filtered by a specifying a configContainer string and or a configKeyRegex RegExp.
	// Params:
	//    configContainer:string : example: 'editor.invisibles'. Only keys in the given container are returned. The default is all keys.
	//                             This is a '.' separated list of names starting with the package name then optionally followed by
	//                             one or more config object container names. Each name must be an exact match. No wildcards or regex.
	//                             If any name does not match, an empty array is returned.
	//    configKeyRegex:RegExp : example: /^bg-/. If given, only keys matching this regex are returned.
	// Usage:
	// The 1st and 2nd parameters (type RegExp and string) and be specified in either order and the second is optional
	//    form1: getConfigKeys(<configContainer:string> [, <configKeyRegex:RegExp>])
	//    form2: getConfigKeys(<configKeyRegex:RegExp> [, <configContainer:string>])
	//    form3: getConfigKeys({configContainer:<configContainer>, configKeyRegex:<configKeyRegex>})
	getConfigKeys($configKeySpec) {
		const {configContainer, configKeyRegex} = this._normalizeParams(...arguments);

		// start at the top of the config
		var cfgToSearch = this.getAll()[0].value;

		// if <configContainer> is specified, navigate down to that branch in the config tree
		if (configContainer) {
			for (const name of configContainer.split('.')) {
				if (!(name in cfgToSearch))
					// if the branch does not exist, there can not be any config keys in it
					return [];
				cfgToSearch = cfgToSearch[name];
			}
		}

		if (typeof cfgToSearch != 'object' && !configKeyRegex)
			return [configContainer];

		if (typeof configKeyRegex == 'string')
			configKeyRegex = new RegExp('^'+configKeyRegex);

		// recursively search the entire branch (which could be the root) for keys matching the <configKeyRegex>
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
		recurseObj(cfgToSearch, configContainer, configKeyRegex)
		return outKeys
	}



	// This extends onDidChange to allow specifying <configContainer> and <configKeyRegex> to match a set of keys that the callback
	// will be registered on.
	// Note that onDidChange can watch the entire config tree or a subtree for changes with one callback, but the callback is sent
	// the entire value tree in {newValue,oldValue} so its inconvenient to know what exactly changed. This will fire the callback
	// with the specific {key,newValue,oldValue} where key is always a leaf so that newValue,oldValue is just the value for that one
	// lead key.
	// Performance / Size Limitation:
	//    Initially, I am not sure if the atom.config system can effieciently register a large number of callbacks so if <configKeySpec>
	//    (aka $configContainer, $configKeyRegex) matches more than 100 keys, an assertion will be thrown.  It would be better to
	//    modify the atom.config class code to add a new mechanism that emits a {key,newValue,oldValue} msg directly for any change
	// Params:
	//    <$configKeySpec> : $configKeySpec can be specified as one or two parameters. As one parameter it can be a
	//                       string (configContainer), a RegExp (configKeyRegex) or an object ({configContainer,configKeyRegex})
	//        <configContainer> : identifies the branch node in the config tree to search. If omitted the whole tree is searched
	//        <configKeyRegex>  : a RegExp to filter keys in the searched branch by
	//    <callback>       : the function that will be invoked when any of the matching keys are changed. The signature is
	//                       callback({key,newValue,oldValue}) where key is a matching key that changed value.
	// Usage:
	// This method 3 different forms so the actuall parameters do not have to line up exactly with the signature. That is why the
	// parameters in the signature are prefixed with '$' to indicate that something special is going on.
	// Note: the <callback> and at least one of <configContainer>, <configKeyRegex> are required
	//    form1: onDidChangeAny(<configContainer:string> [, <configKeyRegex:RegExp>], <callback:function>)
	//    form2: onDidChangeAny(<configKeyRegex:RegExp> [, <configContainer:string>], <callback:function>)
	//    form2: onDidChangeAny({configContainer:<configContainer>, configKeyRegex:<configKeyRegex>}, <callback:function>)
	// See Also:
	//    getConfigKeys : configContainer, configKeyRegex are processed by this method to obtain the set of keys to operate on
	//    addDep        : alternative that uses the DependentsGraph mechaism
	onDidChangeAny($configKeySpec, $callback) {
		var {configContainer, configKeyRegex, callback} = this._normalizeParams(...arguments);
		console.assert(callback && (!!configContainer || !!configKeyRegex),"atom.config.onDidChangeAny: invalid parameters passed")

		// note that we do not use atom's ability to watch the whole config tree or a subtree b/c it sends the entire tree/subtree
		// of values in {newValue,oldValue} without identifying which value changed so we would have to diff the results to find out.

		var disposables    = new Disposables();
		var keys = this.getConfigKeys(configContainer, configKeyRegex);
		console.assert(keys.length < 100, 'Registering callbacks on large sets of configuration keys (>100) is not supported');
		for (const name of keys) {
			disposables.add(this.onDidChange(name, {}, (context)=>{callback({key:name, ...context})}));
		}
		return disposables;
	}
}





// Integration with DependentsGraph System
// This registers a custom ChannelNode type in the DependentsGraph system so that it can manage the integration with atom.config
// Event Subscriptions. When a dependency relationship is added with atom.config as the source object, this specific Class of
// ChannelNode will be created so that it can interpret the channel and create the correct atom.config Event Subscriptions to
// fire the relationship when needed. When the last relationship of that channel is removed, those atom.config Event Subscriptions
// will be disposed.
class AtomConfigChannelNode extends ChannelNode {
	// in this case we made one class that works with all channel of the atom.config object so we do not consider channel in the match
	static matchSource(obj1,channel) {return obj1===atom.config}

	constructor(obj, channel) {
		super(obj, channel);

		this.defaultTargetMethodName = 'onConfigChanged';

		this.disposables.add(obj.onDidChangeAny(channel, {}, (...p)=>{deps.fire({obj,channel}, ...p)}));
	}
}
deps.registerCNodeClass(AtomConfigChannelNode);

new AtomConfigPolyfill().install();
