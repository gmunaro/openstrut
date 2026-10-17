// Seletor do tema da tela (tema.ts): três botões, Escuro, Claro e Do sistema; o
// escolhido fica pressionado (aria-pressed).
import { Monitor, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { definirTema, TEMAS, useTema, type Tema } from "./tema";

const ICONE: Record<Tema, typeof Sun> = { escuro: Moon, claro: Sun, sistema: Monitor };

/** `compacto`: só os ícones (o nome fica no title e no aria-label). */
export function SeletorTema({ compacto = false }: { compacto?: boolean }) {
  const tema = useTema();
  return (
    <div
      role="group"
      aria-label="Tema da tela"
      className="bg-muted inline-flex rounded-md p-0.5 text-xs"
    >
      {TEMAS.map((t) => {
        const Icone = ICONE[t.id];
        const ativo = t.id === tema;
        return (
          <button
            key={t.id}
            type="button"
            aria-pressed={ativo}
            aria-label={compacto ? `Tema ${t.rotulo.toLowerCase()}` : undefined}
            title={`Tema ${t.rotulo.toLowerCase()}`}
            onClick={() => definirTema(t.id)}
            className={cn(
              "focus-visible:ring-ring inline-flex min-h-7 items-center gap-1 rounded px-2 outline-none focus-visible:ring-2",
              ativo
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icone aria-hidden className="size-3.5" />
            {!compacto && t.rotulo}
          </button>
        );
      })}
    </div>
  );
}
