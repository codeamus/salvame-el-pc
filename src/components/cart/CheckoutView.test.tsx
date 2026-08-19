import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import CheckoutView from "@/components/cart/CheckoutView";
import { addToCart, clearCart } from "@/lib/cart-store";
import { priceCLP, type Product } from "@/types/product";

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 1,
    slug: "mouse-redragon-cobra-m711",
    name: "Mouse Redragon Cobra M711",
    brand: "Redragon",
    category: "Mouse",
    priceCLP: priceCLP(19990),
    isFeatured: false,
    photo: "https://example.com/foto.jpg",
    photoCaption: "[ foto: mouse gamer rgb ]",
    specs: [],
    ...overrides,
  };
}

/** Llena el formulario con datos válidos. Recibe overrides para romper uno. */
async function fillForm(
  user: ReturnType<typeof userEvent.setup>,
  overrides: Partial<Record<string, string>> = {},
): Promise<void> {
  const values = {
    nombre: "Ana Soto",
    rut: "123456785",
    correo: "ana@gmail.com",
    telefono: "957243741",
    calle: "Av. Providencia 1234",
    ...overrides,
  };

  await user.type(screen.getByLabelText("Nombre y apellido"), values.nombre);
  await user.type(screen.getByLabelText("RUT"), values.rut);
  await user.type(screen.getByLabelText("Correo electrónico"), values.correo);
  await user.type(screen.getByLabelText(/^Teléfono/), values.telefono);
  await user.selectOptions(
    screen.getByLabelText("Región"),
    overrides.region ?? "Metropolitana de Santiago",
  );
  await user.selectOptions(screen.getByLabelText("Comuna"), overrides.comuna ?? "Providencia");
  await user.type(screen.getByLabelText("Calle y número"), values.calle);
}

beforeEach(() => {
  clearCart();
  addToCart(makeProduct());
});

describe("CheckoutView", () => {
  it("muestra el estado vacío cuando no hay nada en el carrito", () => {
    clearCart();
    render(<CheckoutView />);

    expect(screen.getByText("No hay nada que pagar todavía.")).toBeInTheDocument();
  });

  it("parte en despacho a domicilio, que es el caso más común", () => {
    render(<CheckoutView />);

    expect(screen.getByRole("radio", { name: /despacho a domicilio/i })).toBeChecked();
    expect(screen.getByRole("radio", { name: /acordar entrega/i })).not.toBeChecked();
    expect(screen.getByLabelText("Región")).toBeInTheDocument();
  });

  it("no deja pagar con el formulario vacío y muestra un error por campo", async () => {
    const user = userEvent.setup();
    render(<CheckoutView />);

    await user.click(screen.getByRole("button", { name: /pagar con mercado pago/i }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByTestId("error-nombre")).toBeInTheDocument();
    expect(screen.getByTestId("error-rut")).toBeInTheDocument();
    expect(screen.getByTestId("error-correo")).toBeInTheDocument();
    expect(screen.getByTestId("error-telefono")).toBeInTheDocument();
    expect(screen.getByTestId("error-region")).toBeInTheDocument();
    expect(screen.getByTestId("error-comuna")).toBeInTheDocument();
    expect(screen.getByTestId("error-calle")).toBeInTheDocument();
    expect(screen.getByTestId("checkout-form-status")).toHaveTextContent("revisa 7 campos");
  });

  it("enfoca el primer campo inválido al intentar pagar", async () => {
    const user = userEvent.setup();
    render(<CheckoutView />);

    await user.click(screen.getByRole("button", { name: /pagar con mercado pago/i }));

    expect(screen.getByLabelText("Nombre y apellido")).toHaveFocus();
  });

  describe("RUT", () => {
    it("formatea mientras se escribe", async () => {
      const user = userEvent.setup();
      render(<CheckoutView />);

      const rut = screen.getByLabelText("RUT");
      await user.type(rut, "123456785");

      expect(rut).toHaveValue("12.345.678-5");
    });

    it("rechaza un dígito verificador equivocado al salir del campo", async () => {
      const user = userEvent.setup();
      render(<CheckoutView />);

      const rut = screen.getByLabelText("RUT");
      await user.type(rut, "123456789");
      await user.tab();

      expect(screen.getByTestId("error-rut")).toHaveTextContent(/dígito verificador/i);
      expect(rut).toHaveAttribute("aria-invalid", "true");
      expect(rut).toHaveAccessibleDescription(/dígito verificador/i);
    });

    it("limpia el error apenas el RUT queda correcto", async () => {
      const user = userEvent.setup();
      render(<CheckoutView />);

      const rut = screen.getByLabelText("RUT");
      await user.type(rut, "123456789");
      await user.tab();
      expect(screen.getByTestId("error-rut")).toBeInTheDocument();

      await user.clear(rut);
      await user.type(rut, "123456785");

      expect(screen.queryByTestId("error-rut")).not.toBeInTheDocument();
    });
  });

  describe("teléfono", () => {
    it("formatea en bloques mientras se escribe, con el +56 impreso al lado", async () => {
      const user = userEvent.setup();
      render(<CheckoutView />);

      const phone = screen.getByLabelText(/^Teléfono/);
      await user.type(phone, "957243741");

      expect(phone).toHaveValue("9 5724 3741");
      expect(screen.getByText("+56")).toBeInTheDocument();
    });

    it("absorbe el prefijo país si el usuario lo pega igual", async () => {
      const user = userEvent.setup();
      render(<CheckoutView />);

      const phone = screen.getByLabelText(/^Teléfono/);
      await user.click(phone);
      await user.paste("+56 9 5724 3741");

      expect(phone).toHaveValue("9 5724 3741");
    });

    it("no confunde un fijo que empieza en 5 con el prefijo país", async () => {
      const user = userEvent.setup();
      render(<CheckoutView />);

      const phone = screen.getByLabelText(/^Teléfono/);
      await user.type(phone, "512345678");
      await user.tab();

      expect(phone).toHaveValue("5 1234 5678");
      expect(screen.queryByTestId("error-telefono")).not.toBeInTheDocument();
    });

    it("rechaza letras: no queda nada escrito y avisa al salir", async () => {
      const user = userEvent.setup();
      render(<CheckoutView />);

      const phone = screen.getByLabelText(/^Teléfono/);
      await user.type(phone, "telefono");
      await user.tab();

      expect(phone).toHaveValue("");
      expect(screen.getByTestId("error-telefono")).toBeInTheDocument();
    });

    it("rechaza un número incompleto", async () => {
      const user = userEvent.setup();
      render(<CheckoutView />);

      await user.type(screen.getByLabelText(/^Teléfono/), "95724");
      await user.tab();

      expect(screen.getByTestId("error-telefono")).toHaveTextContent(/9 dígitos/i);
    });
  });

  describe("región y comuna", () => {
    it("parte con la comuna deshabilitada hasta que se elige región", () => {
      render(<CheckoutView />);

      expect(screen.getByLabelText("Comuna")).toBeDisabled();
      expect(screen.getByText("Elige primero tu región")).toBeInTheDocument();
    });

    it("carga las comunas de la región elegida", async () => {
      const user = userEvent.setup();
      render(<CheckoutView />);

      await user.selectOptions(screen.getByLabelText("Región"), "Valparaíso");

      const comuna = screen.getByLabelText("Comuna");
      expect(comuna).toBeEnabled();
      expect(within(comuna).getByRole("option", { name: "Viña del Mar" })).toBeInTheDocument();
      expect(within(comuna).queryByRole("option", { name: "Providencia" })).not.toBeInTheDocument();
    });

    it("limpia la comuna al cambiar de región", async () => {
      const user = userEvent.setup();
      render(<CheckoutView />);

      await user.selectOptions(screen.getByLabelText("Región"), "Metropolitana de Santiago");
      await user.selectOptions(screen.getByLabelText("Comuna"), "Providencia");
      expect(screen.getByLabelText("Comuna")).toHaveValue("Providencia");

      await user.selectOptions(screen.getByLabelText("Región"), "Los Lagos");

      expect(screen.getByLabelText("Comuna")).toHaveValue("");
      expect(
        within(screen.getByLabelText("Comuna")).getByRole("option", { name: "Puerto Montt" }),
      ).toBeInTheDocument();
    });

    it("ofrece las 16 regiones del país", () => {
      render(<CheckoutView />);

      // 16 regiones + el placeholder deshabilitado.
      expect(within(screen.getByLabelText("Región")).getAllByRole("option")).toHaveLength(17);
    });
  });

  it("exige número en la dirección", async () => {
    const user = userEvent.setup();
    render(<CheckoutView />);

    await user.type(screen.getByLabelText("Calle y número"), "Av. Providencia");
    await user.tab();

    expect(screen.getByTestId("error-calle")).toHaveTextContent(/número/i);
  });

  it("no exige la referencia, que es opcional", async () => {
    const user = userEvent.setup();
    render(<CheckoutView />);

    await user.click(screen.getByLabelText("Depto / oficina / referencia (opcional)"));
    await user.tab();

    expect(screen.queryByTestId("error-referencia")).not.toBeInTheDocument();
  });

  it("con todo válido abre la salida a Mercado Pago", async () => {
    const user = userEvent.setup();
    render(<CheckoutView />);

    await fillForm(user);
    await user.click(screen.getByRole("button", { name: /pagar con mercado pago/i }));

    expect(screen.getByRole("dialog", { name: /mercado pago/i })).toBeInTheDocument();
    expect(screen.getByText(/serás redirigido para pagar/i)).toBeInTheDocument();
  });

  describe("forma de entrega", () => {
    it("al acordar entrega esconde la dirección y explica qué sigue", async () => {
      const user = userEvent.setup();
      render(<CheckoutView />);

      await user.click(screen.getByRole("radio", { name: /acordar entrega/i }));

      expect(screen.queryByLabelText("Región")).not.toBeInTheDocument();
      expect(screen.queryByLabelText("Comuna")).not.toBeInTheDocument();
      expect(screen.queryByLabelText("Calle y número")).not.toBeInTheDocument();
      expect(screen.getByTestId("acordar-entrega-nota")).toHaveTextContent(
        /coordinar punto y hora/i,
      );
    });

    it("al acordar entrega no cobra envío y baja el total", async () => {
      const user = userEvent.setup();
      render(<CheckoutView />);

      // $19.990 + $3.990 de envío.
      expect(screen.getByTestId("checkout-shipping")).toHaveTextContent("$3.990");
      expect(screen.getByTestId("checkout-total")).toHaveTextContent("$23.980");

      await user.click(screen.getByRole("radio", { name: /acordar entrega/i }));

      expect(screen.getByTestId("checkout-shipping")).toHaveTextContent("A convenir");
      expect(screen.getByTestId("checkout-total")).toHaveTextContent("$19.990");
    });

    it("con entrega a acordar basta el contacto para pagar", async () => {
      const user = userEvent.setup();
      render(<CheckoutView />);

      await user.click(screen.getByRole("radio", { name: /acordar entrega/i }));
      await user.type(screen.getByLabelText("Nombre y apellido"), "Ana Soto");
      await user.type(screen.getByLabelText("RUT"), "123456785");
      await user.type(screen.getByLabelText("Correo electrónico"), "ana@gmail.com");
      await user.type(screen.getByLabelText(/^Teléfono/), "957243741");
      await user.click(screen.getByRole("button", { name: /pagar con mercado pago/i }));

      expect(screen.getByRole("dialog", { name: /mercado pago/i })).toBeInTheDocument();
    });

    it("con entrega a acordar igual exige los datos de contacto", async () => {
      const user = userEvent.setup();
      render(<CheckoutView />);

      await user.click(screen.getByRole("radio", { name: /acordar entrega/i }));
      await user.click(screen.getByRole("button", { name: /pagar con mercado pago/i }));

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(screen.getByTestId("checkout-form-status")).toHaveTextContent("revisa 4 campos");
    });

    it("cambiar a acordar limpia los errores de dirección que quedaron", async () => {
      const user = userEvent.setup();
      render(<CheckoutView />);

      await user.click(screen.getByRole("button", { name: /pagar con mercado pago/i }));
      expect(screen.getByTestId("error-region")).toBeInTheDocument();

      await user.click(screen.getByRole("radio", { name: /acordar entrega/i }));

      expect(screen.queryByTestId("error-region")).not.toBeInTheDocument();
      expect(screen.getByTestId("checkout-form-status")).toHaveTextContent("revisa 4 campos");
    });

    it("volver a despacho vuelve a pedir la dirección", async () => {
      const user = userEvent.setup();
      render(<CheckoutView />);

      await user.click(screen.getByRole("radio", { name: /acordar entrega/i }));
      await user.click(screen.getByRole("radio", { name: /despacho a domicilio/i }));

      expect(screen.getByLabelText("Región")).toBeInTheDocument();
      expect(screen.queryByTestId("acordar-entrega-nota")).not.toBeInTheDocument();
    });
  });

  it("no deja pagar si la comuna quedó huérfana tras cambiar la región", async () => {
    const user = userEvent.setup();
    render(<CheckoutView />);

    await fillForm(user);
    await user.selectOptions(screen.getByLabelText("Región"), "Coquimbo");
    await user.click(screen.getByRole("button", { name: /pagar con mercado pago/i }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByTestId("error-comuna")).toBeInTheDocument();
  });
});
