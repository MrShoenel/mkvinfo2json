const klaw = require('klaw');
const MkvInfoParser = require('./mkvinfoParser').MkvInfoParser;
const childProc = require('child_process');


class MkvInfo2Json {
	constructor(directory, executable) {
		this.directory = directory;
		this.executable = executable;
	};

	get mkvInfoVersion() {
		return childProc.execSync(`${this.executable} -V`).toString('utf-8');
	};

	processDirectory(opts = { noChapters: false }) {
		return new Promise((resolve, reject) => {
			const files = [];
			klaw(this.directory).on('data', item => {
				if (item.stats.isFile() && item.path.endsWith('.mkv')) {
					files.push(item.path);
				}
			}).on('error', err => {
				reject(err);
			}).on('end', () => {
				const arr = [];
				for (let i = 0; i < files.length; i++) {
					const raw = childProc.execSync(`${this.executable} "${files[i]}"`).toString('utf-8');
					arr.push(new MkvInfoParser(files[i], raw, opts).result);
				}

				resolve(arr);
			});
		});
	};
};

module.exports = {
	MkvInfo2Json
};
