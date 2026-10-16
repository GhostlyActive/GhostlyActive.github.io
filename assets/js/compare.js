/**
 * Before/after slider: two images of the same spot, the top one clipped at the
 * handle. The control is a real range input laid over the picture, so dragging,
 * touch and the arrow keys all work without any pointer maths here. The
 * position is a custom property, so a visitor without JavaScript still gets a
 * fixed half-and-half split.
 */
for (const figure of document.querySelectorAll("[data-compare]")) {
  const stage = figure.querySelector(".compare__stage");
  const input = figure.querySelector("input[type=range]");
  if (!stage || !input) continue;

  const update = () => stage.style.setProperty("--pos", `${input.value}%`);
  input.addEventListener("input", update);
  update();
}
