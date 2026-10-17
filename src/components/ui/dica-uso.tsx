// Dicas de primeiro uso: caixas curtas que explicam por onde começar. Fechada, a dica
// não volta: os ids fechados ficam no localStorage, compartilhados entre as telas.
import { Lightbulb, X } from "lucide-react";
import { useSyncExternalStore, type ReactNode } from "react";
import { cn } from "@/lib/utils";

const CHAVE = "openstrut:dicas-fechadas";
const ouvintes = new Set<() => void>();
/** Dicas fechadas nesta visita quando o localStorage recusa a gravação. */
const memoria = new Set<string>();

/** Ids das dicas já fechadas. Sem localStorage (modo privado bloqueado), nenhuma. */
function lerFechadas(): string[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(CHAVE) ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/** Marca a dica `id` como fechada para sempre neste navegador. */
export function fecharDica(id: string) {
  const fechadas = lerFechadas();
  if (!fechadas.includes(id)) {
    try {
      localStorage.setItem(CHAVE, JSON.stringify([...fechadas, id]));
    } catch {
      // sem armazenamento a dica volta na próxima visita; nesta, some igual
      memoria.add(id);
    }
  }
  for (const f of ouvintes) f();
}

const assinar = (f: () => void) => {
  ouvintes.add(f);
  return () => ouvintes.delete(f);
};

/** A dica `id` ainda deve aparecer. */
export function useDicaAberta(id: string) {
  return useSyncExternalStore(
    assinar,
    () => !memoria.has(id) && !lerFechadas().includes(id),
    () => false,
  );
}

/** Caixa de dica com botão de fechar. `id` identifica a dica no armazenamento. */
export function DicaUso({
  id,
  titulo,
  children,
  className,
}: {
  id: string;
  titulo: string;
  children: ReactNode;
  className?: string;
}) {
  const aberta = useDicaAberta(id);
  if (!aberta) return null;
  return (
    <aside
      aria-label={titulo}
      className={cn(
        "border-primary/40 bg-primary/10 text-foreground flex items-start gap-2 rounded-md border px-3 py-2 text-sm print:hidden",
        className,
      )}
    >
      <Lightbulb aria-hidden className="text-primary mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="font-medium">{titulo}</p>
        <div className="text-muted-foreground mt-0.5 text-xs leading-relaxed">{children}</div>
      </div>
      <button
        type="button"
        aria-label={`Fechar a dica "${titulo}"`}
        title="Fechar (a dica não volta)"
        onClick={() => fecharDica(id)}
        className="text-muted-foreground hover:text-foreground hover:bg-accent focus-visible:ring-ring -m-1 rounded p-1 outline-none focus-visible:ring-2"
      >
        <X className="size-4" />
      </button>
    </aside>
  );
}
