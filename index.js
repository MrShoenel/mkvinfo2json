const argv = require('minimist')(process.argv.slice(2));
const colors = require('colors');
const fs = require('fs');
const path = require('path');
const MkvInfo = require('./modules/mkvinfo').MkvInfo2Json;


const printUsage = () => {
	const w = process.stdout.columns, msg = "mkvinfo2json is a command-line utility for batch processing MKV-files using the mkvinfo-executable and storing that information in a JSON, so that it can be easily processed by 3rd-party programs, such as the bundled MKV Overview.";
	console.log(("> " + msg.match(new RegExp(`.{1,${w - 2}}`, 'g')).join("> ")).cyan);

	console.log("\nUsage:".green);
	console.log(" node index.js \\".white);
	console.log("  [--path, p]      -p /path/to/folder-with-mkv-files");
	console.log("  [--jsonp, j]     -j name_of_jsonp_function (outputs JSON if omitted)");
	console.log("  [--mkvinfo, m]   -m /path/to/mkvinfo (or put executable next to index.js)");
	console.log("  [--outfile, o]   -o /path/to/output.json (if omitted, prints to console)");
	console.log("  [--nochaps, c]   -c leaves out information about chapters");
	console.log("  [--beautify, b]  -b beautify outputted JSON(P)");
};
const opts = {};

if (!argv.path && !argv.p) {
	printUsage();
	console.log("\nThe required argument \"path/p\" is missing.".bgRed.white);
	process.exit(-1);
}
if (!argv.mkvinfo && !argv.m) {
	const a = fs.existsSync(path.join(__dirname, 'mkvinfo')),
		b = fs.existsSync(path.join(__dirname, 'mkvinfo.exe'));
	if (!a && !b) {
		printUsage();
		console.log("The required argument \"mkvinfo/m\" is missing. It should be a fully-qualified path to the mkvinfo-executable.".bgRed.white);
		console.log('Also, no local executable was found (must be placed next to the index.js in that case).'.bgRed.white);
		process.exit(-1);
	}
	argv.m = path.join(__dirname, 'mkvinfo' + (b ? '.exe' : ''));
}
if (argv._.nochaps || argv._.c || argv.nochaps || argv.c) {
	opts.noChapters = true;
}
if (argv.j || argv.jsonp) {
	opts.jsonp = argv.j || argv.jsonp;
}
if (argv.b || argv.beautify) {
	opts.beautify = true;
}


const mkvInfo = new MkvInfo(argv.p || argv.path, argv.m || argv.mkvinfo);
mkvInfo.processDirectory(opts).then(arr => {
	const info = {
		created: (new Date).toUTCString(),
		numFiles: arr.length,
		files: arr,
		infoSize: JSON.stringify.apply(null, [arr, null, opts.beautify ? 2 : null]).length,
		args: argv,
		mkvInfoVersion: mkvInfo.mkvInfoVersion
	};
	let asJson = JSON.stringify.apply(null, [info, null, opts.beautify ? 2 : null]);
	if (opts.jsonp) {
		asJson = `${opts.jsonp}( ${asJson} );`;
	}

	if (argv.o || argv.outfile) {
		fs.writeFileSync(argv.o || argv.outfile, asJson, { encoding: 'utf-8' });
	} else {
		console.log(asJson.green);
	}
}).catch(err => {
	console.error(`An unexpected error occurred: ${JSON.stringify(err)}`.bgRed.white);
	process.exit(-1);
});
