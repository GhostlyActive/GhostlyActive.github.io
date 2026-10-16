const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Looping clips autoplay by default, which CSS alone cannot switch off — so a
 * visitor who asked for reduced motion gets a still frame and a play control.
 * A decorative clip inside a card gets the still frame only: the card is one
 * big link, so controls there could never be reached.
 */
if (reduceMotion) {
  for (const clip of document.querySelectorAll("video[autoplay], video[data-play-in-view]")) {
    clip.autoplay = false;
    clip.controls = !clip.hasAttribute("data-decorative");
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
 * Clips that run while the pointer rests on their card. Hover does not exist
 * on a touch screen, so those keep the still; the feature cards play in view
 * instead and are not touched here.
 */
const hoverClips = document.querySelectorAll("video[data-hover-play]");
if (hoverClips.length > 0 && !reduceMotion && window.matchMedia("(hover: hover)").matches) {
  for (const clip of hoverClips) {
    const card = clip.closest(".work-card") || clip.parentElement;

    clip.addEventListener("playing", () => clip.classList.add("is-playing"));

    card.addEventListener("pointerenter", () => {
      clip.play().catch(() => {});
    });

    card.addEventListener("pointerleave", () => {
      clip.pause();
      clip.classList.remove("is-playing");
      // Back to the start, so the next hover begins where the still does.
      clip.currentTime = 0;
    });
  }
}

/**
 * Click-to-play YouTube facades.
 *
 * Nothing is requested from YouTube until the visitor actually clicks: the
 * poster frames are served from this repo, so a page with twenty videos costs
 * twenty local JPEGs instead of twenty iframes.
 *
 * On a wide screen the player opens in a dialog rather than inside the card,
 * which is 350 px across on a desktop. On a phone the card is the full width
 * anyway, so there the facade is replaced in place.
 */
const wideScreen = window.matchMedia("(min-width: 62rem)");
let player = null;
let playerOpener = null;

function buildIframe(facade) {
  const iframe = document.createElement("iframe");
  iframe.src =
    `https://www.youtube-nocookie.com/embed/${facade.dataset.videoId}` +
    "?autoplay=1&rel=0&modestbranding=1";
  iframe.title = facade.dataset.videoTitle || "YouTube video";
  iframe.allow =
    "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
  iframe.allowFullscreen = true;
  return iframe;
}

function openInDialog(iframe, facade) {
  if (!player) {
    player = document.createElement("dialog");
    player.className = "player";
    player.innerHTML =
      '<div class="player__frame"></div>' +
      '<button class="dialog-close" type="button" aria-label="Close video" autofocus>' +
      '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button>';
    document.body.append(player);

    player.querySelector(".dialog-close").addEventListener("click", () => player.close());

    // Outside the frame the click lands on the dialog itself: that is the backdrop.
    player.addEventListener("click", (event) => {
      if (event.target === player) player.close();
    });

    // Closing the dialog does not stop the video; removing the iframe does.
    player.addEventListener("close", () => {
      player.querySelector(".player__frame").replaceChildren();
      playerOpener?.focus();
      playerOpener = null;
    });
  }

  player.querySelector(".player__frame").replaceChildren(iframe);
  playerOpener = facade;
  player.showModal();
}

document.addEventListener("click", (event) => {
  const facade = event.target.closest(".video[data-video-id]");
  if (!facade) return;

  const iframe = buildIframe(facade);

  if (wideScreen.matches && typeof HTMLDialogElement === "function") {
    openInDialog(iframe, facade);
    return;
  }

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
