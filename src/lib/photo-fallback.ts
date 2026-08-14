/**
 * Fallback de fotos rotas (comportamiento del handoff): si una imagen con
 * data-photo-fallback no carga, se oculta y queda visible el placeholder
 * rayado con su caption mono.
 *
 * Se hace por delegación (evento `error` en fase de captura, porque no
 * burbujea) en vez de `onerror` inline, para no poner handlers en el HTML.
 * El barrido en astro:page-load cubre las imágenes que fallaron antes de
 * que este módulo cargara o que llegaron con un swap del ClientRouter.
 */

function hideBrokenImage(img: HTMLImageElement): void {
  img.style.display = "none";
}

document.addEventListener(
  "error",
  (event) => {
    const target = event.target;
    if (target instanceof HTMLImageElement && target.hasAttribute("data-photo-fallback")) {
      hideBrokenImage(target);
    }
  },
  true,
);

function sweepBrokenImages(): void {
  for (const img of document.querySelectorAll<HTMLImageElement>("img[data-photo-fallback]")) {
    if (img.complete && img.naturalWidth === 0) {
      hideBrokenImage(img);
    }
  }
}

document.addEventListener("astro:page-load", sweepBrokenImages);
