import { expect, test } from "@playwright/test";
import { productoDeOtraCategoria, productoDePrueba } from "./helpers";

test.describe("Navegación del sitio", () => {
  test("la portada carga con el título y el hero", async ({ page }) => {
    await page.goto("/");

    await expect(page).toHaveTitle(/Sálvame el PC/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Hardware y periféricos");
  });

  test("se puede ir de la portada al catálogo", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("link", { name: "Ver catálogo →" }).first().click();

    await expect(page).toHaveURL(/\/tienda/);
    await expect(page.getByRole("heading", { level: 1, name: "Catálogo" })).toBeVisible();
  });

  test("se puede entrar a la ficha de un producto desde el catálogo", async ({ page }) => {
    const producto = await productoDePrueba(page);
    await page.goto("/tienda");

    await page.getByRole("link", { name: producto.nombre }).click();

    await expect(page.getByRole("heading", { level: 1 })).toHaveText(producto.nombre);
    // Las especificaciones son texto que carga el panel: no se comprueba
    // CUÁLES son, sino que la ficha las esté mostrando.
    await expect(page.locator("[data-specs] li").first()).toBeVisible();
  });

  test("el filtro de categoría llega por query param (tiles del bento)", async ({ page }) => {
    const producto = await productoDePrueba(page);
    const ajeno = await productoDeOtraCategoria(page, producto);

    await page.goto(`/tienda?cat=${encodeURIComponent(producto.categoria)}`);

    await expect(page.getByRole("heading", { level: 1, name: producto.categoria })).toBeVisible();
    await expect(page.getByRole("link", { name: producto.nombre })).toBeVisible();

    // Un producto de otra categoría queda oculto. Si el catálogo entero
    // fuera de una sola categoría no habría nada que esconder, y el test se
    // salta esa mitad en vez de inventar un producto que no existe.
    if (ajeno !== null) {
      await expect(page.getByRole("link", { name: ajeno.nombre })).toBeHidden();
    }
  });

  test("filtrar por categoría actualiza la URL y el contador", async ({ page }) => {
    await page.goto("/tienda");

    await page.getByRole("button", { name: "Teclados", exact: true }).click();

    await expect(page).toHaveURL(/cat=Teclados/);
    await expect(page.getByRole("heading", { level: 1, name: "Teclados" })).toBeVisible();
  });

  test("los tiles de categoría transicionan hacia su card en el catálogo", async ({ page }) => {
    // Cada tile muestra la foto de un producto y se lleva su
    // view-transition-name para que vuele hasta la card de ese producto. Si
    // el nombre no existiera en el catálogo, no habría con quién emparejar y
    // el efecto simplemente no ocurriría.
    //
    // Solo cuentan los tiles CON foto: una categoría sin productos
    // publicados —el cliente puede crearla antes de cargarlos— no tiene
    // ninguna foto que llevarse, y eso es correcto, no una regresión.
    await page.goto("/");
    const nombresDeTiles = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLAnchorElement>('a[href*="/tienda?cat="]')]
        .map((a) => a.querySelector("img"))
        .filter((img): img is HTMLImageElement => img !== null)
        .map((img) => getComputedStyle(img).viewTransitionName),
    );

    expect(nombresDeTiles.length).toBeGreaterThan(0);
    expect(nombresDeTiles.filter((n) => n === "none")).toEqual([]);

    await page.goto("/tienda");
    const nombresDelCatalogo = await page.evaluate(() =>
      [...document.querySelectorAll("*")].map((n) => getComputedStyle(n).viewTransitionName),
    );

    for (const nombre of nombresDeTiles) {
      expect(nombresDelCatalogo).toContain(nombre);
    }
  });

  test("no hay view-transition-name repetidos en la portada", async ({ page }) => {
    // Un nombre duplicado no rompe solo esa transición: el navegador aborta
    // la transición ENTERA de la página. Como falla en silencio, se cubre acá.
    await page.goto("/");

    const nombres = await page.evaluate(() =>
      [...document.querySelectorAll("*")]
        .map((n) => getComputedStyle(n).viewTransitionName)
        .filter((v) => v && v !== "none"),
    );

    expect(nombres).toEqual([...new Set(nombres)]);
  });

  test("cada tile del bento llega a su categoría, tilde incluida", async ({ page }) => {
    // "Audífonos" viaja percent-encoded en la URL y vuelve decodificada: si
    // la forma Unicode no coincidiera con la del HTML, el filtro devolvería
    // cero productos sin ningún error visible.
    //
    // Se recorren TODOS los tiles en vez de nombrar uno: las categorías se
    // administran desde el panel, y el día que alguien agregue "Audífonos
    // gamer" o "Sillas" el test tiene que cubrirla sola.
    await page.goto("/");
    const tiles = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLAnchorElement>('a[href*="/tienda?cat="]')].map((a) => ({
        href: a.getAttribute("href") ?? "",
        nombre: a.querySelector("span.text-lg")?.textContent?.trim() ?? "",
      })),
    );

    expect(tiles.length).toBeGreaterThan(0);

    for (const tile of tiles) {
      await page.goto(tile.href);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(tile.nombre);
    }
  });

  test("el velo de las fotos se levanta al pasar el cursor", async ({ page }) => {
    await page.goto("/");

    const conCursor = await page.evaluate(() => matchMedia("(hover: hover)").matches);
    // Un tile CON foto: los de categorías todavía sin productos no tienen
    // <img> al que aplicarle el velo.
    const tile = page
      .locator('a[href*="/tienda?cat="]')
      .filter({ has: page.locator("img") })
      .first();
    const filtro = () => tile.locator("img").evaluate((n) => getComputedStyle(n).filter);

    if (!conCursor) {
      // En táctil no hay hover, así que el velo no se aplica nunca: las fotos
      // de producto tienen que verse a color desde el principio.
      expect(await filtro()).toBe("none");
      return;
    }

    expect(await filtro()).toContain("grayscale");

    await tile.hover();

    // En los tiles del bento, el .group y el contenedor de la foto son el
    // mismo elemento; con un selector de descendiente solo, la foto se
    // quedaba en gris al pasar el cursor.
    await expect.poll(filtro).toBe("none");
  });

  test("la cinta de marcas no deja huecos al reiniciar el bucle", async ({ page }) => {
    // El bucle son dos copias con translateX(-50%), así que una copia tiene
    // que ser al menos tan ancha como la pantalla. Si alguien acorta la lista
    // de marcas, vuelve a aparecer el vacío — y solo se nota mirando.
    await page.goto("/");

    const { copia, pantalla } = await page.evaluate(() => {
      const track = document.querySelector(".marquee-track");
      const primera = track?.firstElementChild;
      return {
        copia: primera ? primera.getBoundingClientRect().width : 0,
        pantalla: window.innerWidth,
      };
    });

    expect(copia).toBeGreaterThanOrEqual(pantalla);
  });

  test("una URL inexistente muestra la página 404", async ({ page }) => {
    const response = await page.goto("/producto-que-no-existe");

    expect(response?.status()).toBe(404);
    await expect(page.getByText("[ error 404 ]")).toBeVisible();
  });

  test("el overlay clickeable de las tarjetas no se sale de su tarjeta", async ({ page }) => {
    // Regresión: el enlace del nombre usa `after:absolute after:inset-0` para
    // hacer clickeable toda la tarjeta. Si la tarjeta pierde `position:
    // relative`, ese overlay se estira hasta cubrir la página entera y
    // bloquea todos los demás links. Se verifica pidiéndole al navegador qué
    // elemento hay realmente en el centro del CTA del hero.
    await page.goto("/");

    const elementAtButtonCenter = await page.evaluate(() => {
      const button = [...document.querySelectorAll("a")].find(
        (anchor) => anchor.textContent?.trim() === "Ver catálogo →",
      );
      if (!button) return "no se encontró el botón";

      const rect = button.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return hit?.textContent?.trim() ?? "";
    });

    expect(elementAtButtonCenter).toBe("Ver catálogo →");
  });

  test("el enlace de salto al contenido funciona con teclado", async ({ page, browserName }) => {
    // WebKit/Safari no mueve el foco a los links con Tab por defecto
    // (preferencia del sistema): el test no aplica en ese engine.
    test.skip(browserName === "webkit", "Safari no tabula sobre links por defecto");

    await page.goto("/");

    await page.keyboard.press("Tab");
    const skipLink = page.getByRole("link", { name: "Saltar al contenido" });
    await expect(skipLink).toBeFocused();

    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/#contenido/);
  });
});
