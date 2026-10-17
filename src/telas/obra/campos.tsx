// Campos que só gravam ao confirmar (Enter ou sair do campo), para que cada
// tecla não vire uma entrada no histórico de desfazer. Esc volta ao valor atual.
// O rótulo fica ligado ao campo por id e o erro fica fora do `<label>`: se
// estivesse dentro, o texto do erro entraria no nome acessível. O erro é ligado
// ao campo por `aria-describedby`.
import { useEffect, useId, useState, type ComponentProps, type ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { NUMERO_INVALIDO } from "../../planta/formato";
import { formatarNumero, lerNumero } from "../formato";

type PropsInput = Omit<ComponentProps<typeof Input>, "value" | "onChange" | "onBlur" | "onKeyDown">;

/** Id da mensagem de erro de um campo; o `aria-describedby` do campo aponta para ele. */
const idDoErro = (id: string) => `${id}-erro`;

/**
 * Rótulo, campo e erro lado a lado. `children` é o próprio `Input`, que recebe
 * `aria-describedby` quando há erro.
 */
function CampoRotulado({
  id,
  rotulo,
  unidade,
  erro,
  children,
}: {
  id: string;
  rotulo: string;
  unidade?: string | undefined;
  erro: string | null;
  children: ReactNode;
}) {
  return (
    <span className="flex items-center gap-1">
      <label htmlFor={id}>{rotulo}</label>
      <span className="inline-flex flex-col">
        {children}
        {erro && (
          <span id={idDoErro(id)} className="text-destructive mt-0.5 text-[11px]">
            {erro}
          </span>
        )}
      </span>
      {unidade && <span className="text-muted-foreground">{unidade}</span>}
    </span>
  );
}

/** Texto confirmado. `confirmar` devolve uma mensagem de erro, ou null se aceitou. */
export function CampoTexto({
  rotulo,
  valor,
  confirmar,
  className,
  id,
  ...props
}: PropsInput & {
  rotulo: string;
  valor: string;
  confirmar: (v: string) => string | null;
}) {
  const gerado = useId();
  const campoId = id ?? gerado;
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
    <CampoRotulado id={campoId} rotulo={rotulo} erro={erro}>
      <Input
        {...props}
        id={campoId}
        value={texto}
        aria-invalid={erro !== null}
        aria-describedby={erro ? idDoErro(campoId) : props["aria-describedby"]}
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
    </CampoRotulado>
  );
}

/** Número para editar: sem separador de milhar. */
const mostrar = (n: number, casas: number) => formatarNumero(n, casas).replace(/\./g, "");

/**
 * Número confirmado (aceita vírgula). Valor que `valido` recusa fica marcado com
 * `mensagemInvalido` e não grava; sair do campo ou Esc voltam ao valor atual.
 */
export function CampoNumero({
  rotulo,
  unidade,
  valor,
  casas = 2,
  valido,
  confirmar,
  mensagemInvalido = NUMERO_INVALIDO,
  className,
  id,
  ...props
}: PropsInput & {
  rotulo: string;
  unidade?: string;
  valor: number;
  casas?: number;
  valido: (n: number) => boolean;
  confirmar: (n: number) => void;
  mensagemInvalido?: string;
}) {
  const gerado = useId();
  const campoId = id ?? gerado;
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
    <CampoRotulado
      id={campoId}
      rotulo={rotulo}
      unidade={unidade}
      erro={invalido ? mensagemInvalido : null}
    >
      <Input
        {...props}
        id={campoId}
        inputMode="decimal"
        value={texto}
        aria-invalid={invalido}
        aria-describedby={invalido ? idDoErro(campoId) : props["aria-describedby"]}
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
    </CampoRotulado>
  );
}
