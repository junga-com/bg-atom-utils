import { PolyfillObjectMixin }        from './PolyfillObjectMixin'

export class AtomConfigPolyfill extends PolyfillObjectMixin {
	constructor() {
		super(
			atom.config,
			['removeSchema']
		);

		// for degugging....
		// global.target = this.target;
		// global.poly = this;
	}

	doesTargetAlreadySupportFeature() {return !!this.target.removeSchema;}
	isTargetStillCompatibleWithThisPollyfill() {return true;}


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
		let baseSchema = atom.config.schema;
		let defaultSettingsBase = atom.config.defaultSettings;
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

		atom.config.unset(keyPath);
		delete baseSchema.properties[name];
		delete defaultSettingsBase[name];
		atom.config.resetSettingsForSchemaChange();
	}
}

new AtomConfigPolyfill().install();
