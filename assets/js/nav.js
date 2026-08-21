/**
 * Where you are on the page, and the brand as a reset.
 *
 * The marker under the navigation follows the section you are reading. Only the
 * landing page carries those sections — on a project page the links point back
 * at index.html, nothing matches, and this file does nothing.
 */
(() => {
  const list = document.querySelector(".site-nav__links");
  const targets = [...document.querySelectorAll(".site-nav__links a")]
    .map((link) => {
      const id = (link.getAttribute("href") || "").split("#")[1];
      const section = id ? document.getElementById(id) : null;
      return section ? { link, section } : null;
    })
    .filter(Boolean);

  if (list && targets.length > 0) {
    const marker = document.createElement("li");
    marker.className = "site-nav__marker";
    marker.setAttribute("aria-hidden", "true");
    list.append(marker);

    let current = null;

    /** The line the section has to cross to count as the one being read. */
    function probe() {
      const nav = document.querySelector(".site-nav");
      return (nav ? nav.offsetHeight : 0) + window.innerHeight * 0.25;
    }

    function activeTarget() {
      // The last section can be shorter than the viewport, so it would never
      // reach the probe line. At the end of the document it always wins.
      const atEnd = window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2;
      if (atEnd) return targets[targets.length - 1];

      const line = probe();
      let found = null;
      for (const target of targets) {
        if (target.section.getBoundingClientRect().top <= line) found = target;
      }
      return found;
    }

    function paint(target) {
      for (const { link } of targets) {
        if (link === (target && target.link)) link.setAttribute("aria-current", "location");
        else link.removeAttribute("aria-current");
      }

      if (!target) {
        marker.style.opacity = "0";
        return;
      }

      marker.style.width = `${target.link.offsetWidth}px`;
      marker.style.transform = `translateX(${target.link.offsetLeft}px)`;
      marker.style.opacity = "1";
    }

    function update(force) {
      const target = activeTarget();
      if (target === current && !force) return;
      current = target;
      paint(target);
    }

    let ticking = false;
    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        update();
      });
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", () => update(true));
    update(true);

    // The brand behaves like a reload: back to the top, every filter cleared.
    const brand = document.querySelector(".site-nav__brand");
    if (brand) {
      brand.addEventListener("click", (event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

        event.preventDefault();
        document.dispatchEvent(new CustomEvent("filters:reset"));
        window.scrollTo({ top: 0, behavior: "instant" });

        // A section anchor is stale after this, but the reel key in the fragment
        // is what unlocked the page — that one stays.
        if (/^#(top|builds|studio|contact)$/.test(location.hash)) {
          history.replaceState(null, "", location.pathname + location.search);
        }

        update(true);
      });
    }
  }
})();
