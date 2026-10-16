// Editor gráfico da planta do pavimento ativo (useObra / usePavimentoAtivo):
// grade com snap, zoom na roda, pan (botão do meio ou espaço + arrastar),
// ferramentas Selecionar / Laje / Pilar, apagar, desfazer/refazer, painel de
// propriedades e, com `resultado`, a cor de cada laje e viga pela situação do cálculo
// (com `pilares`, também a dos pilares: a pior entre os níveis do pavimento).
// No toque: pinça com dois dedos dá zoom e move a vista; com Selecionar, arrastar um
// dedo move a vista e tocar seleciona; Laje é arrastar o dedo; Pilar é tocar.
// No celular (useCompacto) o desenho ocupa a tela, a barra de ferramentas tem alvos de
// 44 px e as propriedades abrem numa folha embaixo (deitado, numa gaveta à direita).
// As regras de edição (e o que regenera a estrutura) estão em edicao.ts.
import {
  Columns2,
  Grid3x3,
  MousePointer2,
  PanelBottomOpen,
  Plus,
  Scan,
  Square,
  Trash2,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as EventoPonteiro,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";
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
import { useCompacto, usePaisagem } from "../telas/tela";

type Ferramenta = "selecionar" | "laje" | "pilar";
type Arrasto = { tipo: "pan"; inicio: Ponto; vista: Vista } | { tipo: "laje"; a: Ponto; b: Ponto };
type Mensagem = { tipo: "erro" | "aviso" | "info"; texto: string };
/** Gesto de toque em andamento. `um`: um dedo (toque ou arrasto); `pinca`: dois dedos,
 *  com a distância, o ponto médio e a vista do início; depois dela, os dedos que
 *  sobram não fazem nada até todos saírem da tela. */
type Gesto =
  | { tipo: "um"; inicio: Ponto; moveu: boolean }
  | { tipo: "pinca"; distancia: number; meio: Ponto; vista: Vista }
  | { tipo: "fim" };

const distancia = (a: Ponto, b: Ponto) => Math.hypot(a.x - b.x, a.y - b.y);
const meio = (a: Ponto, b: Ponto): Ponto => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

export const GRADES = [0.25, 0.5, 1] as const;
/** Distância de snap aos bordos de lajes e folga do clique de seleção, px. O dedo
 *  cobre o alvo e erra mais que o mouse: no toque as folgas são maiores. */
const SNAP_PX = 10;
const CLIQUE_PX = 6;
const SNAP_TOQUE_PX = 22;
const CLIQUE_TOQUE_PX = 18;
/** Deslocamento do dedo abaixo do qual o gesto ainda é um toque (não um arrasto), px. */
const TOQUE_PX = 8;
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
  const compacto = useCompacto();
  const paisagem = usePaisagem() && compacto;
  // celular: a folha de propriedades abre ao tocar num elemento e fecha no X
  const [folha, setFolha] = useState(false);
  // dedos na tela (posição na tela por pointerId) e o gesto que eles fazem
  const dedos = useRef(new Map<number, Ponto>());
  const gesto = useRef<Gesto | null>(null);

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
  const pontoSnap = (v: Vista, t: Ponto, px = SNAP_PX) =>
    snap(telaParaMundo(v, t), grade, linhas, px / v.escala);

  /** Acrescenta um pilar no ponto da tela `t` (com snap) ou mostra por que não dá. */
  function lancarPilar(v: Vista, t: Ponto, px: number) {
    const r = acrescentarPilar(pav, pontoSnap(v, t, px));
    if (!r.ok) return setMensagem({ tipo: "erro", texto: r.erro });
    criado(r.pavimento, { tipo: "pilar", id: r.id });
  }

  /** Seleciona o elemento sob o ponto da tela `t`; no celular abre ou fecha a folha junto. */
  function selecionarEm(v: Vista, t: Ponto, px: number) {
    const alvo = elementoEm(pav, telaParaMundo(v, t), px / v.escala);
    selecionar(alvo ?? null);
    if (compacto) setFolha(alvo !== undefined);
  }

  /** Dedo encostou: dois dedos começam a pinça (e cancelam o que o primeiro começou);
   *  um dedo começa a laje ou o arrasto da vista; toque de seleção e de pilar esperam
   *  o dedo sair, para a pinça não lançar nada. */
  function aoTocar(e: EventoPonteiro<SVGSVGElement>, v: Vista, t: Ponto) {
    e.currentTarget.setPointerCapture(e.pointerId);
    dedos.current.set(e.pointerId, t);
    const [a, b] = [...dedos.current.values()];
    if (a && b) {
      gesto.current = {
        tipo: "pinca",
        distancia: Math.max(distancia(a, b), 1),
        meio: meio(a, b),
        vista: v,
      };
      setArrasto(undefined);
      return;
    }
    gesto.current = { tipo: "um", inicio: t, moveu: false };
    if (ferramenta === "laje") {
      const p = pontoSnap(v, t, SNAP_TOQUE_PX);
      setArrasto({ tipo: "laje", a: p, b: p });
      setCursor(p);
    } else if (ferramenta === "selecionar") setArrasto({ tipo: "pan", inicio: t, vista: v });
  }

  /** Dedo se moveu. Devolve true quando o gesto já tratou o movimento. */
  function aoArrastarDedo(e: EventoPonteiro<SVGSVGElement>, t: Ponto): boolean {
    if (!dedos.current.has(e.pointerId)) return true;
    dedos.current.set(e.pointerId, t);
    const g = gesto.current;
    if (g?.tipo === "pinca") {
      const [a, b] = [...dedos.current.values()];
      if (!a || !b) return true;
      const m = meio(a, b);
      const z = zoomNoPonto(g.vista, g.meio, distancia(a, b) / g.distancia);
      setVista({ ...z, ox: z.ox + m.x - g.meio.x, oy: z.oy + m.y - g.meio.y });
      return true;
    }
    if (g?.tipo !== "um") return true;
    if (!g.moveu && distancia(t, g.inicio) > TOQUE_PX) g.moveu = true;
    // pilar não arrasta; no Selecionar a vista só anda depois de passar da folga do toque
    return ferramenta === "pilar" || (ferramenta === "selecionar" && !g.moveu);
  }

  /** Dedo saiu: fecha o toque (seleção ou pilar) ou a laje; a pinça acaba com o último dedo. */
  function aoSoltarDedo(e: EventoPonteiro<SVGSVGElement>, t: Ponto) {
    dedos.current.delete(e.pointerId);
    const g = gesto.current;
    if (g?.tipo !== "um") {
      gesto.current = dedos.current.size === 0 ? null : { tipo: "fim" };
      setArrasto(undefined);
      return;
    }
    gesto.current = null;
    if (vista && !g.moveu && ferramenta === "selecionar") selecionarEm(vista, t, CLIQUE_TOQUE_PX);
    else if (vista && !g.moveu && ferramenta === "pilar") lancarPilar(vista, t, SNAP_TOQUE_PX);
    aoSoltar();
  }

  function aoPressionar(e: EventoPonteiro<SVGSVGElement>) {
    if (!vista) return;
    const t = pontoTela(e);
    if (e.pointerType === "touch") return aoTocar(e, vista, t);
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
      lancarPilar(vista, t, SNAP_PX);
    } else {
      selecionarEm(vista, t, CLIQUE_PX);
    }
  }

  function aoMover(e: EventoPonteiro<SVGSVGElement>) {
    if (!vista) return;
    const t = pontoTela(e);
    const toque = e.pointerType === "touch";
    if (toque && aoArrastarDedo(e, t)) return;
    if (arrasto?.tipo === "pan") {
      const v = arrasto.vista;
      setVista({ ...v, ox: v.ox + t.x - arrasto.inicio.x, oy: v.oy + t.y - arrasto.inicio.y });
      return;
    }
    const p =
      ferramenta === "selecionar"
        ? telaParaMundo(vista, t)
        : pontoSnap(vista, t, toque ? SNAP_TOQUE_PX : SNAP_PX);
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

  /** Fim de um gesto ou de uma interrupção (o navegador tomou o ponteiro): limpa tudo. */
  function aoCancelar(e: EventoPonteiro<SVGSVGElement>) {
    dedos.current.delete(e.pointerId);
    gesto.current = dedos.current.size === 0 ? null : { tipo: "fim" };
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

  const painel = (
    <PainelPropriedades
      pav={pav}
      selecao={selecao}
      diagnostico={diagSelecao}
      aplicar={aplicarEdicao}
      apagar={apagarSelecao}
      toque={compacto}
    />
  );
  const seletorGrade = (
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
  );

  // ferramentas do celular, em botões de 44 px com ícone e rótulo curto
  const ferramentasCompactas = (
    <>
      <BotaoCompacto
        icone={MousePointer2}
        ativo={ferramenta === "selecionar"}
        onClick={() => setFerramenta("selecionar")}
      >
        Selecionar
      </BotaoCompacto>
      <BotaoCompacto
        icone={Square}
        ativo={ferramenta === "laje"}
        onClick={() => setFerramenta("laje")}
      >
        Laje
      </BotaoCompacto>
      <BotaoCompacto
        icone={Columns2}
        ativo={ferramenta === "pilar"}
        onClick={() => setFerramenta("pilar")}
      >
        Pilar
      </BotaoCompacto>
      <BotaoCompacto icone={Plus} rotulo="Adicionar…" onClick={() => setAdicionando(true)}>
        Adicionar
      </BotaoCompacto>
      <BotaoCompacto icone={Trash2} onClick={apagarSelecao} desabilitado={!selecao}>
        Apagar
      </BotaoCompacto>
      <BotaoCompacto
        icone={Scan}
        rotulo="Enquadrar tudo"
        onClick={() => setVista(enquadrarTudo())}
        desabilitado={tamanho.largura === 0}
      >
        Enquadrar
      </BotaoCompacto>
      <BotaoCompacto icone={PanelBottomOpen} ativo={folha} onClick={() => setFolha((f) => !f)}>
        Propriedades
      </BotaoCompacto>
      <label className="flex min-h-11 shrink-0 flex-col items-center justify-center gap-0.5 px-1 text-[11px] text-slate-400">
        <span className="flex items-center gap-1">
          <Grid3x3 className="size-3.5" /> Grade
        </span>
        {seletorGrade}
      </label>
    </>
  );

  return (
    <div
      className={cn(
        "flex h-full flex-col bg-slate-950 text-slate-100",
        !compacto && "min-h-[480px]",
      )}
    >
      {compacto ? (
        !paisagem && <BarraCompacta>{ferramentasCompactas}</BarraCompacta>
      ) : (
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
            {seletorGrade}
          </label>
        </div>
      )}

      <DialogoAdicionar
        pav={pav}
        aberto={adicionando}
        aoMudarAberto={setAdicionando}
        aoCriar={(novo, alvo) => {
          criado(novo, alvo);
          setAdicionando(false);
        }}
      />

      <div className={cn("flex min-h-0 flex-1", compacto && !paisagem && "flex-col")}>
        {paisagem && <BarraCompacta vertical>{ferramentasCompactas}</BarraCompacta>}
        <div ref={areaRef} className="relative min-h-0 min-w-0 flex-1 overflow-hidden bg-slate-900">
          <svg
            ref={svgRef}
            role="application"
            aria-label="Planta do pavimento"
            tabIndex={0}
            className="absolute inset-0 size-full touch-none select-none outline-none focus-visible:-outline-offset-2 focus-visible:outline-2 focus-visible:outline-sky-400"
            style={{ cursor: cursorSvg }}
            onPointerDown={aoPressionar}
            onPointerMove={aoMover}
            onPointerUp={(e) =>
              e.pointerType === "touch" ? aoSoltarDedo(e, pontoTela(e)) : aoSoltar()
            }
            onPointerCancel={aoCancelar}
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
          {diag && <Legenda compacta={compacto} />}
        </div>
        {!compacto ? (
          <aside
            aria-label="Propriedades"
            className="w-72 shrink-0 overflow-y-auto border-l border-slate-800"
          >
            {painel}
          </aside>
        ) : (
          folha && (
            // folha presa embaixo do desenho (deitado, gaveta à direita): o desenho encolhe
            // em vez de ficar escondido atrás dela
            <aside
              aria-label="Propriedades"
              className={cn(
                "flex shrink-0 flex-col border-slate-700 bg-slate-950",
                paisagem
                  ? "w-[min(20rem,45%)] border-l"
                  : "max-h-[50%] rounded-t-xl border-t shadow-[0_-4px_12px_rgb(0_0_0/0.4)]",
              )}
            >
              <div className="flex items-center gap-2 border-b border-slate-800 pl-3">
                {!paisagem && (
                  <span aria-hidden className="mx-auto h-1 w-10 rounded-full bg-slate-600" />
                )}
                <button
                  type="button"
                  aria-label="Fechar propriedades"
                  onClick={() => setFolha(false)}
                  className="ml-auto flex size-11 items-center justify-center text-slate-300 hover:bg-slate-800"
                >
                  <X className="size-5" />
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[env(safe-area-inset-bottom)]">
                {painel}
              </div>
            </aside>
          )
        )}
      </div>

      <div
        className={cn(
          "flex items-center gap-x-4 border-t border-slate-800 px-2 py-0.5 font-mono text-xs text-slate-400",
          compacto && "flex-wrap gap-x-2 leading-tight",
        )}
      >
        <span className={cn("tabular-nums", compacto ? "shrink-0" : "w-44")}>
          {cursor ? `x = ${fmt(cursor.x)}  y = ${fmt(cursor.y)} m` : " "}
        </span>
        {!(compacto && mensagem) && (
          <span className={cn(compacto && "min-w-0 truncate font-sans")}>
            {(compacto ? DICAS_TOQUE : DICAS)[ferramenta]}
          </span>
        )}
        {mensagem && (
          <span
            role="status"
            className={cn(
              "font-sans",
              COR_MENSAGEM[mensagem.tipo],
              compacto ? "basis-full" : "ml-auto",
            )}
          >
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

const DICAS_TOQUE: Record<Ferramenta, string> = {
  selecionar: "Toque para selecionar; arraste para mover, pinça para zoom.",
  laje: "Arraste o dedo de um canto ao outro da laje.",
  pilar: "Toque sobre o eixo de uma viga: pilar 20 × 20 cm.",
};

/** Barra de ferramentas do celular: rola de lado (ou, deitado, de cima a baixo). */
function BarraCompacta({
  vertical = false,
  children,
}: {
  vertical?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      role="toolbar"
      aria-label="Ferramentas da planta"
      aria-orientation={vertical ? "vertical" : "horizontal"}
      className={cn(
        "flex shrink-0 gap-0.5 border-slate-800 [scrollbar-width:none]",
        vertical
          ? "w-16 flex-col overflow-y-auto overscroll-y-contain border-r py-0.5"
          : "items-stretch overflow-x-auto overscroll-x-contain border-b px-1",
      )}
    >
      {children}
    </div>
  );
}

/** Botão da barra do celular: 44 px no mínimo, ícone em cima e rótulo embaixo.
 *  `rotulo`: nome acessível quando difere do texto curto à vista. */
function BotaoCompacto({
  icone: Icone,
  children,
  rotulo,
  onClick,
  ativo,
  desabilitado = false,
}: {
  icone: LucideIcon;
  children: string;
  rotulo?: string;
  onClick: () => void;
  ativo?: boolean;
  desabilitado?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={desabilitado}
      aria-label={rotulo}
      aria-pressed={ativo}
      className={cn(
        "flex min-h-12 min-w-14 shrink-0 flex-col items-center justify-center gap-0.5 rounded px-1.5 text-[11px] leading-none",
        ativo ? "bg-sky-700 text-white" : "text-slate-200 active:bg-slate-800",
        "disabled:opacity-40",
      )}
    >
      <Icone className="size-5" aria-hidden />
      {children}
    </button>
  );
}

const COR_MENSAGEM: Record<Mensagem["tipo"], string> = {
  erro: "text-red-400",
  aviso: "text-amber-300",
  info: "text-sky-300",
};

/** Cores da situação de cálculo. `compacta` (celular): numa linha, sem a dica do mouse. */
function Legenda({ compacta }: { compacta: boolean }) {
  const itens: Situacao[] = ["ok", "aviso", "falha"];
  return (
    <div
      className={cn(
        "pointer-events-none absolute right-2 bottom-2 rounded border border-slate-700 bg-slate-950/85 px-2 py-1 text-xs text-slate-300",
        compacta && "left-2 flex flex-wrap justify-end gap-x-3 text-[11px]",
      )}
    >
      {itens.map((s) => (
        <div key={s} className="flex items-center gap-1.5">
          <span
            className="inline-block size-2.5 rounded-sm"
            style={{ background: COR_SITUACAO[s] }}
          />
          {ROTULO_SITUACAO[s]}
        </div>
      ))}
      {!compacta && <div className="mt-0.5 text-slate-500">Passe o mouse para ver os avisos.</div>}
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
