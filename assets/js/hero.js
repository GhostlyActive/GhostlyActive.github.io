/**
 * Hero background scenes.
 *
 * Two renderers share one canvas. "Voxel terrain" is the Comanche VoxelSpace
 * algorithm — the same front-to-back column renderer that VoxelPi and Outer
 * Pixels run — drawn into a small pixel buffer and scaled up. "Sunrise
 * alignment" is the 2001 opening: sun rising from behind a planet, past a moon.
 *
 * Press M or use the control in the hero corner to switch. Nothing is loaded
 * from anywhere; both scenes are generated at runtime.
 */
(() => {
  const canvas = document.querySelector("[data-hero-canvas]");
  if (!canvas) return;

  const context = canvas.getContext("2d", { alpha: false });
  if (!context) return;

  const stage = canvas.parentElement;
  const hero = canvas.closest(".hero") || stage;
  const toggle = document.querySelector("[data-scene-toggle]");
  const sceneLabel = document.querySelector("[data-scene-name]");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const STORAGE_KEY = "ghostlyactive:hero-scene";

  const mix = (a, b, t) => a + (b - a) * t;
  const fade = (t) => t * t * (3 - 2 * t);
  const clamp = (value, low, high) => (value < low ? low : value > high ? high : value);

  /** Mulberry32 — a seeded PRNG, so the terrain is the same on every visit. */
  function seeded(seed) {
    let state = seed >>> 0;
    return () => {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ---------- Scene 1: VoxelSpace terrain ---------- */

  function createTerrainScene() {
    const MAP = 512;
    const WRAP = MAP - 1;
    const DISTANCE = 420;
    const PIXEL = 3;

    const altitude = new Uint8Array(MAP * MAP);
    const surface = new Uint32Array(MAP * MAP);

    buildMap();

    let buffer = null;
    let bufferContext = null;
    let image = null;
    let pixels = null;
    let sky = null;
    let hidden = null;
    let bufferWidth = 0;
    let bufferHeight = 0;
    let camX = 512;
    let camY = 800;

    function noise(size, random) {
      const field = new Float32Array(size * size);
      let amplitude = 1;
      let total = 0;

      for (let cells = 4; cells <= size / 2; cells *= 2) {
        const lattice = new Float32Array(cells * cells);
        for (let i = 0; i < lattice.length; i += 1) lattice[i] = random();

        const step = size / cells;
        for (let y = 0; y < size; y += 1) {
          const gy = y / step;
          const row0 = (Math.floor(gy) % cells) * cells;
          const row1 = ((Math.floor(gy) + 1) % cells) * cells;
          const ty = fade(gy - Math.floor(gy));

          for (let x = 0; x < size; x += 1) {
            const gx = x / step;
            const col0 = Math.floor(gx) % cells;
            const col1 = (col0 + 1) % cells;
            const tx = fade(gx - Math.floor(gx));

            const top = mix(lattice[row0 + col0], lattice[row0 + col1], tx);
            const bottom = mix(lattice[row1 + col0], lattice[row1 + col1], tx);
            field[y * size + x] += mix(top, bottom, ty) * amplitude;
          }
        }

        total += amplitude;
        amplitude *= 0.5;
      }

      for (let i = 0; i < field.length; i += 1) field[i] /= total;
      return field;
    }

    function buildMap() {
      const field = noise(MAP, seeded(0x5ea51de));

      for (let y = 0; y < MAP; y += 1) {
        for (let x = 0; x < MAP; x += 1) {
          const index = y * MAP + x;
          const shaped = Math.pow(field[index], 1.7);
          altitude[index] = 6 + shaped * 232;

          // A one-sided height difference stands in for a surface normal:
          // enough relief to read as ridges without a real lighting pass.
          const slope = field[y * MAP + ((x + 1) & WRAP)] - field[y * MAP + ((x - 1) & WRAP)];
          const light = clamp(1 + slope * 5.5, 0.45, 1.65);

          let r;
          let g;
          let b;
          if (shaped < 0.55) {
            const t = shaped / 0.55;
            r = mix(30, 104, t);
            g = mix(28, 90, t);
            b = mix(38, 84, t);
          } else {
            const t = Math.pow((shaped - 0.55) / 0.45, 1.25);
            r = mix(104, 255, t);
            g = mix(90, 176, t);
            b = mix(84, 72, t);
          }

          surface[index] =
            0xff000000 |
            (clamp(b * light, 0, 255) << 16) |
            (clamp(g * light, 0, 255) << 8) |
            clamp(r * light, 0, 255);
        }
      }
    }

    function resize(width, height) {
      bufferWidth = Math.max(2, Math.round(width / PIXEL));
      bufferHeight = Math.max(2, Math.round(height / PIXEL));

      buffer = document.createElement("canvas");
      buffer.width = bufferWidth;
      buffer.height = bufferHeight;
      bufferContext = buffer.getContext("2d");
      image = bufferContext.createImageData(bufferWidth, bufferHeight);
      pixels = new Uint32Array(image.data.buffer);
      hidden = new Int32Array(bufferWidth);

      sky = new Uint32Array(bufferHeight);
      for (let y = 0; y < bufferHeight; y += 1) {
        const t = fade(clamp(y / (bufferHeight * 0.6), 0, 1));
        const r = mix(9, 88, t);
        const g = mix(9, 55, t);
        const b = mix(11, 37, t);
        sky[y] = 0xff000000 | (b << 16) | (g << 8) | r;
      }
    }

    function draw(target, width, height, clock, delta, pointer) {
      if (!buffer || buffer.width !== Math.max(2, Math.round(width / PIXEL))) {
        resize(width, height);
      }

      const yaw = Math.sin(clock * 0.045) * 0.55 + pointer.x * 0.7;
      const camH = 196 + pointer.y * 34;
      const horizon = bufferHeight * 0.38 - pointer.y * bufferHeight * 0.1;
      const scale = bufferHeight * 0.55;

      camX -= Math.sin(yaw) * delta * 26;
      camY -= Math.cos(yaw) * delta * 26;

      for (let y = 0; y < bufferHeight; y += 1) {
        pixels.fill(sky[y], y * bufferWidth, y * bufferWidth + bufferWidth);
      }

      const sinYaw = Math.sin(yaw);
      const cosYaw = Math.cos(yaw);
      hidden.fill(bufferHeight);
      const hazeR = 66;
      const hazeG = 43;
      const hazeB = 31;

      let deltaZ = 1;
      for (let z = 6; z < DISTANCE; z += deltaZ) {
        let px = -cosYaw * z - sinYaw * z + camX;
        let py = sinYaw * z - cosYaw * z + camY;
        const stepX = (cosYaw * z - sinYaw * z + camX - px) / bufferWidth;
        const stepY = (-sinYaw * z - cosYaw * z + camY - py) / bufferWidth;
        const invZ = (1 / z) * scale;
        const haze = clamp((z / DISTANCE) ** 2.4, 0, 1);

        for (let x = 0; x < bufferWidth; x += 1) {
          const offset = ((py & WRAP) * MAP + (px & WRAP)) | 0;
          const top = ((camH - altitude[offset]) * invZ + horizon) | 0;
          const bottom = hidden[x];

          if (top < bottom) {
            const packed = surface[offset];
            const r = mix(packed & 0xff, hazeR, haze) | 0;
            const g = mix((packed >> 8) & 0xff, hazeG, haze) | 0;
            const b = mix((packed >> 16) & 0xff, hazeB, haze) | 0;
            const colour = 0xff000000 | (b << 16) | (g << 8) | r;

            for (let y = Math.max(top, 0); y < bottom; y += 1) {
              pixels[y * bufferWidth + x] = colour;
            }
            hidden[x] = top;
          }

          px += stepX;
          py += stepY;
        }

        deltaZ += 0.012;
      }

      bufferContext.putImageData(image, 0, 0);
      target.imageSmoothingEnabled = false;
      target.drawImage(buffer, 0, 0, width, height);
    }

    return { name: "Voxel terrain", draw, resize };
  }

  /* ---------- Scene 2: 2001-style alignment ---------- */

  function createAlignmentScene() {
    const CYCLE = 52;
    let stars = [];

    function resize(width, height) {
      const random = seeded(0x2001);
      const count = Math.round((width * height) / 5200);
      stars = [];
      for (let i = 0; i < count; i += 1) {
        stars.push({
          x: random() * width,
          y: random() * height * 0.78,
          size: random() < 0.86 ? 1 : 1.8,
          alpha: 0.16 + random() * 0.5,
          phase: random() * Math.PI * 2,
        });
      }
    }

    function draw(target, width, height, clock, delta, pointer) {
      if (stars.length === 0) resize(width, height);

      const space = target.createLinearGradient(0, 0, 0, height);
      space.addColorStop(0, "#050507");
      space.addColorStop(1, "#0b0b0d");
      target.fillStyle = space;
      target.fillRect(0, 0, width, height);

      const centreX = width * 0.62 + pointer.x * width * 0.03;
      const limbY = height * 0.86;
      const planetRadius = height * 1.5;

      for (const star of stars) {
        const twinkle = 0.72 + Math.sin(clock * 0.7 + star.phase) * 0.28;
        target.globalAlpha = star.alpha * twinkle;
        target.fillStyle = "#e8e6e2";
        target.fillRect(star.x, star.y - pointer.y * 6, star.size, star.size);
      }
      target.globalAlpha = 1;

      const moonRadius = height * 0.115;
      const moonY = height * 0.44 + pointer.y * height * 0.03;

      // The sun starts fully behind the planet and leaves past the top edge, so
      // the loop point is never on screen and needs no cross-fade.
      const rise = (clock % CYCLE) / CYCLE;
      const sunRadius = height * 0.075;
      const sunY = mix(limbY + sunRadius * 2.2, -sunRadius * 3, fade(rise));

      const glow = target.createRadialGradient(centreX, sunY, 0, centreX, sunY, sunRadius * 9);
      glow.addColorStop(0, "rgba(255, 214, 150, 0.5)");
      glow.addColorStop(0.22, "rgba(255, 166, 43, 0.22)");
      glow.addColorStop(1, "rgba(255, 166, 43, 0)");
      target.fillStyle = glow;
      target.fillRect(0, 0, width, height);

      const disc = target.createRadialGradient(centreX, sunY, 0, centreX, sunY, sunRadius);
      disc.addColorStop(0, "#fffdf6");
      disc.addColorStop(0.7, "#ffe9b8");
      disc.addColorStop(1, "#ffb347");
      target.fillStyle = disc;
      target.beginPath();
      target.arc(centreX, sunY, sunRadius, 0, Math.PI * 2);
      target.fill();

      drawLitBody(target, centreX, moonY, moonRadius, centreX, sunY, "#121218", "#efe9dc");
      drawLitBody(target, centreX, limbY + planetRadius, planetRadius, centreX, sunY, "#08080a", "#8d7859");
    }

    /** A flat disc plus a rim gradient offset toward the sun — cheaper than a
        real terminator and reads the same at this size. */
    function drawLitBody(target, x, y, radius, sunX, sunY, shadow, rim) {
      target.fillStyle = shadow;
      target.beginPath();
      target.arc(x, y, radius, 0, Math.PI * 2);
      target.fill();

      const dx = sunX - x;
      const dy = sunY - y;
      const length = Math.hypot(dx, dy) || 1;
      const edgeX = x + (dx / length) * radius;
      const edgeY = y + (dy / length) * radius;

      const light = target.createRadialGradient(edgeX, edgeY, 0, edgeX, edgeY, radius * 0.85);
      light.addColorStop(0, rim);
      light.addColorStop(0.35, "rgba(150, 136, 112, 0.45)");
      light.addColorStop(1, "rgba(0, 0, 0, 0)");

      target.save();
      target.beginPath();
      target.arc(x, y, radius, 0, Math.PI * 2);
      target.clip();
      target.fillStyle = light;
      target.fillRect(x - radius, y - radius, radius * 2, radius * 2);
      target.restore();
    }

    return { name: "Sunrise alignment", draw, resize };
  }

  /* ---------- Host ---------- */

  const scenes = [createTerrainScene(), createAlignmentScene()];
  const pointer = { x: 0, y: 0, toX: 0, toY: 0 };

  let current = Number(localStorage.getItem(STORAGE_KEY)) || 0;
  if (!scenes[current]) current = 0;

  let width = 0;
  let height = 0;
  let clock = 0;
  let last = 0;
  let request = 0;
  let onScreen = true;

  function resize() {
    const rect = stage.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    width = Math.max(1, Math.round(rect.width));
    height = Math.max(1, Math.round(rect.height));

    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);

    for (const scene of scenes) scene.resize?.(width, height);
    if (!request) render(0.016);
  }

  function render(delta) {
    scenes[current].draw(context, width, height, clock, delta, pointer);
  }

  function tick(now) {
    request = requestAnimationFrame(tick);
    const delta = last ? Math.min((now - last) / 1000, 0.05) : 0.016;
    last = now;
    clock += delta;
    pointer.x += (pointer.toX - pointer.x) * 0.05;
    pointer.y += (pointer.toY - pointer.y) * 0.05;
    render(delta);
  }

  function start() {
    if (request || reduceMotion) return;
    last = 0;
    request = requestAnimationFrame(tick);
  }

  function stop() {
    cancelAnimationFrame(request);
    request = 0;
  }

  function select(index) {
    current = ((index % scenes.length) + scenes.length) % scenes.length;
    if (sceneLabel) sceneLabel.textContent = scenes[current].name;
    try {
      localStorage.setItem(STORAGE_KEY, String(current));
    } catch {
      // Private mode: the choice just does not survive the reload.
    }
    if (!request) render(0.016);
  }

  new ResizeObserver(resize).observe(stage);

  new IntersectionObserver((entries) => {
    onScreen = entries[0].isIntersecting;
    if (onScreen && !document.hidden) start();
    else stop();
  }).observe(stage);

  document.addEventListener("visibilitychange", () => {
    if (document.hidden || !onScreen) stop();
    else start();
  });

  hero.addEventListener("pointermove", (event) => {
    const rect = hero.getBoundingClientRect();
    pointer.toX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.toY = ((event.clientY - rect.top) / rect.height) * 2 - 1;
  });

  hero.addEventListener("pointerleave", () => {
    pointer.toX = 0;
    pointer.toY = 0;
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "m" && event.key !== "M") return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.target.closest("input, textarea, [contenteditable]")) return;
    select(current + 1);
  });

  if (toggle) {
    toggle.hidden = false;
    toggle.addEventListener("click", () => select(current + 1));
  }

  resize();
  select(current);
  if (reduceMotion) render(0);
})();
