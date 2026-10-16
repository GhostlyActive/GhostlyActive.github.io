/**
 * The grid raycaster from Ghost Engine Classic 2D, running in the page.
 *
 * Left: the map from above, the player, and one line per ray. Right: what those
 * rays become, one column each, drawn into a 128 × 128 buffer — the panel's
 * resolution — and scaled up without smoothing. Drag the player to move it,
 * drag anywhere else to aim, or use the arrow keys once the map has focus.
 *
 * Nothing animates on its own; a frame is rendered when the input changes.
 */
(() => {
  const host = document.querySelector("[data-raycaster]");
  if (!host) return;

  const mapCanvas = host.querySelector("canvas[data-map]");
  const viewCanvas = host.querySelector("canvas[data-view]");
  const readout = host.querySelector("[data-readout]");
  const map = mapCanvas.getContext("2d");
  const view = viewCanvas.getContext("2d", { alpha: false });
  if (!map || !view) return;

  const MAP = 16;
  const COLUMNS = 128;
  const ROWS = 128;
  const FAR = 18;
  const HALF_FOV = Math.tan(Math.PI / 6);
  const FOG = [12, 12, 15];
  const PALETTE = [null, [180, 92, 40], [74, 80, 94], [36, 48, 118]];
  const MAP_FILL = [null, "#b45c28", "#4a505e", "#243076"];

  // The player and the rays take the site's accent, read from the token so a
  // change there reaches the canvas too.
  const style = getComputedStyle(document.documentElement);
  const ACCENT = style.getPropertyValue("--accent").trim() || "#ff6a1f";
  const ACCENT_RGB = style.getPropertyValue("--accent-rgb").trim() || "255, 106, 31";

  // prettier-ignore
  const world = Uint8Array.from([
    2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,
    2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2,
    2,0,1,1,0,0,0,0,0,0,0,3,3,0,0,2,
    2,0,1,0,0,0,0,0,0,0,0,0,3,0,0,2,
    2,0,0,0,0,0,0,2,2,0,0,0,0,0,0,2,
    2,0,0,0,0,0,0,2,0,0,0,0,0,0,0,2,
    2,0,0,0,0,0,0,0,0,0,0,0,1,0,0,2,
    2,0,0,3,0,0,0,0,0,0,0,0,1,0,0,2,
    2,0,0,3,0,0,0,0,0,0,0,0,0,0,0,2,
    2,0,0,0,0,0,0,0,1,1,0,0,0,0,0,2,
    2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2,
    2,0,2,2,2,0,0,0,0,0,0,0,0,3,0,2,
    2,0,0,0,0,0,0,0,0,0,0,0,0,3,0,2,
    2,0,0,0,0,0,0,1,0,0,0,0,0,0,0,2,
    2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2,
    2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,
  ]);

  const player = { x: 5.5, y: 8.5, angle: -0.35 };

  /** Where each ray ended, so the map can draw it. */
  const hits = new Float32Array(COLUMNS * 2);

  const surface = document.createElement("canvas");
  surface.width = COLUMNS;
  surface.height = ROWS;
  const surfaceContext = surface.getContext("2d");
  const image = surfaceContext.createImageData(COLUMNS, ROWS);
  const pixels = new Uint32Array(image.data.buffer);

  const clamp = (value, low, high) => (value < low ? low : value > high ? high : value);
  const mix = (a, b, t) => a + (b - a) * t;
  const pack = (r, g, b) => 0xff000000 | (clamp(b, 0, 255) << 16) | (clamp(g, 0, 255) << 8) | clamp(r, 0, 255);

  function shade(colour, haze, dim) {
    const keep = (1 - haze) * dim;
    return pack(colour[0] * keep + FOG[0] * haze, colour[1] * keep + FOG[1] * haze, colour[2] * keep + FOG[2] * haze);
  }

  function renderView() {
    const dirX = Math.cos(player.angle);
    const dirY = Math.sin(player.angle);
    const planeX = -dirY * HALF_FOV;
    const planeY = dirX * HALF_FOV;
    const horizon = ROWS >> 1;

    for (let y = 0; y < ROWS; y += 1) {
      const colour =
        y < horizon
          ? pack(mix(9, 28, y / horizon), mix(9, 27, y / horizon), mix(11, 33, y / horizon))
          : pack(mix(52, 30, (ROWS - y) / horizon), mix(46, 28, (ROWS - y) / horizon), mix(42, 30, (ROWS - y) / horizon));
      pixels.fill(colour, y * COLUMNS, y * COLUMNS + COLUMNS);
    }

    let wallPixels = 0;

    for (let x = 0; x < COLUMNS; x += 1) {
      const cameraX = (2 * x) / COLUMNS - 1;
      const rayX = dirX + planeX * cameraX;
      const rayY = dirY + planeY * cameraX;

      let mapX = player.x | 0;
      let mapY = player.y | 0;
      const deltaX = Math.abs(1 / rayX);
      const deltaY = Math.abs(1 / rayY);
      const stepX = rayX < 0 ? -1 : 1;
      const stepY = rayY < 0 ? -1 : 1;
      let sideX = rayX < 0 ? (player.x - mapX) * deltaX : (mapX + 1 - player.x) * deltaX;
      let sideY = rayY < 0 ? (player.y - mapY) * deltaY : (mapY + 1 - player.y) * deltaY;

      let side = 0;
      let tile = 0;
      let distance = FAR;

      // The grid walk: step to whichever cell edge is nearer, and stop at the
      // first solid cell. That first hit is the only one this column needs.
      for (let step = 0; step < 48; step += 1) {
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

      hits[x * 2] = player.x + rayX * distance;
      hits[x * 2 + 1] = player.y + rayY * distance;
      if (tile === 0) continue;

      const height = (ROWS / Math.max(distance, 0.05)) | 0;
      const top = Math.max(horizon - (height >> 1), 0);
      const bottom = Math.min(horizon + (height >> 1), ROWS);
      const haze = clamp(distance / FAR, 0, 1) ** 1.3;
      const colour = shade(PALETTE[tile], haze, side === 1 ? 0.62 : 1);

      for (let y = top; y < bottom; y += 1) pixels[y * COLUMNS + x] = colour;
      wallPixels += bottom - top;
    }

    surfaceContext.putImageData(image, 0, 0);
    view.imageSmoothingEnabled = false;
    view.drawImage(surface, 0, 0, viewCanvas.width, viewCanvas.height);

    if (readout) {
      readout.textContent =
        `${COLUMNS} rays · ${wallPixels.toLocaleString("en")} wall pixels of ` +
        `${(COLUMNS * ROWS).toLocaleString("en")}, each written once`;
    }
  }

  function renderMap() {
    const size = mapCanvas.width;
    const cell = size / MAP;

    map.setTransform(1, 0, 0, 1, 0, 0);
    map.fillStyle = "#08080a";
    map.fillRect(0, 0, size, size);

    for (let y = 0; y < MAP; y += 1) {
      for (let x = 0; x < MAP; x += 1) {
        const tile = world[y * MAP + x];
        if (tile === 0) continue;
        map.fillStyle = MAP_FILL[tile];
        map.fillRect(x * cell, y * cell, cell, cell);
      }
    }

    map.strokeStyle = "rgba(255, 255, 255, 0.05)";
    map.lineWidth = 1;
    map.beginPath();
    for (let i = 1; i < MAP; i += 1) {
      map.moveTo(i * cell, 0);
      map.lineTo(i * cell, size);
      map.moveTo(0, i * cell);
      map.lineTo(size, i * cell);
    }
    map.stroke();

    const px = player.x * cell;
    const py = player.y * cell;

    map.strokeStyle = `rgba(${ACCENT_RGB}, 0.14)`;
    map.lineWidth = Math.max(1, cell * 0.03);
    map.beginPath();
    for (let x = 0; x < COLUMNS; x += 1) {
      map.moveTo(px, py);
      map.lineTo(hits[x * 2] * cell, hits[x * 2 + 1] * cell);
    }
    map.stroke();

    // The two edges of the field of view, drawn once more so they read.
    map.strokeStyle = `rgba(${ACCENT_RGB}, 0.7)`;
    map.beginPath();
    for (const x of [0, COLUMNS - 1]) {
      map.moveTo(px, py);
      map.lineTo(hits[x * 2] * cell, hits[x * 2 + 1] * cell);
    }
    map.stroke();

    map.fillStyle = ACCENT;
    map.beginPath();
    map.arc(px, py, cell * 0.24, 0, Math.PI * 2);
    map.fill();
  }

  function render() {
    renderView();
    renderMap();
  }

  function resize() {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const mapSize = Math.max(1, Math.round(mapCanvas.getBoundingClientRect().width * ratio));
    const viewSize = Math.max(1, Math.round(viewCanvas.getBoundingClientRect().width * ratio));
    if (mapCanvas.width !== mapSize) {
      mapCanvas.width = mapSize;
      mapCanvas.height = mapSize;
    }
    if (viewCanvas.width !== viewSize) {
      viewCanvas.width = viewSize;
      viewCanvas.height = viewSize;
    }
    render();
  }

  /* ---------- Input ---------- */

  function free(x, y) {
    return x > 0.25 && y > 0.25 && x < MAP - 0.25 && y < MAP - 0.25 && world[(y | 0) * MAP + (x | 0)] === 0;
  }

  /** One axis at a time, so the player slides along a wall instead of sticking. */
  function moveTo(x, y) {
    if (free(x, player.y)) player.x = x;
    if (free(player.x, y)) player.y = y;
  }

  function aimAt(point) {
    player.angle = Math.atan2(point.y - player.y, point.x - player.x);
  }

  function toWorld(event) {
    const rect = mapCanvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * MAP,
      y: ((event.clientY - rect.top) / rect.height) * MAP,
    };
  }

  let dragging = null;

  mapCanvas.addEventListener("pointerdown", (event) => {
    const point = toWorld(event);
    dragging = Math.hypot(point.x - player.x, point.y - player.y) < 0.9 ? "move" : "aim";
    mapCanvas.setPointerCapture(event.pointerId);
    if (dragging === "aim") aimAt(point);
    render();
    // preventDefault also cancels the focus a click would give the canvas,
    // and the arrow keys need that focus.
    event.preventDefault();
    mapCanvas.focus({ preventScroll: true });
  });

  mapCanvas.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    const point = toWorld(event);
    if (dragging === "move") moveTo(point.x, point.y);
    else aimAt(point);
    render();
  });

  const release = () => {
    dragging = null;
  };
  mapCanvas.addEventListener("pointerup", release);
  mapCanvas.addEventListener("pointercancel", release);

  mapCanvas.addEventListener("keydown", (event) => {
    const turn = 0.09;
    const walk = 0.3;
    const dirX = Math.cos(player.angle);
    const dirY = Math.sin(player.angle);

    switch (event.key) {
      case "ArrowLeft":
      case "a":
        player.angle -= turn;
        break;
      case "ArrowRight":
      case "d":
        player.angle += turn;
        break;
      case "ArrowUp":
      case "w":
        moveTo(player.x + dirX * walk, player.y + dirY * walk);
        break;
      case "ArrowDown":
      case "s":
        moveTo(player.x - dirX * walk, player.y - dirY * walk);
        break;
      default:
        return;
    }
    event.preventDefault();
    render();
  });

  if (typeof ResizeObserver !== "undefined") new ResizeObserver(resize).observe(host);
  window.addEventListener("resize", resize);
  resize();
})();
