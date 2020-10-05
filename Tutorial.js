import fs from 'fs';

export class Tutorial {
	static resumeStateExists() {
		return fs.existsSync(atom.getConfigDirPath()+'/bg-tree-view-toolbar.tutorialState.txt')
	}

	constructor(packageName) {
		this.packageName = packageName;
		this.stateFile = atom.getConfigDirPath()+'/bg-tree-view-toolbar.tutorialState.txt';
	}

	// indicate that after a refresh or restart, the tutorial should resume at this page regardless of the configuration setting
	resumePageSet(pageName) {
		fs.writeFileSync(this.stateFile, 'resume '+pageName);
	}

	// clear the resume page state so that the tutorial will not resume on after a refresh or restart
	resumeClear() {
		fs.unlinkSync(this.stateFile);
	}

	doResumeState() {
		if (fs.existsSync(this.stateFile)) {
			var data;
			try {
				data = fs.readFileSync(this.stateFile, {encoding:'utf8'});
			} catch (err) {
				return false;
			}

			data = data.split(' ');
			if (typeof this[data[1]] == 'function') {
				// invoke with a delay so that the rest of packages can initialize. W/o this opening the config setting package
				// page in the step being re-invoked opened a empty text editor instead of the config settings window.
				// TODO: there should be an obvious API to defer -- related to lateConstruction in AtomPlugin class
				setTimeout(()=>{this[data[1]]()},200);
				return true;
			}
			this.resumeClear();
		}

		return false;
	}
}
