/**
 * ─────────────────────────────────────────────────────────────────────────
 * FILTROS DEL CATÁLOGO (categoría / marca / orden)
 * ─────────────────────────────────────────────────────────────────────────
 *
 * El sitio es estático: las 12 cards se renderizan en build y acá se
 * muestran, ocultan y reordenan según los query params (?cat=&marca=&orden=).
 *
 * Vive en un módulo del layout, y no en un <script> dentro de tienda.astro,
 * por la transición de vista. Al venir desde un tile de categoría de la
 * portada, la foto tiene que volar hasta la card de ese producto — pero el
 * navegador captura la posición de destino en el momento del swap, y para
 * entonces el script de la página nueva todavía no corrió. El resultado era
 * que la card destino quedaba en su posición SIN filtrar (para GPU, a 1400 px
 * de scroll, fuera de pantalla) y la foto volaba hacia la nada.
 *
 * Estando en el layout, el módulo ya está cargado cuando se dispara
 * `astro:before-swap` y puede filtrar el documento entrante ANTES de que se
 * capture. Así la card destino ya está en su posición final y la foto aterriza
 * donde corresponde.
 */

const ORDENES = ["rel", "menor", "mayor"] as const;
type Orden = (typeof ORDENES)[number];

interface CatalogState {
  cat: string;
  marcas: string[];
  orden: Orden;
}

function isOrden(value: string | null): value is Orden {
  return value !== null && (ORDENES as readonly string[]).includes(value);
}

/**
 * Las categorías con tilde ("Audífonos") viajan percent-encoded en la URL.
 * Al decodificarlas pueden volver en una forma Unicode distinta a la del
 * HTML (í precompuesta vs. i + acento combinante): son cadenas que se ven
 * idénticas pero que === da por diferentes. Normalizar ambos lados a NFC
 * evita que el filtro devuelva cero productos por esa diferencia invisible.
 */
function norm(value: string): string {
  return value.normalize("NFC");
}

function readState(search: string): CatalogState {
  const params = new URLSearchParams(search);
  const orden = params.get("orden");
  return {
    cat: norm(params.get("cat") ?? "Todos"),
    marcas: params.getAll("marca").map(norm),
    orden: isOrden(orden) ? orden : "rel",
  };
}

/**
 * Pinta el estado sobre un documento: el vivo o el que está por entrar.
 * Es idempotente — se llama tanto antes del swap como al cargar la página.
 */
function applyFilter(root: ParentNode, state: CatalogState): void {
  const catalog = root.querySelector<HTMLElement>("[data-catalog]");
  if (!catalog) return;

  let visible = 0;
  for (const item of catalog.querySelectorAll<HTMLElement>("[data-item]")) {
    const matches =
      (state.cat === "Todos" || norm(item.dataset.cat ?? "") === state.cat) &&
      (state.marcas.length === 0 || state.marcas.includes(norm(item.dataset.marca ?? "")));
    item.hidden = !matches;
    if (matches) visible += 1;

    /* El orden se resuelve con la propiedad CSS `order`: no se toca el DOM. */
    const price = Number(item.dataset.precio);
    item.style.order =
      state.orden === "menor" ? String(price) : state.orden === "mayor" ? String(-price) : "";
  }

  for (const button of catalog.querySelectorAll<HTMLElement>("[data-filter-cat]")) {
    button.toggleAttribute("data-active", norm(button.dataset.filterCat ?? "") === state.cat);
  }

  for (const button of catalog.querySelectorAll<HTMLElement>("[data-filter-marca]")) {
    const active = state.marcas.includes(norm(button.dataset.filterMarca ?? ""));
    button.setAttribute("aria-pressed", String(active));
    const mark = button.querySelector("[data-marca-mark]");
    if (mark) mark.textContent = active ? "■" : "□";
  }

  const select = catalog.querySelector<HTMLSelectElement>("[data-filter-orden]");
  if (select) select.value = state.orden;

  const title = catalog.querySelector<HTMLElement>("[data-catalog-title]");
  if (title) title.textContent = state.cat === "Todos" ? "Catálogo" : state.cat;

  const count = catalog.querySelector<HTMLElement>("[data-catalog-count]");
  if (count) count.textContent = String(visible).padStart(2, "0");
}

function syncUrl(state: CatalogState): void {
  const next = new URLSearchParams();
  if (state.cat !== "Todos") next.set("cat", state.cat);
  for (const marca of state.marcas) next.append("marca", marca);
  if (state.orden !== "rel") next.set("orden", state.orden);
  const query = next.toString();
  history.replaceState(null, "", query ? `?${query}` : window.location.pathname);
}

/** Conecta los controles del catálogo ya montado en la página. */
function initCatalog(): void {
  const catalog = document.querySelector<HTMLElement>("[data-catalog]");
  if (!catalog) return;

  const state = readState(window.location.search);
  applyFilter(document, state);

  const update = (): void => {
    syncUrl(state);
    applyFilter(document, state);
  };

  for (const button of catalog.querySelectorAll<HTMLElement>("[data-filter-cat]")) {
    button.addEventListener("click", () => {
      state.cat = norm(button.dataset.filterCat ?? "Todos");
      update();
    });
  }

  for (const button of catalog.querySelectorAll<HTMLElement>("[data-filter-marca]")) {
    button.addEventListener("click", () => {
      const marca = norm(button.dataset.filterMarca ?? "");
      state.marcas = state.marcas.includes(marca)
        ? state.marcas.filter((m) => m !== marca)
        : [...state.marcas, marca];
      update();
    });
  }

  const select = catalog.querySelector<HTMLSelectElement>("[data-filter-orden]");
  select?.addEventListener("change", () => {
    state.orden = isOrden(select.value) ? select.value : "rel";
    update();
  });
}

/* Filtra el documento entrante antes de que la transición lo capture. */
document.addEventListener("astro:before-swap", (event) => {
  const { newDocument, to } = event as Event & { newDocument: Document; to: URL };
  applyFilter(newDocument, readState(to.search));
});

document.addEventListener("astro:page-load", initCatalog);
