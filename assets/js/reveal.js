/**
 * Fade-up on first scroll into view.
 *
 * The hidden state lives behind the `.js` flag set in <head>, so a visitor
 * without JavaScript never sees a blank page. Reduced motion is handled in CSS.
 */
const targets = [...document.querySelectorAll(".reveal")];
const DURATION_MS = 550;

function reveal(element) {
  element.classList.add("is-visible");

  // Once it has played, the element drops both classes and goes back to being
  // ordinary markup. Otherwise the visible state stays the property of a CSS
  // animation for the rest of the session, and anything that stalls that
  // animation hides the content for good.
  setTimeout(() => element.classList.remove("reveal", "is-visible"), DURATION_MS + 150);
}

function revealAll() {
  for (const element of targets) reveal(element);
}

if (typeof IntersectionObserver === "undefined") {
  revealAll();
} else {
  try {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          reveal(entry.target);
          observer.unobserve(entry.target);
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 },
    );

    for (const element of targets) observer.observe(element);

    // Anything already on screen is shown straight away rather than waiting for
    // a callback. The effect belongs below the fold anyway, and on a project
    // page every visible block carries `.reveal` — one missed callback there
    // would leave the page blank.
    for (const element of targets) {
      const box = element.getBoundingClientRect();
      if (box.top < window.innerHeight && box.bottom > 0) {
        reveal(element);
        observer.unobserve(element);
      }
    }
  } catch {
    revealAll();
  }
}
