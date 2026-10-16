// Campo numérico da barra de pavimentos. Confirma ao sair ou no Enter; um valor
// recusado fica no campo com a mensagem ligada por aria-describedby. Esc volta ao
// valor gravado. (CampoNumero de campos.tsx não mostra o motivo da recusa.)
import { useEffect, useId, useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatarNumero, lerNumero } from "../formato";

/** Número para editar: sem separador de milhar. */
const mostrar = (n: number, casas: number) => formatarNumero(n, casas).replace(/\./g, "");

/** Número do pavimento ativo. `problema` devolve a mensagem de recusa, ou null se aceita;
 *  só valor aceito e diferente do atual vai para `confirmar`. */
export function CampoPavimentoNumero({
  rotulo,
  unidade,
  valor,
  casas = 2,
  problema,
  confirmar,
  className,
}: {
  rotulo: string;
  unidade?: string;
  valor: number;
  casas?: number;
  problema: (n: number) => string | null;
  confirmar: (n: number) => void;
  className?: string;
}) {
  const id = useId();
  const idErro = `${id}-erro`;
  const [texto, setTexto] = useState(mostrar(valor, casas));
  const [erro, setErro] = useState<string | undefined>(undefined);
  useEffect(() => {
    setTexto(mostrar(valor, casas));
    setErro(undefined);
  }, [valor, casas]);

  const aplicar = () => {
    const n = lerNumero(texto);
    if (n === null) return setErro("Valor numérico inválido.");
    const msg = problema(n);
    if (msg) return setErro(msg);
    setErro(undefined);
    if (n !== valor) confirmar(n);
    else setTexto(mostrar(valor, casas));
  };

  return (
    <span className="inline-flex flex-col">
      <span className="flex items-center gap-1">
        <label htmlFor={id}>{rotulo}</label>
        <Input
          id={id}
          inputMode="decimal"
          value={texto}
          aria-invalid={erro !== undefined}
          aria-describedby={erro ? idErro : undefined}
          className={cn("h-7 px-2 text-right font-mono text-sm tabular-nums", className)}
          onChange={(e) => setTexto(e.target.value)}
          onBlur={aplicar}
          onKeyDown={(e) => {
            if (e.key === "Enter") aplicar();
            if (e.key === "Escape") {
              setTexto(mostrar(valor, casas));
              setErro(undefined);
            }
          }}
        />
        {unidade && <span className="text-muted-foreground">{unidade}</span>}
      </span>
      {erro && (
        <span id={idErro} className="text-destructive mt-0.5 text-[11px]">
          {erro}
        </span>
      )}
    </span>
  );
}
