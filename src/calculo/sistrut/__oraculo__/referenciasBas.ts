/// <reference types="node" />
// Citações de linha dos .BAS do original ("LAJECALC.BAS:2176") com o endereço do
// comando no EXE, que a retradução põe no comentário de cada linha ("'@1b4aa"). A
// linha muda quando a V1 regenera os .BAS (em ca78cb2 o v1-difs inseriu linhas de ON KEY
// e deslocou a numeração de 31 programas); o endereço não. Por isso a citação leva os
// dois, colados: "LAJECALC.BAS:2176@1b4aa", "VIGA.BAS:2498@1967a-2501@19759",
// "PILAR.BAS:5222@3404e, 5293@344df". `conferirCitacoes` acusa a citação cujo endereço
// não está mais na linha citada; `scripts/sistrut/referencias-bas.ts` refaz os números
// pelo endereço. Teste: referenciasBas.test.ts.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** Pasta dos .BAS da V1 nova (`<família>/<EXE>.BAS`); fora do repositório. */
export const PASTA_BAS =
  "C:/Users/MunaroPC/Desktop/Projetos Pessoais/_Arquivo/Sistrust/dist/src-original";

/** Um número citado: a linha e, se houver, o endereço colado. */
export interface NumeroCitado {
  linha: number;
  endereco?: string;
  /** Posição do número no texto (para reescrever). */
  inicio: number;
  fim: number;
}

/** Uma citação "ARQ.BAS:..." com os números da lista (intervalos contam as duas pontas). */
export interface Citacao {
  arquivo: string;
  /** Linha do texto (1-based). */
  linhaTexto: number;
  numeros: NumeroCitado[];
}

const NUMERO = /(\d+)(?:@([0-9a-f]+))?/y;

/** Citações do texto: "ARQ.BAS:" seguido de números separados por "-" ou ", ". */
export function citacoes(texto: string): Citacao[] {
  const out: Citacao[] = [];
  const re = /\b([A-Z][A-Z0-9_]*)\.BAS:(?=\d)/g;
  for (let m = re.exec(texto); m; m = re.exec(texto)) {
    const numeros: NumeroCitado[] = [];
    let i = re.lastIndex;
    for (;;) {
      NUMERO.lastIndex = i;
      const n = NUMERO.exec(texto);
      if (!n) break;
      numeros.push({
        linha: Number(n[1]),
        ...(n[2] ? { endereco: n[2] } : {}),
        inicio: i,
        fim: NUMERO.lastIndex,
      });
      i = NUMERO.lastIndex;
      const sep = /^(-|, )(?=\d)/.exec(texto.slice(i));
      if (!sep) break;
      i += sep[0].length;
    }
    out.push({
      arquivo: m[1]!,
      linhaTexto: texto.slice(0, m.index).split("\n").length,
      numeros,
    });
  }
  return out;
}

/** Linhas de um .BAS da pasta (procura `<família>/<arq>.BAS`); undefined se não há. */
export function lerBas(arquivo: string, pasta = PASTA_BAS): string[] | undefined {
  if (!existsSync(pasta)) return undefined;
  for (const familia of readdirSync(pasta)) {
    const p = join(pasta, familia, `${arquivo}.BAS`);
    if (existsSync(p)) return readFileSync(p, "latin1").split(/\r?\n/);
  }
  return undefined;
}

/** Endereço próprio da linha: o do comando ("'@1b4aa"), o do rótulo ("L_2248d:", o
 *  nome do rótulo é o endereço) ou o da entrada da SUB ("SUB S_202b9 ... (0x202b9)"). */
function enderecoProprio(linha: string) {
  return (
    /'@([0-9a-f]+)/.exec(linha)?.[1] ??
    /^\s*L_([0-9a-f]+):/.exec(linha)?.[1] ??
    /^\s*SUB \S+.*\(0x([0-9a-f]+)\)/.exec(linha)?.[1]
  );
}

/** Endereços aceitos para a linha `n` (1-based): o do comando da linha; ou o do rótulo
 *  ou da SUB e o do primeiro comando até 3 linhas abaixo (como a linha sem endereço:
 *  comentário, DIM, linha da retradução). O 1º é o que a migração grava. */
export function enderecosDaLinha(linhas: readonly string[], n: number) {
  const linha = linhas[n - 1] ?? "";
  const comando = /'@([0-9a-f]+)/.exec(linha)?.[1];
  if (comando) return [comando];
  const out: string[] = [];
  const proprio = enderecoProprio(linha);
  if (proprio) out.push(proprio);
  for (let k = n + 1; k <= n + 3 && k <= linhas.length; k++) {
    const m = /'@([0-9a-f]+)/.exec(linhas[k - 1] ?? "");
    if (m) {
      out.push(m[1]!);
      break;
    }
  }
  return out;
}

/** O endereço que a citação da linha `n` leva (o 1º de `enderecosDaLinha`). */
export const enderecoNaLinha = (linhas: readonly string[], n: number) =>
  enderecosDaLinha(linhas, n)[0];

/** Linha (1-based) do comando, rótulo ou SUB com o endereço, ou undefined. */
export function linhaDoEndereco(linhas: readonly string[], endereco: string) {
  const i = linhas.findIndex((l) => enderecoProprio(l) === endereco);
  return i < 0 ? undefined : i + 1;
}

/** Problemas das citações do texto contra os .BAS atuais: número sem endereço, arquivo
 *  que não existe e endereço que não está na linha citada (com a linha onde ele está). */
export function conferirCitacoes(texto: string, ler = lerBas): string[] {
  const problemas: string[] = [];
  for (const c of citacoes(texto)) {
    const linhas = ler(c.arquivo);
    if (!linhas) {
      problemas.push(`linha ${c.linhaTexto}: ${c.arquivo}.BAS não encontrado`);
      continue;
    }
    for (const n of c.numeros) {
      const onde = `linha ${c.linhaTexto}: ${c.arquivo}.BAS:${n.linha}`;
      if (!n.endereco) {
        problemas.push(`${onde} sem o endereço (@${enderecoNaLinha(linhas, n.linha) ?? "?"})`);
        continue;
      }
      if (enderecosDaLinha(linhas, n.linha).includes(n.endereco)) continue;
      const certa = linhaDoEndereco(linhas, n.endereco);
      problemas.push(
        `${onde}@${n.endereco}: ${certa ? `o endereço está na linha ${certa}` : "endereço não existe no arquivo"}`,
      );
    }
  }
  return problemas;
}
