import { useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useStore } from "@nanostores/react";
import { $cart, $cartShipping, $cartSubtotal } from "@/lib/cart-store";
import { CHILE_REGIONS, communesOf } from "@/lib/chile-geo";
import {
  ADDRESS_FIELDS,
  CHECKOUT_FIELDS,
  EMPTY_CHECKOUT_FORM,
  shippingForMethod,
  toCheckoutPayload,
  validateCheckout,
  validateField,
  type CheckoutErrors,
  type CheckoutField,
  type CheckoutForm,
  type DeliveryMethod,
} from "@/lib/checkout-form";
import type { ClassValue } from "clsx";
import { cn } from "@/lib/cn";
import { formatCLP } from "@/lib/format";
import { formatPhone, formatRut } from "@/lib/validation";

/**
 * Checkout de despacho (paso 01) con salida a TUU (paso 02).
 *
 * El submit hace POST a /api/checkout con los ids del carrito y los datos ya
 * normalizados, y redirige a la URL que devuelve la pasarela. Los PRECIOS no
 * se mandan: el servidor los relee del catálogo y recalcula el total. Este
 * componente muestra un total, pero el que se cobra es el del servidor.
 *
 * El carrito NO se vacía acá. Se vacía en /pago/exito cuando el callback
 * firmado de TUU confirmó el pago: si se vaciara al redirigir, quien cancele
 * o a quien le rechacen la tarjeta vuelve a un carrito vacío.
 *
 * La validación vive en @/lib/checkout-form (reglas y mensajes) y en
 * @/lib/validation (RUT módulo 11, teléfono chileno). Acá solo queda el
 * *cuándo* se valida, que es una decisión de interacción:
 *
 *   - Al escribir NO se muestra error nuevo (molesta corregir a alguien que
 *     todavía no termina de escribir), pero sí se limpia el que ya estaba:
 *     el usuario ve que lo arregló en el momento.
 *   - Al salir del campo (blur) se valida y se muestra el error.
 *   - Al enviar se valida todo y se enfoca el primer campo con problema.
 */

interface DeliveryOption {
  readonly value: DeliveryMethod;
  readonly title: string;
  readonly description: string;
}

/** Las dos formas de recibir el pedido, en el orden en que se muestran. */
const DELIVERY_OPTIONS: readonly DeliveryOption[] = [
  {
    value: "despacho",
    title: "Despacho a domicilio",
    description: "Lo llevamos a tu dirección. Te pedimos región, comuna y calle.",
  },
  {
    value: "acordar",
    title: "Acordar entrega",
    description: "Coordinamos contigo el punto y la hora. Sin costo de envío.",
  },
];

/** Formateadores que corren mientras el usuario escribe, por campo. */
const LIVE_FORMATTERS: Partial<Record<CheckoutField, (value: string) => string>> = {
  rut: formatRut,
  telefono: formatPhone,
};

export default function CheckoutView() {
  const lines = useStore($cart);
  const subtotal = useStore($cartSubtotal);
  const cartShipping = useStore($cartShipping);

  // `enviando` cubre desde el clic hasta que el navegador se va a la
  // pasarela. Bloquea el botón: sin eso, un doble clic abre DOS intentos de
  // pago con referencias distintas y el comprador puede pagar dos veces.
  const [enviando, setEnviando] = useState(false);
  const [errorPago, setErrorPago] = useState<string | null>(null);
  const [form, setForm] = useState<CheckoutForm>(EMPTY_CHECKOUT_FORM);
  const [errors, setErrors] = useState<CheckoutErrors>({});

  const isDespacho = form.entrega === "despacho";
  // El total se recalcula acá y no se lee de $cartTotal porque depende de la
  // forma de entrega, que es estado de este formulario y no del carrito.
  const shipping = shippingForMethod(form.entrega, cartShipping);
  const total = subtotal + shipping;

  /** Referencias a los controles, para poder enfocar el primero inválido. */
  const fieldRefs = useRef<Partial<Record<CheckoutField, HTMLElement | null>>>({});

  /** Comunas de la región elegida. Vacío mientras no haya región. */
  const communes = useMemo(() => communesOf(form.region), [form.region]);

  function setField(field: CheckoutField, rawValue: string): void {
    const value = LIVE_FORMATTERS[field]?.(rawValue) ?? rawValue;

    // Cambiar de región invalida la comuna: "Providencia" no existe en
    // Magallanes, así que se limpia en vez de dejar un dato imposible.
    const next: CheckoutForm =
      field === "region" ? { ...form, region: value, comuna: "" } : { ...form, [field]: value };

    setForm(next);

    // Se revalida contra `next` para que el error se limpie apenas el valor
    // pasa a ser correcto, sin esperar al blur.
    setErrors((previous) => {
      const updated = { ...previous };
      if (validateField(field, next) === undefined) delete updated[field];
      if (field === "region") delete updated.comuna;
      return updated;
    });
  }

  function setDeliveryMethod(method: DeliveryMethod): void {
    const next: CheckoutForm = { ...form, entrega: method };
    setForm(next);

    // Pasar a "acordar" apaga los errores de dirección: esos campos dejan de
    // pedirse, así que un error suyo quedaría colgado señalando la nada.
    setErrors((previous) => {
      const updated = { ...previous };
      for (const field of ADDRESS_FIELDS) {
        if (validateField(field, next) === undefined) delete updated[field];
      }
      return updated;
    });
  }

  function handleBlur(field: CheckoutField): void {
    setErrors((previous) => {
      const message = validateField(field, form);
      const updated = { ...previous };
      if (message === undefined) delete updated[field];
      else updated[field] = message;
      return updated;
    });
  }

  async function iniciarPago(): Promise<void> {
    setEnviando(true);
    setErrorPago(null);

    try {
      const respuesta = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // Solo id y cantidad: el precio lo pone el servidor.
          items: lines.map((line) => ({ id: line.productId, quantity: line.quantity })),
          cliente: toCheckoutPayload(form),
        }),
      });

      const datos = (await respuesta.json()) as {
        redirectUrl?: string;
        reference?: string;
        error?: string;
      };

      if (!respuesta.ok || datos.redirectUrl === undefined) {
        setErrorPago(datos.error ?? "No pudimos iniciar el pago. Inténtalo nuevamente.");
        setEnviando(false);
        return;
      }

      // Guardada por si vuelve sin el ?ref en la URL: la página de resultado
      // la usa como respaldo para saber qué orden consultar.
      sessionStorage.setItem("salvameelpc:ultima-orden", datos.reference ?? "");

      // Redirección top-level, nunca un popup: los bloqueadores lo matan y el
      // comprador se queda mirando una pantalla que no pasa nada.
      window.location.href = datos.redirectUrl;
    } catch {
      setErrorPago("No pudimos conectar con la pasarela. Revisa tu conexión e inténtalo de nuevo.");
      setEnviando(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (enviando) return;

    const found = validateCheckout(form);
    setErrors(found);

    const firstInvalid = CHECKOUT_FIELDS.find((field) => found[field] !== undefined);
    if (firstInvalid !== undefined) {
      fieldRefs.current[firstInvalid]?.focus();
      return;
    }

    void iniciarPago();
  }

  /** Props comunes de cualquier control: estado de error, id y refs. */
  function controlProps(field: CheckoutField, extraClassName?: ClassValue) {
    const invalid = errors[field] !== undefined;

    return {
      id: `checkout-${field}`,
      name: field,
      value: form[field],
      "aria-invalid": invalid,
      "aria-describedby": invalid ? `checkout-${field}-error` : undefined,
      onBlur: () => handleBlur(field),
      className: cn("field", invalid && "border-coral bg-coral/5", extraClassName),
      ref: (node: HTMLElement | null) => {
        fieldRefs.current[field] = node;
      },
    };
  }

  const errorCount = Object.keys(errors).length;

  if (lines.length === 0 && !enviando) {
    return (
      <div className="px-5 pt-12 pb-18 sm:px-10">
        <h1 className="mb-8 text-[clamp(36px,5vw,64px)] font-extrabold tracking-[-.04em] uppercase">
          Checkout
        </h1>
        <div className="flex flex-col items-center gap-4.5 border border-line p-14 text-center">
          <p className="font-mono text-[13px] text-muted">[ carrito vacío ]</p>
          <p className="text-[22px] font-extrabold">No hay nada que pagar todavía.</p>
          <a href="/tienda" className="btn-primary px-7 py-3.5">
            Ir al catálogo →
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="px-5 pt-12 pb-18 sm:px-10">
      <h1 className="mb-2 text-[clamp(36px,5vw,64px)] font-extrabold tracking-[-.04em] uppercase">
        Checkout
      </h1>
      <p className="mb-8 font-mono text-xs text-muted">01 entrega → 02 pago seguro con tuu</p>

      {/* noValidate: los mensajes del navegador (en inglés y sin estilo) se
          reemplazan por los nuestros, que además son específicos por regla. */}
      <form
        noValidate
        onSubmit={handleSubmit}
        className="grid grid-cols-1 items-start gap-8 lg:grid-cols-[1.5fr_1fr]"
      >
        <div className="flex flex-col gap-7">
          {/* La forma de entrega va primero: define si más abajo se pide
              dirección o no. El fieldset + legend ya agrupa los radios para
              lectores de pantalla, sin necesidad de un role extra. */}
          <fieldset className="m-0 flex flex-col gap-3.5 border border-line p-6">
            <legend className="px-2 font-mono text-[11px] tracking-[.14em] uppercase">
              Cómo lo recibes
            </legend>
            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
              {DELIVERY_OPTIONS.map((option, index) => {
                const selected = form.entrega === option.value;

                return (
                  <label
                    key={option.value}
                    data-testid={`entrega-${option.value}`}
                    className={cn(
                      "flex cursor-pointer flex-col gap-2 border p-4.5 transition-colors",
                      "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-coral",
                      selected ? "border-coral bg-coral/8" : "border-line hover:bg-ink/4",
                    )}
                  >
                    <span className="flex items-center gap-2.5">
                      <input
                        type="radio"
                        name="entrega"
                        value={option.value}
                        checked={selected}
                        className="sr-only"
                        ref={
                          index === 0
                            ? (node) => {
                                fieldRefs.current.entrega = node;
                              }
                            : undefined
                        }
                        onChange={() => setDeliveryMethod(option.value)}
                      />
                      {/* Radio dibujado a mano: el nativo no acepta el
                          cuadrado sin radio del design system. */}
                      <span
                        aria-hidden="true"
                        className={cn(
                          "grid size-4 shrink-0 place-items-center border",
                          selected ? "border-coral" : "border-line",
                        )}
                      >
                        {selected && <span className="size-2 bg-coral" />}
                      </span>
                      <span className="text-[15px] font-extrabold">{option.title}</span>
                    </span>
                    <span className="text-[13px] leading-snug text-ink/65">
                      {option.description}
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          <fieldset className="m-0 flex flex-col gap-3.5 border border-line p-6">
            <legend className="px-2 font-mono text-[11px] tracking-[.14em] uppercase">
              Contacto
            </legend>
            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
              <FieldShell field="nombre" label="Nombre y apellido" error={errors.nombre}>
                <input
                  {...controlProps("nombre")}
                  type="text"
                  autoComplete="name"
                  maxLength={80}
                  placeholder="Nombre y apellido"
                  onChange={(event) => setField("nombre", event.target.value)}
                />
              </FieldShell>

              <FieldShell field="rut" label="RUT" error={errors.rut}>
                <input
                  {...controlProps("rut")}
                  type="text"
                  inputMode="text"
                  autoComplete="off"
                  maxLength={12}
                  placeholder="RUT (12.345.678-9)"
                  onChange={(event) => setField("rut", event.target.value)}
                />
              </FieldShell>

              <FieldShell field="correo" label="Correo electrónico" error={errors.correo}>
                <input
                  {...controlProps("correo")}
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  maxLength={254}
                  placeholder="Correo electrónico"
                  onChange={(event) => setField("correo", event.target.value)}
                />
              </FieldShell>

              {/* El "+56" va impreso al lado del campo, no dentro: así el
                  usuario nunca pelea con un prefijo que se autocompleta. */}
              <FieldShell
                field="telefono"
                label="Teléfono, sin el código de país +56"
                error={errors.telefono}
              >
                <div
                  className={cn(
                    "flex items-center gap-1.5",
                    controlProps("telefono").className,
                    "py-0 pr-0",
                  )}
                >
                  <span aria-hidden="true" className="font-mono text-[13px] text-muted select-none">
                    +56
                  </span>
                  <input
                    {...controlProps("telefono")}
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    maxLength={14}
                    placeholder="9 5724 3741"
                    className="w-full border-0 bg-transparent py-3.25 text-sm outline-offset-0"
                    onChange={(event) => setField("telefono", event.target.value)}
                  />
                </div>
              </FieldShell>
            </div>
          </fieldset>

          {isDespacho ? (
            <fieldset className="m-0 flex flex-col gap-3.5 border border-line p-6">
              <legend className="px-2 font-mono text-[11px] tracking-[.14em] uppercase">
                Dirección de despacho
              </legend>

              {/* Región primero: la comuna depende de ella. */}
              <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                <FieldShell field="region" label="Región" error={errors.region}>
                  <select
                    {...controlProps("region")}
                    autoComplete="address-level1"
                    onChange={(event) => setField("region", event.target.value)}
                  >
                    <option value="" disabled>
                      Región
                    </option>
                    {CHILE_REGIONS.map((region) => (
                      <option key={region.name} value={region.name}>
                        {region.name}
                      </option>
                    ))}
                  </select>
                </FieldShell>

                <FieldShell
                  field="comuna"
                  label="Comuna"
                  error={errors.comuna}
                  hint={form.region === "" ? "Elige primero tu región" : undefined}
                >
                  <select
                    {...controlProps(
                      "comuna",
                      communes.length === 0 && "cursor-not-allowed opacity-45",
                    )}
                    autoComplete="address-level2"
                    disabled={communes.length === 0}
                    onChange={(event) => setField("comuna", event.target.value)}
                  >
                    <option value="" disabled>
                      {form.region === "" ? "Comuna (elige región)" : "Comuna"}
                    </option>
                    {communes.map((commune) => (
                      <option key={commune} value={commune}>
                        {commune}
                      </option>
                    ))}
                  </select>
                </FieldShell>
              </div>

              <FieldShell field="calle" label="Calle y número" error={errors.calle}>
                <input
                  {...controlProps("calle")}
                  type="text"
                  autoComplete="address-line1"
                  maxLength={120}
                  placeholder="Calle y número"
                  onChange={(event) => setField("calle", event.target.value)}
                />
              </FieldShell>

              <FieldShell
                field="referencia"
                label="Depto / oficina / referencia (opcional)"
                error={errors.referencia}
              >
                <input
                  {...controlProps("referencia")}
                  type="text"
                  autoComplete="address-line2"
                  maxLength={120}
                  placeholder="Depto / oficina / referencia (opcional)"
                  onChange={(event) => setField("referencia", event.target.value)}
                />
              </FieldShell>
            </fieldset>
          ) : (
            <div
              data-testid="acordar-entrega-nota"
              className="flex flex-col gap-2 border border-line p-6"
            >
              <p className="font-mono text-[11px] tracking-[.14em] text-muted uppercase">
                Acordamos la entrega
              </p>
              <p className="text-[15px] font-extrabold">
                Te escribimos para coordinar punto y hora.
              </p>
              <p className="text-[13px] leading-relaxed text-ink/65">
                Apenas confirmemos el pago te contactamos al teléfono que dejaste arriba para
                acordar dónde y cuándo entregarte el pedido. No necesitas dejar una dirección.
              </p>
            </div>
          )}
        </div>

        <aside className="sticky top-22 flex flex-col gap-3.5 border border-line p-7">
          <p className="font-mono text-[11px] tracking-[.14em] text-muted uppercase">Tu pedido</p>

          {lines.map((line) => (
            <div
              key={line.productId}
              className="flex justify-between gap-3 border-b border-line-soft pb-2.5 text-[13px]"
            >
              <span className="font-semibold">
                {line.name} <span className="font-mono text-muted">×{line.quantity}</span>
              </span>
              <span className="font-mono font-bold whitespace-nowrap">
                {formatCLP(line.priceCLP * line.quantity)}
              </span>
            </div>
          ))}

          <div className="flex justify-between gap-3 text-sm">
            <span>{isDespacho ? "Envío" : "Entrega"}</span>
            <span data-testid="checkout-shipping" className="font-mono font-bold">
              {!isDespacho ? "A convenir" : shipping === 0 ? "Gratis" : formatCLP(shipping)}
            </span>
          </div>

          <div className="flex justify-between border-t border-line pt-3.5 text-[17px] font-extrabold">
            <span>Total</span>
            <span data-testid="checkout-total" className="font-mono">
              {formatCLP(total)}
            </span>
          </div>

          <button
            type="submit"
            disabled={enviando}
            aria-busy={enviando}
            data-testid="checkout-submit"
            className="btn-primary px-6 py-4 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {enviando ? "Conectando con TUU…" : "Pagar con TUU →"}
          </button>

          {/* Resumen del estado del formulario: quien usa lector de pantalla
              se entera de que el submit falló sin tener que recorrer campos. */}
          <p
            role="status"
            data-testid="checkout-form-status"
            className={cn(
              "text-center font-mono text-[11px]",
              errorCount > 0 || errorPago !== null ? "text-coral" : "text-muted",
            )}
          >
            {errorPago ??
              (errorCount > 0
                ? `revisa ${errorCount} ${errorCount === 1 ? "campo" : "campos"} antes de pagar`
                : "serás redirigido a la pasarela de tuu para completar el pago")}
          </p>
        </aside>
      </form>

      {/* Cortina mientras se abre el intento de pago y el navegador se va a
          la pasarela. No lleva botón de cerrar a propósito: el intento ya
          está en curso y volver atrás desde acá solo lleva a pagar dos veces. */}
      {enviando && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Redirigiendo a la pasarela de pago"
          className="fixed inset-0 z-200 flex items-center justify-center bg-scrim/75 p-6"
        >
          <div className="flex max-w-110 flex-col items-center gap-4 border border-line bg-cream px-12 py-11 text-center">
            <p className="font-mono text-[11px] tracking-[.14em] text-coral uppercase">
              conectando con tuu…
            </p>
            <p className="text-2xl font-extrabold tracking-[-.02em]">
              Te estamos llevando a pagar {formatCLP(total)}
            </p>
            <p className="text-[13px] text-ink/65">
              No cierres ni recargues esta ventana. En un momento se abre la pasarela.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

interface FieldShellProps {
  readonly field: CheckoutField;
  /** Etiqueta accesible: visualmente oculta, igual que en /contacto. */
  readonly label: string;
  readonly error: string | undefined;
  /** Texto de ayuda que se muestra cuando no hay error. */
  readonly hint?: string | undefined;
  readonly children: ReactNode;
}

/**
 * Envuelve un control con su label accesible y su mensaje de error.
 *
 * Existe para que los ocho campos no repitan ocho veces la misma estructura
 * de label + control + error, que es justo donde se cuelan los `htmlFor` que
 * no apuntan a nada y los errores sin `role="alert"`.
 */
function FieldShell({ field, label, error, hint, children }: FieldShellProps) {
  const id = `checkout-${field}`;

  return (
    <div className="flex flex-col gap-1.5">
      <label className="sr-only" htmlFor={id}>
        {label}
      </label>
      {children}
      {error !== undefined ? (
        <p
          id={`${id}-error`}
          role="alert"
          data-testid={`error-${field}`}
          className="font-mono text-[11px] leading-snug text-coral"
        >
          {error}
        </p>
      ) : (
        hint !== undefined && (
          <p className="font-mono text-[11px] leading-snug text-muted">{hint}</p>
        )
      )}
    </div>
  );
}
