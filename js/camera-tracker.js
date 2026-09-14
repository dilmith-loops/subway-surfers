/**
 * Advanced Camera Motion & Face Tracker for Subway Surfers
 * Supports MediaPipe Face Detection AI with Optical Flow fallback.
 * Uses hysteresis lane detection and velocity impulses for rock-solid stability.
 */

class CameraTracker {
  constructor() {
    this.videoEl = null;
    this.canvasEl = null;
    this.ctx = null;
    this.stream = null;
    this.isActive = false;

    // AI Detector (MediaPipe)
    this.faceDetector = null;
    this.isMediaPipeReady = false;
    this.isProcessingMediaPipe = false;

    // Tracking coordinates (mirrored: 0 = left edge, 1 = right edge)
    this.currentX = 0.5;
    this.currentY = 0.38;
    this.prevY = 0.38;
    this.prevTime = performance.now();
    this.baseX = 0.5;
    this.baseY = 0.38;
    this.hasAutoCalibrated = false;
    this.calibrationFrameCount = 0;
    this.faceBox = null;
    this.landmarks = null;
    this.headTilt = 0; // degrees

    // Sensitivity thresholds with hysteresis deadbands
    this.leanThreshold = 0.068;      // displacement required to leave center
    this.returnThreshold = 0.034;    // displacement required to return to center
    this.jumpVelocityThresh = -0.026; // upward speed
    this.duckVelocityThresh = 0.026;  // downward speed
    this.jumpDispThresh = -0.065;    // upward height
    this.duckDispThresh = 0.065;     // downward depth

    // Lane state (-1: Left, 0: Center, 1: Right)
    this.currentLane = 0;
    this.lastJumpTime = 0;
    this.lastDuckTime = 0;
    this.gestureCooldown = 420; // ms
    this.detectedAction = "🟢 CENTER";
    this.lastActionTime = 0;

    // Optical Flow fallback buffer
    this.procW = 80;
    this.procH = 60;
    this.procCanvas = document.createElement("canvas");
    this.procCanvas.width = this.procW;
    this.procCanvas.height = this.procH;
    this.procCtx = this.procCanvas.getContext("2d", { willReadFrequently: true });
    this.prevPixelData = null;

    // Callbacks
    this.onLaneChange = null;
    this.onJump = null;
    this.onDuck = null;
    this.onStatusUpdate = null;

    this.animationFrameId = null;
  }

  async init(videoElementId = "webcam-video", canvasElementId = "webcam-canvas") {
    this.videoEl = document.getElementById(videoElementId);
    this.canvasEl = document.getElementById(canvasElementId);
    if (!this.canvasEl) return false;
    this.ctx = this.canvasEl.getContext("2d");

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: "user"
        },
        audio: false
      });

      this.videoEl.srcObject = this.stream;
      await this.videoEl.play();

      this.canvasEl.width = 320;
      this.canvasEl.height = 240;
      this.isActive = true;

      // Start MediaPipe
      await this.initMediaPipe();

      // Keyboard 'C' shortcut to center calibrate
      window.addEventListener("keydown", (e) => {
        if (e.key === "c" || e.key === "C") {
          this.calibrateNow();
        }
      });

      this.prevTime = performance.now();
      this.loop();
      return true;
    } catch (err) {
      console.warn("Webcam access error:", err);
      if (this.onStatusUpdate) {
        this.onStatusUpdate({
          active: false,
          error: "Camera denied. You can play using Keyboard (Arrows / WASD)!",
          action: "KEYBOARD READY"
        });
      }
      return false;
    }
  }

  async initMediaPipe() {
    if (window.FaceDetection) {
      try {
        this.faceDetector = new window.FaceDetection({
          locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_detection/${file}`
        });

        this.faceDetector.setOptions({
          model: 'short',
          minDetectionConfidence: 0.5
        });

        this.faceDetector.onResults((results) => {
          this.handleMediaPipeResults(results);
          this.isProcessingMediaPipe = false;
        });

        this.isMediaPipeReady = true;
      } catch (e) {
        console.warn("MediaPipe load issue, falling back to Optical Flow", e);
        this.isMediaPipeReady = false;
      }
    }
  }

  // Instant Center Calibration
  calibrateNow() {
    this.baseX = this.currentX;
    this.baseY = this.currentY;
    this.currentLane = 0; // Explicitly snap to center track
    this.hasAutoCalibrated = true;
    this.detectedAction = "🟢 CENTER";
    this.lastActionTime = Date.now();

    if (this.onLaneChange) {
      this.onLaneChange(0);
    }

    // Visual notification
    const toast = document.createElement("div");
    toast.className = "letter-collected-banner";
    toast.style.borderColor = "#00ffcc";
    toast.innerHTML = `🎯 <strong>CENTER CALIBRATED! (TRACK 2)</strong>`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 1200);

    if (window.soundEngine) {
      window.soundEngine.playLetterCollect(4);
    }
  }

  setSensitivity(preset) {
    if (preset === "low") {
      this.leanThreshold = 0.095;
      this.returnThreshold = 0.048;
      this.jumpVelocityThresh = -0.034;
      this.duckVelocityThresh = 0.034;
    } else if (preset === "high") {
      this.leanThreshold = 0.048;
      this.returnThreshold = 0.024;
      this.jumpVelocityThresh = -0.020;
      this.duckVelocityThresh = 0.020;
    } else {
      // Normal
      this.leanThreshold = 0.068;
      this.returnThreshold = 0.034;
      this.jumpVelocityThresh = -0.026;
      this.duckVelocityThresh = 0.026;
    }
  }

  loop() {
    if (!this.isActive) return;

    const now = performance.now();
    const dt = Math.max(0.001, (now - this.prevTime) / 1000);
    this.prevTime = now;

    if (this.isMediaPipeReady && this.faceDetector && !this.isProcessingMediaPipe) {
      if (this.videoEl.readyState >= 2) {
        this.isProcessingMediaPipe = true;
        this.faceDetector.send({ image: this.videoEl }).catch(() => {
          this.isProcessingMediaPipe = false;
        });
      }
    } else if (!this.isMediaPipeReady) {
      this.processOpticalFlow(dt);
    }

    this.drawHUD();
    this.animationFrameId = requestAnimationFrame(() => this.loop());
  }

  // --- Process MediaPipe Face Results ---
  handleMediaPipeResults(results) {
    if (!results.detections || results.detections.length === 0) {
      return;
    }

    const det = results.detections[0];
    const box = det.boundingBox;
    const lms = det.landmarks;

    // Mirrored X coordinates (0 = left edge of screen, 1 = right edge of screen)
    const rawX = 1.0 - box.xCenter;
    const rawY = box.yCenter;

    // Head tilt calculation: vector from Screen-Left eye to Screen-Right eye
    if (lms && lms.length >= 2) {
      const screenLeftEyeX = 1.0 - lms[1].x;
      const screenLeftEyeY = lms[1].y;
      const screenRightEyeX = 1.0 - lms[0].x;
      const screenRightEyeY = lms[0].y;

      const dx = screenRightEyeX - screenLeftEyeX;
      const dy = screenRightEyeY - screenLeftEyeY;
      // When level: dx is positive (~0.1), dy is 0 -> atan2 is 0 degrees!
      this.headTilt = Math.atan2(dy, dx) * (180 / Math.PI);
    } else {
      this.headTilt = 0;
    }

    this.faceBox = {
      x: 1.0 - (box.xCenter + box.width / 2),
      y: box.yCenter - box.height / 2,
      w: box.width,
      h: box.height
    };
    this.landmarks = lms ? lms.map(p => ({ x: 1.0 - p.x, y: p.y })) : null;

    // Smooth filter (responsive alpha 0.55)
    const alpha = 0.55;
    this.currentX = this.currentX * (1 - alpha) + rawX * alpha;
    this.currentY = this.currentY * (1 - alpha) + rawY * alpha;

    // Auto-calibration on startup (average first 8 frames to settle on center)
    if (!this.hasAutoCalibrated) {
      this.calibrationFrameCount++;
      if (this.calibrationFrameCount === 1) {
        this.baseX = this.currentX;
        this.baseY = this.currentY;
      } else {
        this.baseX = this.baseX * 0.7 + this.currentX * 0.3;
        this.baseY = this.baseY * 0.7 + this.currentY * 0.3;
      }

      if (this.calibrationFrameCount >= 8) {
        this.hasAutoCalibrated = true;
        this.currentLane = 0;
        if (this.onLaneChange) this.onLaneChange(0);
      }
    }

    this.evaluateGestures();
  }

  // --- Optical Flow Fallback ---
  processOpticalFlow(dt) {
    if (!this.videoEl || this.videoEl.readyState < 2) return;

    this.procCtx.save();
    this.procCtx.translate(this.procW, 0);
    this.procCtx.scale(-1, 1);
    this.procCtx.drawImage(this.videoEl, 0, 0, this.procW, this.procH);
    this.procCtx.restore();

    const imgData = this.procCtx.getImageData(0, 0, this.procW, this.procH);
    const data = imgData.data;

    let weightedX = 0;
    let weightedY = 0;
    let totalWeight = 0;

    const maxY = Math.floor(this.procH * 0.85);

    for (let y = 0; y < maxY; y++) {
      for (let x = 0; x < this.procW; x++) {
        const idx = (y * this.procW + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];

        let weight = 0;
        if (this.prevPixelData) {
          const diff = Math.abs(r - this.prevPixelData[idx]) +
                       Math.abs(g - this.prevPixelData[idx + 1]) +
                       Math.abs(b - this.prevPixelData[idx + 2]);
          if (diff > 30) weight += (diff / 30) * 3;
        }

        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        if (lum > 60 && lum < 220) weight += 0.8;

        if (weight > 0) {
          weightedX += x * weight;
          weightedY += y * weight;
          totalWeight += weight;
        }
      }
    }

    if (!this.prevPixelData || this.prevPixelData.length !== data.length) {
      this.prevPixelData = new Uint8ClampedArray(data.length);
    }
    this.prevPixelData.set(data);

    if (totalWeight > 10) {
      const rawX = (weightedX / totalWeight) / this.procW;
      const rawY = (weightedY / totalWeight) / this.procH;

      const alpha = 0.45;
      this.currentX = this.currentX * (1 - alpha) + rawX * alpha;
      this.currentY = this.currentY * (1 - alpha) + rawY * alpha;

      if (!this.hasAutoCalibrated) {
        this.baseX = this.currentX;
        this.baseY = this.currentY;
        this.hasAutoCalibrated = true;
        this.currentLane = 0;
        if (this.onLaneChange) this.onLaneChange(0);
      }
    }

    this.evaluateGestures();
  }

  // --- Core Gesture Recognition: Hysteresis Lane & Velocity Jumps ---
  evaluateGestures() {
    const now = Date.now();
    const deltaY = this.currentY - this.prevY;
    const dispY = this.currentY - this.baseY;
    const dispX = this.currentX - this.baseX;
    this.prevY = this.currentY;

    // Subtle head tilt assist (adds natural feel without overriding center)
    const tiltAssist = (this.headTilt / 50) * (this.leanThreshold * 0.35);
    const effectiveDispX = dispX + tiltAssist;

    // 1. Jump & Duck (Velocity-based)
    let triggeredVertical = false;

    // JUMP: Fast upward movement
    if ((deltaY < this.jumpVelocityThresh || dispY < this.jumpDispThresh) &&
        (now - this.lastJumpTime > this.gestureCooldown)) {
      this.lastJumpTime = now;
      this.detectedAction = "⬆️ JUMP!";
      this.lastActionTime = now;
      triggeredVertical = true;
      if (this.onJump) this.onJump();
    }
    // DUCK: Fast downward movement
    else if ((deltaY > this.duckVelocityThresh || dispY > this.duckDispThresh) &&
             (now - this.lastDuckTime > this.gestureCooldown)) {
      this.lastDuckTime = now;
      this.detectedAction = "⬇️ SLIDE / DUCK!";
      this.lastActionTime = now;
      triggeredVertical = true;
      if (this.onDuck) this.onDuck();
    }

    // 2. Horizontal Lane with Hysteresis Deadband
    let targetLane = this.currentLane;

    if (this.currentLane === 0) {
      // Currently in CENTER: must lean beyond leanThreshold to leave center
      if (effectiveDispX < -this.leanThreshold) {
        targetLane = -1; // LEFT TRACK
      } else if (effectiveDispX > this.leanThreshold) {
        targetLane = 1;  // RIGHT TRACK
      }
    } else if (this.currentLane === -1) {
      // Currently in LEFT: return to center when within returnThreshold
      if (effectiveDispX > -this.returnThreshold) {
        targetLane = 0; // Return to CENTER
      }
    } else if (this.currentLane === 1) {
      // Currently in RIGHT: return to center when within returnThreshold
      if (effectiveDispX < this.returnThreshold) {
        targetLane = 0; // Return to CENTER
      }
    }

    // Only slowly adapt baseline when comfortably resting in the center
    if (targetLane === 0) {
      this.baseX = this.baseX * 0.996 + this.currentX * 0.004;
      this.baseY = this.baseY * 0.996 + this.currentY * 0.004;
    }

    if (targetLane !== this.currentLane) {
      this.currentLane = targetLane;
      if (this.onLaneChange) {
        this.onLaneChange(this.currentLane);
      }
    }

    if (!triggeredVertical && (now - this.lastActionTime > 500)) {
      if (this.currentLane === -1) {
        this.detectedAction = "⬅️ LEFT TRACK";
      } else if (this.currentLane === 1) {
        this.detectedAction = "➡️ RIGHT TRACK";
      } else {
        this.detectedAction = "🟢 CENTER";
      }
    }

    if (this.onStatusUpdate) {
      this.onStatusUpdate({
        active: true,
        lane: this.currentLane,
        action: this.detectedAction,
        dispX: effectiveDispX,
        x: this.currentX,
        y: this.currentY,
        baseX: this.baseX,
        baseY: this.baseY,
        tilt: this.headTilt
      });
    }
  }

  // --- Visual HUD on PIP Canvas ---
  drawHUD() {
    if (!this.ctx || !this.canvasEl) return;
    const w = this.canvasEl.width;
    const h = this.canvasEl.height;

    this.ctx.clearRect(0, 0, w, h);

    // 1. Draw Mirrored Video
    if (this.videoEl && this.videoEl.readyState >= 2) {
      this.ctx.save();
      this.ctx.translate(w, 0);
      this.ctx.scale(-1, 1);
      this.ctx.drawImage(this.videoEl, 0, 0, w, h);
      this.ctx.restore();
    }

    // Semi-transparent overlay
    this.ctx.fillStyle = "rgba(10, 15, 30, 0.28)";
    this.ctx.fillRect(0, 0, w, h);

    // 2. Lane Boundaries
    const leftX = (this.baseX - this.leanThreshold) * w;
    const rightX = (this.baseX + this.leanThreshold) * w;
    const centerX = this.baseX * w;
    const jumpY = (this.baseY + this.jumpDispThresh) * h;
    const duckY = (this.baseY + this.duckDispThresh) * h;

    // Zone highlight
    if (this.currentLane === -1) {
      this.ctx.fillStyle = "rgba(0, 255, 204, 0.25)";
      this.ctx.fillRect(0, 0, leftX, h);
    } else if (this.currentLane === 1) {
      this.ctx.fillStyle = "rgba(0, 255, 204, 0.25)";
      this.ctx.fillRect(rightX, 0, w - rightX, h);
    } else {
      this.ctx.fillStyle = "rgba(0, 255, 128, 0.18)";
      this.ctx.fillRect(leftX, 0, rightX - leftX, h);
    }

    // Dividing lines
    this.ctx.lineWidth = 1.5;
    this.ctx.setLineDash([4, 4]);

    // Left line
    this.ctx.strokeStyle = this.currentLane === -1 ? "#00ffcc" : "rgba(255, 255, 255, 0.35)";
    this.ctx.beginPath();
    this.ctx.moveTo(leftX, 0);
    this.ctx.lineTo(leftX, h);
    this.ctx.stroke();

    // Right line
    this.ctx.strokeStyle = this.currentLane === 1 ? "#00ffcc" : "rgba(255, 255, 255, 0.35)";
    this.ctx.beginPath();
    this.ctx.moveTo(rightX, 0);
    this.ctx.lineTo(rightX, h);
    this.ctx.stroke();

    // Center baseline line
    this.ctx.strokeStyle = this.currentLane === 0 ? "rgba(0, 255, 128, 0.6)" : "rgba(255, 255, 255, 0.2)";
    this.ctx.beginPath();
    this.ctx.moveTo(centerX, 0);
    this.ctx.lineTo(centerX, h);
    this.ctx.stroke();

    // Jump & Duck lines
    this.ctx.strokeStyle = "rgba(255, 220, 0, 0.7)";
    this.ctx.beginPath();
    this.ctx.moveTo(0, jumpY);
    this.ctx.lineTo(w, jumpY);
    this.ctx.stroke();

    this.ctx.strokeStyle = "rgba(255, 0, 128, 0.7)";
    this.ctx.beginPath();
    this.ctx.moveTo(0, duckY);
    this.ctx.lineTo(w, duckY);
    this.ctx.stroke();

    this.ctx.setLineDash([]);

    // 3. Face Bounding Box & Target Reticle
    if (this.faceBox) {
      const bx = this.faceBox.x * w;
      const by = this.faceBox.y * h;
      const bw = this.faceBox.w * w;
      const bh = this.faceBox.h * h;

      this.ctx.strokeStyle = this.currentLane === 0 ? "#00ff88" : "#00ffcc";
      this.ctx.lineWidth = 2;

      // Corner brackets
      const cl = 12;
      this.ctx.beginPath();
      this.ctx.moveTo(bx, by + cl); this.ctx.lineTo(bx, by); this.ctx.lineTo(bx + cl, by);
      this.ctx.moveTo(bx + bw - cl, by); this.ctx.lineTo(bx + bw, by); this.ctx.lineTo(bx + bw, by + cl);
      this.ctx.moveTo(bx, by + bh - cl); this.ctx.lineTo(bx, by + bh); this.ctx.lineTo(bx + cl, by + bh);
      this.ctx.moveTo(bx + bw - cl, by + bh); this.ctx.lineTo(bx + bw, by + bh); this.ctx.lineTo(bx + bw, by + bh - cl);
      this.ctx.stroke();

      if (this.landmarks) {
        this.ctx.fillStyle = "#ffcc00";
        this.landmarks.forEach((lm) => {
          this.ctx.beginPath();
          this.ctx.arc(lm.x * w, lm.y * h, 3, 0, Math.PI * 2);
          this.ctx.fill();
        });
      }
    }

    // Reticle
    const px = this.currentX * w;
    const py = this.currentY * h;

    this.ctx.save();
    this.ctx.shadowColor = "#00ffcc";
    this.ctx.shadowBlur = 10;
    this.ctx.fillStyle = this.currentLane === 0 ? "#00ff88" : "#00ffcc";
    this.ctx.beginPath();
    this.ctx.arc(px, py, 5, 0, Math.PI * 2);
    this.ctx.fill();

    this.ctx.strokeStyle = "#ffffff";
    this.ctx.lineWidth = 1.5;
    this.ctx.beginPath();
    this.ctx.arc(px, py, 12, 0, Math.PI * 2);
    this.ctx.stroke();
    this.ctx.restore();

    // Zone labels
    this.ctx.font = "bold 9px sans-serif";
    this.ctx.fillStyle = this.currentLane === -1 ? "#00ffcc" : "rgba(255,255,255,0.7)";
    this.ctx.fillText("LEFT", leftX / 2 - 12, h - 8);

    this.ctx.fillStyle = this.currentLane === 0 ? "#00ff88" : "rgba(255,255,255,0.7)";
    this.ctx.fillText("CENTER", centerX - 18, h - 8);

    this.ctx.fillStyle = this.currentLane === 1 ? "#00ffcc" : "rgba(255,255,255,0.7)";
    this.ctx.fillText("RIGHT", (rightX + w) / 2 - 14, h - 8);
  }
}

window.cameraTracker = new CameraTracker();
