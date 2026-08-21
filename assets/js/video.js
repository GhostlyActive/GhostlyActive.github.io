const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Looping clips autoplay by default, which CSS alone cannot switch off — so a
 * visitor who asked for reduced motion gets a still frame and a play control.
 */
if (reduceMotion) {
  for (const clip of document.querySelectorAll("video[autoplay], video[data-play-in-view]")) {
    clip.autoplay = false;
    clip.controls = true;
    clip.pause();
  }
}

/**
 * `autoplay` overrides `preload="none"`, so a clip far down the page would be
 * fetched on load whether or not anyone scrolls to it. These start paused and
 * begin once they come into view.
 */
const deferred = document.querySelectorAll("video[data-play-in-view]");
if (deferred.length > 0 && !reduceMotion) {
  if (typeof IntersectionObserver === "undefined") {
    for (const clip of deferred) clip.play().catch(() => {});
  } else {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) entry.target.play().catch(() => {});
          else entry.target.pause();
        }
      },
      { threshold: 0.25 },
    );
    for (const clip of deferred) observer.observe(clip);
  }
}

/**
 * Click-to-play YouTube facades.
 *
 * Nothing is requested from YouTube until the visitor actually clicks: the
 * poster frames are served from this repo, so a page with twenty videos costs
 * twenty local JPEGs instead of twenty iframes.
 */
document.addEventListener("click", (event) => {
  const facade = event.target.closest(".video[data-video-id]");
  if (!facade) return;

  const iframe = document.createElement("iframe");
  iframe.src =
    `https://www.youtube-nocookie.com/embed/${facade.dataset.videoId}` +
    "?autoplay=1&rel=0&modestbranding=1";
  iframe.title = facade.dataset.videoTitle || "YouTube video";
  iframe.allow =
    "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
  iframe.allowFullscreen = true;

  // The facade is a <button>, which may not contain an iframe: the player would
  // end up inside a control that keeps announcing itself and swallowing keys.
  // So the button is replaced rather than filled.
  const frame = document.createElement("div");
  frame.className = "video is-playing";
  frame.append(iframe);
  facade.replaceWith(frame);

  // The element that had focus is gone; without this a keyboard visitor lands
  // back at the top of the document.
  iframe.focus({ preventScroll: true });
});
