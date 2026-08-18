/**
 * Unlisted videos, unlocked by the key in the URL fragment.
 *
 * The repository is public, so `assets/data/extra.enc` holds nothing but
 * AES-GCM ciphertext — no title, no video ID. The key travels in the fragment
 * (`#k=…`), which a browser never sends to a server and never puts in a
 * Referer header. Without it this file does nothing at all.
 *
 * Poster frames come straight from i.ytimg.com rather than this repository:
 * a file named after the video would give the ID away in the directory
 * listing. Only someone holding the key ever triggers those requests.
 */
const STORE_KEY = "ghostlyactive:extra-key";

function readKey() {
  const fragment = new URLSearchParams(location.hash.slice(1)).get("k");
  if (fragment) return fragment;
  try {
    return sessionStorage.getItem(STORE_KEY);
  } catch {
    return null;
  }
}

function decodeKey(text) {
  const padded = text.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

function buildCard(card) {
  const article = document.createElement("article");
  article.className = "reel-card reveal is-visible";
  article.dataset.topics = card.topics.join("|");
  article.dataset.extra = "";

  const poster = document.createElement("img");
  poster.src = `https://i.ytimg.com/vi/${card.id}/maxresdefault.jpg`;
  poster.alt = "";
  poster.width = 1280;
  poster.height = 720;
  poster.loading = "lazy";
  poster.decoding = "async";
  poster.referrerPolicy = "no-referrer";

  // Not every upload has a maxres frame, and YouTube answers those with a grey
  // 120x90 placeholder rather than a 404 — so onerror never fires and the size
  // is the only tell.
  poster.addEventListener("load", () => {
    if (poster.naturalWidth <= 200) poster.src = `https://i.ytimg.com/vi/${card.id}/hqdefault.jpg`;
  }, { once: true });

  const button = document.createElement("button");
  button.className = "video";
  button.type = "button";
  button.dataset.videoId = card.id;
  button.dataset.videoTitle = card.title;
  // Only the play icon is markup. The title goes in as text: interpolated into
  // HTML, a "<" in a title would be parsed as a tag and eat the rest of it.
  const play = document.createElement("span");
  play.className = "video__play";
  play.innerHTML = '<svg aria-hidden="true"><use href="#i-play"></use></svg>';

  const label = document.createElement("span");
  label.className = "visually-hidden";
  label.textContent = `Play video: ${card.title}`;

  button.append(poster, play, label);

  const body = document.createElement("div");
  body.className = "reel-card__body";

  const heading = document.createElement("h3");
  heading.textContent = card.title;
  body.append(heading);

  if (card.description) {
    const text = document.createElement("p");
    text.textContent = card.description;
    body.append(text);
  }

  const tags = document.createElement("ul");
  tags.className = "tag-row";
  card.tags.forEach((tag, index) => {
    const item = document.createElement("li");
    item.className = index === 0 ? "tag tag--cyan" : "tag";
    item.textContent = tag;
    tags.append(item);
  });
  body.append(tags);

  if (card.meta) {
    const meta = document.createElement("p");
    meta.className = "reel-card__meta";
    meta.textContent = card.meta;
    body.append(meta);
  }

  article.append(button, body);
  return article;
}

async function unlock() {
  const token = readKey();
  const grid = document.querySelector("#studio-grid");
  if (!token || !grid || !window.crypto?.subtle) return;
  if (document.documentElement.dataset.extra !== undefined) return;

  const response = await fetch("assets/data/extra.enc");
  if (!response.ok) return;

  const blob = Uint8Array.from(atob((await response.text()).trim()), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("raw", decodeKey(token), "AES-GCM", false, ["decrypt"]);

  // A wrong key fails the GCM tag check and throws — there is no partial result
  // to leak, so the catch is the whole of the access control.
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: blob.subarray(0, 12) },
    key,
    blob.subarray(12),
  );

  const { cards } = JSON.parse(new TextDecoder().decode(plain));
  grid.append(...cards.map(buildCard));

  try {
    sessionStorage.setItem(STORE_KEY, token);
  } catch {
    // Private mode: the key has to stay in the address bar.
  }

  document.documentElement.dataset.extra = "";
  document.dispatchEvent(new CustomEvent("cards:changed"));
}

function attempt() {
  const fromFragment = new URLSearchParams(location.hash.slice(1)).has("k");

  unlock().catch(() => {
    // A wrong key in the fragment is worth forgetting. A failure on a stored one
    // is not: navigating to #builds also fires this, and dropping the key there
    // would lock the visitor out of a reel they were already reading.
    if (!fromFragment) return;
    try {
      sessionStorage.removeItem(STORE_KEY);
    } catch {
      /* nothing to clean up */
    }
  });
}

attempt();

// Pasting the key onto a page that is already open only changes the fragment,
// which is not a navigation — nothing would run without this.
window.addEventListener("hashchange", attempt);
