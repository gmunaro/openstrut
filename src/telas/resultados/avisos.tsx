// Lista de avisos da obra (fora dos limites da norma, elementos não calculados,
// equilíbrio), organizada por severidade e por grupo (classificaAvisos.ts). Nada é
// filtrado: cada texto original continua na lista do grupo.
import { ChevronRight, CircleAlert, Info, TriangleAlert } from "lucide-react";
import { useId, useState } from "react";
import type { Aviso, FonteAviso } from "../calculo";
import {
  agruparAvisos,
  avisoDaImportacao,
  fonteDoAviso,
  type GrupoAvisos,
  type NivelAvisos,
  type Severidade,
  TITULO_SEVERIDADE,
} from "./classificaAvisos";
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
          <li
            key={i}
            className="grid grid-cols-[minmax(6rem,auto)_1fr] gap-x-3 compacto:grid-cols-1"
          >
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

/** Modo de cálculo da obra: decide o selo de origem de cada grupo. */
export type ModoAvisos = "original" | "corrigido";

interface OpcoesLista {
  /** O aviso com opção ganha o botão (na tela; o relatório não). */
  comOpcoes?: boolean;
  /** Modo da obra; sem ele, os selos são os do corrigido. */
  modo?: ModoAvisos | undefined;
  /** Tudo aberto, sem botões de abrir e fechar (relatório). Na impressão o conteúdo
   *  recolhido sai de qualquer jeito. */
  expandido?: boolean;
}

/**
 * Lista de avisos por severidade (erros, atenção, informativos) e por grupo, com a
 * contagem de cada um e o resumo de onde os repetidos aparecem. Os informativos começam
 * recolhidos. Sem avisos, mostra `vazio` (padrão: tudo dentro dos limites).
 */
export function ListaAvisos({
  avisos,
  vazio = "Nenhum aviso: todos os elementos dentro dos limites verificados.",
  comOpcoes = false,
  modo,
  expandido = false,
}: {
  avisos: Aviso[];
  vazio?: string | undefined;
} & OpcoesLista) {
  if (avisos.length === 0) return <p className="text-ok text-sm">{vazio}</p>;
  const niveis = agruparAvisos(avisos);
  const fontes = new Set(avisos.map(fonteDoAviso));
  return (
    <div data-slot="lista-avisos" className="border-aviso/50 bg-aviso/5 rounded-md border p-3">
      <p className="text-aviso flex flex-wrap items-center gap-x-2 text-sm font-semibold">
        <TriangleAlert className="size-4" />
        <span>{`${avisos.length} aviso(s)`}</span>
        <span className="text-muted-foreground text-xs font-normal">{contagens(niveis)}</span>
      </p>
      {fontes.has("calculo") && fontes.has("detalhamento") && (
        <p className="text-muted-foreground mt-1 text-xs">{notaOrigem(modo)}</p>
      )}
      <GruposDeAvisos
        niveis={niveis}
        comOpcoes={comOpcoes}
        modo={modo}
        expandido={expandido}
        titulo="h3"
      />
    </div>
  );
}

/** Avisos da importação (strings com o arquivo no começo), na mesma organização da
 *  lista da obra: severidade, grupos e resumo dos repetidos. */
export function ListaAvisosImportacao({ avisos }: { avisos: readonly string[] }) {
  return <GruposDeAvisos niveis={agruparAvisos(avisos.map(avisoDaImportacao))} titulo="h4" />;
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

const PLURAIS: Record<Severidade, [string, string]> = {
  erro: ["erro", "erros"],
  atencao: ["de atenção", "de atenção"],
  info: ["informativo", "informativos"],
};

/** "2 erros, 30 de atenção, 47 informativos". */
const contagens = (niveis: readonly NivelAvisos[]) =>
  niveis.map((n) => plural(n.total, ...PLURAIS[n.severidade])).join(", ");

const notaOrigem = (modo: ModoAvisos | undefined) =>
  modo === "original"
    ? "“Do SISTRUT original”: avisos do motor que reproduz o programa de 1991. “Verificação extra da V2”: regras do detalhamento das barras da V2, que o original não tem."
    : "“Verificação de detalhamento da V2”: regras do detalhamento das barras feito pela V2; os demais avisos vêm do cálculo.";

/** Selo de origem do grupo; nenhum para a importação e para o cálculo no modo corrigido. */
function textoSelo(fonte: FonteAviso, modo: ModoAvisos | undefined): string | null {
  if (fonte === "importacao") return null;
  if (modo === "original")
    return fonte === "detalhamento" ? "verificação extra da V2" : "do SISTRUT original";
  return fonte === "detalhamento" ? "verificação de detalhamento da V2" : null;
}

const COR: Record<Severidade, string> = {
  erro: "text-destructive",
  atencao: "text-aviso",
  info: "text-muted-foreground",
};

const ICONE: Record<Severidade, typeof Info> = {
  erro: CircleAlert,
  atencao: TriangleAlert,
  info: Info,
};

/** Os níveis de severidade e os grupos de cada um. */
function GruposDeAvisos({
  niveis,
  titulo,
  ...opcoes
}: { niveis: readonly NivelAvisos[]; titulo: "h3" | "h4" } & OpcoesLista) {
  return (
    <div className="grid gap-3 text-xs">
      {niveis.map((n) => (
        <BlocoNivel key={n.severidade} nivel={n} titulo={titulo} {...opcoes} />
      ))}
    </div>
  );
}

/** Um nível de severidade; o informativo começa recolhido (fora do `expandido`). */
function BlocoNivel({
  nivel,
  titulo: Titulo,
  expandido = false,
  ...opcoes
}: { nivel: NivelAvisos; titulo: "h3" | "h4" } & OpcoesLista) {
  const recolhivel = nivel.severidade === "info" && !expandido;
  const [aberto, setAberto] = useState(false);
  const id = useId();
  const Icone = ICONE[nivel.severidade];
  const rotulo = `${TITULO_SEVERIDADE[nivel.severidade]} (${nivel.total})`;
  const visivel = !recolhivel || aberto;
  return (
    <div className="min-w-0">
      <Titulo
        className={`${COR[nivel.severidade]} mb-1 flex items-center gap-1.5 text-xs font-semibold`}
      >
        {recolhivel ? (
          <button
            type="button"
            aria-expanded={aberto}
            aria-controls={id}
            onClick={() => setAberto((a) => !a)}
            className="focus-visible:ring-ring/50 -mx-1 flex min-h-6 items-center gap-1.5 rounded px-1 text-left hover:underline focus-visible:ring-[3px] focus-visible:outline-none compacto:min-h-11"
          >
            <ChevronRight
              aria-hidden
              className={`size-3.5 shrink-0 transition-transform print:hidden ${aberto ? "rotate-90" : ""}`}
            />
            <Icone aria-hidden className="size-3.5 shrink-0" />
            {rotulo}
          </button>
        ) : (
          <>
            <Icone aria-hidden className="size-3.5 shrink-0" />
            {rotulo}
          </>
        )}
      </Titulo>
      <ul id={id} className={visivel ? "grid gap-1.5" : "hidden gap-1.5 print:grid"}>
        {nivel.grupos.map((g) => (
          <ItemGrupo key={g.chave} grupo={g} expandido={expandido} {...opcoes} />
        ))}
      </ul>
    </div>
  );
}

/**
 * Um grupo: rótulo, contagem, selo de origem, onde aparece e os textos completos. Até 3
 * avisos, os textos ficam sempre à vista; com mais, um botão abre a lista, que já começa
 * aberta no grupo de erro ou quando algum aviso tem botão de opção.
 */
function ItemGrupo({
  grupo: g,
  comOpcoes = false,
  modo,
  expandido = false,
}: { grupo: GrupoAvisos } & OpcoesLista) {
  const n = g.avisos.length;
  const comBotao = comOpcoes && g.avisos.some((a) => a.opcao);
  const recolhivel = n > 3 && !expandido;
  const [aberto, setAberto] = useState(g.severidade === "erro" || comBotao);
  const id = useId();
  const selo = textoSelo(g.fonte, modo);
  const visivel = !recolhivel || aberto;
  return (
    <li className="border-aviso/20 bg-background/60 min-w-0 rounded border px-2 py-1.5">
      <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="font-semibold">{g.grupo}</span>
        <span className="text-muted-foreground tabular-nums">({n})</span>
        {selo && (
          <span className="border-border text-muted-foreground rounded-full border px-1.5 text-[0.7rem]">
            {selo}
          </span>
        )}
      </p>
      {n > 1 && g.resumo && (
        <p className="text-muted-foreground mt-0.5 wrap-anywhere">{g.resumo}</p>
      )}
      {recolhivel && (
        <button
          type="button"
          aria-expanded={aberto}
          aria-controls={id}
          onClick={() => setAberto((a) => !a)}
          className="text-primary focus-visible:ring-ring/50 mt-0.5 flex min-h-6 items-center gap-1 rounded text-left hover:underline focus-visible:ring-[3px] focus-visible:outline-none print:hidden compacto:min-h-11"
        >
          <ChevronRight
            aria-hidden
            className={`size-3.5 shrink-0 transition-transform ${aberto ? "rotate-90" : ""}`}
          />
          {aberto ? "Ocultar os textos" : `Ver os ${n} textos`}
        </button>
      )}
      <ul id={id} className={visivel ? "mt-1 grid gap-0.5" : "mt-1 hidden gap-0.5 print:grid"}>
        {g.avisos.map((a, i) => (
          <LinhaAviso key={i} aviso={a} comOpcoes={comOpcoes} />
        ))}
      </ul>
    </li>
  );
}

/** Um aviso com o texto original; o da importação já traz o arquivo no texto. */
function LinhaAviso({ aviso: a, comOpcoes }: { aviso: Aviso; comOpcoes: boolean }) {
  const texto = (
    <span className="compacto:col-span-2 min-w-0 wrap-anywhere">
      {a.texto}
      {comOpcoes && a.opcao && <BotaoOpcao opcao={a.opcao} elemento={a.elemento} />}
    </span>
  );
  if (a.fonte === "importacao") return <li className="min-w-0">{texto}</li>;
  return (
    // celular: local e elemento numa linha, o texto embaixo com a largura toda
    <li className="compacto:grid-cols-[auto_1fr] compacto:border-b compacto:border-aviso/20 compacto:py-1 compacto:last:border-0 grid grid-cols-[minmax(6rem,auto)_minmax(3rem,auto)_1fr] gap-x-3">
      <span className="text-muted-foreground">{a.local || "obra"}</span>
      <span className="font-medium">{a.elemento}</span>
      {texto}
    </li>
  );
}
