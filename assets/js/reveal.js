/**
 * Fade-up on first scroll into view.
 *
 * The hidden state lives behind the `.js` flag set in <head>, so a visitor
 * without JavaScript never sees a blank page. Reduced motion is handled in CSS.
 */
const targets = document.querySelectorAll(".reveal");

if (typeof IntersectionObserver === "undefined") {
  for (const element of targets) element.classList.add("is-visible");
} else {
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      }
    },
    { rootMargin: "0px 0px -8% 0px", threshold: 0.08 },
  );

  for (const element of targets) observer.observe(element);
}
