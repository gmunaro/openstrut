// Camada "Armadura": desenha a armadura calculada dentro da peça selecionada (a viga, ou a
// coluna inteira de um pilar ou fundação), com as peças da vista transparentes. As barras
// saem prontas de `ctx.barrasDe` (dominio/armaduraGeometria.ts); aqui só viram tubos,
// mesclados numa malha por nível e tipo de posição. Contrato em docs/VISTA-3D.md.
import { useSyncExternalStore } from "react";
import {
  Box3,
  BufferGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshLambertMaterial,
} from "three";
import { Button } from "@/components/ui/button";
import { type Camada, type ContextoVista, type FabricaMateriais, materiaisPadrao } from "../api";
import {
  agruparPorMaterial,
  type Alvo,
  alvoDaSelecao,
  COR_TIPO,
  type LinhaPosicao,
  linhasDoPainel,
  motivoSemBarras,
  NOME_TIPO,
  type PosicaoDesenhada,
  type TipoBarra,
  tiposPresentes,
} from "./logica";

/** O que o Painel mostra; trocado inteiro a cada refazer. */
interface Situacao {
  alvo: Alvo;
  /** Peças com barras desenhadas (para o Enquadrar). */
  chaves: string[];
  linhas: LinhaPosicao[];
  avisos: string[];
  tipos: TipoBarra[];
}

const INICIAL: Situacao = {
  alvo: { tipo: "nenhum", motivo: "" },
  chaves: [],
  linhas: [],
  avisos: [],
  tipos: [],
};
let situacao = INICIAL;
const ouvintes = new Set<() => void>();
function publicar(s: Situacao) {
  situacao = s;
  for (const f of ouvintes) f();
}
const assinar = (f: () => void) => {
  ouvintes.add(f);
  return () => void ouvintes.delete(f);
};

/** Peças da vista transparentes enquanto a camada está ligada, para ver o aço; o
 *  destaque da seleção fica mais fraco para não cobrir as barras. O resto é o padrão. */
const materiaisTransparentes: FabricaMateriais = (papel) => {
  const m = materiaisPadrao(papel);
  if (papel === "solido") {
    m.transparent = true;
    m.opacity = 0.18;
    m.depthWrite = false;
  }
  if (papel === "destaque") m.opacity = 0.12;
  return m;
};

const fmt = (v: number, casas = 0) =>
  v.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: casas });

function motivoSemCalculo(ctx: ContextoVista): string | null {
  if (ctx.calculo.tipo === "erro") return `Cálculo com erro: ${ctx.calculo.mensagem}`;
  if (ctx.calculo.tipo === "semNorma")
    return "Sem cálculo: a norma da obra ainda não tem implementação no motor.";
  if (!ctx.detalhamento) return "Sem detalhamento de armadura nesta obra.";
  return null;
}

function ativar(ctx: ContextoVista) {
  const raiz = new Group();
  raiz.name = "armadura";
  ctx.cena.add(raiz);
  const materiais = new Map<TipoBarra, MeshLambertMaterial>();
  const material = (t: TipoBarra) => {
    let m = materiais.get(t);
    if (!m) {
      m = new MeshLambertMaterial({ color: COR_TIPO[t], side: DoubleSide });
      materiais.set(t, m);
    }
    return m;
  };
  /** Grupo de cada nível: `position.y` é o deslocamento do explodido. */
  const niveis = new Map<number, Group>();
  let assinatura = "";
  let fonte: unknown[] = [];

  const limparMalhas = () => {
    raiz.traverse((o) => {
      if (o instanceof Mesh) o.geometry.dispose();
    });
    raiz.clear();
    niveis.clear();
  };

  const nomeDoNivel = (chave: string) => {
    const e = ctx.elemento(chave);
    return e ? (ctx.modelo.niveis[e.nivel]?.nome ?? "") : "";
  };
  const secaoDoPilar = (chave: string) => {
    const e = ctx.elemento(chave);
    if (!e || e.tipo !== "pilar") return undefined;
    return ctx.obra.pavimentos
      .find((p) => p.id === e.pavimentoId)
      ?.pilares.find((p) => p.id === e.id)?.secao?.tipo;
  };

  /** Refaz as malhas quando a seleção, o que aparece ou a obra mudam. */
  const refazer = () => {
    const alvo = alvoDaSelecao(ctx.modelo, ctx.selecao);
    const visiveis = alvo.tipo === "nenhum" ? [] : alvo.chaves.filter((k) => ctx.estaVisivel(k));
    const fonteAgora = [ctx.modelo, ctx.detalhamento, ctx.calculo];
    const sig = `${alvo.tipo}|${alvo.tipo === "nenhum" ? alvo.motivo : alvo.chaves.join(",")}|${visiveis.join(",")}`;
    if (sig === assinatura && fonteAgora.every((f, i) => f === fonte[i])) return;
    assinatura = sig;
    fonte = fonteAgora;
    limparMalhas();

    const semCalculo = motivoSemCalculo(ctx);
    if (semCalculo || alvo.tipo === "nenhum") {
      const avisos = [semCalculo ?? (alvo.tipo === "nenhum" ? alvo.motivo : "")].filter(Boolean);
      publicar({ ...INICIAL, alvo, avisos });
      ctx.pedirRender();
      return;
    }

    const avisos: string[] = [];
    const ocultas = alvo.chaves.length - visiveis.length;
    if (ocultas > 0)
      avisos.push(
        alvo.tipo === "viga"
          ? "A viga está oculta na vista: a armadura não é desenhada."
          : `${ocultas} de ${alvo.chaves.length} lances ocultos na vista não são desenhados.`,
      );
    const itens: PosicaoDesenhada[] = [];
    const chaves: string[] = [];
    for (const k of visiveis) {
      const e = ctx.elemento(k)!;
      const barras = ctx.barrasDe(k);
      const motivo = motivoSemBarras(barras, secaoDoPilar(k));
      if (motivo || !barras) {
        const rotulo = alvo.tipo === "coluna" ? `${e.nome} (${nomeDoNivel(k)})` : e.nome;
        avisos.push(`${rotulo}: ${motivo}.`);
        continue;
      }
      chaves.push(k);
      for (const posicao of barras) itens.push({ chave: k, nivel: e.nivel, posicao });
    }

    for (const g of agruparPorMaterial(itens, (n) => ctx.alturaNaCena(n, 0))) {
      let grupo = niveis.get(g.nivel);
      if (!grupo) {
        grupo = new Group();
        grupo.name = `armadura ${ctx.modelo.niveis[g.nivel]?.nome ?? g.nivel}`;
        grupo.position.y = ctx.alturaNaCena(g.nivel, 0);
        niveis.set(g.nivel, grupo);
        raiz.add(grupo);
      }
      const geo = new BufferGeometry();
      geo.setAttribute("position", new Float32BufferAttribute(g.malha.posicoes, 3));
      geo.setAttribute("normal", new Float32BufferAttribute(g.malha.normais, 3));
      geo.setIndex(g.malha.indices);
      const malha = new Mesh(geo, material(g.tipo));
      malha.name = `armadura ${g.tipo}`;
      malha.userData = { barras: g.barras };
      grupo.add(malha);
    }

    publicar({
      alvo,
      chaves,
      linhas: linhasDoPainel(itens, (k) => (alvo.tipo === "coluna" ? nomeDoNivel(k) : "")),
      avisos,
      tipos: tiposPresentes(itens.map((i) => i.posicao)),
    });
    ctx.pedirRender();
  };

  /** O explodido só move os grupos dos níveis, sem refazer as malhas. */
  const acompanharExplodido = () => {
    for (const [n, g] of niveis) g.position.y = ctx.alturaNaCena(n, 0);
    ctx.pedirRender();
  };

  ctx.definirMateriais(materiaisTransparentes);
  refazer();
  // "visibilidade" vem depois de toda "cena" (obra editada, foco, tipos ocultos)
  const parar = [
    ctx.aoMudar("selecao", refazer),
    ctx.aoMudar("visibilidade", refazer),
    ctx.aoMudar("explodido", acompanharExplodido),
  ];
  return () => {
    for (const p of parar) p();
    limparMalhas();
    ctx.cena.remove(raiz);
    for (const m of materiais.values()) m.dispose();
    ctx.definirMateriais(null);
    publicar(INICIAL);
  };
}

function Painel({ ctx }: { ctx: ContextoVista }) {
  const s = useSyncExternalStore(assinar, () => situacao);
  const coluna = s.alvo.tipo === "coluna";
  const enquadrar = () => {
    const caixa = new Box3();
    for (const k of s.chaves) {
      const c = ctx.caixaDe(k);
      if (c) caixa.union(c);
    }
    if (!caixa.isEmpty()) void ctx.enquadrarEm(caixa);
  };
  // linhas da coluna agrupadas pelo lance, de cima para baixo como na lista de elementos
  const blocos = coluna
    ? [...new Set(s.linhas.map((l) => l.chave))]
        .toReversed()
        .map((k) => ({ k, linhas: s.linhas.filter((l) => l.chave === k) }))
    : [{ k: "", linhas: s.linhas }];
  return (
    <div className="grid gap-2 text-xs" data-testid="painel-armadura">
      {s.alvo.tipo !== "nenhum" && (
        <div className="flex items-center justify-between gap-2">
          <span className="font-medium">{s.alvo.nome}</span>
          <Button
            size="xs"
            variant="outline"
            className="compacto:h-9"
            disabled={s.chaves.length === 0}
            onClick={enquadrar}
          >
            Enquadrar
          </Button>
        </div>
      )}
      {s.avisos.map((a) => (
        <p key={a} className="text-muted-foreground">
          {a}
        </p>
      ))}
      {s.tipos.length > 0 && (
        <ul className="flex flex-wrap gap-x-3 gap-y-1" aria-label="Legenda da armadura">
          {s.tipos.map((t) => (
            <li key={t} className="flex items-center gap-1">
              <span
                aria-hidden
                className="inline-block size-3 rounded-sm"
                style={{ backgroundColor: COR_TIPO[t] }}
              />
              {NOME_TIPO[t]}
            </li>
          ))}
        </ul>
      )}
      {s.linhas.length > 0 && (
        <table className="w-full tabular-nums" aria-label="Posições desenhadas">
          <thead className="text-muted-foreground">
            <tr>
              <th className="text-left font-normal">Pos.</th>
              <th className="text-left font-normal">Tipo</th>
              <th className="text-right font-normal">φ (mm)</th>
              <th className="text-right font-normal">Qtd.</th>
              <th className="text-right font-normal">C (cm)</th>
            </tr>
          </thead>
          {blocos.map((b) => (
            <tbody key={b.k}>
              {coluna && (
                <tr>
                  <th colSpan={5} className="pt-1 text-left font-medium">
                    {b.linhas[0]?.lance}
                  </th>
                </tr>
              )}
              {b.linhas.map((l) => (
                <tr key={`${l.chave}|${l.nome}`}>
                  <td>
                    <span
                      aria-hidden
                      className="mr-1 inline-block size-2 rounded-sm"
                      style={{ backgroundColor: COR_TIPO[l.tipo] }}
                    />
                    {l.nome}
                  </td>
                  <td>{NOME_TIPO[l.tipo]}</td>
                  <td className="text-right">{fmt(l.phi, 1)}</td>
                  <td className="text-right">{l.quantidade}</td>
                  <td className="text-right">{fmt(l.comprimento)}</td>
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      )}
    </div>
  );
}

export const camada: Camada = { ativar, Painel };
