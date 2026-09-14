/**
 * Word Hunt & "Fill in the Blanks" Mechanics
 * Authentic Subway Surfers Daily Word Hunt feature.
 */
class WordHuntManager {
  constructor() {
    this.wordBank = [
      "SUBWAY",
      "SURFER",
      "SKATE",
      "TRAIN",
      "METRO",
      "RUNNER",
      "JAKE",
      "BOOST",
      "COINS",
      "DODGE",
      "HOVER",
      "SPEED"
    ];
    this.currentWordIndex = 0;
    this.currentWord = "";
    this.letters = [];
    this.collected = [];
    this.wordsCompletedCount = 0;
    this.containerEl = null;
    this.statusEl = null;

    this.onLetterCollected = null;
    this.onWordCompleted = null;
  }

  init(containerId = "word-hunt-slots", statusId = "word-hunt-status") {
    this.containerEl = document.getElementById(containerId);
    this.statusEl = document.getElementById(statusId);
    this.startNewWord(this.wordBank[0]);
  }

  startNewWord(customWord = null) {
    if (customWord) {
      this.currentWord = customWord.toUpperCase();
    } else {
      this.currentWordIndex = (this.currentWordIndex + 1) % this.wordBank.length;
      this.currentWord = this.wordBank[this.currentWordIndex].toUpperCase();
    }

    this.letters = this.currentWord.split("");
    // Start with all blanks or give first letter free if word is long
    this.collected = new Array(this.letters.length).fill(false);

    this.renderHUD();
  }

  getMissingLetters() {
    const missing = [];
    for (let i = 0; i < this.letters.length; i++) {
      if (!this.collected[i]) {
        missing.push({ letter: this.letters[i], index: i });
      }
    }
    return missing;
  }

  // Choose which letter to spawn in the 3D track
  getNextSpawnLetter() {
    const missing = this.getMissingLetters();
    // 70% chance to spawn a needed letter to keep excitement high!
    if (missing.length > 0 && Math.random() < 0.75) {
      const pick = missing[Math.floor(Math.random() * missing.length)];
      return pick.letter;
    }
    // 25% chance to spawn another letter from alphabet
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    return alphabet[Math.floor(Math.random() * alphabet.length)];
  }

  collectLetter(letter) {
    const char = letter.toUpperCase();
    let foundIndex = -1;

    // Find first uncollected instance of this letter
    for (let i = 0; i < this.letters.length; i++) {
      if (this.letters[i] === char && !this.collected[i]) {
        foundIndex = i;
        break;
      }
    }

    if (foundIndex !== -1) {
      this.collected[foundIndex] = true;
      this.renderHUD(foundIndex);

      if (window.soundEngine) {
        window.soundEngine.playLetterCollect(foundIndex);
      }

      const isComplete = this.collected.every(c => c === true);

      if (this.onLetterCollected) {
        this.onLetterCollected({
          letter: char,
          index: foundIndex,
          isComplete,
          word: this.currentWord
        });
      }

      if (isComplete) {
        this.wordsCompletedCount++;
        if (window.soundEngine) {
          window.soundEngine.playWordComplete();
        }
        if (this.onWordCompleted) {
          this.onWordCompleted({
            word: this.currentWord,
            bonusCoins: 5000,
            wordsCompleted: this.wordsCompletedCount
          });
        }
        // Advance to next word after a short celebration pause
        setTimeout(() => {
          this.startNewWord();
        }, 3200);
      }

      return {
        matched: true,
        letter: char,
        index: foundIndex,
        isComplete
      };
    }

    // Letter wasn't needed for the word, but still gives minor bonus
    return {
      matched: false,
      letter: char,
      index: -1,
      isComplete: false
    };
  }

  renderHUD(highlightIndex = -1) {
    if (!this.containerEl) return;
    this.containerEl.innerHTML = "";

    this.letters.forEach((char, idx) => {
      const slot = document.createElement("div");
      slot.className = "letter-slot";
      const isCollected = this.collected[idx];

      if (isCollected) {
        slot.classList.add("filled");
        slot.textContent = char;
        if (idx === highlightIndex) {
          slot.classList.add("pop-anim");
        }
      } else {
        slot.classList.add("blank");
        // Show subtle hint or empty blank
        slot.innerHTML = `<span class="hint-char">${char}</span>`;
      }
      this.containerEl.appendChild(slot);
    });

    if (this.statusEl) {
      const missingCount = this.getMissingLetters().length;
      if (missingCount === 0) {
        this.statusEl.innerHTML = `<span class="completed-badge">🎉 WORD COMPLETED! +5,000 COINS!</span>`;
      } else {
        this.statusEl.innerHTML = `Collect <strong>${missingCount}</strong> more letter${missingCount > 1 ? 's' : ''} to complete <strong>${this.currentWord}</strong>`;
      }
    }
  }
}

window.wordHunt = new WordHuntManager();
