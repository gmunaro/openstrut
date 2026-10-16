// Formulário dos dados do pilar no PILGEEDI, PILAREDI e PILAR do SISTRUT (docs/MODO-CALCULO.md,
// "Pilares"): Pilar → textos do formulário e de volta, com as regras do leitor do arquivo
// (src/armazenamento/arquivo.ts, camposPilar). Valem nos dois modos da NB-1/78; a NBR 6118
// os ignora. O pilar de um pavimento é o lance do nível de baixo até o nível do pavimento.
import type {
  BarraPilarObra,
  CargaTopoPilar,
  Pilar,
  PontoSecao,
  SecaoNaoRetangular,
  VerificacaoPilarObra,
  VinculoPilar,
  VinculosPilar,
} from "../../../dominio/obra";
import { lerNumero } from "../../formato";
import {
  conferirPoligono,
  Leitor,
  type LinhaForm,
  listaOuNada,
  semChaves,
  soDefinidos,
  textoDe,
} from "./formulario";

export type TipoSecao = "retangular" | "circular" | "poligonal";
/** "padrao" = sem o campo (a carga do outro .REP soma, o padrão do PILGEEDI). */
export type ModoCargaTopo = "padrao" | NonNullable<CargaTopoPilar["modo"]>;
/** Variação de armadura que começa no lance: nenhuma, dimensionada pelo PILAREDI ou dada. */
export type ArmaduraForm = "nenhuma" | "dimensionada" | "dada";

export const ROTULO_VINCULO: Record<VinculoPilar, string> = {
  engaste: "engaste",
  semiEngaste: "semi-engaste",
  continuidade: "continuidade",
  livre: "livre",
};

/** Vínculo de um nível: `dado` = x e y gravados; sem ele, continuidade (o padrão). */
export interface FormVinculos {
  dado: boolean;
  x: VinculoPilar;
  y: VinculoPilar;
}

type Vertice = LinhaForm<"x" | "y">;
export type Barra = LinhaForm<"x" | "y" | "bitola">;
export type MomentoVento = LinhaForm<"m" | "angulo">;
export type MomentoCarga = LinhaForm<"m" | "inclinacao" | "vao" | "rigidez">;

export interface FormCarga {
  ligada: boolean;
  normal: string;
  momentos: MomentoCarga[];
}

export interface FormEstribo {
  ligado: boolean;
  bitola: string;
  espacamento: string;
}

export interface FormVerificacao {
  barras: Barra[];
  estribo: FormEstribo;
  comEsforcos: boolean;
  nk: string;
  mxk: string;
  myk: string;
  lex: string;
  ley: string;
}

export interface FormPilar {
  tipoSecao: TipoSecao;
  rotacao: string;
  d: string;
  dInterno: string;
  vertices: Vertice[];
  vinculos: FormVinculos;
  vinculosTopo: FormVinculos;
  comExcentricidade: boolean;
  excentricidadeX: string;
  excentricidadeY: string;
  comVento: boolean;
  ventoNormal: string;
  ventoMomentos: MomentoVento[];
  cargaTopo: FormCarga;
  modoCargaTopo: ModoCargaTopo;
  cargaBase: FormCarga;
  transicao: boolean;
  armadura: ArmaduraForm;
  barrasArmadura: Barra[];
  estriboArmadura: FormEstribo;
  verificacoes: FormVerificacao[];
}

/** Campos do pilar que o editor controla (os outros passam intactos). b e h só mudam
 *  quando há `secao` (viram a caixa dela). */
const CAMPOS = [
  "secao",
  "rotacao",
  "vinculos",
  "vinculosTopo",
  "excentricidade",
  "vento",
  "cargaTopo",
  "cargaBase",
  "transicao",
  "armadura",
  "verificacoes",
] as const satisfies readonly (keyof Pilar)[];

export const MAX_MOMENTOS_VENTO = 2;
export const MAX_MOMENTOS_CARGA = 4;

export const linhaVertice = (): Vertice => ({ x: "", y: "" });
export const linhaBarra = (): Barra => ({ x: "", y: "", bitola: "" });
export const linhaMomentoVento = (): MomentoVento => ({ m: "", angulo: "0" });
export const linhaMomentoCarga = (): MomentoCarga => ({
  m: "",
  inclinacao: "0",
  vao: "1",
  rigidez: "0",
});
const estriboVazio = (): FormEstribo => ({ ligado: false, bitola: "", espacamento: "" });
export const verificacaoVazia = (): FormVerificacao => ({
  barras: [linhaBarra()],
  estribo: estriboVazio(),
  comEsforcos: false,
  nk: "",
  mxk: "",
  myk: "",
  lex: "",
  ley: "",
});

const formVinculos = (v: VinculosPilar | undefined): FormVinculos =>
  v ? { dado: true, ...v } : { dado: false, x: "continuidade", y: "continuidade" };

const linhaDaBarra = (b: BarraPilarObra): Barra => ({
  x: textoDe(b.x),
  y: textoDe(b.y),
  bitola: textoDe(b.bitola),
});

const formEstribo = (e: { bitola: number; espacamento: number } | undefined): FormEstribo =>
  e
    ? { ligado: true, bitola: textoDe(e.bitola), espacamento: textoDe(e.espacamento) }
    : estriboVazio();

const formCarga = (c: Omit<CargaTopoPilar, "modo"> | undefined): FormCarga => ({
  ligada: c !== undefined,
  normal: textoDe(c?.normal),
  momentos: (c?.momentos ?? []).map((m) => ({
    m: textoDe(m.m),
    inclinacao: textoDe(m.inclinacao),
    vao: textoDe(m.vao),
    rigidez: textoDe(m.rigidez),
  })),
});

/** Pilar → formulário. */
export function formDoPilar(p: Pilar): FormPilar {
  const s = p.secao;
  return {
    tipoSecao: s?.tipo ?? "retangular",
    rotacao: textoDe(p.rotacao),
    d: s?.tipo === "circular" ? textoDe(s.d) : "",
    dInterno: s?.tipo === "circular" ? textoDe(s.dInterno) : "0",
    vertices:
      s?.tipo === "poligonal"
        ? s.vertices.map((v) => ({ x: textoDe(v.x), y: textoDe(v.y) }))
        : // o retângulo da planta, no sentido horário, como ponto de partida
          [
            { x: "0", y: "0" },
            { x: "0", y: textoDe(p.h) },
            { x: textoDe(p.b), y: textoDe(p.h) },
            { x: textoDe(p.b), y: "0" },
          ],
    vinculos: formVinculos(p.vinculos),
    vinculosTopo: formVinculos(p.vinculosTopo),
    comExcentricidade: p.excentricidade !== undefined,
    excentricidadeX: textoDe(p.excentricidade?.x ?? 0),
    excentricidadeY: textoDe(p.excentricidade?.y ?? 0),
    comVento: p.vento !== undefined,
    ventoNormal: textoDe(p.vento?.normal ?? 0),
    ventoMomentos: (p.vento?.momentos ?? []).map((m) => ({
      m: textoDe(m.m),
      angulo: textoDe(m.angulo),
    })),
    cargaTopo: formCarga(p.cargaTopo),
    modoCargaTopo: p.cargaTopo?.modo ?? "padrao",
    cargaBase: formCarga(p.cargaBase),
    transicao: p.transicao === true,
    armadura: !p.armadura ? "nenhuma" : p.armadura.barras ? "dada" : "dimensionada",
    barrasArmadura: (p.armadura?.barras ?? []).map(linhaDaBarra),
    estriboArmadura: formEstribo(p.armadura?.estribo),
    verificacoes: (p.verificacoes ?? []).map((v) => ({
      barras: v.barras.map(linhaDaBarra),
      estribo: formEstribo(v.estribo),
      comEsforcos: v.esforcos !== undefined,
      nk: textoDe(v.esforcos?.nk),
      mxk: textoDe(v.esforcos?.mxk),
      myk: textoDe(v.esforcos?.myk),
      lex: textoDe(v.esforcos?.lex),
      ley: textoDe(v.esforcos?.ley),
    })),
  };
}

/** Caixa da seção, cm: circular D × D; poligonal Δx × Δy dos vértices. É o b × h que o
 *  pilar grava com `secao`, para a planta e o fluxo da V2. */
export function caixaDaSecao(s: SecaoNaoRetangular): { b: number; h: number } {
  if (s.tipo === "circular") return { b: s.d, h: s.d };
  const xs = s.vertices.map((v) => v.x);
  const ys = s.vertices.map((v) => v.y);
  return { b: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
}

/** Caixa da seção que o formulário daria ao aplicar, ou undefined (retangular, ou campos
 *  que ainda não são números). Só para a prévia no diálogo. */
export function previaCaixa(f: FormPilar): { b: number; h: number } | undefined {
  if (f.tipoSecao === "circular") {
    const d = lerNumero(f.d);
    return d === null || d <= 0 ? undefined : { b: d, h: d };
  }
  if (f.tipoSecao !== "poligonal" || f.vertices.length < 3) return undefined;
  const vertices: PontoSecao[] = [];
  for (const v of f.vertices) {
    const x = lerNumero(v.x);
    const y = lerNumero(v.y);
    if (x === null || y === null) return undefined;
    vertices.push({ x, y });
  }
  return caixaDaSecao({ tipo: "poligonal", vertices });
}

function lerSecao(l: Leitor, f: FormPilar): SecaoNaoRetangular | undefined {
  if (f.tipoSecao === "circular") {
    const d = l.numero(f.d, "Seção circular, diâmetro D", "positivo");
    const dInterno = l.numero(f.dInterno, "Seção circular, vazado Dint", "naoNegativo");
    if (d > 0 && dInterno >= d) l.erro("Seção circular: o vazado Dint precisa ser menor que D.");
    return { tipo: "circular", d, dInterno };
  }
  if (f.tipoSecao === "poligonal") {
    const vertices = f.vertices.map((v, i): PontoSecao => ({
      x: l.numero(v.x, `Seção poligonal, vértice ${i + 1}, x`),
      y: l.numero(v.y, `Seção poligonal, vértice ${i + 1}, y`),
    }));
    // o anti-horário é aceito: o modo original reproduz a área negativa (D-6)
    conferirPoligono(l, vertices, "Seção poligonal", false);
    return { tipo: "poligonal", vertices };
  }
  return undefined;
}

const lerVinculos = (v: FormVinculos): VinculosPilar | undefined =>
  v.dado ? { x: v.x, y: v.y } : undefined;

function lerBarras(l: Leitor, linhas: readonly Barra[], rotulo: string): BarraPilarObra[] {
  return linhas.map((b, i) => ({
    x: l.numero(b.x, `${rotulo}, barra ${i + 1}, x`),
    y: l.numero(b.y, `${rotulo}, barra ${i + 1}, y`),
    bitola: l.numero(b.bitola, `${rotulo}, barra ${i + 1}, bitola`, "positivo"),
  }));
}

function lerEstribo(l: Leitor, e: FormEstribo, rotulo: string) {
  if (!e.ligado) return undefined;
  return {
    bitola: l.numero(e.bitola, `${rotulo}, estribo, bitola`, "positivo"),
    espacamento: l.numero(e.espacamento, `${rotulo}, estribo, espaçamento`, "positivo"),
  };
}

function lerCarga(l: Leitor, c: FormCarga, rotulo: string): Omit<CargaTopoPilar, "modo"> {
  if (c.momentos.length > MAX_MOMENTOS_CARGA)
    l.erro(`${rotulo}: no máximo ${MAX_MOMENTOS_CARGA} momentos.`);
  return {
    normal: l.numero(c.normal, `${rotulo}, normal`),
    momentos: c.momentos.map((m, i) => {
      const r = `${rotulo}, momento ${i + 1}`;
      return {
        m: l.numero(m.m, `${r}, M`),
        inclinacao: l.numero(m.inclinacao, `${r}, inclinação`),
        vao: l.numero(m.vao, `${r}, vão`),
        rigidez: l.numero(m.rigidez, `${r}, rigidez`, "naoNegativo"),
      };
    }),
  };
}

/**
 * Formulário → pilar, ou a lista de problemas. As faixas são as do leitor do arquivo;
 * além delas, a seção poligonal precisa ter área. Com seção circular ou poligonal, b e h
 * viram a caixa dela e a rotação sai (só vale na retangular).
 */
export function pilarDoForm(f: FormPilar, p: Pilar): Pilar | string[] {
  const l = new Leitor();
  const secao = lerSecao(l, f);
  let rotacao: number | undefined;
  if (!secao) {
    rotacao = l.opcional(f.rotacao, "Rotação", "naoNegativo");
    if (rotacao !== undefined && rotacao > 360)
      l.erro("Rotação: informe um ângulo de 0 a 360 graus.");
  }

  const excentricidade = f.comExcentricidade
    ? {
        x: l.numero(f.excentricidadeX, "Excentricidade, x"),
        y: l.numero(f.excentricidadeY, "Excentricidade, y"),
      }
    : undefined;

  if (f.comVento && f.ventoMomentos.length > MAX_MOMENTOS_VENTO)
    l.erro(`Vento: no máximo ${MAX_MOMENTOS_VENTO} momentos.`);
  const vento = f.comVento
    ? {
        normal: l.numero(f.ventoNormal, "Vento, normal"),
        momentos: f.ventoMomentos.map((m, i) => ({
          m: l.numero(m.m, `Vento, momento ${i + 1}, M`),
          angulo: l.numero(m.angulo, `Vento, momento ${i + 1}, ângulo`),
        })),
      }
    : undefined;

  const cargaTopo: CargaTopoPilar | undefined = f.cargaTopo.ligada
    ? {
        ...lerCarga(l, f.cargaTopo, "Carga no topo"),
        ...(f.modoCargaTopo === "padrao" ? {} : { modo: f.modoCargaTopo }),
      }
    : undefined;
  const cargaBase = f.cargaBase.ligada ? lerCarga(l, f.cargaBase, "Carga na base") : undefined;

  let armadura: Pilar["armadura"];
  if (f.armadura !== "nenhuma") {
    const barras = f.armadura === "dada" ? lerBarras(l, f.barrasArmadura, "Armadura") : undefined;
    if (barras && barras.length === 0)
      l.erro("Armadura dada: informe ao menos uma barra (ou escolha a dimensionada).");
    armadura = soDefinidos({ barras, estribo: lerEstribo(l, f.estriboArmadura, "Armadura") });
  }

  const verificacoes = f.verificacoes.map((v, i): VerificacaoPilarObra => {
    const r = `Verificação ${i + 1}`;
    return {
      barras: lerBarras(l, v.barras, r),
      ...soDefinidos({
        estribo: lerEstribo(l, v.estribo, r),
        esforcos: v.comEsforcos
          ? {
              nk: l.numero(v.nk, `${r}, Nk`),
              mxk: l.numero(v.mxk, `${r}, Mxk`),
              myk: l.numero(v.myk, `${r}, Myk`),
              lex: l.numero(v.lex, `${r}, lex`, "positivo"),
              ley: l.numero(v.ley, `${r}, ley`, "positivo"),
            }
          : undefined,
      }),
    };
  });

  const novo: Pilar = {
    ...semChaves(p, CAMPOS),
    ...(secao ? caixaDaSecao(secao) : {}),
    ...soDefinidos({
      secao,
      rotacao,
      vinculos: lerVinculos(f.vinculos),
      vinculosTopo: lerVinculos(f.vinculosTopo),
      excentricidade,
      vento,
      cargaTopo,
      cargaBase,
      transicao: f.transicao ? (true as const) : undefined,
      armadura,
      verificacoes: listaOuNada(verificacoes),
    }),
  };
  return l.erros.length > 0 ? l.erros : novo;
}

/** Resumo do que o pilar tem de dados do SISTRUT, para o painel
 *  ("circular D 30 · vento · 2 verificações"). */
export function resumoPilar(p: Pilar): string {
  const partes: string[] = [];
  const s = p.secao;
  if (s?.tipo === "circular")
    partes.push(
      `circular D ${textoDe(s.d)}${s.dInterno > 0 ? ` vazado ${textoDe(s.dInterno)}` : ""}`,
    );
  else if (s) partes.push(`poligonal (${s.vertices.length} vértices)`);
  if (p.rotacao) partes.push(`girado ${textoDe(p.rotacao)}°`);
  if (p.vinculos) partes.push("vínculo na base");
  if (p.vinculosTopo) partes.push("vínculo no topo");
  if (p.excentricidade) partes.push("excentricidade");
  if (p.vento) partes.push("vento");
  if (p.cargaTopo) partes.push("carga no topo");
  if (p.cargaBase) partes.push("carga na base");
  if (p.transicao) partes.push("transição");
  if (p.armadura) partes.push(p.armadura.barras ? "armadura dada" : "nova variação de armadura");
  const n = p.verificacoes?.length ?? 0;
  if (n > 0) partes.push(`${n} ${n > 1 ? "verificações" : "verificação"}`);
  return partes.length > 0 ? partes.join(" · ") : "sem dados do SISTRUT (valem os da planta)";
}
