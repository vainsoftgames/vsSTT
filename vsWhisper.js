// vsWhisper.js

const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");

class vsWhisper {
	constructor({ model = "base", lang = "en" } = {}) {
		this.model = model;
		this.lang = lang;

		// Holds file paths (audio chunks) not yet processed
		this.unprocessedChunks = [];

		// Holds the entire transcript
		this.fullTranscript = "";
	}

	setModelLang(model, lang) {
		this.model = model;
		this.lang = lang;
	}

	addChunk(filePath) {
		this.unprocessedChunks.push(filePath);
	}

  async processNextChunk() {
    if (this.unprocessedChunks.length === 0) return "";

    const chunkPath = this.unprocessedChunks.shift();
    // Create a unique output filename
    const outputPath = chunkPath.replace(".ogg", ".txt");// + ".txt";

    // Example local whisper CLI call; adapt for your environment
    const cmd = [
      "whisper",
      `"${chunkPath}"`,
      `--model ${this.model}`,
	  `--output_dir "uploads/"`,
      `--language ${this.lang}`,
      `--output_format txt`,
      `--initial_prompt "${this.fullTranscript.replace(/"/g, "")}"`,
      // ...
    ].join(" ");
	
	console.log(cmd);

    return new Promise((resolve, reject) => {
      exec(cmd, (error, stdout, stderr) => {
          console.error("Error running whisper CLI:", error, stdout, stderr);
        if (error) {
          console.error("Error running whisper CLI:", error);
          return reject(error);
        }

        fs.readFile(outputPath, "utf8", (err, data) => {
          if (err) {
            console.error("Error reading output file:", err);
            return reject(err);
          }

          const newText = data.trim();
          if (newText) {
            this.fullTranscript += (this.fullTranscript ? " " : "") + newText;
          }

          // Cleanup if you want
          fs.unlinkSync(chunkPath);
          fs.unlinkSync(outputPath);

          resolve(newText);
        });
      });
    });
  }

	async processAllChunks() {
		while (this.unprocessedChunks.length > 0) {
			await this.processNextChunk();
		}
		return this.fullTranscript;
	}

	getTranscript() {
		return this.fullTranscript;
	}
}

module.exports = vsWhisper;
