# Base de datos

## Cómo aplicarla

Supabase → **SQL Editor** → New query → pegar el archivo → Run.

**En orden, y una sola vez cada uno:**

1. [`schema.sql`](schema.sql) — schema inicial completo, con los datos
   sembrados (productos, páginas, textos, legales).
2. [`migrations/`](migrations/) — en orden numérico. Cada una es un cambio
   sobre lo anterior.

Todos son idempotentes: volver a correrlos no rompe nada ni pisa lo que ya
editaste desde el panel. Pero el orden sí importa — una migración asume que
la anterior ya corrió.

| Archivo                                         | Qué hace                                                  |
| ----------------------------------------------- | --------------------------------------------------------- |
| `schema.sql`                                    | Catálogo, CMS, pedidos, stock, RLS y bucket de imágenes.  |
| `migrations/0002_categorias_administrables.sql` | Convierte las categorías de lista fija en tabla editable. |

## Verificar que quedó bien

```bash
pnpm check:supabase
```

Comprueba el seed y —lo que de verdad importa— que el Row Level Security
protege lo que tiene que proteger: que con la clave pública NO se puede leer
un pedido, crear un producto ni cerrar un pago.

## Antes de usar el panel

En el dashboard de Supabase:

1. **Authentication → Sign In / Providers**: desactivar _"Allow new users to
   sign up"_. Con un solo usuario admin, cualquiera que se registre quedaría
   con permisos de escritura.
2. **Authentication → Users → Add user**: crear el usuario, marcando
   **Auto Confirm User**. Sin eso, Supabase espera una confirmación por
   correo y el login rechaza el acceso.

## Lo que no está en estos archivos

Las claves. Salen de Project Settings → Data API y → API Keys, y van al
`.env` local y al environment de Vercel. Ver [`.env.example`](../.env.example),
que explica por qué ninguna lleva prefijo `PUBLIC_`.
