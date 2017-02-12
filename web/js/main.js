const app = angular.module('app', []);
app.controller("Ctrl", ['$http', '$timeout', function($http, $timeout) {
	this.isReady = true;
	this.mkvInfo = window.json;
	this.infoSize = window.json.infoSize;
	this.mkvs = window.json.files;
	this.createArgs = (() => {
		const arr = [], args = this.mkvInfo.args;
		Object.keys(args).forEach(k => {
			if (k === '_') {
				arr.push(...args[k]);
			} else {
				if (args[k] === true) {
					arr.push(`-${k}`);
				} else {
					arr.push(`-${k}=${args[k]}`);
				}
			}
		});
		return arr.join('  ');
	})();

	for (let i = 0; i < this.mkvs.length; i++) {
		const m = this.mkvs[i];
		m.aiId = i;
		m.videoTrack = m.segTracks.filter(t => t.type === 'video')[0];
		m.name = m.filePath.replace(/\.mkv$/i, '');

		m.isMovie = m.dirName.indexOf('\\movies') >= 0;
		m.isShow = m.dirName.indexOf('\\series') >= 0;
		m.isExtra = m.dirName.indexOf('\\extras') >= 0;
		m.isBonus = m.dirName.indexOf('\\bonus') >= 0;
		m.isOther = (!m.isMovie && !m.isShow && !m.isExtra && !m.isBonus) || m.dirName.indexOf('\\other') >= 0;

		m.isHd = m.videoTrack.pxWidth >= 1260 && m.videoTrack.pxWidth < 1300;
		m.isFullHd = m.videoTrack.pxWidth >= 1900 && m.videoTrack.pxWidth < 2000;
		m.is4K = m.videoTrack.pxWidth >= 3840;
		m.isHEVC = m.videoTrack.codecId.toLowerCase().indexOf('hevc') >= 0;
		m.quality = `${m.videoTrack.pxWidth}x${m.videoTrack.pxHeight}`;

		m.duration = parseFloat(m.segInfo.Duration.split(' ')[0]);

		m.audioTracks = m.segTracks
			.filter(t => t.type === 'audio')
			.map(t => { t.language = t.language || 'eng'; return t; })
			.sort();
		m.audioTracksNames = m.audioTracks.map(t => t.language).join(', ');

		m.subTracks = m.segTracks
			.filter(t => t.type === 'subtitles')
			.map(t => { t.language = t.language || 'eng'; return t; })
			.sort();
		m.subTracksNames = m.subTracks.map(t => t.language).join(', ');

		m.headString = Object.keys(m.head).map(key => {
			return `${key}${m.head[key] ? ': ' + m.head[key] : ''}`;
		}).join("\n"); // shown in <pre/>

		m.segInfoString = Object.keys(m.segInfo).map(key => {
			return `${key}${m.segInfo[key] ? ': ' + m.segInfo[key] : ''}`;
		}).join("\n"); // shown in <pre/>
	}

	this.sizeTotal = this.mkvs.map(m => m.fileSize).reduce((p, c) => p + c, 0);
	this.durationTotal = this.mkvs.map(m => m.duration).reduce((p, c) => p + c, 0);

	// Just an init
	this.mkvsFiltered = this.mkvs;
	this.mkvsFilteredSize = this.sizeTotal;
	this.mkvsFilteredDuration = this.durationTotal;

	this.mkvsSelected = [];
	this.mkvsSelectedSize = 0;
	this.mkvsSelectedDuration = 0;

	this.sort = () => {
		if (this.sortBy === '') {
			return;
		}

		const asc = this.sortDir === 'asc';

		this.mkvsFiltered.sort((a, b) => {
			const valA = this.sortBy === 'quality' ? a.videoTrack.pxWidth * a.videoTrack.pxHeight : a[this.sortBy],
				valB = this.sortBy === 'quality' ? b.videoTrack.pxWidth * b.videoTrack.pxHeight : b[this.sortBy];
			
			return valA < valB ? (asc ? -1 : 1) : (asc ? 1 : -1);
		});
	};

	/**
	 * Only called by this.filter()
	 */
	this.filterTracks = m => {
		const val = this.filterTrackVal,
			select = this.filterTrackSelect,
			tracks = m.segTracks.filter(t => t.type === this.filterTrackType),
			compareFn = (track, field, type, val) => {
				if (!track.hasOwnProperty(field)) {
					if (type === 'miss') {
						return true;
					}
					return false; // because this is then unexpected
				}

				const f = `${track[field]}`, v = `${val}`;
				if (type === 'eq') {
					return f === v;
				} else if (type === 'eq_ic') {
					return f.toLowerCase() === v.toLowerCase();
				} else if (type === 'con') {
					return f.indexOf(v) >= 0;
				} else if (type === 'con_ic') {
					return f.toLowerCase().indexOf(v.toLowerCase()) >= 0;
				}

				return false;
			};
		
		if ((select === 'any' || select === 'all') && tracks.length === 0) {
			return false;
		}
		
		const filtered = tracks.filter(t => compareFn(t, this.filterTrackField, this.filterTrackCompare, val));

		if (select === 'any') {
			return filtered.length > 0;
		} else if (select === 'all') {
			return filtered.length === tracks.length;
		} else if (select === 'none') {
			return filtered.length === 0;
		}
	};

	this.filter = () => {
		const noFilter = () => true,
			name = this.filterName.toLowerCase(),
			dir = this.filterDir.toLowerCase(),
			q = this.filterQ.toLowerCase(),
			audio = this.filterAudio.toLowerCase(),
			head = this.filterHead.toLowerCase(),
			segInfo = this.filterSegInfo.toLowerCase();

		this.mkvsFiltered = this.mkvs.filter(m => {
			const sizeLimit = isNaN(parseInt(this.filterSize)) ? Number.MAX_SAFE_INTEGER : parseInt(this.filterSize, 10) * 1e6;
			return m.fileSize < sizeLimit
				&& (!!name ? m.name.toLowerCase().indexOf(name) >= 0 : true)
				&& (!!dir ? m.dirName.toLowerCase().indexOf(dir) >= 0 : true)
				&& (!!audio ? m.audioTracksNames.toLowerCase().indexOf(audio) >= 0 : true)
				&& (!!q ? (
					q === 'hd' ? m.isHd || m.isFullHd || m.is4K :
					(q === 'fhd' ? m.isFullHd || m.is4K :
					(q === '4k' ? m.is4K : false))
					) : true)
				&& (!!head ? m.headString.toLowerCase().indexOf(head) >= 0 : true)
				&& (!!segInfo ? m.segInfoString.toLowerCase().indexOf(segInfo) >= 0 : true)
				&& (
					(this.showMovies && this.showMovies === m.isMovie)
					|| (this.showSeries && this.showSeries === m.isShow)
					|| (this.showExtra && this.showExtra === m.isExtra)
					|| (this.showBonus && this.showBonus === m.isBonus)
					|| (this.showOther && this.showOther === m.isOther)
				)
				&& (this.showHevcOnly ? m.isHEVC : true)
				&& (this.filterTrackType && this.filterTrackVal ? this.filterTracks(m) : true);
		});
		
		this.mkvsFilteredSize = this.mkvsFiltered.map(m => m.fileSize).reduce((p, c) => p + c, 0);
		this.mkvsFilteredDuration = this.mkvsFiltered.map(m => m.duration).reduce((p, c) => p + c, 0);
		this.sort();
	};

	this.updateSelected = () => {
		this.mkvsSelected = this.mkvsFiltered.filter(m => m.ui.selected);
		this.mkvsSelectedSize = this.mkvsSelected.map(m => m.fileSize).reduce((p, c) => p + c, 0);
		this.mkvsSelectedDuration = this.mkvsSelected.map(m => m.duration).reduce((p, c) => p + c, 0);
	};

	this.selectNone = () => {
		this.mkvs.forEach(m => m.ui.selected = false);
		this.updateSelected();
	};

	this.selectAll = () => {
		this.mkvsFiltered.forEach(m => m.ui.selected = true);
		this.updateSelected();
	};

	this.exportSelection = () => {
		const t = this.exportType;
		let props = [];
		if (t === 'name') {
			props.push('name');
		} else if (t === 'name-dir') {
			props.push('name', 'dirName');
		} else if (t === 'extended') {
			props.push('name', 'dirName', 'duration', 'audioTracksNames', 'subTracksNames', 'fileSize', 'quality');
		} else {
			props = null; // all of it
		}

		const json = props === null ? this.mkvsSelected.slice(0) :
			this.mkvsSelected.map(m => {
				const o = {};
				for (let i = 0; i < props.length; i++) {
					o[props[i]] = m[props[i]];
				}
				return o;
			});
		
		const uri = 'data:application/octet-stream,' + encodeURIComponent(JSON.stringify(json));
		window.open(uri);
	};
}]).filter('fileSize', ['$filter', $filter => {
	return input => {
		const sizes = ['bytes', 'KB', 'MB', 'GB', 'TB'];
		let number = parseInt(input, 10);

		if (number < 1000) {
			return `${number} ${sizes[0]}`;
		}

		let idx = 0;
		while (number > 1000) {
			number /= 1000;
			idx++;
		}

		return `${$filter('number')(number, 1)} ${sizes[idx]}`;
	};
}]).filter('duration', [() => {
	return input => {
		const secs = parseFloat(`${input}`),
			days = Math.floor(secs / (3600 * 24)),
			hours = Math.floor((secs % (3600 * 24)) / 3600),
			minutes = Math.floor((secs % 3600) / 60),
			seconds = (secs | 0) % 60;
		
		return `${days > 0 ? days + 'd ' : ''}${hours}:${minutes < 10 ? '0' + minutes : minutes}:${seconds < 10 ? '0' + seconds : seconds}`;
	};
}]);

angular.bootstrap(document.body, ['app']);
