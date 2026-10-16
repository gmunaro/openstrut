// Lista de avisos da obra (fora dos limites da norma, elementos não
// calculados, equilíbrio). Nada é filtrado.
import { CircleAlert, TriangleAlert } from "lucide-react";
import type { Aviso } from "../calculo";
import { BotaoOpcao } from "./opcaoAviso";

/** Falhas dos pavimentos (carga incompleta), em vermelho; nada sem falha. `comOpcoes`: o
 *  aviso com opção ganha o botão (na tela; o relatório não). */
export function ListaFalhas({
  falhas,
  comOpcoes = false,
}: {
  falhas: Aviso[];
  comOpcoes?: boolean;
}) {
  if (falhas.length === 0) return null;
  return (
    <div
      role="alert"
      className="border-destructive/60 bg-destructive/10 mb-3 rounded-md border p-3"
    >
      <p className="text-destructive mb-2 flex items-center gap-2 text-sm font-semibold">
        <CircleAlert className="size-4" /> {falhas.length} falha(s): vigas e pilares incompletos
      </p>
      <ul className="text-destructive grid gap-0.5 text-xs">
        {falhas.map((a, i) => (
          <li key={i} className="grid grid-cols-[minmax(6rem,auto)_1fr] gap-x-3">
            <span className="font-medium">{a.local || "obra"}</span>
            <span>
              {a.texto}
              {comOpcoes && a.opcao && <BotaoOpcao opcao={a.opcao} elemento={a.elemento} />}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Lista de avisos; sem avisos, mostra `vazio` (padrão: tudo dentro dos limites). */
export function ListaAvisos({
  avisos,
  vazio = "Nenhum aviso: todos os elementos dentro dos limites verificados.",
  comOpcoes = false,
}: {
  avisos: Aviso[];
  vazio?: string | undefined;
  comOpcoes?: boolean;
}) {
  if (avisos.length === 0) return <p className="text-ok text-sm">{vazio}</p>;
  return (
    <div className="border-aviso/50 bg-aviso/5 rounded-md border p-3">
      <p className="text-aviso mb-2 flex items-center gap-2 text-sm font-semibold">
        <TriangleAlert className="size-4" /> {avisos.length} aviso(s)
      </p>
      <ul className="grid gap-0.5 text-xs">
        {avisos.map((a, i) => (
          <li key={i} className="grid grid-cols-[minmax(6rem,auto)_minmax(3rem,auto)_1fr] gap-x-3">
            <span className="text-muted-foreground">{a.local || "obra"}</span>
            <span className="font-medium">{a.elemento}</span>
            <span>
              {a.texto}
              {comOpcoes && a.opcao && <BotaoOpcao opcao={a.opcao} elemento={a.elemento} />}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
