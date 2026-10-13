// Campos que só gravam ao confirmar (Enter ou sair do campo), para que cada
// tecla não vire uma entrada no histórico de desfazer. Esc volta ao valor atual.
import { useEffect, useState, type ComponentProps } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatarNumero, lerNumero } from "../formato";

type PropsInput = Omit<ComponentProps<typeof Input>, "value" | "onChange" | "onBlur" | "onKeyDown">;

/** Texto confirmado. `confirmar` devolve uma mensagem de erro, ou null se aceitou. */
export function CampoTexto({
  valor,
  confirmar,
  className,
  ...props
}: PropsInput & { valor: string; confirmar: (v: string) => string | null }) {
  const [texto, setTexto] = useState(valor);
  const [erro, setErro] = useState<string | null>(null);
  useEffect(() => {
    setTexto(valor);
    setErro(null);
  }, [valor]);
  const aplicar = () => {
    if (texto === valor) return setErro(null);
    setErro(confirmar(texto));
  };
  return (
    <span className="inline-flex flex-col">
      <Input
        {...props}
        value={texto}
        aria-invalid={erro !== null}
        title={erro ?? props.title}
        className={cn("h-7 px-2 text-sm", className)}
        onChange={(e) => setTexto(e.target.value)}
        onBlur={aplicar}
        onKeyDown={(e) => {
          if (e.key === "Enter") aplicar();
          if (e.key === "Escape") {
            setTexto(valor);
            setErro(null);
          }
        }}
      />
      {erro && <span className="text-destructive mt-0.5 text-[11px]">{erro}</span>}
    </span>
  );
}

/** Número para editar: sem separador de milhar. */
const mostrar = (n: number, casas: number) => formatarNumero(n, casas).replace(/\./g, "");

/** Número confirmado (aceita vírgula). Valor que `valido` recusa volta ao anterior. */
export function CampoNumero({
  valor,
  casas = 2,
  valido,
  confirmar,
  className,
  ...props
}: PropsInput & {
  valor: number;
  casas?: number;
  valido: (n: number) => boolean;
  confirmar: (n: number) => void;
}) {
  const [texto, setTexto] = useState(mostrar(valor, casas));
  const [invalido, setInvalido] = useState(false);
  useEffect(() => {
    setTexto(mostrar(valor, casas));
    setInvalido(false);
  }, [valor, casas]);
  const aplicar = () => {
    const n = lerNumero(texto);
    if (n === null || !valido(n)) {
      setInvalido(true);
      return;
    }
    setInvalido(false);
    if (n !== valor) confirmar(n);
    else setTexto(mostrar(valor, casas));
  };
  return (
    <Input
      {...props}
      inputMode="decimal"
      value={texto}
      aria-invalid={invalido}
      className={cn("h-7 px-2 text-right font-mono text-sm tabular-nums", className)}
      onChange={(e) => setTexto(e.target.value)}
      onBlur={aplicar}
      onKeyDown={(e) => {
        if (e.key === "Enter") aplicar();
        if (e.key === "Escape") {
          setTexto(mostrar(valor, casas));
          setInvalido(false);
        }
      }}
    />
  );
}
