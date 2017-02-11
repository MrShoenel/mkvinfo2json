const fs = require('fs');
const path = require('path');


const intMatch = /^\-?(?:0|(?:[1-9]\d*?))$/;
const nullMatch = /^null$/i;
const trueMatch = /^(?:(?:true)|(?:!(?:!!)*?false))$/i;
const falseMatch = /^(?:(?:false)|(?:!(?:!!)*?true))$/i;
const floatMatch = /^\-?(?:0|(?:(?:0?|[1-9]\d*?)\.\d+?))$/;
const scientificMatch = /^\-?(?:0|(?:[1-9]\d*?)|(?:(?:0?|[1-9]\d*?)\.\d+?))e(?:\+|\-)?[1-9]\d*?$/i;



class MkvInfoParser {
	constructor(filePath, rawOutput, opts = { noChapters: false }) {
		this.raw = rawOutput;
		this.info = new MkvInfo(filePath);
		this.opts = opts;
	};

	static singleSplit(line, char = ': ') {
		const sp = line.split(char);
		return [
			sp[0],
			sp.slice(1).join(char)
		].filter(v => v.length > 0);
	};

	static readBlock(lineInfoStart, iLineInfoStart, lines, stopLine = null) {
		const depthBefore = lineInfoStart.depth, wasRoot = lineInfoStart.isRoot;
		const arr = [];
		do {
			if (iLineInfoStart + 2 === lines.length) {
				break;
			}

			let nextLi = new LineInfo(lines[iLineInfoStart + 1]);
			if (nextLi.content === stopLine) {
				break;
			}
			if (nextLi.depth > depthBefore || (wasRoot && nextLi.depth === 0 && nextLi.isTop)) {
				arr.push(nextLi.content);
				iLineInfoStart++;
			} else {
				break;
			}
		} while (true);

		return {
			iAfter: iLineInfoStart,
			block: arr
		};
	};

	get result() {
		const split = this.raw.split(/\n|(?:\r\n?)$/g);
		for (let i = 0; i < split.length; i++) {
			const line = /^\|?\s*\+?\s+?(.+)/g.exec(split[i].trim());
			if (!line) {
				continue;
			}

			let li = new LineInfo(line[0]);
			if (li.isRoot) {
				if (li.content.startsWith('EBML')) {
					const blockInfo = MkvInfoParser.readBlock(li, i, split);
					blockInfo.block.forEach(l => this.processEBMLorDocLine(l));
					i = blockInfo.iAfter;
				} else if (li.content.startsWith('Segment')) {
					const blockInfo = MkvInfoParser.readBlock(li, i, split, 'Segment tracks');
					blockInfo.block.forEach(l => this.processSegmentInfoLine(l));
					i = blockInfo.iAfter;
				}
			} else {
				if (li.content === 'A track') {
					const blockInfo = MkvInfoParser.readBlock(li, i, split);
					this.processAudioVideoSubTrack(blockInfo.block);
					i = blockInfo.iAfter;
				} else if (li.content === 'ChapterAtom' && !this.opts.noChapters) {
					const blockInfo = MkvInfoParser.readBlock(li, i, split);
					this.processChapterAtom(blockInfo.block);
					i = blockInfo.iAfter;
				}
			}
		}

		return MkvInfoParser.toAtomic(this.info);
	};

	static toAtomic(info) {
		for (let k in info) {
			if (typeof info[k] === 'object') {
				info[k] = MkvInfoParser.toAtomic(info[k]);
				continue;
			}

			if (typeof info[k] !== 'string') {
				continue;
			}

			if (intMatch.test(info[k])) {
				info[k] = parseInt(info[k], 10);
			} else if (nullMatch.test(info[k])) {
				info[k] = null;
			} else if (trueMatch.test(info[k])) {
				info[k] = true;
			} else if (falseMatch.test(info[k])) {
				info[k] = false;
			} else if (floatMatch.test(info[k])
				|| scientificMatch.test(info[k])) {
				info[k] = parseFloat(info[k]);
			}
		}

		return info;
	};

	processEBMLorDocLine(line) {
		const sp = MkvInfoParser.singleSplit(line);
		if (sp.length !== 2) {
			return;
		}
		this.info.head[sp[0]] = sp[1];
	};

	processSegmentInfoLine(line) {
		const sp = MkvInfoParser.singleSplit(line);
		if (sp.length !== 2) {
			return;
		}
		this.info.segInfo[sp[0]] = sp[1];
	};

	processChapterAtom(lines) {
		const track = new ChapterAtom();

		for (let i = 0; i < lines.length; i++) {
			const sp = MkvInfoParser.singleSplit(lines[i]), k = sp[0], v = sp[1];

			switch (k) {
				case 'ChapterUID':
					track.uid = v;
					break;
				case 'ChapterTimeStart':
					track.start = v;
					break;
				case 'ChapterFlagHidden':
					track.hidden = v !== '0';
					break;
				case 'ChapterFlagEnabled':
					track.enabled = v === '1';
					break;
				case 'ChapterLanguage':
					track.language = v;
					break;
			}
		}

		this.info.chapters.push(track);
	};

	processAudioVideoSubTrack(lines) {
		const type = lines.filter(l => l.startsWith('Track type:'))[0].split(': ')[1];
		const isVideo = type === 'video', isAudio = !isVideo && type === 'audio',
			isSub = !isVideo && !isAudio && type === 'subtitles';
		
		const track = isVideo ? new VideoTrack() :
			(isAudio ? new AudioTrack() : new SubtitleTrack());
		
		for (let i = 0; i < lines.length; i++) {
			const sp = MkvInfoParser.singleSplit(lines[i]), k = sp[0], v = sp[1];

			switch (k) {
				case 'Track number':
					track.number = v;
					break;
				case 'Track UID':
					track.uid = v;
					break;
				case 'Track type':
					track.type = v;
					break;
				case 'Codec ID':
					track.codecId = v;
					break;
				case 'Language':
					track.language = v;
					break;
				

				// Video:
				case 'Pixel width':
					track.pxWidth = v;
					break;
				case 'Pixel height':
					track.pxHeight = v;
					break;
				case 'Display width':
					track.displayWidth = v;
					break;
				case 'Display height':
					track.displayHeight = v;
					break;
				

				// Audio:
				case 'Sampling frequency':
					track.sampFreq = v;
					break;
				case 'Channels':
					track.channels = v;
					break;
				

				// Subs:
				case 'Name':
					track.name = v;
					break;
			}
		}

		this.info.segTracks.push(track);
	};
};


class LineInfo {
	constructor(line) {
		this.info = /^(\|)?(\s*)\+?\s(.+)/ig.exec(`${line}`.trim());
	};

	get isRoot() {
		return this.info[1] === void 0;
	};

	get isTop() {
		return !this.isRoot && this.depth === 0;
	};

	get depth() {
		return this.info[2].length;
	};

	get content() {
		return this.info[3];
	};
};



class MkvInfo {
	constructor(filePath) {
		this.filePath = path.basename(filePath);
		this.dirName = path.dirname(filePath);
		this.fileSize = fs.statSync(filePath).size;

		/**
		 * EBML and DOC type.
		 */
		this.head = {};

		/**
		 * Segment-infos.
		 */
		this.segInfo = {};

		/**
		 * @var {Array<SegmentTrack>}
		 */
		this.segTracks = [];

		/**
		 * @var {Array<ChapterAtom>}
		 */
		this.chapters = [];
	};
};

class SegmentTrack {
	constructor() {
		this.number;
		this.uid;
		this.type;
		this.codecId;
		this.language;
	};
};

class VideoTrack extends SegmentTrack {
	constructor() {
		super();
		this.pxWidth;
		this.pxHeight;
		this.displayWidth;
		this.displayHeight;
	};
};

class AudioTrack extends SegmentTrack {
	constructor() {
		super();
		this.sampFreq;
		this.channels;
	};
};

class SubtitleTrack extends SegmentTrack {
	constructor() {
		super();
		this.name;
	};
};

class ChapterAtom extends SegmentTrack {
	constructor() {
		super();
		this.start;
		this.hidden;
		this.enabled;
	};
};

module.exports = {
	MkvInfoParser
};
