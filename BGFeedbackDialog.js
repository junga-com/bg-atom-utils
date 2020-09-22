import { Component } from 'bg-atom-redom-ui';

export class BGFeedbackDialog {
	constructor(title, params) {
		this.type = params.type || 'info';
		if (!params.detail) params.detail = ' ';
		switch (this.type) {
			case 'success': this.dialogBox = atom.notifications.addSuccess(title, params); break;
			case 'info':    this.dialogBox = atom.notifications.addInfo(title, params);    break;
			case 'warn':    this.dialogBox = atom.notifications.addWarning(title, params); break;
			case 'warning': this.dialogBox = atom.notifications.addWarning(title, params); break;
			case 'error':   this.dialogBox = atom.notifications.addError(title, params);   break;
			default:        console.assert(false,`unknown type ${this.type}`);             break;
		}

		try {
			this.statusArea = new Component('statusArea:$div')
			this.progressBar = new Component('progressBar:$progress')

			// The caller can specify status,current, and goal in addition to atom notification options
			this.update(params)

			this.el = atom.views.getView(this.dialogBox).element;
			this.el.classList.add('BGFeedbackDialog');
			this.title = this.el.querySelector('.message');
			this.buttons = this.el.querySelector('.meta .btn-toolbar');
			if (!this.buttons) {
				const meta = this.el.querySelector('.meta');
				this.buttons = new Component('$div.btn-toolbar').el;
				meta.appendChild(this.buttons);
				this.el.classList.add('has-buttons');
			}

			this.dialogDetailEl = this.el.querySelector('.detail-content');

			Component.mount(this.dialogDetailEl, [
				this.statusArea,
				this.progressBar
			])
		} catch(e) {
			this.dialogBox.dismiss();
			throw e;
		}
	}

	update({title, status, current, goal, buttons}) {
		if (title != null)   this.setTitle(title)
		if (status != null)  this.setStatus(status)
		if (current != null) this.setCurrent(current)
		if (goal != null)    this.setGoal(goal)
		if (buttons != null) this.setButtons(buttons)

		if ((status == null) && (current == null) && (goal == null))
			this.setCurrent('++')
	}

	setTitle(title) {
		this.title.innerText = title
	}

	setStatus(status) {
		this.statusArea.setLabel(status)
	}

	hideProgress() {
		this.progressBar.el.style.display = 'none'
	}

	setGoal(goal) {
		this.progressBar.el.max = goal
	}

	setCurrent(current) {
		if (!this.progressBar.el.max)
			return
		if (typeof current == "string") {
			if (/[-+][0-9]+/.test(current))
				this.progressBar.el.value += current;
			else if (current == "++")
				this.progressBar.el.value++;
			else if (current == "--")
				this.progressBar.el.value--;
			else
				this.progressBar.el.value = 0+current;
		} else if (typeof current == "number")
			this.progressBar.el.value = current;
	}

	setButtons(buttons) {
		this.buttons.innerHTML = ''
		for (const button of buttons) {
			this.buttons.appendChild(new Component('$a.btn '+button.text, {
				className: `btn-${this.type} ${button.className}`,
				href: '#',
				onclick: button.onDidClick
			}).el)
		}
	}

	dismiss() {
		this.dialogBox.dismiss()
	}
}
