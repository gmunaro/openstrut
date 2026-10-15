// Cargas dos pilares de edifício no SISTRUT: leitura do .REP por coluna e nível,
// acumulação dos níveis de cima, peso próprio, normal e momentos de vento, redução
// de sobrecarga, comprimento de flambagem pela matriz de vínculos, distribuição dos
// momentos das vigas entre os lances, resumo na fundação e predimensionamento.
//
// Fonte: PILGEEDI.BAS:520-720 (.REP); PILAREDI.BAS:4666-4775 (le, Nk), 6599-6630
// (redução), 7304-7746 (S_60164: carga acumulada, peso próprio, momentos),
// 3713-3740 e 3976-4187 (L_40943, L_4235f: predimensionamento), 960-1000
// (resumo na fundação). Livro: livros_viga_pilar.md 2.13 itens 1-3 (U51-046..048,
// U53-023..027, U53-051..054, U56-025..031). PLANO P11-P13.
//
// Convenções (documentadas no contrato, base/tipos.ts):
// - Níveis pelo índice em `ColunaEdificio.niveis` (0 = mais baixo);
//   `LeituraRep.nivelInicial/Final` são índices. O lance que começa no nível i usa
//   `niveis[i].secao`; níveis seguidos com a mesma geometria formam uma "seção" do
//   original (A_1338); o topo pertence à seção do lance de baixo.
// - Vínculos = índice da matriz de flambagem (`VinculoPilar`); o código Rx/Ry do
//   original converte por `indiceDoCodigoOriginal` (PILAREDI.BAS:4733-4760).
// - Momentos do .REP: |VAL(texto)|, inclinação 0 (o PILGEEDI zera e só muda pela
//   tela), rigidez de viga A(k+3)/A(k+2) = 0.
// - Vento por nível (A_12dc): `normalVento` e até dois momentos com ângulo
//   (`NivelColuna.ventos`); sem `ventos`, `mkx` vai a 0° e `mky` a 90°.
import { qbCint } from "../base/f32";
import type {
  CargaPilarNivel,
  CargasPilares,
  ColunaEdificio,
  LeituraRep,
  MateriaisSistrut,
  ModoSistrut,
  ParametrosPip,
  ParametrosPredimensionamento,
  PredimensionaPilar,
  SecaoPilar,
} from "../base/tipos";
import {
  type Contexto,
  criaContexto,
  inerciaGirada,
  leiAco,
  novoEstado,
  posiciona,
  secaoCalculo,
} from "./secao";

/** Slot de momento de viga num nível (A_1280(c, i, k..k+3)). */
export interface MomentoNivel {
  m: number;
  inclinacao: number;
  /** A(k+2): vão com o sinal de −SGN(M). */
  vao: number;
  /** A(k+3): numerador da rigidez de viga (0 no .REP). */
  rigidez: number;
}

/** Normal e os 4 slots de momento de cada nível de uma coluna. */
export interface CargasLidas {
  normal: number[];
  slots: MomentoNivel[][];
}

/** `VAL` do QuickBASIC: ignora espaços e tabulações e lê o maior prefixo numérico. */
export function qbVal(texto: string) {
  const t = texto.replace(/[ \t\n]/g, "");
  const m = t.match(/^[+-]?(\d+\.?\d*|\.\d+)([eEdD][+-]?\d+)?/);
  return m ? Number(m[0].replace(/[dD]/, "e")) : 0;
}

/** Código Rx/Ry do original (1-based) → índice da matriz de flambagem
 *  (PILAREDI.BAS:4733-4760): 1 continuidade, 2 livre, 3 e 4 engaste, ≥5 semi-engaste. */
export function indiceDoCodigoOriginal(codigo: number) {
  if (codigo === 1) return 2;
  if (codigo === 2) return 3;
  if (codigo >= 5) return 1;
  return 0;
}

/** O nome da coluna contém o número do pilar, isolado (PILGEEDI.BAS:544-560): VAL
 *  a partir da ocorrência dá o número e o que vem antes é espaço ou não é número. */
export function casaNome(nome: string, numero: number) {
  const alvo = String(numero);
  for (let p = nome.indexOf(alvo); p >= 0; p = nome.indexOf(alvo, p + 1)) {
    if (qbVal(nome.slice(p)) !== numero) continue;
    const antes = nome[Math.max(0, p - 1)];
    if (antes === " " || qbVal(nome.slice(Math.max(0, p - 1))) === 0) return true;
  }
  return false;
}

const slotsVazios = (): MomentoNivel[] =>
  Array.from({ length: 4 }, () => ({ m: 0, inclinacao: 0, vao: 0, rigidez: 0 }));

/** Lê os .REP para as colunas (PILGEEDI.BAS:530-720). Cada registro vai para a
 *  PRIMEIRA coluna cujo nome contém o número do pilar (L_122f4). N = total da linha;
 *  "substitui" zera o nível e grava; "maxima" só substitui se N for maior (>
 *  estrito); "soma" soma N e põe os momentos a partir do primeiro slot com
 *  |M| ≤ 0,01, e com os 4 ocupados abandona o resto do .REP (L_135e2). Na leitura
 *  dos momentos, slot com |M| ≤ 0,01 é sobrescrito pelo seguinte; com 4 slots
 *  cheios e mais momentos, o registro para (L_14dd9). */
export function leCargasRep(
  reps: readonly LeituraRep[],
  colunas: readonly ColunaEdificio[],
  modo: ModoSistrut,
): CargasLidas[] {
  const s = modo === "original" ? Math.fround : (x: number) => x;
  const k001 = s(0.01);
  const lidas = colunas.map((c) => ({
    normal: Array.from({ length: c.niveis.length }, () => 0),
    slots: Array.from({ length: c.niveis.length }, slotsVazios),
  }));
  for (const rep of reps) {
    registros: for (const linha of rep.linhas) {
      const numero = qbVal(linha.pilar.slice(1, 11));
      for (let nivel = rep.nivelInicial; nivel <= rep.nivelFinal; nivel++) {
        const ci = colunas.findIndex(
          (c) => nivel >= 0 && nivel < c.niveis.length && casaNome(c.nome, numero),
        );
        if (ci < 0) continue;
        const alvo = lidas[ci]!;
        let k = 0;
        if (rep.modo === "soma") {
          alvo.normal[nivel] = s(alvo.normal[nivel]! + linha.total);
          while (alvo.slots[nivel]![k]!.m > k001) {
            k += 1;
            if (k > 3) break registros;
          }
        } else {
          if (rep.modo === "maxima" && !(linha.total > alvo.normal[nivel]!)) continue;
          alvo.normal[nivel] = s(linha.total);
          alvo.slots[nivel] = slotsVazios();
        }
        const slots = alvo.slots[nivel]!;
        for (let i = 0; i < linha.momentos.length; i++) {
          const mo = linha.momentos[i]!;
          const v = qbVal(mo.texto);
          slots[k] = {
            m: s(Math.abs(v)),
            inclinacao: s(mo.inclinacao ?? 0),
            vao: s(mo.vao * -Math.sign(v)),
            rigidez: s(mo.rigidez ?? 0),
          };
          if (slots[k]!.m > k001) k += 1;
          if (k > 3 && i < linha.momentos.length - 1) break;
        }
      }
    }
  }
  return lidas;
}

/** O vínculo é "livre" (código 2 do original, índice 3 da matriz). */
const livre = (v: number) => v === 3;

/** Comprimentos de flambagem do lance que começa no nível i (PILAREDI.BAS:4721-4771):
 *  desce e sobe enquanto o vínculo for livre; le = Δcota × matriz(inferior, superior). */
export function comprimentosFlambagem(
  coluna: ColunaEdificio,
  i: number,
  pip: ParametrosPip,
  s: (x: number) => number,
) {
  const nv = coluna.niveis;
  const topo = nv.length - 1;
  if (!(topo > i)) return { lex: 0, ley: 0 };
  const le = (dir: "vinculoX" | "vinculoY") => {
    let a = i;
    while (a > 0 && livre(nv[a]![dir])) a -= 1;
    let b = i;
    while (topo > b) {
      b += 1;
      if (!livre(nv[b]![dir])) break;
    }
    const coef = pip.coeficienteFlambagem[nv[a]![dir]]![nv[b]![dir]]!;
    return s(coef * s(nv[b]!.cota - nv[a]!.cota));
  };
  return { lex: le("vinculoX"), ley: le("vinculoY") };
}

/** Chave da geometria de uma seção (sem barras), para achar onde a seção muda. */
const chaveSecao = (s: SecaoPilar) => JSON.stringify({ ...s, barras: [] });

/** Seção carregada (V_104a, A_10be): geometria, área e J num ângulo. */
function propriedades(ctx: Contexto, secao: SecaoPilar, bitolas: ParametrosPip["bitolas"]) {
  const est = novoEstado(secaoCalculo({ ...secao, barras: [] }, bitolas, ctx.modo));
  posiciona(ctx, est, 270);
  return {
    area: est.area,
    inercia: (theta: number) => inerciaGirada(ctx, est, theta).j,
    geometria: (theta: number) => {
      const r = inerciaGirada(ctx, est, theta);
      return { ...r, altura: est.altura, area: est.area };
    },
  };
}

/** Opções do S_60164: nível L (V_0ff0) e, no predimensionamento, a seção em teste
 *  para todos os níveis (sem a troca de seções). */
interface OpcoesAcumulada {
  L: number;
  secaoTeste?: SecaoPilar;
  coefM: number;
  coefF: number;
}

/** S_60164 (PILAREDI.BAS:7304-7746) para o lance que começa no nível L.
 *  Percorre do topo para baixo: soma as normais dos níveis ≥ L; pula os níveis
 *  livres nas duas direções; recarrega a seção quando ela muda e soma no slot do
 *  nível de cima −(ΣN − Nj − Nj+1)·e da seção de cima (7431-7433); reparte os
 *  momentos das vigas por J/L entre os lances de cima e de baixo; quando o nível é
 *  o primeiro da sua seção, a rigidez de baixo usa a seção de baixo, que fica
 *  carregada para os slots seguintes e para o peso próprio do nível (7487-7521);
 *  peso próprio Δcota·A·densidade. Depois: momentos no topo e na base com
 *  transporte −1/2, interpolação nos níveis livres, vento (7619-7620), caso "e" =
 *  maior extremo e caso "f" = 0,6·M1 + 0,4·M2 ≥ 0,4·M1. */
function cargaAcumulada(
  ctx: Contexto,
  coluna: ColunaEdificio,
  lidas: CargasLidas,
  pip: ParametrosPip,
  op: OpcoesAcumulada,
) {
  const { s, k } = ctx;
  const { L, coefM, coefF } = op;
  const nv = coluna.niveis;
  const topo = nv.length - 1;
  const cota = (i: number) => nv[i]!.cota;
  const N = (i: number) => lidas.normal[i] ?? 0;
  // seções do original: índice por nível e primeiro nível de cada uma
  const indice: number[] = [];
  const primeiro: number[] = [0];
  for (let j = 0; j < Math.max(topo, 1); j++) {
    const muda = j > 0 && chaveSecao(nv[j]!.secao) !== chaveSecao(nv[j - 1]!.secao);
    indice.push(j === 0 ? 0 : indice[j - 1]! + (muda ? 1 : 0));
    if (muda) primeiro.push(j);
  }
  if (topo > 0) indice.push(indice[topo - 1]!);
  const secaoDoIndice = (i: number) => nv[primeiro[i]!]!.secao;
  const acima = (j: number, dir: "vinculoX" | "vinculoY") => {
    let u = Math.min(j + 1, topo);
    while (topo > u && livre(nv[u]![dir])) u += 1;
    return u;
  };
  const abaixo = (j: number, dir: "vinculoX" | "vinculoY") => {
    let d = Math.max(j - 1, 0);
    while (d > 0 && livre(nv[d]![dir])) d -= 1;
    return d;
  };
  let normal = 0;
  let pp = 0;
  const m165 = Array.from({ length: nv.length }, () => [0, 0, 0, 0]);
  let secaoCarregada = -1;
  let carregada = propriedades(ctx, op.secaoTeste ?? nv[0]!.secao, pip.bitolas);
  for (let j = topo; j >= 0; j--) {
    if (j >= L) normal = s(N(j) + normal);
    const ux = acima(j, "vinculoX");
    const uy = acima(j, "vinculoY");
    const dx = abaixo(j, "vinculoX");
    const dy = abaixo(j, "vinculoY");
    if (topo > j && livre(nv[j]!.vinculoY) && livre(nv[j]!.vinculoX)) continue;
    if (op.secaoTeste) carregada = propriedades(ctx, op.secaoTeste, pip.bitolas);
    else if (secaoCarregada !== indice[j]) {
      carregada = propriedades(ctx, secaoDoIndice(indice[j]!), pip.bitolas);
      const ex = nv[primeiro[indice[j]! + 1] ?? -1]?.excentricidade;
      if (secaoCarregada !== -1 && ex) {
        const resto = normal - N(j) - N(j + 1);
        m165[ux]![1] = s(m165[ux]![1]! - (resto * qbCint(100 * ex.x)) / 10000);
        m165[uy]![3] = s(m165[uy]![3]! - (resto * qbCint(100 * ex.y)) / 10000);
      }
      secaoCarregada = indice[j]!;
    }
    let ax = 0;
    let ay = 0;
    let ex = 0;
    let ey = 0;
    for (const mo of lidas.slots[j]!) {
      if (mo.m === 0) break;
      let theta = s(mo.inclinacao - 90);
      if (theta < 0) theta = s(360 + theta);
      const horizontal = mo.inclinacao === 180 || mo.inclinacao === 0;
      const vertical = mo.inclinacao === 270 || mo.inclinacao === 90;
      const j0 = carregada.inercia(theta);
      const cima = ux !== uy && !horizontal ? uy : ux;
      let kCima = topo > j ? s(j0 / ((cota(cima) - cota(j)) * coefM)) : 0;
      if (horizontal && livre(nv[ux]!.vinculoX)) kCima = 0;
      if (vertical && livre(nv[uy]!.vinculoY)) kCima = 0;
      const baixo = dx !== dy && !horizontal ? dy : dx;
      let kBaixo = 0;
      if (j > 0) {
        if (op.secaoTeste || secaoCarregada === 0 || primeiro[secaoCarregada]! < j) {
          kBaixo = s(j0 / ((cota(j) - cota(baixo)) * coefM));
        } else {
          // PILAREDI.BAS:7487-7498: carrega a seção de baixo e não volta
          carregada = propriedades(ctx, secaoDoIndice(secaoCarregada - 1), pip.bitolas);
          kBaixo = s(carregada.inercia(theta) / ((cota(j) - cota(baixo)) * coefM));
        }
      }
      const rigidezViga = mo.vao > 0 ? s(mo.rigidez / mo.vao) : 0;
      const soma = kCima + kBaixo + rigidezViga;
      const a = s((mo.m / soma) * kCima);
      const e = s((-mo.m / soma) * kBaixo);
      const ang = (mo.inclinacao * k.pi) / 180;
      ax = s(Math.cos(ang) * a + ax);
      ay = s(Math.sin(ang) * a + ay);
      ex = s(Math.cos(ang) * e + ex);
      ey = s(Math.sin(ang) * e + ey);
    }
    const linha = m165[j]!;
    linha[0] = s(linha[0]! + ax);
    linha[1] = s(linha[1]! + ex);
    linha[2] = s(linha[2]! + ay);
    linha[3] = s(linha[3]! + ey);
    if (j >= L && pip.pesoProprio) {
      const sobe = Math.min(ux, uy);
      pp = s(
        ((cota(sobe) - cota(j)) / (100 ** 2 * coefF)) * coefM * carregada.area * pip.densidade + pp,
      );
    }
  }
  // momentos no topo (soma dos níveis livres de cima) e na base do lance L
  const somaTopo = (col: number, dir: "vinculoX" | "vinculoY") => {
    let t = 0;
    for (let j = L + 1; j <= topo; j++) {
      t = s(m165[j]![col]! + t);
      if (!livre(nv[j]![dir])) break;
    }
    return t;
  };
  const topoX = somaTopo(1, "vinculoX");
  const topoY = somaTopo(3, "vinculoY");
  const ux = acima(L, "vinculoX");
  const uy = acima(L, "vinculoY");
  const dx = abaixo(L, "vinculoX");
  const dy = abaixo(L, "vinculoY");
  const lx = livre(nv[L]!.vinculoX);
  const ly = livre(nv[L]!.vinculoY);
  const uxLivre = livre(nv[ux]!.vinculoX);
  const uyLivre = livre(nv[uy]!.vinculoY);
  const baseX0 = lx ? m165[dx]![0]! : m165[L]![0]!;
  const baseY0 = ly ? m165[dy]![2]! : m165[L]![2]!;
  let baseX = s((uxLivre ? 1 : -0.5) * topoX + baseX0);
  let cimaX = s((uxLivre ? 0 : -1) * (baseX0 / 2) + topoX);
  let baseY = s((uyLivre ? 1 : -0.5) * topoY + baseY0);
  let cimaY = s((uyLivre ? 0 : -1) * (baseY0 / 2) + topoY);
  if (!uxLivre && lx)
    baseX = s(((cimaX - baseX) * (cota(L) - cota(dx))) / (cota(ux) - cota(dx)) + baseX);
  if (!uyLivre && ly)
    baseY = s(((cimaY - baseY) * (cota(L) - cota(dy))) / (cota(uy) - cota(dy)) + baseY);
  let fX = cimaX;
  let fY = cimaY;
  if (topo > L) {
    const m = Math.min(ux, uy);
    if (ux > m)
      cimaX = lx
        ? s(cimaX - ((cimaX - baseX) * (cota(ux) - cota(m))) / (cota(ux) - cota(L)))
        : s(((cimaX - baseX) * (cota(m) - cota(L))) / (cota(ux) - cota(L)) + baseX);
    if (uy > m)
      cimaY = ly
        ? s(cimaY - ((cimaY - baseY) * (cota(uy) - cota(m))) / (cota(uy) - cota(L)))
        : s(((cimaY - baseY) * (cota(m) - cota(L))) / (cota(uy) - cota(L)) + baseY);
  }
  // vento do nível (PILAREDI.BAS:7614-7626): normal e dois momentos com ângulo
  const nivel = nv[L]!;
  const ventos = nivel.ventos ?? [
    { m: nivel.mkx, angulo: 0 },
    { m: nivel.mky, angulo: 90 },
  ];
  const [v1 = { m: 0, angulo: 0 }, v2 = { m: 0, angulo: 0 }] = ventos;
  let vento = 0;
  if (v2.m !== 0 || v1.m !== 0 || nivel.normalVento !== 0) {
    vento = s(nivel.normalVento);
    const r = (g: number) => (g * k.pi) / 180;
    const vx = s(Math.cos(r(v1.angulo)) * v1.m + Math.cos(r(v2.angulo)) * v2.m);
    const vy = s(Math.sin(r(v1.angulo)) * v1.m + Math.sin(r(v2.angulo)) * v2.m);
    baseX = s(baseX + vx);
    baseY = s(baseY + vy);
    cimaX = s(cimaX + vx);
    cimaY = s(cimaY + vy);
    fX = s(fX + vx);
    fY = s(fY + vy);
  }
  // caso "e": o maior extremo
  let eX = cimaX;
  let eY = cimaY;
  if (eX ** 2 + eY ** 2 < baseX ** 2 + baseY ** 2) {
    eX = baseX;
    eY = baseY;
  }
  // caso "f": 0,6·M1 + 0,4·M2, nunca abaixo de 0,4·M1
  let gX: number;
  let gY: number;
  if (fX ** 2 + fY ** 2 > baseX ** 2 + baseY ** 2) {
    gX = s(fX * k.c06 + k.c04 * baseX);
    if (Math.abs(gX) < Math.abs(fX * k.c04)) gX = s(fX * k.c04);
    gY = s(fY * k.c06 + k.c04 * baseY);
    if (Math.abs(gY) < Math.abs(fY * k.c04)) gY = s(fY * k.c04);
  } else {
    gX = s(k.c06 * baseX + k.c04 * cimaX);
    if (Math.abs(gX) < Math.abs(k.c04 * baseX)) gX = s(k.c04 * baseX);
    gY = s(k.c06 * baseY + fY * k.c04);
    if (Math.abs(gY) < Math.abs(k.c04 * baseY)) gY = s(k.c04 * baseY);
  }
  const zera = (x: number) => (Math.abs(x) < k.c001 ? 0 : x);
  return {
    normal,
    pp,
    vento,
    e: { mkx: zera(eX), mky: zera(eY) },
    f: { mkx: zera(gX), mky: zera(gY) },
    base: { mkx: zera(baseX), mky: zera(baseY) },
  };
}

/** Redução de sobrecarga com 4, 5 ou mais de 5 níveis acima: (N + pp)·%acid·k/100,
 *  k = 0,2/0,4/0,6, só com a opção "S" (PILAREDI.BAS:6602-6615 no dimensionamento,
 *  978-987 na fundação; padrão "N"). No corrigido não incide sobre o peso próprio
 *  (D-8). */
function reducao(
  ctx: Contexto,
  liga: boolean,
  niveisAcima: number,
  n: number,
  pp: number,
  pip: ParametrosPip,
) {
  const { s, k } = ctx;
  if (!liga) return 0;
  const fator = niveisAcima === 4 ? k.c02 : niveisAcima === 5 ? k.c04 : niveisAcima > 5 ? k.c06 : 0;
  const base = ctx.modo === "original" ? n + pp : n;
  return s((base * qbCint(pip.porcentagemAcidental) * fator) / 100);
}

function contextoCarga(modo: ModoSistrut, materiais?: MateriaisSistrut) {
  return criaContexto(modo, {
    fck: materiais?.fck ?? 0,
    fyk: materiais?.fyk ?? 0,
    aco: materiais?.classeAco ?? "B",
    csf: materiais?.gamaF ?? 1,
    csc: materiais?.gamaC ?? 1,
    csa: materiais?.gamaS ?? 1,
    coefTensao: 1,
  });
}

/** Cargas de dimensionamento de cada lance (níveis 0..topo−1) de cada coluna
 *  (PILAREDI.BAS:4653, 6599-6630, 7304-7746): Nk = Σ N dos níveis acima + normal de
 *  vento do nível + peso próprio − redução. caso_c_pilaredi: 17,37 + 0,30 = 17,67. */
export const cargasPilares: CargasPilares = (
  reps,
  colunas,
  pip,
  modo,
  coeficientes = { medida: 1, forca: 1 },
) => {
  const ctx = contextoCarga(modo);
  const { s } = ctx;
  const todas = leCargasRep(reps, colunas, modo);
  const saida: CargaPilarNivel[] = [];
  colunas.forEach((coluna, ci) => {
    const lidas = todas[ci]!;
    const topo = coluna.niveis.length - 1;
    for (let L = 0; L < topo; L++) {
      const c = cargaAcumulada(ctx, coluna, lidas, pip, {
        L,
        coefM: coeficientes.medida,
        coefF: coeficientes.forca,
      });
      const acima = s(c.normal - lidas.normal[L]!);
      const red = reducao(ctx, pip.reduzAcidentalDimensionamento, topo - L, acima, c.pp, pip);
      const { lex, ley } = comprimentosFlambagem(coluna, L, pip, s);
      saida.push({
        coluna: coluna.nome,
        nivel: L,
        nk: s(acima + c.vento + (c.pp - red)),
        pesoProprio: c.pp,
        mkx: c.e.mkx,
        mky: c.e.mky,
        lex,
        ley,
        momentosFlambagem: c.f,
        momentosBase: c.base,
        cargaAcumulada: acima,
        reducao: red,
        normalVento: c.vento,
      });
    }
  });
  return saida;
};

/** Resumo de cargas na fundação (PILAREDI.BAS:960-1000, F_13521): S_60164 desde o
 *  nível de baixo com todas as normais; redução da FUNDAÇÃO (V_0e9e$); impressos
 *  "acumulada" = vento − redução + ΣN, peso próprio, fundação = ΣN + vento + pp −
 *  redução e os momentos da BASE do primeiro lance (V_1632, V_1636; 5553-5554).
 *  Caso dim: P5 17,37 + 0,30 = 17,67. */
export function resumoFundacao(
  reps: readonly LeituraRep[],
  coluna: ColunaEdificio,
  pip: ParametrosPip,
  modo: ModoSistrut,
) {
  const ctx = contextoCarga(modo);
  const { s } = ctx;
  const [lidas] = leCargasRep(reps, [coluna], modo);
  const c = cargaAcumulada(ctx, coluna, lidas!, pip, { L: 0, coefM: 1, coefF: 1 });
  const red = reducao(
    ctx,
    pip.reduzAcidentalFundacao,
    coluna.niveis.length - 1,
    c.normal,
    c.pp,
    pip,
  );
  return {
    cargaAcumulada: s(c.vento - red + c.normal),
    pesoProprio: c.pp,
    fundacao: s(c.normal + c.vento + (c.pp - red)),
    reducao: red,
    mx: c.base.mkx,
    my: c.base.mky,
  };
}

const PADRAO_PREDIM: ParametrosPredimensionamento = {
  excentricidadeMinima: 2,
  verificaH30: true,
  coeficienteMedida: 1,
  coeficienteForca: 1,
};

/** σs do aço a 2 ‰ (ξ = 12, d = cobrimento) (PILAREDI.BAS:3980-3984). */
function tensaoAco2(ctx: Contexto, secao: SecaoPilar, pip: ParametrosPip) {
  const est = novoEstado(secaoCalculo({ ...secao, barras: [] }, pip.bitolas, ctx.modo));
  est.xi = 12;
  est.d = pip.cobrimento;
  est.epsC = ctx.k.c002;
  return leiAco(ctx, est, pip.cobrimento).sigma;
}

/** Tensões de um nível no predimensionamento (PILAREDI.BAS:4079-4114): N = ΣN acima
 *  + pp − redução (sem vento); σ1 = max(0, N − ρ·A·σs/100)/A; σ2 = σ1 + M·100·v/J,
 *  M = √(Mx² + My²) + N·max(emin, h/30), h, v e J no ângulo do momento − 90°
 *  (INFERIDO: J e v da seção em teste nesse ângulo). */
function tensoesNivel(
  ctx: Contexto,
  secao: SecaoPilar,
  n: number,
  momentos: { mkx: number; mky: number },
  sigmaS: number,
  pip: ParametrosPip,
  par: ParametrosPredimensionamento,
) {
  const { s, k } = ctx;
  const { mkx: x, mky: y } = momentos;
  const m0 = s(Math.sqrt(x ** 2 + y ** 2) * par.coeficienteMedida * par.coeficienteForca);
  const graus = (r: number) => (r * 180) / k.pi;
  let ang = 0;
  if (y >= 0 && x > 0) ang = s(graus(Math.atan(y / x)));
  if (y > 0 && x <= 0) ang = s(graus(Math.atan(-x / y)) + 90);
  if (y <= 0 && x < 0) ang = s(graus(Math.atan(y / x)) + 180);
  if (y < 0 && x >= 0) ang = s(graus(Math.atan(x / -y)) + 270);
  ang = s(ang - 90);
  if (ang < 0) ang = s(360 + ang);
  const g = propriedades(ctx, secao, pip.bitolas).geometria(ang);
  const eMin = s(par.excentricidadeMinima / 100);
  const eH = s(par.verificaH30 ? g.altura / 3000 : 0);
  const ea = eMin > eH ? eMin : eH;
  const m = s(n * ea * par.coeficienteForca + m0);
  const resto = s(
    n * par.coeficienteForca - (pip.taxaIdealPredimensionamento * g.area * sigmaS) / 100,
  );
  const comp = resto > 0 ? resto : 0;
  return { tensaoNormal: comp / g.area, tensaoFlexao: comp / g.area + (m * 100 * g.topo) / g.j };
}

/** Predimensionamento de uma coluna a partir do nível `nivelBase` (PILAREDI.BAS:
 *  3713-3740, 3976-4187): área ideal = ΣN dos níveis acima de `nivelBase` (sem pp,
 *  vento e redução)/((σs − σadm)·ρ/100 + σadm); lado = √área no múltiplo de 5,
 *  mínimo 14 cm. A cada lado testado, o S_60164 roda em modo PREDIMENSIONAMENTO
 *  (peso próprio e rigidezes da seção em teste) do topo até `nivelBase`; o lado é
 *  reprovado se σ1 > 0,6·fck ou σ2 > 0,75·fck em QUALQUER nível e cresce de 5 em 5.
 *  Com `secao` imposta (B e H digitados), só calcula as tensões. As tensões
 *  devolvidas são as máximas da faixa, a partir de 0, como a tela mostra. */
export const predimensionaPilar: PredimensionaPilar = (
  reps,
  coluna,
  nivelBase,
  materiais,
  pip,
  modo,
  opcoes = {},
) => {
  const ctx = contextoCarga(modo, materiais);
  const { s } = ctx;
  const par = opcoes.parametros ?? PADRAO_PREDIM;
  const [lidas] = leCargasRep(reps, [coluna], modo);
  const topo = coluna.niveis.length - 1;
  let somaAcima = 0;
  for (let j = topo; j >= nivelBase + 1; j--) somaAcima = s(lidas!.normal[j]! + somaAcima);
  const admN = s(pip.tensaoAdmissivelNormal * materiais.fck);
  const admM = s(pip.tensaoAdmissivelFlexao * materiais.fck);
  const quadrado = (l: number): SecaoPilar => ({ tipo: "retangular", b: l, h: l, barras: [] });
  const sigmaS = tensaoAco2(ctx, opcoes.secao ?? quadrado(20), pip);
  const areaIdeal = s(
    (somaAcima / ((sigmaS - admN) * (pip.taxaIdealPredimensionamento / 100) + admN)) *
      par.coeficienteForca,
  );
  const raiz = s(Math.sqrt(areaIdeal));
  let lado =
    pip.medidaMinima > raiz
      ? pip.medidaMinima
      : qbCint(raiz / pip.multiploMedida) * pip.multiploMedida;
  const tentativas: { lado: number; tensaoNormal: number; tensaoFlexao: number; nivel: number }[] =
    [];
  for (let volta = 0; volta < 200; volta++) {
    const secao = opcoes.secao ?? quadrado(lado);
    let maxN = 0;
    let maxM = 0;
    let reprovado = false;
    for (let L = topo; L >= nivelBase; L--) {
      const c = cargaAcumulada(ctx, coluna, lidas!, pip, {
        L,
        secaoTeste: secao,
        coefM: par.coeficienteMedida,
        coefF: par.coeficienteForca,
      });
      const acima = s(c.normal - lidas!.normal[L]!);
      const red = reducao(ctx, pip.reduzAcidentalDimensionamento, topo - L, acima, c.pp, pip);
      const n = s(c.pp - red + acima);
      const t = tensoesNivel(ctx, secao, n, c.e, sigmaS, pip, par);
      tentativas.push({ lado, nivel: L, ...t });
      if (!opcoes.secao && (t.tensaoFlexao > admM || t.tensaoNormal > admN)) {
        reprovado = true;
        break;
      }
      if (t.tensaoNormal >= maxN) maxN = t.tensaoNormal;
      if (t.tensaoFlexao >= maxM) maxM = t.tensaoFlexao;
    }
    if (!reprovado)
      return {
        coluna: coluna.nome,
        b: opcoes.secao ? Number.NaN : lado,
        h: opcoes.secao ? Number.NaN : lado,
        secao,
        areaIdeal,
        tensaoNormal: maxN,
        tensaoNormalAdmissivel: admN,
        tensaoFlexao: maxM,
        tensaoFlexaoAdmissivel: admM,
        tentativas,
      };
    lado = s(lado + pip.multiploMedida);
    if (lado / pip.multiploMedida !== Math.trunc(lado / pip.multiploMedida))
      lado = (Math.trunc(lado / pip.multiploMedida) + 1) * pip.multiploMedida;
  }
  throw new Error(`Predimensionamento da coluna ${coluna.nome} não converge`);
};
