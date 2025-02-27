class vsSTT {
  /**
   * @param {Object} config
   * @param {string} config.apiUrl - The base URL of your server (e.g. http://192.168.1.16:9969)
   * @param {string} config.model - The whisper model (e.g. 'small.en')
   * @param {string} config.lang - The language (e.g. 'en')
   * @param {number} config.segmentDuration - segment length in milliseconds (default 10000 for 10s)
   * @param {HTMLTextAreaElement} [config.textArea] - optional textarea element to append transcriptions
   */
  constructor({
    apiUrl,
    model = 'small.en',
    lang = 'en',
    segmentDuration = 10000,
    textArea = null
  }) {
    this.apiUrl = apiUrl;
    this.model = model;
    this.lang = lang;
    this.segmentDuration = segmentDuration;
    this.textArea = textArea;

    this.sessionID = null;
    this.mediaRecorder = null;
    this.recordingRunning = false;
    this.chunks = [];

    // Just in case you want to override or pass additional MediaRecorder options
    this.mediaOptions = { 
      mimeType: 'audio/webm; codecs=opus', 
      type: 'audio/webm; codecs=opus' 
    };
  }

  /**
   * Create or retrieve a sessionID from your server
   */
  async getSessionID() {
    if (this.sessionID) {
      return this.sessionID;
    }

    const res = await fetch(`${this.apiUrl}/start_session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: this.model, lang: this.lang })
    });

    if (!res.ok) {
      throw new Error(`Session creation failed: ${res.status}`);
    }

    const data = await res.json();
    console.log("getSessionID -> data:", data);
    this.sessionID = data.sessionID;
    return this.sessionID;
  }

  /**
   * Start capturing audio in 10-second segments (or segmentDuration).
   */
  async start() {
    if (this.recordingRunning) {
      console.warn("Recording is already running.");
      return;
    }

    // Ensure we have a session
    await this.getSessionID();

    // Prompt user for mic permission
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    this.recordingRunning = true;
    this._recordSeg(stream);
  }

  /**
   * Stop capturing audio. 
   * This stops the current segment and prevents new segments.
   */
  stop() {
    this.recordingRunning = false;
    // If mediaRecorder is mid-recording, stop it
    if (this.mediaRecorder && this.mediaRecorder.state === "recording") {
      this.mediaRecorder.stop();
    }
  }

  /**
   * Internal method: starts a new MediaRecorder segment for a fixed duration.
   */
  _recordSeg(stream) {
    // Reset chunk buffer for this segment
    this.chunks = [];
    
    this.mediaRecorder = new MediaRecorder(stream, this.mediaOptions);

    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        this.chunks.push(e.data);
      }
    };

    // Called after the segment stops
    this.mediaRecorder.onstop = async () => {
      // Combine all data into one finalized Blob
      const recordedChunks = this.chunks.splice(0, this.chunks.length);
      const blob = new Blob(recordedChunks, this.mediaOptions);

      // Send this chunk to the server
      await this.uploadChunk(blob);

      // If still recording, start next segment
      if (this.recordingRunning) {
        this._recordSeg(stream);
      }
    };

    // Start recorder
    this.mediaRecorder.start();

    // Stop after `segmentDuration` ms
    setTimeout(() => {
      if (this.mediaRecorder && this.mediaRecorder.state === "recording") {
        this.mediaRecorder.stop();
      }
    }, this.segmentDuration);
  }

  /**
   * Upload a single Blob to the server for the current session.
   * Optionally, append the returned text to the textArea or handle it via callback.
   * @param {Blob} blob
   */
  async uploadChunk(blob) {
    if (!this.sessionID) {
      throw new Error("No sessionID. Call getSessionID first.");
    }

    const formData = new FormData();
    formData.append("audio_chunk", blob, "temp.webm");

    const res = await fetch(`${this.apiUrl}/upload-chunk/${this.sessionID}`, {
      method: "POST",
      body: formData
    });

    const data = await res.json();
    if (data.success) {
      console.log("Partial transcription:", data.chunkText);
      // If we have a textArea, append the partial transcription
      if (this.textArea) {
        this.textArea.value += (this.textArea.value ? " " : "") + data.chunkText;
      }
    } else {
      console.error("Error uploading chunk:", data);
    }
  }
}
