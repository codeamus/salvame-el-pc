/**
 * Placeholder de tipos. Cuando el schema esté aplicado en Supabase, generar
 * los tipos reales con:
 *
 *   pnpm dlx supabase gen types typescript --project-id <tu-project-id> > src/types/database.ts
 *
 * y reemplazar este archivo. Mientras tanto los clientes de Supabase quedan
 * sin tipar estrictamente (usar con cuidado en las queries).
 */
export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

export interface Database {
  public: {
    Tables: Record<string, { Row: Record<string, unknown> }>;
  };
}
