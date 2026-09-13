# Referencia de backend (código parkeado)

Código de referencia del handoff original, **no forma parte del build ni del
lint** (está en los `ignores` de `eslint.config.js`). Vive acá para no perder
el diseño de la capa de backend mientras el sitio no tiene base de datos.

## Estado de cada pieza

| Pieza | Estado |
| --- | --- |
| `lib/mercadopago.ts` | ❌ **Descartado.** La pasarela del proyecto es TUU. |
| `pages/api/checkout.ts` | ❌ **Superado** por [`src/pages/api/checkout.ts`](../../src/pages/api/checkout.ts), ya implementado contra TUU. |
| `pages/api/webhooks/mercadopago.ts` | ❌ **Superado** por [`src/pages/api/tuu/callback.ts`](../../src/pages/api/tuu/callback.ts). |
| `supabase/schema.sql` | ❌ **Superado** por [`supabase/schema.sql`](../../supabase/schema.sql), que es el schema real del proyecto: catálogo, CMS, pedidos contra TUU y RLS. Este queda solo como registro del diseño original. |
| `lib/supabase/`, `middleware.ts`, `admin/`, `pages/admin/` | ✅ **Vigentes como referencia** para el panel de administración, que se construye sobre [`supabase/schema.sql`](../../supabase/schema.sql). |

## Por qué se cambió de Mercado Pago a TUU

Decisión del proyecto. La integración real está implementada y documentada en
[`docs/pagos-tuu.md`](../pagos-tuu.md); el flujo de pago del sitio corre hoy
contra el ambiente de QA de TUU.

Lo que **sí** vale la pena conservar del código de Mercado Pago es el patrón,
no la implementación: crear la orden en la base antes de salir a la pasarela,
recalcular el precio siempre en el servidor, y tratar el webhook —no la
redirección del navegador— como la fuente de verdad. Los tres están aplicados
en la integración de TUU.
