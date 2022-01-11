import { PolyfillObjectMixin }        from 'bg-dom';
import { ChannelNode, iniParamGetAll }from 'bg-dom';
import * as fs                        from 'fs';
import * as path                      from 'path';


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

	install(...p) {
		super.install(...p);
		this.bgSandboxDirProvider = new SandboxDirectoryProvider();
		this.target.directoryProviders.unshift(this.bgSandboxDirProvider);

		this.bgSandboxRepoProvider = new SandboxRepositoryProvider();
		this.target.repositoryProviders.unshift(this.bgSandboxRepoProvider);

		this.target.setPaths(this.target.getPaths());
	}

	uninstall(...p) {
		this.target.directoryProviders.splice(this.directoryProviders.indexOf(this.bgSandboxDirProvider),1);
		this.bgSandboxDirProvider = null;

		this.target.repositoryProviders.splice(this.repositoryProviders.indexOf(this.bgSandboxRepoProvider),1);
		this.bgSandboxRepoProvider = null;

		super.uninstall(...p);
	}

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
		if (SB_isASandboxFolder(newPath)) {
			const subs = [];
			for (const entry of fs.readdirSync(newPath)) {
				const subPath = path.join(newPath, entry);
				if (SB_isABGProjectFolder(subPath))
					subs.push(subPath);
			}
			if (subs.length>0) {
				process.chdir(newPath);
				this.setPaths(subs);
				//this.orig_addPath(...p);
				return;
			}
		}

		this.orig_addPath(...p);
	}
}

export function SB_isASandboxFolder(folder) {
	if (!folder) return false;
	const bgSPConfigFile = path.join(folder,'.bg-sp','config');
	const projectData = iniParamGetAll(bgSPConfigFile);
	return (projectData && projectData.projectType == 'sandbox');
}

export function SB_isABGProjectFolder(folder) {
	if (!folder) return false;
	const bgSPConfigFile = path.join(folder,'.bg-sp','config');
	const projectData = iniParamGetAll(bgSPConfigFile);
	return (projectData && typeof projectData.projectType != 'undefined');
}

class SandboxDirectoryProvider {
	directoryForURI(projectPath) {return Promise((resolveFn)=>{resolveFn(this.directoryForURISync(projectPath))})}
	directoryForURISync(projectPath) {
		if (SB_isASandboxFolder(projectPath)) {
			const defaultDir= atom.project.defaultDirectoryProvider.directoryForURISync(projectPath);
			return new SandboxDirectory(defaultDir);
		}
	}
}

class SandboxDirectory {
	// this implements a runtime inheritance pattern. <dir> is the existing atom Directory class instance that repreents the folder
	// and this class extends that **object** as opposed to extending a class.
	constructor(dir) {
		Reflect.setPrototypeOf(this.__proto__, dir);
	}

	getEntriesSync() {
		var entries = super.getEntriesSync();
		if (entries)
			entries = entries.filter((entry)=>!entry.isDirectory() || !SB_isABGProjectFolder(entry.getPath()))
		return entries;
	}

	getEntries(callback) {
		super.getEntries((error,entries)=>{
			if (entries)
				entries = entries.filter((entry)=>!entry.isDirectory() || !SB_isABGProjectFolder(entry.getPath()))
			callback(error,entries);
		})
	}
}

class SandboxRepositoryProvider {
	repositoryForDirectory(directory) {return Promise((resolveFn)=>{resolveFn(this.repositoryForDirectorySync(directory))})}
	repositoryForDirectorySync(directory) {
		if (SB_isASandboxFolder(directory.getPath())) {
			const defaultRepo= this.getRepoFromOtherProviders(directory);
			if (defaultRepo)
				return new SandboxRepositoryMixin(defaultRepo);
			else
				return new SandboxRepository(directory.getPath());
		}
	}
	getRepoFromOtherProviders(directory) {
		for (let provider of atom.project.repositoryProviders) {
			if (provider!==this && provider.repositoryForDirectorySync) {
				var repo = provider.repositoryForDirectorySync(directory);
			}
			if (repo) {
				return repo;
			}
		}
	}
}

class SandboxRepositoryMixin {
	// this implements a runtime inheritance pattern. <repo> is the existing atom GitRepository class instance that repreents the folder
	// and this class extends that **object** as opposed to extending a class.
	constructor(repo) {
		Reflect.setPrototypeOf(this.__proto__, repo);
	}

	isPathIgnored(path) {
		if (SB_isABGProjectFolder(path))
			return true;
		return super.isPathIgnored(path)
	}
}

class SandboxRepository {
	constructor(path) {
		this.path = path;
	}

	destroy() {}
	isDestroyed() {return false;}
	onDidDestroy(callback) {return {dispose:()=>{}}}
	onDidChangeStatus(callback) {return {dispose:()=>{}}}
	onDidChangeStatuses(callback) {return {dispose:()=>{}}}
	getType() {return 'bgsandbox'}
	getPath() {return this.path}
	getWorkingDirectory() {return this.path}
	isProjectAtRoot() {return true}
	relativize(path) {return path.relative(this.path, path)}
	hasBranch(branch) {return false}
	getShortHead(path) {return path}
	isSubmodule(filePath) {return false}
	getAheadBehindCount(reference, path) {return 0}
	getCachedUpstreamAheadBehindCount(path) {return 0}
	getConfigValue(key, path) {return undefined}
	getOriginURL(path) {return path}
	getUpstreamBranch(path) {return ""}
	getReferences(path) {return {}}
	getReferenceTarget(reference, path) {return undefined}
	isPathModified(path) {return false}
	isPathNew(path) {return false}
	isPathIgnored(path) {
		if (SB_isABGProjectFolder(path))
			return true;
	}
	getDirectoryStatus(directoryPath) {return 0}
	getPathStatus(path) {return 0}
	getCachedPathStatus(path) {return 0}
	isStatusModified(status) {return false}
	isStatusNew(status) {return false}
	getDiffStats(path) {return {}}
	getLineDiffs(path, text) {return []}
	checkoutHead(path) {return true}
	checkoutReference(reference, create) {return true}
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

//2021-02 disabling sandbox function b/c atom sees all files via two paths and gets confused.
//new AtomProjectPolyfill().install();
