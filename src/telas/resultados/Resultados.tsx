// Aba Resultados: falhas dos pavimentos (em vermelho) e avisos da obra; por
// pavimento, as tabelas de lajes, vigas e equilíbrio; depois os pilares por
// nível. Cada elemento abre a memória. A barra do topo filtra os elementos por nome
// (filtro.ts); os cabeçalhos ordenam e o botão Copiar leva a tabela para o Excel.
import { CircleAlert, Info, Search, X } from "lucide-react";
import { startTransition, useContext, useDeferredValue, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { DicaUso } from "@/components/ui/dica-uso";
import type { ResultadoObra } from "../../calculo/fluxo";
import { calcularQuantitativos } from "../../calculo/quantitativos";
import type { Obra } from "../../dominio/obra";
import { useObra } from "../../estado/obra";
import {
  coletarAvisos,
  coletarFalhas,
  AVISOS_OBRA_VAZIA,
  mensagemSemNorma,
  obraSemElementos,
  SELO_MODO_ORIGINAL,
  type Aviso,
  type Calculo,
} from "../calculo";
import { DetalhamentoContexto, type DetalhamentoObra } from "../detalhamento";
import { formatarNumero } from "../formato";
import { ListaAvisos, ListaFalhas } from "./avisos";
import { TabelaEquilibrio } from "./equilibrio";
import { type Filtro, FiltroContexto, filtroDeTexto, MOSTRA_TUDO, useFiltro } from "./filtro";
import { TabelasLajes } from "./lajes";
import { BlocoMotorSistrut, semMarcasDuplicadas, vazioComMarcas } from "./motorSistrut";
import { TabelaPilares } from "./pilares";
import { ResumoQuantitativos } from "./quantitativos";
import { TabelaVigas } from "./vigas";

/** Mensagem quando não há resultado: norma sem implementação ou erro do motor. */
export function SemCalculo({ calculo }: { calculo: Exclude<Calculo, { tipo: "ok" }> }) {
  if (calculo.tipo === "semNorma")
    return (
      <div
        role="status"
        className="border-aviso/50 bg-aviso/10 text-aviso flex items-start gap-2 rounded-md border p-4 text-sm"
      >
        <Info className="mt-0.5 size-4 shrink-0" />
        <p>{mensagemSemNorma(calculo.norma)}</p>
      </div>
    );
  return (
    <div
      role="alert"
      className="border-destructive/60 bg-destructive/10 flex items-start gap-2 rounded-md border p-4 text-sm"
    >
      <CircleAlert className="text-destructive mt-0.5 size-4 shrink-0" />
      <div>
        <p className="font-medium">O cálculo não pôde ser concluído.</p>
        <p className="text-muted-foreground mt-1 text-xs">{calculo.mensagem}</p>
      </div>
    </div>
  );
}

/** Nomes das vigas do pavimento que o motor SISTRUT parou no DESDIM (só no modo original). */
const vigasInterrompidas = (r: ResultadoObra, pavimentoId: string) =>
  new Set(
    (r.sistrut?.pavimentos.find((p) => p.pavimentoId === pavimentoId)?.vigas ?? [])
      .filter((v) => v.interrompida)
      .map((v) => v.nome),
  );

/** Seções fora da tela não passam por layout nem pintura até chegarem perto dela
 *  (content-visibility), com uma altura estimada para a barra de rolagem não pular. */
const SECAO_LEVE = "[content-visibility:auto] [contain-intrinsic-size:auto_1200px]";

/** Tabelas de todos os pavimentos e dos pilares (também usadas no relatório).
 *  Na aba Resultados: `ate` é quantas etapas já aparecem (uma por pavimento e, por
 *  último, a dos pilares) e `naTela` deixa as seções fora da vista sem layout. */
export function TabelasObra({
  resultado,
  comMemoria,
  ate,
  naTela = false,
}: {
  resultado: ResultadoObra;
  comMemoria: boolean;
  ate?: number;
  naTela?: boolean;
}) {
  const gamaF = Math.max(resultado.norma.gamaG, resultado.norma.gamaQ);
  const mostra = useFiltro();
  const filtrando = mostra !== MOSTRA_TUDO;
  // com filtro, o pavimento sem laje nem viga do filtro some inteiro
  const pavimentos = filtrando
    ? resultado.pavimentos.filter(
        (rp) =>
          rp.lajes.some((l) => mostra(l.laje.nome)) ||
          rp.vigas.some((v) => mostra(v.viga.nome)) ||
          rp.montagem.naoCalculadas.some((v) => mostra(v.nome)),
      )
    : resultado.pavimentos;
  const todosNaTela = ate === undefined || ate > resultado.pavimentos.length;
  const comPilares =
    todosNaTela && (!filtrando || resultado.pilares.some((p) => mostra(p.pilar.nome)));
  const secao = naTela ? SECAO_LEVE : undefined;
  return (
    <>
      {pavimentos.slice(0, ate).map((rp) => (
        <section key={rp.pavimento.id} className={cn("mt-6 break-inside-auto", secao)}>
          <h2 className="border-b pb-1 text-base font-semibold">
            {rp.pavimento.nome}
            <span className="text-muted-foreground ml-3 text-xs font-normal">
              pé-direito {formatarNumero(rp.pavimento.peDireito)} m
              {rp.pavimento.repeticoes > 1 ? ` · repete ${rp.pavimento.repeticoes}×` : ""}
            </span>
          </h2>
          <TabelasLajes lajes={rp.lajes} comMemoria={comMemoria} />
          <TabelaVigas
            vigas={rp.vigas}
            interrompidas={vigasInterrompidas(resultado, rp.pavimento.id)}
            naoCalculadas={rp.montagem.naoCalculadas}
            gamaF={gamaF}
            comMemoria={comMemoria}
          />
          {!filtrando && <TabelaEquilibrio equilibrio={rp.equilibrio} comMemoria={comMemoria} />}
        </section>
      ))}
      {comPilares && (
        <section className={cn("mt-6", secao)}>
          <h2 className="border-b pb-1 text-base font-semibold">Pilares</h2>
          <TabelaPilares resultado={resultado} comMemoria={comMemoria} />
        </section>
      )}
      {filtrando && todosNaTela && pavimentos.length === 0 && !comPilares && (
        <p role="status" className="text-muted-foreground mt-6 text-sm">
          Nenhum elemento com esse nome. Use os nomes da planta (V1, P3, L2) ou só a letra (V, P, L)
          para ver todos de um tipo.
        </p>
      )}
    </>
  );
}

export function Resultados({ calculo }: { calculo: Calculo }) {
  const obra = useObra((e) => e.obra);
  const detalhamento = useContext(DetalhamentoContexto);
  if (calculo.tipo !== "ok") return <SemCalculo calculo={calculo} />;
  // obra vazia: sem "Nenhum aviso" nem tabelas vazias, que sugerem uma verificação que não houve
  if (obra && obraSemElementos(obra))
    return (
      <p role="status" className="text-muted-foreground text-sm">
        {AVISOS_OBRA_VAZIA}
      </p>
    );
  const r = calculo.resultado;
  return <ResultadosCalculados r={r} obra={obra} detalhamento={detalhamento} />;
}

/** Resultados da obra calculada, com a barra de filtro. */
function ResultadosCalculados({
  r,
  obra,
  detalhamento,
}: {
  r: ResultadoObra;
  obra: Obra | null;
  detalhamento: DetalhamentoObra | null;
}) {
  const [texto, setTexto] = useState("");
  // a digitação não espera as tabelas redesenharem
  const adiado = useDeferredValue(texto);
  const filtro = useMemo(() => filtroDeTexto(adiado), [adiado]);
  // etapas: uma por pavimento e a dos pilares
  const etapas = r.pavimentos.length + 1;
  const ate = useMontagemGradual(etapas);
  const montando = ate < etapas;
  return (
    <div className="pb-8">
      <DicaUso id="resultados" titulo="Como ler os resultados" className="mb-3">
        A seta ao lado do nome abre a memória de cálculo, com a fórmula e o item da norma de cada
        etapa. Filtre por elemento (V1, P3, ou V para todas as vigas), clique no título de uma
        coluna para ordenar e use <strong>Copiar</strong> para colar a tabela no Excel.
      </DicaUso>
      <div className="bg-background/95 compacto:static sticky top-0 z-20 -mx-1 mb-2 flex flex-wrap items-center gap-2 px-1 py-1.5 backdrop-blur print:hidden">
        <label className="relative flex min-w-56 flex-1 items-center sm:max-w-sm">
          <span className="sr-only">Filtrar elementos</span>
          <Search
            aria-hidden
            className="text-muted-foreground pointer-events-none absolute left-2 size-4"
          />
          <input
            type="text"
            inputMode="search"
            enterKeyHint="search"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Filtrar: V1, P3 ou V (todas as vigas)"
            className="border-input bg-background focus-visible:ring-ring/50 focus-visible:border-ring h-8 w-full rounded-md border pr-8 pl-8 text-sm outline-none focus-visible:ring-[3px]"
          />
          {texto && (
            <button
              type="button"
              aria-label="Limpar o filtro"
              onClick={() => setTexto("")}
              className="text-muted-foreground hover:text-foreground absolute right-1.5 rounded p-0.5"
            >
              <X className="size-4" />
            </button>
          )}
        </label>
        {adiado.trim() && (
          <span role="status" className="text-muted-foreground text-xs">
            Filtro: {adiado.trim()} · vale para as tabelas e os avisos; as falhas, o equilíbrio e o
            resumo da obra ficam fora
          </span>
        )}
      </div>
      <p className="text-muted-foreground mb-3 flex flex-wrap items-center gap-2 text-xs">
        <span>
          Calculado pela {r.norma.nome}. Clique na seta ao lado do nome para ver a memória de
          cálculo.
        </span>
        {obra?.modoCalculo === "original" && (
          <Badge variant="outline" className="border-aviso/60 text-aviso">
            {SELO_MODO_ORIGINAL}
          </Badge>
        )}
      </p>
      <ListaFalhas falhas={coletarFalhas(r)} comOpcoes />
      <ListaAvisos
        avisos={avisosDoFiltro(semMarcasDuplicadas(coletarAvisos(r, detalhamento), r), filtro)}
        vazio={filtro === MOSTRA_TUDO ? vazioComMarcas(r) : "Nenhum aviso nos elementos do filtro."}
        comOpcoes
      />
      <BlocoMotorSistrut resultado={r} comOpcoes />
      <FiltroContexto value={filtro}>
        <TabelasObra resultado={r} comMemoria ate={ate} naTela />
      </FiltroContexto>
      {montando ? (
        <Montando feitos={ate} total={r.pavimentos.length} />
      ) : (
        obra && filtro === MOSTRA_TUDO && <BlocoQuantitativos obra={obra} resultado={r} />
      )}
    </div>
  );
}

/** Avisos dos elementos que o filtro mostra; sem filtro, todos. Aviso do pavimento ou da
 *  obra (sem elemento) e do equilíbrio sai com o filtro ligado. O elemento do detalhamento
 *  vem como "V1 (detalhamento)". */
export function avisosDoFiltro(avisos: Aviso[], mostra: Filtro) {
  if (mostra === MOSTRA_TUDO) return avisos;
  return avisos.filter((a) => a.elemento !== "" && mostra(a.elemento.replace(/ \(.*\)$/, "")));
}

/** Obras com até este número de etapas (pavimentos + pilares) aparecem de uma vez. */
const ETAPAS_DE_UMA_VEZ = 3;

/**
 * Quantas etapas da aba Resultados já aparecem. Obra pequena: todas. Obra grande:
 * uma por vez, cada uma numa tarefa separada (startTransition depois de um setTimeout),
 * para a aba abrir na hora e a página responder enquanto as tabelas entram.
 */
function useMontagemGradual(total: number) {
  const [ate, setAte] = useState(() => (total <= ETAPAS_DE_UMA_VEZ ? total : 1));
  // obra trocada ou recalculada com outro número de pavimentos: recomeça
  const [totalAntes, setTotalAntes] = useState(total);
  if (total !== totalAntes) {
    setTotalAntes(total);
    setAte(total <= ETAPAS_DE_UMA_VEZ ? total : Math.min(ate, total));
  }
  useEffect(() => {
    if (ate >= total) return;
    const t = setTimeout(() => startTransition(() => setAte((n) => n + 1)), 0);
    return () => clearTimeout(t);
  }, [ate, total]);
  return Math.min(ate, total);
}

/** Aviso de progresso enquanto os pavimentos entram na aba Resultados. */
function Montando({ feitos, total }: { feitos: number; total: number }) {
  return (
    <div role="status" className="text-muted-foreground mt-6 grid max-w-sm gap-1.5 text-xs">
      <span>
        {feitos < total
          ? `Montando as tabelas: ${feitos} de ${total} pavimentos; depois, os pilares.`
          : "Montando as tabelas dos pilares."}
      </span>
      <progress
        max={total + 1}
        value={feitos}
        aria-label="Progresso da montagem dos resultados"
        className="accent-primary h-1.5 w-full"
      />
    </div>
  );
}

/** Resumo de aço e concreto da obra aberta (a obra traz cobrimentos e geometria). */
function BlocoQuantitativos({ obra, resultado }: { obra: Obra; resultado: ResultadoObra }) {
  const quant = useMemo(() => calcularQuantitativos(obra, resultado), [obra, resultado]);
  return <ResumoQuantitativos quant={quant} obra={obra} />;
}
