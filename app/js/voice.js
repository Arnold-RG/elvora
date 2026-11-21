// Voice I/O. Mic opens only on a user tap and is released as soon as
// listening ends. Speech-to-text uses the browser's SpeechRecognition;
// replies are spoken with speechSynthesis. Exposes a 0..1 level for the orb.

const SR = window.SpeechRecognition || window.webkitSpeechRecognition || null;

export class Voice {
  constructor({ onState = () => {}, onTranscript = () => {}, onNotice = () => {} } = {}) {
    this.onState = onState;
    this.onTranscript = onTranscript;
    this.onNotice = onNotice;
    this.state = 'idle';
    this.stream = null;
    this.ctx = null;
    this.analyser = null;
    this.buf = null;
    this.rec = null;
    this.pulse = 0;          // event-driven envelope (fallback / speaking)
    this.pulseT = 0;
    this.speakToken = 0;
  }

  static get canRecognize() { return !!SR; }
  static get canSpeak() { return 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined'; }

  set(state) { this.state = state; this.onState(state); }

  /** current level 0..1 for the orb */
  level() {
    const now = performance.now();
    const decay = Math.exp(-(now - this.pulseT) / 180);
    const p = this.pulse * decay;
    if (this.state === 'listening' && this.analyser) {
      this.analyser.getFloatTimeDomainData(this.buf);
      let sum = 0;
      for (let i = 0; i < this.buf.length; i++) sum += this.buf[i] * this.buf[i];
      const rms = Math.sqrt(sum / this.buf.length);
      return Math.min(1, Math.max(0, (20 * Math.log10(rms + 1e-6) + 60) / 45)); // -60..-15 dBFS → 0..1
    }
    if (this.state === 'listening') return 0.12 + 0.6 * p;
    if (this.state === 'speaking') return 0.22 + 0.62 * p + 0.06 * Math.sin(now / 90);
    return 0;
  }

  bump(v = 1) { this.pulse = v; this.pulseT = performance.now(); }

  async openMic() {
    if (!navigator.mediaDevices?.getUserMedia) return;
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      const src = this.ctx.createMediaStreamSource(this.stream);
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 1024;
      this.buf = new Float32Array(this.analyser.fftSize);
      src.connect(this.analyser); // analyser only — audio is not played back or stored
    } catch (e) {
      this.closeMic();
      throw e;
    }
  }

  closeMic() {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.analyser = null;
    if (this.ctx && this.ctx.state !== 'closed') this.ctx.close().catch(() => {});
    this.ctx = null;
  }

  /** Listen for one utterance. Resolves with the final transcript, or '' */
  async listen() {
    if (!SR) {
      this.onNotice('Voice input isn’t supported in this browser. Type your question below — Elvora still answers out loud.');
      return '';
    }
    this.cancelSpeech();
    this.set('listening');
    try {
      await this.openMic();
    } catch (e) {
      this.set('idle');
      this.onNotice(e && e.name === 'NotAllowedError'
        ? 'Microphone access is blocked. Allow it for this site in your browser settings, or type below.'
        : 'Couldn’t open the microphone. You can type your question below.');
      return '';
    }
    return new Promise((resolve) => {
      const rec = new SR();
      this.rec = rec;
      rec.lang = navigator.language || 'en-US';
      rec.interimResults = true;
      rec.continuous = false;
      rec.maxAlternatives = 1;
      let finalText = '';
      let interim = '';
      let retried = false;
      const timer = setTimeout(() => { try { rec.stop(); } catch {} }, 15000);
      rec.onresult = (ev) => {
        interim = '';
        for (let i = ev.resultIndex; i < ev.results.length; i++) {
          const r = ev.results[i];
          if (r.isFinal) finalText += r[0].transcript;
          else interim += r[0].transcript;
        }
        this.bump(0.9);
        this.onTranscript((finalText + interim).trim(), false);
      };
      rec.onspeechstart = () => this.bump(0.7);
      rec.onerror = (ev) => {
        if (ev.error === 'audio-capture' && this.stream && !retried) {
          // some phones can't share the mic between the level meter and speech-to-text
          retried = true;
          this.closeMic();
          return;
        }
        const msg = {
          'not-allowed': 'Microphone access is blocked. Allow it for this site in your browser settings, or type below.',
          'service-not-allowed': 'Speech-to-text is turned off in this browser. You can type below.',
          'no-speech': 'I didn’t catch that. Tap the orb and try again.',
          network: 'Speech-to-text needs an internet connection. You can type below.',
          'language-not-supported': 'Speech-to-text doesn’t support your browser language yet. You can type below.',
        }[ev.error];
        if (msg) this.onNotice(msg);
      };
      rec.onend = () => {
        if (retried && !this.stream && !finalText && !interim && this.rec === rec && this.state === 'listening' && !rec._restarted) {
          rec._restarted = true;
          try { rec.start(); return; } catch {}
        }
        clearTimeout(timer);
        this.closeMic();
        this.rec = null;
        const text = (finalText || interim).trim();
        if (text) this.onTranscript(text, true);
        if (this.state === 'listening') this.set(text ? 'thinking' : 'idle');
        resolve(text);
      };
      try { rec.start(); } catch { clearTimeout(timer); this.closeMic(); this.set('idle'); resolve(''); }
    });
  }

  stopListening() {
    if (this.rec) { try { this.rec.stop(); } catch {} }
    else this.closeMic();
  }

  cancelSpeech() {
    this.speakToken++;
    if (Voice.canSpeak) window.speechSynthesis.cancel();
  }

  /** Speak (or, if disabled/unavailable, reveal) the reply. onWord(i) per word. */
  speak(text, { enabled = true, onWord = () => {} } = {}) {
    this.cancelSpeech();
    const token = this.speakToken;
    const words = text.split(/\s+/).filter(Boolean);
    this.set('speaking');
    return new Promise((resolve) => {
      let done = false;
      let timer = 0;
      const finish = () => {
        if (done) return; done = true;
        clearInterval(timer);
        onWord(words.length);
        if (token === this.speakToken && this.state === 'speaking') this.set('idle');
        resolve();
      };
      // Timed reveal: used when speech is off/unavailable, and as a pulse source
      // for voices that don't report word boundaries.
      let wi = 0;
      const startTimed = (ms) => {
        clearInterval(timer);
        timer = setInterval(() => {
          if (token !== this.speakToken) return finish();
          this.bump(0.6 + 0.4 * Math.random());
          onWord(++wi);
          if (wi >= words.length && !speaking) finish();
        }, ms);
      };
      let speaking = false;
      if (!enabled || !Voice.canSpeak) { startTimed(240); return; }

      const u = new SpeechSynthesisUtterance(text.replace(/\n+/g, ' '));
      u.lang = navigator.language || 'en-US';
      u.rate = 1.02;
      const voices = window.speechSynthesis.getVoices();
      const lang = u.lang.slice(0, 2);
      u.voice = voices.find((v) => v.lang?.startsWith(lang) && /natural|enhanced|premium|neural/i.test(v.name))
        || voices.find((v) => v.lang?.startsWith(lang) && v.localService) || null;
      let sawBoundary = false;
      u.onstart = () => {
        speaking = true;
        setTimeout(() => { if (!sawBoundary && !done) startTimed(300); }, 700);
      };
      u.onboundary = (e) => {
        if (e.name && e.name !== 'word') return;
        sawBoundary = true;
        this.bump(0.75 + 0.25 * Math.random());
        const upto = text.slice(0, e.charIndex).split(/\s+/).filter(Boolean).length + 1;
        wi = Math.max(wi, upto);
        onWord(wi);
      };
      u.onend = () => { speaking = false; finish(); };
      u.onerror = () => { speaking = false; if (!done) startTimed(240); };
      window.speechSynthesis.speak(u);
      // no voices / headless: speech never starts → fall back to timed reveal
      setTimeout(() => { if (!speaking && !done && token === this.speakToken) { window.speechSynthesis.cancel(); startTimed(240); } }, 1500);
    });
  }

  stopAll() {
    this.stopListening();
    this.cancelSpeech();
    this.closeMic();
    this.set('idle');
  }
}
