/**
 * The telegraph's timing, in the page: type a word and the key taps it out —
 * a dash three dots long, three units between letters, seven between words,
 * the proportions the firmware's replay uses. The readout mirrors the OLED:
 * the current letter large, its code underneath, the sentence along the foot.
 * The clack is synthesised on the spot; nothing is downloaded.
 */
(() => {
  const host = document.querySelector("[data-morse]");
  if (!host) return;

  const form = host.querySelector("form");
  const input = host.querySelector("input");
  const key = host.querySelector(".morse__key");
  const letterOut = host.querySelector("[data-letter]");
  const codeOut = host.querySelector("[data-code]");
  const sentenceOut = host.querySelector("[data-sentence]");
  const soundToggle = host.querySelector("[data-sound]");
  if (!form || !input || !key || !letterOut || !codeOut || !sentenceOut) return;

  const UNIT_MS = 90;

  // prettier-ignore
  const CODE = {
    A: ".-", B: "-...", C: "-.-.", D: "-..", E: ".", F: "..-.", G: "--.", H: "....", I: "..",
    J: ".---", K: "-.-", L: ".-..", M: "--", N: "-.", O: "---", P: ".--.", Q: "--.-", R: ".-.",
    S: "...", T: "-", U: "..-", V: "...-", W: ".--", X: "-..-", Y: "-.--", Z: "--..",
    0: "-----", 1: ".----", 2: "..---", 3: "...--", 4: "....-", 5: ".....", 6: "-....",
    7: "--...", 8: "---..", 9: "----.",
  };

  let audio = null;
  let sound = true;
  let run = 0;

  /** A short burst of filtered noise: the plunger hitting the button. */
  function clack(strength) {
    if (!sound) return;
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) return;
    audio ??= new Context();

    const length = Math.round(audio.sampleRate * 0.035);
    const buffer = audio.createBuffer(1, length, audio.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 3;

    const source = audio.createBufferSource();
    source.buffer = buffer;
    const filter = audio.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 1400;
    filter.Q.value = 0.8;
    const gain = audio.createGain();
    gain.gain.value = strength;

    source.connect(filter).connect(gain).connect(audio.destination);
    source.start();
  }

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  async function play(text) {
    const id = ++run;
    const alive = () => id === run;

    letterOut.textContent = "";
    codeOut.textContent = "";
    sentenceOut.textContent = "";
    host.dataset.state = "transmitting";

    const words = text.toUpperCase().split(/\s+/).filter(Boolean);

    for (const [wordIndex, word] of words.entries()) {
      for (const char of word) {
        const code = CODE[char];
        if (!code) continue;

        letterOut.textContent = char;
        codeOut.textContent = "";

        for (const [index, symbol] of [...code].entries()) {
          key.classList.add("is-down");
          clack(0.9);
          await wait(UNIT_MS * (symbol === "." ? 1 : 3));
          if (!alive()) return;

          key.classList.remove("is-down");
          clack(0.3);
          codeOut.textContent += symbol === "." ? "·" : "−";

          if (index < code.length - 1) {
            await wait(UNIT_MS);
            if (!alive()) return;
          }
        }

        await wait(UNIT_MS * 3);
        if (!alive()) return;
        sentenceOut.textContent += char;
      }

      if (wordIndex < words.length - 1) {
        sentenceOut.textContent += " ";
        await wait(UNIT_MS * 4);
        if (!alive()) return;
      }
    }

    letterOut.textContent = "";
    codeOut.textContent = "";
    host.dataset.state = "done";
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    play(input.value);
  });

  if (soundToggle) {
    soundToggle.addEventListener("click", () => {
      sound = !sound;
      soundToggle.setAttribute("aria-pressed", String(sound));
      soundToggle.textContent = sound ? "Sound on" : "Sound off";
    });
  }
})();
