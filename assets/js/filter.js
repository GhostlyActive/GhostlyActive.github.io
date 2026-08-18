/**
 * Topic filter for the card grids.
 *
 * The chips are built here rather than written into the markup, so the counts
 * cannot drift from the cards and a visitor without JavaScript simply gets the
 * full grid instead of controls that do nothing.
 */
const FADE_MS = 220;

function readTopics(element) {
  return (element.dataset.topics || "")
    .split("|")
    .map((topic) => topic.trim())
    .filter(Boolean);
}

function buildBar(bar) {
  const grid = document.querySelector(bar.dataset.filter);
  if (!grid) return;

  const cards = [...grid.children].filter((card) => card.dataset.topics);
  if (cards.length === 0) return;

  const label = bar.dataset.filterLabel || "projects";
  const topics = readTopics(bar).filter((topic) =>
    cards.some((card) => readTopics(card).includes(topic)),
  );

  bar.setAttribute("role", "group");
  bar.setAttribute("aria-label", `Filter ${label} by topic`);

  const status = document.createElement("p");
  status.className = "visually-hidden";
  status.setAttribute("role", "status");

  const chips = [null, ...topics].map((topic) => {
    const matching = topic === null ? cards : cards.filter((card) => readTopics(card).includes(topic));

    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "filter__chip";
    chip.setAttribute("aria-pressed", String(topic === null));
    chip.append(topic === null ? "All" : topic);

    const count = document.createElement("span");
    count.className = "filter__count";
    count.textContent = String(matching.length);
    chip.append(count);

    chip.addEventListener("click", () => apply(topic));
    bar.append(chip);

    return { chip, topic, matching };
  });

  let pending = 0;

  function apply(selected) {
    for (const { chip, topic, matching } of chips) {
      const active = topic === selected;
      chip.setAttribute("aria-pressed", String(active));
      if (active) status.textContent = `${matching.length} of ${cards.length} ${label} shown.`;
    }

    const leaving = [];
    for (const card of cards) {
      if (selected === null || readTopics(card).includes(selected)) {
        card.hidden = false;
        card.classList.remove("is-leaving");
      } else if (!card.hidden) {
        card.classList.add("is-leaving");
        leaving.push(card);
      }
    }

    // The outgoing cards fade before the grid reflows, so the ones that stay
    // move once instead of jumping while their neighbours are still visible.
    clearTimeout(pending);
    pending = setTimeout(() => {
      for (const card of leaving) card.hidden = true;
    }, FADE_MS);
  }

  bar.append(status);
  bar.dataset.ready = "";
}

function buildAll() {
  for (const card of document.querySelectorAll(".work-card, .reel-card")) {
    card.hidden = false;
    card.classList.remove("is-leaving");
  }

  for (const bar of document.querySelectorAll(".filter[data-filter]")) {
    bar.replaceChildren();
    delete bar.dataset.ready;
    buildBar(bar);
  }
}

buildAll();

// extra.js appends cards long after this script has run, so the chips and their
// counts are rebuilt from whatever the grid holds at that moment.
document.addEventListener("cards:changed", buildAll);
