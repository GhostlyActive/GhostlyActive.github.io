/**
 * Canvas backgrounds, one per section.
 *
 * "terrain" is the Comanche VoxelSpace algorithm — the same front-to-back
 * column renderer that VoxelPi and Outer Pixels run. "raycast" is Wolfenstein's
 * grid DDA, the algorithm underneath Ghost Engine Classic 2D. Both write into a
 * small pixel buffer that is scaled up, so the result stays chunky and cheap.
 *
 * Nothing is loaded from anywhere; both worlds are generated at runtime.
 */
(() => {
  const canvases = [...document.querySelectorAll("[data-scene]")];
  if (canvases.length === 0) return;

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const mix = (a, b, t) => a + (b - a) * t;
  const fade = (t) => t * t * (3 - 2 * t);
  const clamp = (value, low, high) => (value < low ? low : value > high ? high : value);
  const pack = (r, g, b) =>
    0xff000000 | (clamp(b, 0, 255) << 16) | (clamp(g, 0, 255) << 8) | clamp(r, 0, 255);

  /** Mulberry32 — seeded, so every visitor gets the same world. */
  function seeded(seed) {
    let state = seed >>> 0;
    return () => {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /**
   * A low-resolution ARGB buffer blitted up to the visible canvas. Both scenes
   * fill spans of pixels directly — thousands of `fillRect` calls a frame would
   * not hold 60 fps.
   */
  function createPixelBuffer(pixelSize) {
    const surface = document.createElement("canvas");
    const context = surface.getContext("2d");
    let image = null;

    return {
      width: 0,
      height: 0,
      pixels: null,

      resize(cssWidth, cssHeight) {
        this.width = Math.max(2, Math.round(cssWidth / pixelSize));
        this.height = Math.max(2, Math.round(cssHeight / pixelSize));
        surface.width = this.width;
        surface.height = this.height;
        image = context.createImageData(this.width, this.height);
        this.pixels = new Uint32Array(image.data.buffer);
      },

      blit(target, cssWidth, cssHeight) {
        context.putImageData(image, 0, 0);
        target.imageSmoothingEnabled = false;
        target.drawImage(surface, 0, 0, cssWidth, cssHeight);
      },
    };
  }

  /* ---------- VoxelSpace terrain ---------- */

  function createTerrainScene() {
    const MAP = 512;
    const WRAP = MAP - 1;
    const DISTANCE = 420;

    const altitude = new Uint8Array(MAP * MAP);
    const surface = new Uint32Array(MAP * MAP);
    const buffer = createPixelBuffer(3);

    let sky = null;
    let hidden = null;
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

    const field = noise(MAP, seeded(0x5ea51de));

    for (let y = 0; y < MAP; y += 1) {
      for (let x = 0; x < MAP; x += 1) {
        const index = y * MAP + x;
        const shaped = Math.pow(field[index], 1.7);
        altitude[index] = 6 + shaped * 232;

        // A one-sided height difference stands in for a surface normal: enough
        // relief to read as ridges without a real lighting pass.
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

        surface[index] = pack(r * light, g * light, b * light);
      }
    }

    function resize(width, height) {
      buffer.resize(width, height);
      hidden = new Int32Array(buffer.width);

      sky = new Uint32Array(buffer.height);
      for (let y = 0; y < buffer.height; y += 1) {
        const t = fade(clamp(y / (buffer.height * 0.6), 0, 1));
        sky[y] = pack(mix(9, 88, t), mix(9, 55, t), mix(11, 37, t));
      }
    }

    function draw(target, width, height, clock, delta, pointer) {
      const { pixels } = buffer;
      const bufferWidth = buffer.width;
      const bufferHeight = buffer.height;

      const yaw = Math.sin(clock * 0.045) * 0.55 + pointer.x * 0.7;
      const camH = 196 + pointer.y * 34;
      const horizon = bufferHeight * 0.38 - pointer.y * bufferHeight * 0.1;

      // Tied to the buffer *width*, because the 90° field of view is horizontal:
      // scaling off the height instead stretches the relief on a tall phone.
      const scale = bufferWidth * 0.42;

      camX -= Math.sin(yaw) * delta * 26;
      camY -= Math.cos(yaw) * delta * 26;

      for (let y = 0; y < bufferHeight; y += 1) {
        pixels.fill(sky[y], y * bufferWidth, y * bufferWidth + bufferWidth);
      }

      const sinYaw = Math.sin(yaw);
      const cosYaw = Math.cos(yaw);
      hidden.fill(bufferHeight);

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
            const colour = surface[offset];
            const shade = pack(
              mix(colour & 0xff, 66, haze),
              mix((colour >> 8) & 0xff, 43, haze),
              mix((colour >> 16) & 0xff, 31, haze),
            );

            for (let y = Math.max(top, 0); y < bottom; y += 1) {
              pixels[y * bufferWidth + x] = shade;
            }
            hidden[x] = top;
          }

          px += stepX;
          py += stepY;
        }

        deltaZ += 0.012;
      }

      buffer.blit(target, width, height);
    }

    return { draw, resize };
  }

  /* ---------- Raycast corridor ---------- */

  function createRaycastScene() {
    const MAP = 32;
    const CENTRE = MAP / 2;
    const PATH_RADIUS = 9.5;
    const FAR = 17;

    const world = new Uint8Array(MAP * MAP);
    const buffer = createPixelBuffer(3);

    const walls = [
      [0, 0, 0],
      [224, 147, 52],
      [80, 86, 100],
      [152, 127, 102],
    ];

    let ceiling = null;
    let floor = null;

    const random = seeded(0xbadc0de);
    for (let y = 0; y < MAP; y += 1) {
      for (let x = 0; x < MAP; x += 1) {
        const edge = x === 0 || y === 0 || x === MAP - 1 || y === MAP - 1;
        const radius = Math.hypot(x + 0.5 - CENTRE, y + 0.5 - CENTRE);

        // The camera circles at PATH_RADIUS, so that band is kept clear and no
        // collision test is needed — everything else is free to be a pillar.
        const onPath = Math.abs(radius - PATH_RADIUS) < 1.6;
        world[y * MAP + x] = edge ? 2 : !onPath && random() < 0.17 ? 1 + ((random() * 3) | 0) : 0;
      }
    }

    function resize(width, height) {
      buffer.resize(width, height);

      const horizon = buffer.height * 0.52;
      ceiling = new Uint32Array(buffer.height);
      floor = new Uint32Array(buffer.height);

      for (let y = 0; y < buffer.height; y += 1) {
        const up = clamp(y / horizon, 0, 1);
        ceiling[y] = pack(mix(9, 33, up), mix(9, 31, up), mix(11, 38, up));

        const down = clamp((y - horizon) / (buffer.height - horizon), 0, 1);
        floor[y] = pack(mix(30, 74, down), mix(28, 62, down), mix(32, 52, down));
      }
    }

    function draw(target, width, height, clock, delta, pointer) {
      const { pixels } = buffer;
      const bufferWidth = buffer.width;
      const bufferHeight = buffer.height;
      const horizon = (bufferHeight * 0.52 + pointer.y * bufferHeight * 0.08) | 0;

      // Same reason as the terrain: the vertical scale comes off the width, or
      // a narrow canvas turns into a hall of impossibly tall doors.
      const projection = bufferWidth * 0.76;

      const orbit = clock * 0.052;
      const posX = CENTRE + Math.cos(orbit) * PATH_RADIUS;
      const posY = CENTRE + Math.sin(orbit) * PATH_RADIUS;
      const angle = orbit + Math.PI / 2 + Math.sin(clock * 0.11) * 0.16 + pointer.x * 0.4;

      const dirX = Math.cos(angle);
      const dirY = Math.sin(angle);
      const planeX = -dirY * 0.66;
      const planeY = dirX * 0.66;

      for (let x = 0; x < bufferWidth; x += 1) {
        const offset = (2 * x) / bufferWidth - 1;
        const rayX = dirX + planeX * offset;
        const rayY = dirY + planeY * offset;

        let mapX = posX | 0;
        let mapY = posY | 0;

        const deltaX = Math.abs(1 / rayX);
        const deltaY = Math.abs(1 / rayY);
        const stepX = rayX < 0 ? -1 : 1;
        const stepY = rayY < 0 ? -1 : 1;

        let sideX = rayX < 0 ? (posX - mapX) * deltaX : (mapX + 1 - posX) * deltaX;
        let sideY = rayY < 0 ? (posY - mapY) * deltaY : (mapY + 1 - posY) * deltaY;

        let side = 0;
        let tile = 0;
        let distance = FAR;

        for (let step = 0; step < 64; step += 1) {
          if (sideX < sideY) {
            sideX += deltaX;
            mapX += stepX;
            side = 0;
          } else {
            sideY += deltaY;
            mapY += stepY;
            side = 1;
          }

          if (mapX < 0 || mapY < 0 || mapX >= MAP || mapY >= MAP) break;

          tile = world[mapY * MAP + mapX];
          if (tile !== 0) {
            distance = side === 0 ? sideX - deltaX : sideY - deltaY;
            break;
          }
        }

        const lit = tile !== 0 && distance < FAR;
        const column = lit ? (projection / Math.max(distance, 0.35)) | 0 : 0;
        const top = lit ? Math.max(horizon - (column >> 1), 0) : horizon;
        const bottom = lit ? Math.min(horizon + (column >> 1), bufferHeight) : horizon;

        for (let y = 0; y < top; y += 1) pixels[y * bufferWidth + x] = ceiling[y];
        for (let y = bottom; y < bufferHeight; y += 1) pixels[y * bufferWidth + x] = floor[y];

        if (!lit) continue;

        // The classic trick: y-facing walls are drawn darker, and that alone
        // reads as light falling across the geometry.
        const shade = side === 1 ? 0.66 : 1;
        const haze = clamp(distance / FAR, 0, 1) ** 1.3;
        const [r, g, b] = walls[tile];
        const colour = pack(
          mix(r * shade, 12, haze),
          mix(g * shade, 12, haze),
          mix(b * shade, 15, haze),
        );

        for (let y = top; y < bottom; y += 1) pixels[y * bufferWidth + x] = colour;
      }

      buffer.blit(target, width, height);
    }

    return { draw, resize };
  }

  /* ---------- Host ---------- */

  const factories = { terrain: createTerrainScene, raycast: createRaycastScene };

  function mount(canvas) {
    const build = factories[canvas.dataset.scene];
    const context = canvas.getContext("2d", { alpha: false });
    if (!build || !context) return;

    const scene = build();
    const stage = canvas.parentElement;
    const section = canvas.closest("section, header") || stage;
    const pointer = { x: 0, y: 0, toX: 0, toY: 0 };

    let width = 0;
    let height = 0;
    let clock = 0;
    let last = 0;
    let request = 0;
    let onScreen = false;

    function render(delta) {
      if (width > 0 && height > 0) scene.draw(context, width, height, clock, delta, pointer);
    }

    function resize() {
      const rect = stage.getBoundingClientRect();
      const nextWidth = Math.max(1, Math.round(rect.width));
      const nextHeight = Math.max(1, Math.round(rect.height));
      if (nextWidth === width && nextHeight === height) return;

      width = nextWidth;
      height = nextHeight;

      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);

      scene.resize(width, height);
      if (!request) render(0.016);
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

    // Both paths, because the section can change height without the window
    // moving, and ResizeObserver is not everywhere. `resize` bails out when
    // nothing actually changed, so firing twice costs nothing.
    window.addEventListener("resize", resize);
    if (typeof ResizeObserver !== "undefined") new ResizeObserver(resize).observe(stage);

    new IntersectionObserver((entries) => {
      onScreen = entries[0].isIntersecting;
      if (onScreen && !document.hidden) start();
      else stop();
    }).observe(stage);

    document.addEventListener("visibilitychange", () => {
      if (document.hidden || !onScreen) stop();
      else start();
    });

    section.addEventListener("pointermove", (event) => {
      const rect = section.getBoundingClientRect();
      pointer.toX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.toY = ((event.clientY - rect.top) / rect.height) * 2 - 1;
    });

    section.addEventListener("pointerleave", () => {
      pointer.toX = 0;
      pointer.toY = 0;
    });

    resize();
  }

  for (const canvas of canvases) mount(canvas);
})();
