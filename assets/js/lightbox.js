/**
 * Gallery pictures open full size in a <dialog>. Each image is wrapped in a
 * button at runtime, so the keyboard reaches it; without JavaScript it stays
 * an ordinary picture, and the slider's two images are left alone.
 */
const pictures = [...document.querySelectorAll(".figure > img")].filter(
  (image) => !image.closest("[data-compare]"),
);

if (pictures.length > 0 && typeof HTMLDialogElement === "function") {
  const dialog = document.createElement("dialog");
  dialog.className = "lightbox";
  dialog.innerHTML =
    '<img alt="">' +
    '<p class="lightbox__caption"></p>' +
    '<button class="dialog-close" type="button" aria-label="Close" autofocus>' +
    '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button>';
  document.body.append(dialog);

  const large = dialog.querySelector("img");
  const caption = dialog.querySelector(".lightbox__caption");
  let opener = null;

  for (const image of pictures) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "figure__zoom";
    button.setAttribute("aria-label", `View larger: ${image.alt || "image"}`);
    image.replaceWith(button);
    button.append(image);

    button.addEventListener("click", () => {
      large.src = image.currentSrc || image.src;
      large.alt = image.alt;
      caption.textContent = image.closest("figure")?.querySelector("figcaption")?.textContent.trim() ?? "";
      opener = button;
      dialog.showModal();
    });
  }

  dialog.querySelector(".dialog-close").addEventListener("click", () => dialog.close());

  // Outside the picture the click lands on the dialog itself: that is the backdrop.
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });

  dialog.addEventListener("close", () => {
    large.removeAttribute("src");
    opener?.focus();
    opener = null;
  });
}
