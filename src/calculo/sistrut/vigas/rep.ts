// Opção 7 do VIGA: soma das reações das vigas por pilar e o arquivo .REP que o
// PILAR-Edifícios (PILGEEDI) lê. Porta `viga/VIGA.BAS:2094-2566` (F_17d76, F_19377,
// L_195e8 e a gravação em 2545-2557); especificação em
// C:/tmp/v2-paridade/apoio/livros_viga_pilar.md 1.4 e 3.1 (U61-022..025).
//
// Modo "original": cada parcela é INT(R·100)/100 (VIGA.BAS:2413), e o total, a soma
// em SINGLE das parcelas truncadas (caso b, P5: 6,93 + 10,44 = 17,37). Modo
// "corrigido" (R5, PLANO.md 4.2): soma as reações sem truncar e arredonda só o total
// em 2 casas.
//
// Texto das parcelas e dos momentos: o original corta STR$(x) em INSTR(".") + 2
// (VIGA.BAS:2501, 2506), e sem ponto (valor inteiro) sobram o sinal e o 1º dígito: 30
// vira "3" e −20 vira "-2" (D-21). O corrigido grava o número com 2 casas, sem o corte.
import { atribuicao, qbInt, qbStr, qbUsing } from "../base/f32";
import type {
  DadosViga,
  LinhaRep,
  ModoSistrut,
  ParametrosVicalc,
  SomaReacoesPilares,
} from "../base/tipos";

/** `LTRIM$(MID$(STR$(x), 1, INSTR(STR$(x), ".") + 2))`: o corte textual que o original
 *  usa nas parcelas e nos momentos do .REP (VIGA.BAS:2415-2419). Trunca para zero
 *  pelo texto: −0,6481 → "-.64"; 1,1 → "1.1"; 2 → "2" (sem ponto, INSTR = 0 corta em 2
 *  caracteres). */
export function corteDuasCasas(x: number) {
  const texto = qbStr(x);
  const ponto = texto.indexOf(".") + 1;
  return texto.slice(0, ponto + 2).trimStart();
}

/** Soma das reações por pilar, na ordem em que os pilares aparecem nas vigas (A_1718,
 *  VIGA.BAS:2190-2204), e momentos dos apoios extremos (A_0fc4(2..3), VIGA.BAS:2416-2419).
 *  `analises` na ordem de processamento; cada uma acha os pilares em `vigas` pelo nome.
 *  A parcela é a reação estática ou a máxima (linha 12 do VIGA.INI; U61-023). */
export const somaReacoesPilares: SomaReacoesPilares = (analises, vigas, parametros, modo) => {
  const s = atribuicao(modo);
  const porPilar = new Map<string, LinhaRep>();
  const pares = analises.flatMap((analise) => {
    const viga = vigas.find((v) => v.nome === analise.nome);
    return viga ? [{ analise, viga }] : [];
  });
  for (const { viga } of pares) {
    for (const pilar of viga.pilares) {
      if (pilar !== null && !porPilar.has(pilar)) {
        porPilar.set(pilar, { pilar, total: 0, parcelas: [], momentos: [] });
      }
    }
  }
  for (const { analise, viga } of pares) {
    const n = viga.tramos.length;
    for (const [k, apoio] of analise.apoios.entries()) {
      const pilar = viga.pilares[k];
      const linha = pilar == null ? undefined : porPilar.get(pilar);
      if (!linha) continue;
      const r = parametros.reacaoNoPilar === "maxima" ? apoio.rMax : apoio.r;
      const valor = modo === "original" ? s(qbInt(r * 100) / 100) : r;
      linha.total = s(linha.total + valor);
      linha.parcelas.push({ viga: viga.nome, valor, texto: textoDoRep(valor, modo) });
      const [mEsq, mDir] = analise.momentosPilar;
      if (mEsq !== 0 && k === 0) {
        linha.momentos.push(momento(viga, mEsq, 1, viga.tramos[0]?.vao ?? 0, modo));
      }
      if (mDir !== 0 && k === n) {
        linha.momentos.push(momento(viga, mDir, n, viga.tramos[n - 1]?.vao ?? 0, modo));
      }
    }
  }
  const linhas = [...porPilar.values()];
  if (modo === "corrigido") for (const l of linhas) l.total = Math.round(l.total * 100) / 100;
  return linhas;
};

/** Texto de uma parcela ou de um momento no .REP: o corte do STR$ no original; no
 *  corrigido, o número com até 2 casas, sem o corte (D-21): 30 → "30", −0,6481 → "-0.65". */
export function textoDoRep(valor: number, modo: ModoSistrut) {
  return modo === "original" ? corteDuasCasas(valor) : String(Math.round(valor * 100) / 100);
}

function momento(viga: DadosViga, valor: number, apoio: number, vao: number, modo: ModoSistrut) {
  return { viga: viga.nome, valor, texto: textoDoRep(valor, modo), apoio, vao };
}

/** Texto de uma parcela no .REP: "6.93 (V2) + " (VIGA.BAS:2415). */
export const textoParcelaRep = (p: LinhaRep["parcelas"][number]) => `${p.texto} (${p.viga}) + `;

/** Texto de um momento no .REP: "-.64@1 [4]  (V1) > " (VIGA.BAS:2416-2419). */
export const textoMomentoRep = (m: LinhaRep["momentos"][number]) =>
  `${m.texto}@${m.apoio} [${qbStr(m.vao).trimStart()}]  (${m.viga}) > `;

/** Linha de título do quadro e do .REP (VIGA.BAS:2436-2448): " Cargas Totais", com
 *  " e Acidentais" (e "  Momentos Externos") quando há acidentais, e o tipo de reação. */
export function tituloRep(parametros: ParametrosVicalc) {
  let titulo = " Cargas Totais";
  if (parametros.acidentais) {
    titulo += " e Acidentais";
    if (parametros.momentosExternos) titulo += "  Momentos Externos";
  }
  return `${titulo}  Reacoes ${parametros.reacaoNoPilar === "estatica" ? "Estaticas" : "Maximas"}`;
}

/** Número do pilar como o original guarda (inteiro): "P7" → 7. */
function numeroPilar(pilar: string) {
  const m = /(\d+)\s*$/.exec(pilar);
  return m ? Number(m[1]) : Number.NaN;
}

/** Linhas do arquivo .REP (VIGA.BAS:2545-2557), sem o fim de linha: cabeçalho e, por
 *  pilar, "P   7         1.82", "*" + parcelas e ">" + momentos. `data` e `hora` vão
 *  como o original escreve DATE$ e TIME$ (ex.: "10-14-2026", "21:27"). */
export function linhasArquivoRep(
  linhas: readonly LinhaRep[],
  cabecalho: { obra: string; registros: string; data: string; hora: string },
  parametros: ParametrosVicalc,
) {
  const saida = [
    "SISTRUT Software e Tecnologia s/c Ltda",
    "Versao 4.0    Abril 1990",
    "",
    " SOMATORIA DE REACOES EM PILARES",
    ` OBRA ${cabecalho.obra}`,
    ` GERADO EM ${cabecalho.data}   ${cabecalho.hora}`,
    ` REGISTROS ${cabecalho.registros}`,
    tituloRep(parametros),
    "",
  ];
  for (const l of linhas) {
    saida.push(qbUsing("P####     #####.##", numeroPilar(l.pilar), l.total));
    saida.push(`*${l.parcelas.map(textoParcelaRep).join("")}`);
    saida.push(`>${l.momentos.map(textoMomentoRep).join("")}`);
  }
  return saida;
}
