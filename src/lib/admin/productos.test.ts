import { describe, expect, it } from "vitest";
import {
  FORMULARIO_VACIO,
  aFormulario,
  mensajeDeErrorSupabase,
  parseCLP,
  slugify,
  validarProducto,
  type FormularioProducto,
  type ProductoAdmin,
} from "./productos";

/** Formulario válido mínimo, para partir de algo que SÍ pasa. */
function formulario(cambios: Partial<FormularioProducto> = {}): FormularioProducto {
  return {
    ...FORMULARIO_VACIO,
    name: "Mouse Redragon Cobra M711",
    brand: "Redragon",
    category: "Mouse",
    price_clp: "19990",
    ...cambios,
  };
}

describe("slugify", () => {
  it("quita tildes en vez de comerse la vocal", () => {
    // Sin normalizar a NFD, "Audífonos" daría "audfonos": la í es un solo
    // carácter que el filtro de [a-z0-9] se lleva entero.
    expect(slugify("Audífonos HyperX")).toBe("audifonos-hyperx");
    expect(slugify("Teclado Ñandú")).toBe("teclado-nandu");
  });

  it("colapsa separadores y no deja guiones sueltos en los bordes", () => {
    expect(slugify("  RAM  16GB / DDR5  ")).toBe("ram-16gb-ddr5");
    expect(slugify("¡Oferta!")).toBe("oferta");
  });

  it("devuelve vacío cuando no queda nada utilizable", () => {
    expect(slugify("¿?¡!")).toBe("");
  });
});

describe("parseCLP", () => {
  it("acepta el formato en que una persona escribe pesos", () => {
    expect(parseCLP("19990")).toBe(19990);
    expect(parseCLP("19.990")).toBe(19990);
    expect(parseCLP("$ 19.990")).toBe(19990);
  });

  it("rechaza lo que no es un entero válido en vez de devolver NaN", () => {
    // Un NaN silencioso terminaría guardado como precio del producto.
    expect(parseCLP("")).toBeNull();
    expect(parseCLP("abc")).toBeNull();
    expect(parseCLP("-100")).toBeNull();
    expect(parseCLP("19,5")).toBeNull();
  });
});

describe("validarProducto", () => {
  it("acepta un producto mínimo y normaliza lo que corresponde", () => {
    const resultado = validarProducto(
      formulario({ name: "  Mouse Nuevo  ", brand: " Logitech ", price_clp: "44.990" }),
    );

    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.valores.name).toBe("Mouse Nuevo");
    expect(resultado.valores.brand).toBe("Logitech");
    expect(resultado.valores.price_clp).toBe(44990);
    // El slug se deriva solo: quien carga un producto no piensa en URLs.
    expect(resultado.valores.slug).toBe("mouse-nuevo");
  });

  it("respeta el slug escrito a mano, pero lo normaliza", () => {
    const resultado = validarProducto(formulario({ slug: "Mouse ESPECIAL 2026" }));
    expect(resultado.ok && resultado.valores.slug).toBe("mouse-especial-2026");
  });

  it("exige nombre y marca", () => {
    const resultado = validarProducto(formulario({ name: "   ", brand: "" }));
    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.errores.name).toBeDefined();
    expect(resultado.errores.brand).toBeDefined();
  });

  it("rechaza un precio anterior que no sea MAYOR que el actual", () => {
    // Mismo criterio que getDiscountPercent y que el CHECK de la base: si no
    // es mayor, no es un descuento — es un dato roto que se vería como un
    // producto sin oferta.
    const igual = validarProducto(
      formulario({ price_clp: "19990", compare_at_price_clp: "19990" }),
    );
    expect(igual.ok).toBe(false);

    const menor = validarProducto(formulario({ price_clp: "19990", compare_at_price_clp: "9990" }));
    expect(menor.ok).toBe(false);
    if (menor.ok) return;
    expect(menor.errores.compare_at_price_clp).toMatch(/MAYOR/);

    const mayor = validarProducto(
      formulario({ price_clp: "19990", compare_at_price_clp: "24990" }),
    );
    expect(mayor.ok && mayor.valores.compare_at_price_clp).toBe(24990);
  });

  it("trata el precio anterior vacío como 'sin oferta', no como cero", () => {
    const resultado = validarProducto(formulario({ compare_at_price_clp: "   " }));
    expect(resultado.ok && resultado.valores.compare_at_price_clp).toBeNull();
  });

  it("rechaza una categoría fuera de la union de TypeScript", () => {
    const resultado = validarProducto(formulario({ category: "Sillas Gamer" }));
    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.errores.category).toBeDefined();
  });

  it("convierte las specs a lista ignorando líneas vacías", () => {
    const resultado = validarProducto(
      formulario({ specs: "Sensor 10.000 DPI\n\n  RGB 16.8M  \n\n" }),
    );
    expect(resultado.ok && resultado.valores.specs).toEqual(["Sensor 10.000 DPI", "RGB 16.8M"]);
  });

  it("guarda el caption vacío como null", () => {
    // null deja que el front use su texto por defecto "[ foto: nombre ]";
    // un "" pintaría un caption en blanco.
    const resultado = validarProducto(formulario({ photo_caption: "  " }));
    expect(resultado.ok && resultado.valores.photo_caption).toBeNull();
  });

  it("rechaza stock negativo", () => {
    const resultado = validarProducto(formulario({ stock: "-3" }));
    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.errores.stock).toBeDefined();
  });
});

describe("aFormulario", () => {
  it("hace ida y vuelta sin perder datos", () => {
    const producto: ProductoAdmin = {
      id: 1,
      slug: "mouse-redragon-cobra-m711",
      name: "Mouse Redragon Cobra M711",
      brand: "Redragon",
      category: "Mouse",
      price_clp: 19990,
      compare_at_price_clp: 24990,
      is_featured: true,
      photo_url: "https://ejemplo.cl/foto.jpg",
      photo_path: "productos/mouse.jpg",
      photo_caption: null,
      specs: ["Sensor 10.000 DPI", "RGB"],
      stock: 5,
      track_stock: true,
      is_published: true,
      sort_order: 10,
    };

    const resultado = validarProducto(aFormulario(producto));
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;

    const { id: _id, ...esperado } = producto;
    expect(resultado.valores).toEqual(esperado);
  });
});

describe("mensajeDeErrorSupabase", () => {
  it("traduce el slug duplicado", () => {
    expect(
      mensajeDeErrorSupabase('duplicate key value violates unique constraint "products_slug_key"'),
    ).toMatch(/Ya existe un producto/);
  });

  it("traduce el check del precio anterior", () => {
    expect(
      mensajeDeErrorSupabase('new row violates check constraint "products_compare_at_gt_price"'),
    ).toMatch(/mayor que el actual/);
  });

  it("traduce un fallo de permisos a algo accionable", () => {
    expect(mensajeDeErrorSupabase("new row violates row-level security policy")).toMatch(
      /sesión no tiene permiso/,
    );
  });

  it("deja pasar lo que no reconoce en vez de ocultarlo", () => {
    expect(mensajeDeErrorSupabase("connection terminated")).toBe("connection terminated");
  });
});
