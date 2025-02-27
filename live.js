const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const vsWhisper = require('./vsWhisper');

const app = express();
const PORT = 9969;

app.use(express.json());
app.use(cors());
app.use(express.urlencoded({ extended: true }));

// Multer config: store uploaded files in ./uploads
const upload = multer({ dest: "uploads/" });

const jobs = {};

function uniqid(prefix = '', moreEntropy = false) {
	// Get the current timestamp in hexadecimal form
	const ts = Date.now().toString(16);
	let id = prefix + ts;

	if (moreEntropy) {
		// Append additional random hexadecimal digits for extra entropy
		id += (Math.random() * 0x100000000).toString(16).padStart(8, '0');
	}

	return id;
}

function setupSession({ model, lang } = {}) {
	let sessionID = uniqid('', true);
	const whisperInstance = new vsWhisper({ model, lang });

	jobs[sessionID] = {
		model: model || 'base',
		lang: lang  || 'en',
		text: "",
		instance: whisperInstance,
		promiseQueue  : false
	};
	
	return sessionID;
}
// 1) A helper function to queue chunk processing for each session
function queueChunk(sessionID, chunkPath) {
	// If we have no queue yet for this session, start with an already-resolved Promise
	if (!jobs[sessionID].promiseQueue) {
		jobs[sessionID].promiseQueue = Promise.resolve();
	}

	const whisper = jobs[sessionID].instance;

	// Chain a new step onto the existing promise queue
	jobs[sessionID].promiseQueue = jobs[sessionID].promiseQueue.then(async () => {
		// Add chunk
		whisper.addChunk(chunkPath);
		// Process next chunk
		const newText = await whisper.processNextChunk();
		// Save the updated transcript in the session object
		jobs[sessionID].text = whisper.getTranscript();
		return newText;
	});

	return jobs[sessionID].promiseQueue;
}

// Session Management
app.get("/get_session", async (req, res) => {
	let sessionID = setupSession();
	res.json({ sessionID: sessionID, jobs: jobs[sessionID] });
});
app.get("/get_sessions", async (req, res) => {
	res.json({ jobs: jobs });
});

// Init Sessions
app.get("/start_session*", async (req, res) => {
	let { model, lang } = req.query;
	let sessionID = setupSession({ model, lang });
	res.json({ sessionID: sessionID, jobs: jobs[sessionID] });
});
app.post("/start_session", async (req, res) => {
	let { model, lang } = req.body;
	let sessionID = setupSession({ model, lang });

	res.json({ sessionID: sessionID, jobs: jobs[sessionID] });
});

// 1) Endpoint: receive a 10-sec chunk from client
app.post("/upload-chunk/:sessionID", upload.single("audio_chunk"), async (req, res) => {
	try {
		const { sessionID } = req.params;
		if (!jobs[sessionID]) {
			return res.status(404).json({ success: false, message: "Session not found", para: req.params });
		}

		const oldPath = req.file.path;
		const newPath = oldPath + ".ogg";
		fs.renameSync(oldPath, newPath);
		// The file is on disk at req.file.path
		const chunkPath = newPath;

		// Process immediately
		//const newText = await whisper.processNextChunk();
		const newText = await queueChunk(sessionID, chunkPath);
		jobs[sessionID]['text'] = whisper.getTranscript();

		// Return the chunk's text so the client can append it
		res.json({ success: true, chunkText: newText });
	}
	catch (error) {
		console.error(error);
		res.status(500).json({ success: false, message: "Server error" });
	}
});

// 2) Endpoint: get the final transcript (once recording is done)
app.get("/final-transcript/:sessionID", async (req, res) => {
	const { sessionID } = req.params;
	
	if (!jobs[sessionID]) {
		return res.status(404).json({ message: "Session not found" });
	}
	// If any chunks remain, process them all
	// await whisper.processAllChunks();

	// Return the entire transcript
	const transcript = jobs[sessionID].vsWhisperInstance.getTranscript();
	res.json({ transcript });
});

app.listen(PORT, () => {
	console.log(`Server listening on port ${PORT}`);
});
