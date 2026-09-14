/**
 * Authentic Subway Surfers Sound & Music Engine
 * Uses official Subway Surfers audio assets (theme.ogg, coins, jumps, slides, crashes)
 * with graceful procedural Web Audio fallback.
 */

class SoundEngine {
  constructor() {
    this.ctx = null;
    this.isMuted = false;
    this.musicEnabled = true;
    this.isInitialized = false;

    // Official Subway Surfers Audio elements
    this.bgmAudio = null;
    this.sfxJump = null;
    this.sfxRoll = null;
    this.sfxCoin = null;
    this.sfxDodge = null;
    this.sfxDeath = null;
    this.sfxPowerup = null;
    this.sfxMagnet = null;
    this.sfxStart = null;
    this.sfxButton = null;

    this.hasLoadedAssets = false;
    this.preloadAssets();
  }

  preloadAssets() {
    try {
      this.bgmAudio = new Audio('assets/audio/theme.ogg');
      this.bgmAudio.loop = true;
      this.bgmAudio.volume = 0.55;

      this.sfxJump = new Audio('assets/audio/hero_jump.ogg');
      this.sfxJump.volume = 0.7;

      this.sfxRoll = new Audio('assets/audio/hero_roll.ogg');
      this.sfxRoll.volume = 0.7;

      this.sfxCoin = new Audio('assets/audio/pickup_coin.ogg');
      this.sfxCoin.volume = 0.6;

      this.sfxDodge = new Audio('assets/audio/hero_dodge.ogg');
      this.sfxDodge.volume = 0.5;

      this.sfxDeath = new Audio('assets/audio/hero_death.ogg');
      this.sfxDeath.volume = 0.8;

      this.sfxPowerup = new Audio('assets/audio/pickup_powerup.ogg');
      this.sfxPowerup.volume = 0.75;

      this.sfxMagnet = new Audio('assets/audio/special_magnet.ogg');
      this.sfxMagnet.volume = 0.65;

      this.sfxStart = new Audio('assets/audio/guard_start.ogg');
      this.sfxStart.volume = 0.75;

      this.sfxButton = new Audio('assets/audio/ui_button.ogg');
      this.sfxButton.volume = 0.6;

      this.hasLoadedAssets = true;
    } catch (e) {
      console.warn("Could not load official audio files, falling back to Web Audio synthesis", e);
      this.hasLoadedAssets = false;
    }
  }

  init() {
    if (this.isInitialized) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtx();
      this.isInitialized = true;
    } catch (e) {
      console.warn("Web Audio API unavailable", e);
    }
  }

  ensureContext() {
    if (!this.ctx) this.init();
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    if (this.bgmAudio) {
      if (this.isMuted) {
        this.bgmAudio.pause();
      } else if (this.musicEnabled) {
        this.bgmAudio.play().catch(() => {});
      }
    }
    return this.isMuted;
  }

  playAudioClone(audio) {
    if (this.isMuted || !audio) return;
    try {
      const clone = audio.cloneNode();
      clone.volume = audio.volume;
      clone.play().catch(() => {});
    } catch (e) {}
  }

  // --- Game Event Audio Methods ---

  startBGM() {
    if (this.isMuted || !this.musicEnabled) return;
    if (this.bgmAudio) {
      this.bgmAudio.currentTime = 0;
      this.bgmAudio.play().catch((e) => {
        console.log("Autoplay waiting for user gesture:", e);
      });
    }
  }

  stopBGM() {
    if (this.bgmAudio) {
      this.bgmAudio.pause();
    }
  }

  playStartWhistle() {
    if (this.isMuted) return;
    this.playAudioClone(this.sfxStart);
  }

  playJump() {
    if (this.isMuted) return;
    if (this.sfxJump) {
      this.playAudioClone(this.sfxJump);
    } else {
      this.synthJump();
    }
  }

  playSlide() {
    if (this.isMuted) return;
    if (this.sfxRoll) {
      this.playAudioClone(this.sfxRoll);
    } else {
      this.synthSlide();
    }
  }

  playCoin() {
    if (this.isMuted) return;
    if (this.sfxCoin) {
      this.playAudioClone(this.sfxCoin);
    } else {
      this.synthCoin();
    }
  }

  playLaneSwitch() {
    if (this.isMuted) return;
    if (this.sfxDodge) {
      this.playAudioClone(this.sfxDodge);
    } else {
      this.synthLaneSwitch();
    }
  }

  playCrash() {
    if (this.isMuted) return;
    if (this.sfxDeath) {
      this.playAudioClone(this.sfxDeath);
    } else {
      this.synthCrash();
    }
    this.stopBGM();
  }

  playButtonClick() {
    if (this.isMuted) return;
    if (this.sfxButton) {
      this.playAudioClone(this.sfxButton);
    }
  }

  playLetterCollect(letterIndex = 0) {
    if (this.isMuted) return;
    if (this.sfxPowerup) {
      this.playAudioClone(this.sfxPowerup);
    }
    // Also play ascending sparkling chime
    this.synthHarmonicChime(letterIndex);
  }

  playWordComplete() {
    if (this.isMuted) return;
    if (this.sfxPowerup) {
      this.playAudioClone(this.sfxPowerup);
    }
    this.synthWordCompleteFanfare();
  }

  // --- Procedural Fallbacks (Synthesis) ---

  synthJump() {
    if (!this.ctx) return;
    this.ensureContext();
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(160, now);
    osc.frequency.exponentialRampToValueAtTime(580, now + 0.18);
    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.2);
  }

  synthSlide() {
    if (!this.ctx) return;
    this.ensureContext();
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(320, now);
    osc.frequency.exponentialRampToValueAtTime(110, now + 0.25);
    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.25);
  }

  synthCoin() {
    if (!this.ctx) return;
    this.ensureContext();
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(987.77, now);
    osc.frequency.setValueAtTime(1318.51, now + 0.05);
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.16);
  }

  synthLaneSwitch() {
    if (!this.ctx) return;
    this.ensureContext();
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(340, now);
    osc.frequency.exponentialRampToValueAtTime(460, now + 0.08);
    gain.gain.setValueAtTime(0.1, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.09);
  }

  synthCrash() {
    if (!this.ctx) return;
    this.ensureContext();
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(120, now);
    osc.frequency.exponentialRampToValueAtTime(30, now + 0.35);
    gain.gain.setValueAtTime(0.5, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.4);
  }

  synthHarmonicChime(index) {
    if (!this.ctx) return;
    this.ensureContext();
    const now = this.ctx.currentTime;
    const scale = [523.25, 587.33, 659.25, 698.46, 783.99, 880.00, 987.77, 1046.50];
    const baseFreq = scale[index % scale.length];

    [1, 1.5, 2].forEach((mult, i) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(baseFreq * mult, now + i * 0.03);
      gain.gain.setValueAtTime(0.2 / (i + 1), now + i * 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now + i * 0.03);
      osc.stop(now + 0.38);
    });
  }

  synthWordCompleteFanfare() {
    if (!this.ctx) return;
    this.ensureContext();
    const now = this.ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.50, 1318.51, 1567.98];
    notes.forEach((freq, idx) => {
      const t = now + idx * 0.08;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.25, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + (idx === notes.length - 1 ? 0.8 : 0.2));
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(t);
      osc.stop(t + (idx === notes.length - 1 ? 0.8 : 0.25));
    });
  }
}

window.soundEngine = new SoundEngine();
