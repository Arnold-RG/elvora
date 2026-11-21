// QA-only stub: headless Chromium has no speech service, so this fakes the
// browser recognizer with a fixed test phrase. Not part of the app.
(() => {
  class FakeSR {
    start() {
      const words = 'how much water have I had today'.split(' ');
      let i = 0;
      setTimeout(() => this.onspeechstart && this.onspeechstart(), 500);
      this._t = setInterval(() => {
        i++;
        const txt = words.slice(0, i).join(' ');
        const fin = i === words.length;
        const res = [Object.assign([{ transcript: txt }], { isFinal: fin })];
        this.onresult && this.onresult({ resultIndex: 0, results: res });
        if (fin) { clearInterval(this._t); setTimeout(() => this.onend && this.onend(), 350); }
      }, 330);
    }
    stop() { clearInterval(this._t); this.onend && this.onend(); }
    abort() { this.stop(); }
  }
  window.webkitSpeechRecognition = FakeSR;
  window.SpeechRecognition = FakeSR;
})();
