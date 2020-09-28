import { PolyfillObjectMixin }        from 'bg-dom';
import { ChannelNode, iniParamGetAll }from 'bg-dom';
import * as fs                        from 'fs';



export class AtomProjectPolyfill extends PolyfillObjectMixin {
	constructor() {
		super(
			atom.project,
			['setPaths','addPath']
		);
	}

	getTarget() {return atom.project;}
	doesTargetAlreadySupportFeature() {return false;}
	isTargetStillCompatibleWithThisPollyfill() {return true;}


	//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
	// Polyfill Methods...
	// These methods are writtien in the context of the target object and will be dynamically added to that object when this polyfill
	// is installed.  If the name matches an existing method of the target object, it will be replaced and the original will be
	// available as orig_<methodName>
	// The 'this' pointer of these methods will be the target object, not the polyfill object when they are invoked.

	setPaths(...p) {
		this.orig_setPaths(...p);
	}

	// override the addPath method so that we can implement special handling of sandbox folders. Note that when a path is passed on
	// the atom command line, this will be called with that path after packages are activated and this polyfill gets installed.
	// When atom is refreshed, it will be deserialized before packages are activated and addPath will be called before the polyfill
	// overrides addPath. Fortunately, this works out because the results of the sandbox processing is to add the individual subproject
	// paths and that set of paths, not the sandbox folder is what gets serialized/deserialized.
	addPath(...p) {
		const [newPath] = p;
		const pwd = process.cwd()
		if (fs.existsSync(pwd+'/.bg-sp/config')) {
			const projectData = iniParamGetAll(pwd+'/.bg-sp/config')
			if (projectData && projectData.projectType == 'sandbox' && pwd==newPath) {
				const subs = [];
				for (const entry of fs.readdirSync(newPath))
					if (fs.existsSync(newPath+'/'+entry+'/.bg-sp/config'))
						subs.push(newPath+'/'+entry);
				if (subs.length>0) {
					this.setPaths(subs);
					return;
				}
			}
		}

		this.orig_addPath(...p);
	}
}





// Integration with DependentsGraph System
// This registers a custom ChannelNode type in the DependentsGraph system so that it can manage the integration with atom.project
// Event Subscriptions. When a dependency relationship is added with atom.project as the source object, this specific Class of
// ChannelNode will be created so that it can interpret the channel and create the correct atom.project Event Subscriptions to
// fire the relationship when needed. When the last relationship of that channel is removed, those atom.project Event Subscriptions
// will be disposed.
// class AtomConfigChannelNode extends ChannelNode {
// 	// in this case we made one class that works with all channel of the atom.project object so we do not consider channel in the match
// 	static matchSource(obj1,channel) {return obj1===atom.project}
//
// 	constructor(obj, channel) {
// 		super(obj, channel);
//
// 		this.defaultTargetMethodName = 'onConfigChanged';
//
// 		this.disposables.add(obj.onDidChangeAny(channel, {}, (...p)=>{deps.fire({obj,channel}, ...p)}));
// 	}
// }
// deps.registerCNodeClass(AtomConfigChannelNode);

new AtomProjectPolyfill().install();
