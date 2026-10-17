// Sequência construtiva (4D): as etapas da obra geradas do modelo 3D, na ordem de
// execução, com datas em dias corridos. Lógica pura, sem three.js e sem React, para a
// camada (camada.tsx) e os testes (etapas.test.ts).
import type { Modelo3D } from "../api";

/** Serviço de uma etapa: a fundação inteira ou, num nível, os pilares do lance, a fôrma
 *  com as vigas e as lajes (com a escada que chega ao nível). */
export type TipoEtapa = "fundacao" | "pilares" | "vigas" | "lajes";

export const TIPOS_ETAPA: readonly TipoEtapa[] = ["fundacao", "pilares", "vigas", "lajes"];

export const ROTULO_ETAPA: Record<TipoEtapa, string> = {
  fundacao: "Fundação",
  pilares: "Pilares",
  vigas: "Fôrma e vigas",
  lajes: "Lajes",
};

/** Duração padrão de cada serviço, dias corridos (por nível, salvo a fundação). Ordem de
 *  grandeza de obra pequena com uma equipe: blocos escavados, armados e concretados em
 *  uma semana; pilares do lance armados, fôrmados e concretados em 3 dias; fôrma do
 *  pavimento com as vigas em 4; armação e concretagem das lajes em 5. */
export const DURACAO_PADRAO: Record<TipoEtapa, number> = {
  fundacao: 7,
  pilares: 3,
  vigas: 4,
  lajes: 5,
};

export interface Etapa {
  tipo: TipoEtapa;
  /** Índice do nível em `modelo.niveis`; a fundação usa o 0. */
  nivel: number;
  /** Serviço ("Fundação", "Pilares", "Fôrma e vigas", "Lajes" ou "Lajes e escada") e
   *  nome do nível ("" na fundação). */
  servico: string;
  nomeNivel: string;
  /** Ex.: "Fundação", "Pilares · Tipo (2/3)", "Lajes e escada · Cobertura". */
  nome: string;
  /** Chaves das peças (Elemento3D.chave) que a etapa constrói. */
  chaves: string[];
  /** Dia em que a etapa começa (0 = o primeiro dia da obra) e duração, dias corridos. */
  inicio: number;
  dias: number;
}

/** Duração aceita: inteiro de 1 dia para cima (vazio ou inválido vira 1). */
export const diasValidos = (d: number) => (Number.isFinite(d) ? Math.max(1, Math.round(d)) : 1);

/** Etapas do modelo na ordem de obra: a fundação; depois, de baixo para cima, para cada
 *  nível, os pilares do lance (que sustentam a laje do nível), a fôrma com as vigas e as
 *  lajes. A escada, que fica no nível de baixo dela, entra com as lajes do nível de cima
 *  (a do último nível, com as lajes dele). Etapas sem peças ficam de fora. As etapas
 *  correm uma depois da outra, sem sobreposição. */
export function gerarEtapas(
  modelo: Modelo3D,
  duracoes: Record<TipoEtapa, number> = DURACAO_PADRAO,
): Etapa[] {
  const ultimo = modelo.niveis.length - 1;
  const grupos = new Map<string, { chaves: string[]; escada: boolean }>();
  for (const e of modelo.elementos) {
    const [tipo, nivel]: [TipoEtapa, number] =
      e.tipo === "fundacao"
        ? ["fundacao", 0]
        : e.tipo === "pilar"
          ? ["pilares", e.nivel]
          : e.tipo === "viga"
            ? ["vigas", e.nivel]
            : e.tipo === "laje"
              ? ["lajes", e.nivel]
              : ["lajes", Math.min(e.nivel + 1, ultimo)];
    const k = `${tipo}|${nivel}`;
    const g = grupos.get(k) ?? { chaves: [], escada: false };
    g.chaves.push(e.chave);
    if (e.tipo === "escada") g.escada = true;
    grupos.set(k, g);
  }

  const etapas: Etapa[] = [];
  let dia = 0;
  const incluir = (tipo: TipoEtapa, nivel: number) => {
    const g = grupos.get(`${tipo}|${nivel}`);
    if (!g) return;
    const n = modelo.niveis[nivel];
    const servico = tipo === "lajes" && g.escada ? "Lajes e escada" : ROTULO_ETAPA[tipo];
    const nomeNivel = tipo === "fundacao" ? "" : (n?.nome ?? "");
    const dias = diasValidos(duracoes[tipo]);
    etapas.push({
      tipo,
      nivel,
      servico,
      nomeNivel,
      nome: nomeNivel ? `${servico} · ${nomeNivel}` : servico,
      chaves: g.chaves,
      inicio: dia,
      dias,
    });
    dia += dias;
  };
  incluir("fundacao", 0);
  for (let i = 0; i <= ultimo; i++) for (const t of TIPOS_ETAPA.slice(1)) incluir(t, i);
  return etapas;
}

/** Dias da obra inteira (o dia seguinte ao fim da última etapa). */
export const totalDias = (etapas: readonly Etapa[]) => {
  const u = etapas.at(-1);
  return u ? u.inicio + u.dias : 0;
};

/** Índice da etapa em andamento no dia `dia` (dias decorridos desde o início), ou -1
 *  antes do início e depois da última etapa. */
export function etapaNoDia(etapas: readonly Etapa[], dia: number): number {
  return etapas.findIndex((e) => e.inicio <= dia && dia < e.inicio + e.dias);
}

/** O que aparece no dia `dia`: as peças das etapas já começadas (concluídas e em
 *  andamento) e, entre elas, as da etapa em andamento. O resto é o futuro. */
export function pecasNoDia(
  etapas: readonly Etapa[],
  dia: number,
): { visiveis: Set<string>; emObra: Set<string> } {
  const visiveis = new Set<string>();
  const emObra = new Set<string>();
  for (const e of etapas) {
    if (e.inicio > dia) break;
    const andamento = dia < e.inicio + e.dias;
    for (const k of e.chaves) {
      visiveis.add(k);
      if (andamento) emObra.add(k);
    }
  }
  return { visiveis, emObra };
}

// ---- datas (dias corridos, sem fuso: a data ISO é tratada como UTC) ----------------------

/** Data ISO (aaaa-mm-dd) somada de `dias`. */
export function somarDias(iso: string, dias: number): string {
  const t = Date.parse(`${iso}T00:00:00Z`);
  if (Number.isNaN(t)) return iso;
  return new Date(t + dias * 86_400_000).toISOString().slice(0, 10);
}

/** aaaa-mm-dd → dd/mm/aaaa. */
export const dataBr = (iso: string) => iso.split("-").toReversed().join("/");

/** Primeiro e último dia da etapa, ISO, a partir da data de início da obra. */
export const datasDaEtapa = (e: Etapa, inicioObra: string) => ({
  inicio: somarDias(inicioObra, e.inicio),
  fim: somarDias(inicioObra, e.inicio + e.dias - 1),
});

/** Cronograma em CSV (separador ";", como o Excel em pt-BR abre). */
export function cronogramaCsv(etapas: readonly Etapa[], inicioObra: string): string {
  const campo = (v: string | number) => {
    const s = String(v);
    return /[;"\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
  };
  const linhas = [["Etapa", "Serviço", "Nível", "Peças", "Início", "Fim", "Dias"]];
  etapas.forEach((e, i) => {
    const d = datasDaEtapa(e, inicioObra);
    linhas.push([
      String(i + 1),
      e.servico,
      e.nomeNivel,
      String(e.chaves.length),
      dataBr(d.inicio),
      dataBr(d.fim),
      String(e.dias),
    ]);
  });
  return linhas.map((l) => l.map(campo).join(";")).join("\r\n") + "\r\n";
}
