// Editor gráfico da planta do pavimento ativo (useObra / usePavimentoAtivo):
// grade com snap, zoom na roda, pan (botão do meio ou espaço + arrastar),
// ferramentas Selecionar / Laje / Pilar, apagar, desfazer/refazer, painel de
// propriedades e, com `resultado`, a cor de cada laje e viga pela situação do cálculo
// (com `pilares`, também a dos pilares: a pior entre os níveis do pavimento).
// As regras de edição (e o que regenera a estrutura) estão em edicao.ts.
import { useEffect, useMemo, useRef, useState, type PointerEvent as EventoPonteiro } from "react";
import type { ResultadoPavimento, ResultadoPilar } from "../calculo/fluxo";
import type { Pavimento } from "../dominio/obra";
import { useObra, usePavimentoAtivo } from "../estado/obra";
import { COR_SITUACAO, Desenho, ROTULO_SITUACAO } from "./Desenho";
import {
  acrescentarLaje,
  acrescentarPilar,
  alterarLaje,
  apagarLaje,
  apagarPilar,
  apagarViga,
  moverPilar,
  substituirPavimento,
  type Edicao,
} from "./edicao";
import { DialogoAdicionar } from "./DialogoAdicionar";
import { fmt } from "./formato";
import {
  type Alvo,
  CAIXA_VAZIA,
  cabeNaTela,
  caixaDoAlvo,
  caixaDoPavimento,
  elementoEm,
  enquadrar,
  lajeSobreposta,
  linhasDeSnap,
  normalizarRetangulo,
  proximoAlvo,
  snap,
  telaParaMundo,
  zoomNoPonto,
  type Ponto,
  type Vista,
} from "./geometria";
import { PainelPropriedades } from "./PainelPropriedades";
import { diagnosticos, SEM_CALCULO, type Situacao } from "./situacao";

type Ferramenta = "selecionar" | "laje" | "pilar";
type Arrasto = { tipo: "pan"; inicio: Ponto; vista: Vista } | { tipo: "laje"; a: Ponto; b: Ponto };
type Mensagem = { tipo: "erro" | "aviso" | "info"; texto: string };

export const GRADES = [0.25, 0.5, 1] as const;
/** Distância de snap aos bordos de lajes e folga do clique de seleção, px. */
const SNAP_PX = 10;
const CLIQUE_PX = 6;
/** Sentido de cada seta no mundo (y para cima), em passos de grade com Shift. */
const DIRECAO: Record<string, Ponto> = {
  ArrowRight: { x: 1, y: 0 },
  ArrowLeft: { x: -1, y: 0 },
  ArrowUp: { x: 0, y: 1 },
  ArrowDown: { x: 0, y: -1 },
};

/** `resultado`: cálculo do pavimento ativo; `pilares`: ResultadoObra.pilares (todos os
 *  níveis; o editor filtra os do pavimento ativo). Sem eles a planta fica sem cores. */
export function EditorPlanta(props: {
  resultado?: ResultadoPavimento;
  pilares?: ResultadoPilar[];
}) {
  const pav = usePavimentoAtivo();
  if (!pav) return <div className="p-4 text-sm text-slate-400">Nenhum pavimento aberto.</div>;
  return <Editor pav={pav} resultado={props.resultado} pilares={props.pilares} />;
}

function Editor({
  pav,
  resultado,
  pilares,
}: {
  pav: Pavimento;
  resultado: ResultadoPavimento | undefined;
  pilares: ResultadoPilar[] | undefined;
}) {
  const editar = useObra((s) => s.editar);
  const desfazer = useObra((s) => s.desfazer);
  const refazer = useObra((s) => s.refazer);
  const selecao = useObra((s) => s.selecao);
  const selecionar = useObra((s) => s.selecionar);

  const [ferramenta, setFerramenta] = useState<Ferramenta>("selecionar");
  const [grade, setGrade] = useState<number>(0.5);
  const [tamanho, setTamanho] = useState({ largura: 0, altura: 0 });
  const [vistaSalva, setVistaSalva] = useState<{ pavId: string; vista: Vista }>();
  const [arrasto, setArrasto] = useState<Arrasto>();
  const [cursor, setCursor] = useState<Ponto>();
  const [espaco, setEspaco] = useState(false);
  const [mensagem, setMensagem] = useState<Mensagem>();
  const [adicionando, setAdicionando] = useState(false);
  const areaRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const enquadrarTudo = () =>
    enquadrar(caixaDoPavimento(pav) ?? CAIXA_VAZIA, tamanho.largura, tamanho.altura);
  // enquadra ao abrir e ao trocar de pavimento (ajuste de estado durante a renderização)
  if (tamanho.largura > 0 && vistaSalva?.pavId !== pav.id)
    setVistaSalva({ pavId: pav.id, vista: enquadrarTudo() });
  const vista = vistaSalva?.pavId === pav.id ? vistaSalva.vista : undefined;
  const setVista = (v: Vista) => setVistaSalva({ pavId: pav.id, vista: v });

  const linhas = useMemo(() => linhasDeSnap(pav.lajes), [pav.lajes]);
  const diag = useMemo(() => resultado && diagnosticos(resultado, pilares), [resultado, pilares]);

  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      if (e) setTamanho({ largura: e.contentRect.width, altura: e.contentRect.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // zoom na roda centrado no cursor; listener nativo para poder impedir a rolagem da
  // página. Atualização funcional: vários eventos no mesmo quadro se acumulam.
  const temVista = vista !== undefined;
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || !temVista) return;
    const roda = (e: WheelEvent) => {
      e.preventDefault();
      const r = svg.getBoundingClientRect();
      const t = { x: e.clientX - r.left, y: e.clientY - r.top };
      const fator = Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0015));
      setVistaSalva((s) => s && { pavId: s.pavId, vista: zoomNoPonto(s.vista, t, fator) });
    };
    svg.addEventListener("wheel", roda, { passive: false });
    return () => svg.removeEventListener("wheel", roda);
  }, [temVista]);

  useEffect(() => {
    if (!mensagem) return;
    const t = setTimeout(() => setMensagem(undefined), 7000);
    return () => clearTimeout(t);
  }, [mensagem]);

  const aplicar = (p: Pavimento) => editar((o) => substituirPavimento(o, pav.id, p));
  const aplicarEdicao = (e: Edicao) => {
    if (!e.ok) return e.erro;
    aplicar(e.pavimento);
    return undefined;
  };

  /** Grava o elemento criado e o seleciona; se ele não cabe na área visível, reenquadra o pavimento. */
  function criado(novo: Pavimento, alvo: Alvo) {
    aplicar(novo);
    selecionar(alvo);
    const caixa = caixaDoAlvo(novo, alvo);
    if (vista && caixa && !cabeNaTela(vista, caixa, tamanho.largura, tamanho.altura))
      setVista(enquadrar(caixaDoPavimento(novo) ?? CAIXA_VAZIA, tamanho.largura, tamanho.altura));
  }

  function apagarSelecao() {
    if (!selecao) return;
    if (selecao.tipo === "laje") {
      const erro = aplicarEdicao(apagarLaje(pav, selecao.id));
      if (erro) setMensagem({ tipo: "erro", texto: erro });
    } else if (selecao.tipo === "viga") {
      const erro = aplicarEdicao(apagarViga(pav, selecao.id));
      setMensagem(
        erro
          ? { tipo: "erro", texto: erro }
          : {
              tipo: "info",
              texto:
                'Viga apagada: os bordos das lajes sobre ela ficaram livres. Para recriá-la, volte o vínculo desses bordos para "auto".',
            },
      );
    } else {
      const nome = pav.pilares.find((p) => p.id === selecao.id)?.nome ?? "";
      const r = apagarPilar(pav, selecao.id);
      if (!r.ok) return setMensagem({ tipo: "erro", texto: r.erro });
      aplicar(r.pavimento);
      if (r.gerado)
        setMensagem({
          tipo: "info",
          texto: `${nome} apagado: a viga passa contínua sobre o ponto (marcado tracejado). Para recolocá-lo, desenhe um pilar ali.`,
        });
    }
    selecionar(null);
  }

  /** Desloca o elemento selecionado em metros: laje por alterarLaje (regenera a estrutura),
   *  pilar por moverPilar. Viga não se move; a mensagem diz de onde vem a posição dela. */
  function moverSelecao(dx: number, dy: number) {
    if (!selecao) return;
    if (selecao.tipo === "viga") {
      setMensagem({ tipo: "info", texto: "Vigas não se movem: a posição delas vem das lajes." });
      return;
    }
    const erro =
      selecao.tipo === "laje"
        ? (() => {
            const l = pav.lajes.find((q) => q.id === selecao.id);
            return l && aplicarEdicao(alterarLaje(pav, l.id, { x: l.x + dx, y: l.y + dy }));
          })()
        : (() => {
            const p = pav.pilares.find((q) => q.id === selecao.id);
            return p && aplicarEdicao(moverPilar(pav, p.id, { x: p.x + dx, y: p.y + dy }));
          })();
    setMensagem(erro ? { tipo: "erro", texto: erro } : undefined);
  }

  // atalhos de teclado (fora de campos de texto e de diálogos abertos por cima da planta)
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      const alvo = e.target;
      if (
        alvo instanceof HTMLElement &&
        (alvo.isContentEditable ||
          ["INPUT", "SELECT", "TEXTAREA"].includes(alvo.tagName) ||
          alvo.closest('[role="dialog"], [role="alertdialog"]'))
      )
        return;
      const k = e.key.toLowerCase();
      if (e.ctrlKey || e.metaKey) {
        if (k === "z" && !e.shiftKey) desfazer();
        else if (k === "y" || (k === "z" && e.shiftKey)) refazer();
        else return;
        e.preventDefault();
        return;
      }
      if (e.altKey) return;
      // Shift+seta move o selecionado um passo de grade (com a planta em foco)
      const direcao = DIRECAO[e.key];
      if (e.shiftKey && direcao && alvo === svgRef.current) {
        e.preventDefault();
        moverSelecao(direcao.x * grade, direcao.y * grade);
        return;
      }
      // com a planta em foco, as setas percorrem os elementos (Tab segue para fora da planta)
      const passo =
        e.key === "ArrowRight" || e.key === "ArrowDown"
          ? 1
          : e.key === "ArrowLeft" || e.key === "ArrowUp"
            ? -1
            : 0;
      if (passo !== 0 && alvo === svgRef.current) {
        e.preventDefault();
        const prox = proximoAlvo(pav, selecao, passo);
        if (prox) selecionar(prox);
        return;
      }
      if (e.key === " ") {
        e.preventDefault();
        setEspaco(true);
      } else if (k === "v") setFerramenta("selecionar");
      else if (k === "l") setFerramenta("laje");
      else if (k === "p") setFerramenta("pilar");
      else if (k === "a") setAdicionando(true);
      else if (e.key === "Delete") apagarSelecao();
      else if (e.key === "Escape") {
        setMensagem(undefined);
        if (arrasto) setArrasto(undefined);
        else if (ferramenta !== "selecionar") setFerramenta("selecionar");
        else selecionar(null);
      }
    };
    const solta = (e: KeyboardEvent) => {
      if (e.key === " ") setEspaco(false);
    };
    const perdeFoco = () => setEspaco(false);
    window.addEventListener("keydown", tecla);
    window.addEventListener("keyup", solta);
    window.addEventListener("blur", perdeFoco);
    return () => {
      window.removeEventListener("keydown", tecla);
      window.removeEventListener("keyup", solta);
      window.removeEventListener("blur", perdeFoco);
    };
  });

  const pontoTela = (e: EventoPonteiro<SVGSVGElement>): Ponto => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const pontoSnap = (v: Vista, t: Ponto) =>
    snap(telaParaMundo(v, t), grade, linhas, SNAP_PX / v.escala);

  function aoPressionar(e: EventoPonteiro<SVGSVGElement>) {
    if (!vista) return;
    const t = pontoTela(e);
    if (e.button === 1 || (e.button === 0 && espaco)) {
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      setArrasto({ tipo: "pan", inicio: t, vista });
      return;
    }
    if (e.button !== 0) return;
    if (ferramenta === "laje") {
      e.currentTarget.setPointerCapture(e.pointerId);
      const p = pontoSnap(vista, t);
      setArrasto({ tipo: "laje", a: p, b: p });
    } else if (ferramenta === "pilar") {
      const r = acrescentarPilar(pav, pontoSnap(vista, t));
      if (!r.ok) return setMensagem({ tipo: "erro", texto: r.erro });
      criado(r.pavimento, { tipo: "pilar", id: r.id });
    } else {
      selecionar(elementoEm(pav, telaParaMundo(vista, t), CLIQUE_PX / vista.escala) ?? null);
    }
  }

  function aoMover(e: EventoPonteiro<SVGSVGElement>) {
    if (!vista) return;
    const t = pontoTela(e);
    if (arrasto?.tipo === "pan") {
      const v = arrasto.vista;
      setVista({ ...v, ox: v.ox + t.x - arrasto.inicio.x, oy: v.oy + t.y - arrasto.inicio.y });
      return;
    }
    const p = ferramenta === "selecionar" ? telaParaMundo(vista, t) : pontoSnap(vista, t);
    setCursor(p);
    if (arrasto?.tipo === "laje") setArrasto({ ...arrasto, b: p });
  }

  function aoSoltar() {
    if (arrasto?.tipo === "laje") {
      const r = normalizarRetangulo(arrasto.a, arrasto.b);
      if (r.lx === 0 || r.ly === 0) {
        setMensagem({ tipo: "info", texto: "Arraste para desenhar o retângulo da laje." });
      } else {
        const res = acrescentarLaje(pav, r);
        if (!res.ok) setMensagem({ tipo: "erro", texto: res.erro });
        else criado(res.pavimento, { tipo: "laje", id: res.id });
      }
    }
    setArrasto(undefined);
  }

  const previa = arrasto?.tipo === "laje" ? normalizarRetangulo(arrasto.a, arrasto.b) : undefined;
  const cursorSvg =
    arrasto?.tipo === "pan"
      ? "grabbing"
      : espaco
        ? "grab"
        : ferramenta === "selecionar"
          ? "default"
          : "crosshair";
  const mapaSelecao = selecao
    ? { laje: diag?.lajes, viga: diag?.vigas, pilar: diag?.pilares }[selecao.tipo]
    : undefined;
  const diagSelecao =
    selecao && mapaSelecao ? (mapaSelecao.get(selecao.id) ?? SEM_CALCULO) : undefined;

  return (
    <div className="flex h-full min-h-[480px] flex-col bg-slate-950 text-slate-100">
      <div className="flex flex-wrap items-center gap-1 border-b border-slate-800 px-2 py-1 text-sm">
        <Botao
          ativo={ferramenta === "selecionar"}
          onClick={() => setFerramenta("selecionar")}
          dica="V"
        >
          Selecionar
        </Botao>
        <Botao ativo={ferramenta === "laje"} onClick={() => setFerramenta("laje")} dica="L">
          Laje
        </Botao>
        <Botao ativo={ferramenta === "pilar"} onClick={() => setFerramenta("pilar")} dica="P">
          Pilar
        </Botao>
        <Botao onClick={() => setAdicionando(true)} dica="A">
          Adicionar…
        </Botao>
        <Botao onClick={apagarSelecao} desabilitado={!selecao} dica="Delete">
          Apagar
        </Botao>
        <Separador />
        <Botao onClick={() => setVista(enquadrarTudo())} desabilitado={tamanho.largura === 0}>
          Enquadrar tudo
        </Botao>
        <label className="ml-1 flex items-center gap-1 text-xs text-slate-400">
          Grade
          <select
            value={grade}
            onChange={(e) => setGrade(Number(e.target.value))}
            className="rounded border border-slate-700 bg-slate-900 px-1 py-0.5 text-slate-100"
          >
            {GRADES.map((g) => (
              <option key={g} value={g}>
                {fmt(g)} m
              </option>
            ))}
          </select>
        </label>
      </div>

      <DialogoAdicionar
        pav={pav}
        aberto={adicionando}
        aoMudarAberto={setAdicionando}
        aoCriar={(novo, alvo) => {
          criado(novo, alvo);
          setAdicionando(false);
        }}
      />

      <div className="flex min-h-0 flex-1">
        <div ref={areaRef} className="relative min-w-0 flex-1 overflow-hidden bg-slate-900">
          <svg
            ref={svgRef}
            role="application"
            aria-label="Planta do pavimento"
            tabIndex={0}
            className="absolute inset-0 size-full touch-none select-none outline-none focus-visible:-outline-offset-2 focus-visible:outline-2 focus-visible:outline-sky-400"
            style={{ cursor: cursorSvg }}
            onPointerDown={aoPressionar}
            onPointerMove={aoMover}
            onPointerUp={aoSoltar}
            onPointerCancel={() => setArrasto(undefined)}
            onPointerLeave={() => setCursor(undefined)}
            onMouseDown={(e) => {
              if (e.button === 1) e.preventDefault(); // sem rolagem automática do botão do meio
            }}
            onContextMenu={(e) => e.preventDefault()}
          >
            {vista && (
              <Desenho
                pav={pav}
                vista={vista}
                largura={tamanho.largura}
                altura={tamanho.altura}
                grade={grade}
                selecao={selecao}
                diag={diag}
                previa={
                  previa && { r: previa, invalida: lajeSobreposta(pav.lajes, previa) !== undefined }
                }
                cursor={ferramenta === "selecionar" ? undefined : cursor}
              />
            )}
          </svg>
          {diag && <Legenda />}
        </div>
        <aside
          aria-label="Propriedades"
          className="w-72 shrink-0 overflow-y-auto border-l border-slate-800"
        >
          <PainelPropriedades
            pav={pav}
            selecao={selecao}
            diagnostico={diagSelecao}
            aplicar={aplicarEdicao}
            apagar={apagarSelecao}
          />
        </aside>
      </div>

      <div className="flex items-center gap-4 border-t border-slate-800 px-2 py-0.5 font-mono text-xs text-slate-400">
        <span className="w-44 tabular-nums">
          {cursor ? `x = ${fmt(cursor.x)}  y = ${fmt(cursor.y)} m` : " "}
        </span>
        <span>{DICAS[ferramenta]}</span>
        {mensagem && (
          <span role="status" className={`ml-auto font-sans ${COR_MENSAGEM[mensagem.tipo]}`}>
            {mensagem.texto}
          </span>
        )}
      </div>
    </div>
  );
}

const DICAS: Record<Ferramenta, string> = {
  selecionar: "Clique num elemento para selecionar.",
  laje: "Arraste o retângulo da laje (snap à grade e aos bordos).",
  pilar: "Clique sobre o eixo de uma viga para acrescentar um pilar 20 × 20 cm.",
};

const COR_MENSAGEM: Record<Mensagem["tipo"], string> = {
  erro: "text-red-400",
  aviso: "text-amber-300",
  info: "text-sky-300",
};

function Legenda() {
  const itens: Situacao[] = ["ok", "aviso", "falha"];
  return (
    <div className="pointer-events-none absolute right-2 bottom-2 rounded border border-slate-700 bg-slate-950/85 px-2 py-1 text-xs text-slate-300">
      {itens.map((s) => (
        <div key={s} className="flex items-center gap-1.5">
          <span
            className="inline-block size-2.5 rounded-sm"
            style={{ background: COR_SITUACAO[s] }}
          />
          {ROTULO_SITUACAO[s]}
        </div>
      ))}
      <div className="mt-0.5 text-slate-500">Passe o mouse para ver os avisos.</div>
    </div>
  );
}

const Separador = () => <span className="mx-1 h-5 w-px bg-slate-700" />;

function Botao({
  children,
  onClick,
  ativo = false,
  desabilitado = false,
  dica,
}: {
  children: string;
  onClick: () => void;
  ativo?: boolean;
  desabilitado?: boolean;
  dica?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={desabilitado}
      title={dica && `${children} (${dica})`}
      aria-pressed={ativo}
      className={`rounded px-2 py-0.5 ${
        ativo ? "bg-sky-700 text-white" : "text-slate-200 hover:bg-slate-800"
      } disabled:opacity-40 disabled:hover:bg-transparent`}
    >
      {children}
    </button>
  );
}
