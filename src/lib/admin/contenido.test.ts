import { describe, expect, it } from "vitest";
import {
  aTextoEditable,
  construirContenido,
  deducirDescriptor,
  desdeTextoEditable,
  esPendiente,
  leerDescriptor,
  type DescriptorSeccion,
} from "./contenido";

describe("leerDescriptor", () => {
  it("lee un descriptor normal", () => {
    const d = leerDescriptor({
      heading: { label: "Título", kind: "text" },
      body: { label: "Texto", kind: "textarea", help: "Una frase" },
    });

    expect(d.heading).toEqual({ label: "Título", kind: "text" });
    expect(d.body?.help).toBe("Una frase");
  });

  it("degrada una clase desconocida a texto en vez de romper la pantalla", () => {
    // `fields` es jsonb: nada impide que alguien escriba cualquier cosa
    // editando la fila a mano. Si eso reventara, la página quedaría sin
    // forma de editarse salvo por SQL.
    const d = leerDescriptor({ x: { label: "X", kind: "holograma" } });
    expect(d.x?.kind).toBe("text");
  });

  it("usa la clave como etiqueta cuando falta", () => {
    const d = leerDescriptor({ cta_label: { kind: "text" } });
    expect(d.cta_label?.label).toBe("cta_label");
  });

  it("lee recursivamente los campos de una lista de objetos", () => {
    const d = leerDescriptor({
      items: {
        label: "Servicios",
        kind: "list",
        of: { title: { label: "Título", kind: "text" } },
      },
    });
    expect(d.items?.of?.title?.label).toBe("Título");
  });

  it("no revienta con basura", () => {
    expect(leerDescriptor(null)).toEqual({});
    expect(leerDescriptor("texto")).toEqual({});
    expect(leerDescriptor([1, 2])).toEqual({});
  });
});

describe("deducirDescriptor", () => {
  it("deduce las clases del contenido cuando la sección no trae fields", () => {
    // Sin esto, una sección mal sembrada se vería como un formulario vacío
    // y su contenido quedaría inaccesible desde el panel.
    const d = deducirDescriptor({
      titulo: "Hola",
      precio: 3990,
      visible: true,
      marcas: ["Redragon", "Logitech"],
      items: [{ a: 1 }],
      largo: "x".repeat(120),
    });

    expect(d.titulo?.kind).toBe("text");
    expect(d.precio?.kind).toBe("number");
    expect(d.visible?.kind).toBe("boolean");
    expect(d.marcas?.kind).toBe("list");
    expect(d.items?.kind).toBe("json");
    expect(d.largo?.kind).toBe("textarea");
  });
});

describe("aTextoEditable / desdeTextoEditable", () => {
  it("las listas van una por línea y vuelven sin líneas vacías", () => {
    expect(aTextoEditable(["Redragon", "Logitech"], "list")).toBe("Redragon\nLogitech");

    const vuelta = desdeTextoEditable("  Redragon \n\n Logitech \n", "list");
    expect(vuelta.ok && vuelta.valor).toEqual(["Redragon", "Logitech"]);
  });

  it("los números vuelven como número, no como texto", () => {
    // Un "3990" entre comillas no falla en ninguna parte: simplemente deja
    // de compararse ni sumarse bien en el carrito y en los legales.
    const r = desdeTextoEditable("3.990", "number");
    expect(r.ok && r.valor).toBe(3990);
    expect(typeof (r.ok && r.valor)).toBe("number");
  });

  it("un número vacío es 0 y no NaN", () => {
    const r = desdeTextoEditable("   ", "number");
    expect(r.ok && r.valor).toBe(0);
  });

  it("rechaza un número inválido", () => {
    const r = desdeTextoEditable("mucho", "number");
    expect(r.ok).toBe(false);
  });

  it("el JSON inválido da un mensaje entendible, no el de JSON.parse", () => {
    const r = desdeTextoEditable('{"a": 1,}', "json");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/comas y comillas/);
  });

  it("el JSON válido hace ida y vuelta", () => {
    const original = [{ href: "/tienda", label: "Tienda" }];
    const texto = aTextoEditable(original, "json");
    const vuelta = desdeTextoEditable(texto, "json");
    expect(vuelta.ok && vuelta.valor).toEqual(original);
  });

  it("un objeto mal declarado se muestra como JSON, no como [object Object]", () => {
    // Pasa cuando alguien cambia el `kind` de un campo que ya tenía datos.
    // "[object Object]" además de inútil se guardaría tal cual.
    expect(aTextoEditable({ a: 1 }, "text")).toBe('{"a":1}');
  });

  it("un valor ausente se edita como vacío, no como 'undefined'", () => {
    expect(aTextoEditable(undefined, "text")).toBe("");
    expect(aTextoEditable(null, "text")).toBe("");
  });
});

describe("construirContenido", () => {
  const descriptor: DescriptorSeccion = {
    heading: { label: "Título", kind: "text" },
    monto: { label: "Monto", kind: "number" },
    visible: { label: "Visible", kind: "boolean" },
    items: { label: "Items", kind: "list", of: { title: { label: "T", kind: "text" } } },
  };

  it("arma el contenido completo mezclando textos y valores crudos", () => {
    const r = construirContenido(
      descriptor,
      { heading: "Hola", monto: "1.990" },
      { visible: true, items: [{ title: "Uno" }] },
    );

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.contenido).toEqual({
      heading: "Hola",
      monto: 1990,
      visible: true,
      items: [{ title: "Uno" }],
    });
  });

  it("devuelve TODOS los errores, no solo el primero", () => {
    // Arreglar uno y que recién ahí aparezca el otro es la forma más rápida
    // de perderle la paciencia a un formulario.
    const r = construirContenido(
      { a: { label: "A", kind: "number" }, b: { label: "B", kind: "json" } },
      { a: "no", b: "{{" },
      {},
    );

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(Object.keys(r.errores).sort()).toEqual(["a", "b"]);
  });

  it("da valores por defecto sensatos a lo que no llegó", () => {
    const r = construirContenido(descriptor, {}, {});
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.contenido.visible).toBe(false);
    expect(r.contenido.items).toEqual([]);
    expect(r.contenido.monto).toBe(0);
  });
});

describe("esPendiente", () => {
  it("reconoce los placeholders del handoff", () => {
    // Los corchetes son un seguro deliberado: un dato legal sin completar
    // tiene que verse a la legua antes de salir a producción.
    expect(esPendiente("[ razón social pendiente ]")).toBe(true);
    expect(esPendiente("  [ rut pendiente ]")).toBe(true);
    expect(esPendiente("Sálvame el PC SpA")).toBe(false);
    expect(esPendiente(3990)).toBe(false);
  });
});
