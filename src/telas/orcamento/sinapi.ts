// Tabela de referência: um recorte pequeno e datado da SINAPI (Caixa), com as
// composições padrão do orçamento montadas a partir dela.
//
// Fonte: SINAPI, relatório mensal 09/2026, formato XLSX, arquivo
// SINAPI-2026-09-formato-xlsx.zip de
// https://www.caixa.gov.br/Downloads/sinapi-relatorios-mensais/SINAPI-2026-09-formato-xlsx.zip
// (SHA-256 feef29cd107f4bdde9bc10ba03d71eb4d8b6b2e0e95fe9020c4fe72aabe2a04c), planilha
// SINAPI_Referência_2026_09.xlsx, emissão 09/10/2026. UF SP (São Paulo), sem
// desoneração: insumos da aba ISD (preço mediano), composições da aba CSD. Cada
// preço abaixo foi lido da planilha oficial pelo próprio importador do app.
//
// Os preços mudam todo mês e por UF: para outra UF, mês ou a desoneração, importe a
// planilha da SINAPI (abas ISD/ICD e CSD/CCD) na tela do orçamento.
//
// Composições padrão (docs/ORCAMENTO.md): a SINAPI embute nas composições de
// montagem de fôrma uma fração da fôrma fabricada (4 utilizações) e nas de armação o
// aço com 11 % de perda. Aqui o material entra separado (com a perda e o
// reaproveitamento do orçamento), e a mão de obra fica com o resto da composição:
// - montagem e desmontagem: 92514 (laje), 92456 (viga) e 92419 (pilar), 4
//   utilizações, sem a subcomposição de fabricação;
// - armação: 92762 (CA-50 10,0 mm, montagem) sem a 92803 + a 92803 (corte e dobra)
//   sem o aço: a mesma mão de obra por kg para todas as bitolas (a de 10 mm);
// - concretagem: 103673 (lançamento com bomba, adensamento e acabamento) inteira.
import type { Componente, Papel, TabelaPrecos } from "../../dominio/orcamento";

/** Id fixo da tabela de referência (a cópia editada no navegador usa o mesmo). */
export const ID_SINAPI = "sinapi-2026-09-sp-nd";

const i = (codigo: string, unidade: string, preco: number, descricao: string) => ({
  codigo,
  descricao,
  unidade,
  preco,
});

export const TABELA_SINAPI: TabelaPrecos = {
  id: ID_SINAPI,
  nome: "SINAPI 09/2026 · SP · sem desoneração",
  fonte:
    "SINAPI (Caixa), relatório 09/2026, SINAPI_Referência_2026_09.xlsx (emissão 09/10/2026), abas ISD e CSD, coluna SP. https://www.caixa.gov.br/Downloads/sinapi-relatorios-mensais/SINAPI-2026-09-formato-xlsx.zip",
  referencia: "2026-09",
  uf: "SP",
  desonerado: false,
  itens: [
    // insumos (ISD)
    i(
      "1524",
      "M3",
      520.9,
      "CONCRETO USINADO BOMBEAVEL, CLASSE DE RESISTENCIA C20, BRITA 0 E 1, SLUMP = 100 +/- 20 MM, COM BOMBEAMENTO (DISPONIBILIZACAO DE BOMBA), SEM O LANCAMENTO (NBR 8953)",
    ),
    i(
      "1527",
      "M3",
      537.44,
      "CONCRETO USINADO BOMBEAVEL, CLASSE DE RESISTENCIA C25, BRITA 0 E 1, SLUMP = 100 +/- 20 MM, COM BOMBEAMENTO (DISPONIBILIZACAO DE BOMBA), SEM O LANCAMENTO (NBR 8953)",
    ),
    i(
      "1525",
      "M3",
      553.97,
      "CONCRETO USINADO BOMBEAVEL, CLASSE DE RESISTENCIA C30, BRITA 0 E 1, SLUMP = 100 +/- 20 MM, COM BOMBEAMENTO (DISPONIBILIZACAO DE BOMBA), SEM O LANCAMENTO (NBR 8953)",
    ),
    i(
      "11145",
      "M3",
      570.51,
      "CONCRETO USINADO BOMBEAVEL, CLASSE DE RESISTENCIA C35, BRITA 0 E 1, SLUMP = 100 +/- 20 MM, COM BOMBEAMENTO (DISPONIBILIZACAO DE BOMBA), SEM O LANCAMENTO (NBR 8953)",
    ),
    i(
      "34479",
      "M3",
      587.05,
      "CONCRETO USINADO BOMBEAVEL, CLASSE DE RESISTENCIA C40, BRITA 0 E 1, SLUMP = 100 +/- 20 MM, COM BOMBEAMENTO (DISPONIBILIZACAO DE BOMBA), SEM O LANCAMENTO (NBR 8953)",
    ),
    i("32", "KG", 7.06, "ACO CA-50, 6,3 MM, VERGALHAO"),
    i("33", "KG", 7.1, "ACO CA-50, 8,0 MM, VERGALHAO"),
    i("34", "KG", 6.69, "ACO CA-50, 10,0 MM, VERGALHAO"),
    i("43055", "KG", 5.8, "ACO CA-50, 12,5 MM OU 16,0 MM, VERGALHAO"),
    i("43056", "KG", 6.69, "ACO CA-50, 20,0 MM OU 25,0 MM, VERGALHAO"),
    i("43057", "KG", 7.35, "ACO CA-50, 32,0 MM, VERGALHAO"),
    i("43059", "KG", 6.33, "ACO CA-60, 4,2 MM, OU 5,0 MM, OU 6,0 MM, OU 7,0 MM, VERGALHAO"),
    i(
      "43132",
      "KG",
      21.66,
      "ARAME RECOZIDO 16 BWG, D = 1,65 MM (0,016 KG/M) OU 18 BWG, D = 1,25 MM (0,01 KG/M)",
    ),
    i(
      "39017",
      "UN",
      0.22,
      "ESPACADOR / DISTANCIADOR CIRCULAR COM ENTRADA LATERAL, EM PLASTICO, PARA VERGALHAO *4,2 A 12,5* MM, COBRIMENTO 20 MM",
    ),
    i(
      "2692",
      "L",
      6.83,
      "DESMOLDANTE PROTETOR PARA FORMAS DE MADEIRA, DE BASE OLEOSA EMULSIONADA EM AGUA",
    ),
    i(
      "40270",
      "M",
      123.03,
      "VIGA DE ESCORAMENTO H20, DE MADEIRA, PESO DE 5,00 A 5,20 KG/M, COM EXTREMIDADES PLASTICAS",
    ),
    i(
      "10749",
      "UNXMES",
      25.73,
      "LOCACAO DE ESCORA METALICA TELESCOPICA, COM ALTURA REGULAVEL DE *1,80* A *3,20* M, COM CAPACIDADE DE CARGA DE NO MINIMO 1000 KGF (10 KN), INCLUSO TRIPE E FORCADO",
    ),
    i(
      "40339",
      "UNXMES",
      7.78,
      "LOCACAO DE CRUZETA, SIMPLES, PARA ESCORA METALICA, COMPRIMENTO ENTRE 50 A 60 CM, PARA ESCORA DE 1,80 A 3,20 METROS E TUBO EXTERNO ATE 48 MM DE DIAMETRO",
    ),
    i("40304", "KG", 14.72, "PREGO DE ACO POLIDO COM CABECA DUPLA 17 X 27 (2 1/2 X 11)"),
    i(
      "40287",
      "MES",
      8.54,
      'LOCACAO DE BARRA DE ANCORAGEM DE 0,80 A 1,20 M DE EXTENSAO, COM ROSCA DE 5/8", INCLUINDO PORCA E FLANGE',
    ),
    i(
      "40275",
      "UNXMES",
      23.2,
      "LOCACAO DE VIGA SANDUICHE METALICA VAZADA PARA TRAVAMENTO DE PILARES, ALTURA DE *8* CM, LARGURA DE *6* CM E EXTENSAO DE 2 M",
    ),
    i(
      "40271",
      "UNXMES",
      22.19,
      "LOCACAO DE APRUMADOR METALICO DE PILAR, COM ALTURA E ANGULO REGULAVEIS, EXTENSAO DE *1,50* A *2,80* M",
    ),
    i(
      "4491",
      "M",
      8.25,
      "PONTALETE *7,5 X 7,5* CM EM PINUS, MISTA OU EQUIVALENTE DA REGIAO - BRUTA",
    ),
    // composições (CSD)
    i(
      "92267",
      "M2",
      44.25,
      "FABRICAÇÃO DE FÔRMA PARA LAJES, EM CHAPA DE MADEIRA COMPENSADA RESINADA, E = 17 MM. AF_09/2020",
    ),
    i(
      "92265",
      "M2",
      121.84,
      "FABRICAÇÃO DE FÔRMA PARA VIGAS, EM CHAPA DE MADEIRA COMPENSADA RESINADA, E = 17 MM. AF_09/2020",
    ),
    i(
      "92263",
      "M2",
      167.18,
      "FABRICAÇÃO DE FÔRMA PARA PILARES E ESTRUTURAS SIMILARES, EM CHAPA DE MADEIRA COMPENSADA RESINADA, E = 17 MM. AF_09/2020",
    ),
    i(
      "103673",
      "M3",
      60,
      "LANÇAMENTO COM USO DE BOMBA, ADENSAMENTO E ACABAMENTO DE CONCRETO EM ESTRUTURAS. AF_02/2022",
    ),
    i("88245", "H", 36.99, "ARMADOR COM ENCARGOS COMPLEMENTARES"),
    i("88238", "H", 34.64, "AJUDANTE DE ARMADOR COM ENCARGOS COMPLEMENTARES"),
    i("88262", "H", 36.53, "CARPINTEIRO DE FORMAS COM ENCARGOS COMPLEMENTARES"),
    i("88239", "H", 34.27, "AJUDANTE DE CARPINTEIRO COM ENCARGOS COMPLEMENTARES"),
  ],
};

const c = (codigo: string, coef = 1): Componente => ({ codigo, coef });

/** Concreto usinado bombeável da SINAPI por fck (C20 a C40, NBR 8953). */
const CONCRETO: Record<number, string> = {
  20: "1524",
  25: "1527",
  30: "1525",
  35: "11145",
  40: "34479",
};

/** Vergalhão da SINAPI por categoria e bitola (os códigos de 12,5/16 e 20/25 são agrupados). */
const VERGALHAO: Record<string, string> = {
  "CA-50:6.3": "32",
  "CA-50:8": "33",
  "CA-50:10": "34",
  "CA-50:12.5": "43055",
  "CA-50:16": "43055",
  "CA-50:20": "43056",
  "CA-50:25": "43056",
  "CA-50:32": "43057",
  "CA-60:4.2": "43059",
  "CA-60:5": "43059",
  "CA-60:6": "43059",
  "CA-60:7": "43059",
};

/** Composições padrão que não dependem da obra. Coeficientes do Analítico 09/2026. */
const FIXAS: Partial<Record<Papel, Componente[]>> = {
  "mo-concretagem": [c("103673")],
  "forma:laje": [c("92267")],
  "forma:viga": [c("92265")],
  "forma:pilar": [c("92263")],
  // 92514 sem a 92267 (0,341 m²)
  "mo-forma:laje": [
    c("88262", 0.635),
    c("88239", 0.116),
    c("40270", 0.038),
    c("10749", 0.397),
    c("2692", 0.01),
  ],
  // 92456 sem a 92265 (0,414 m²)
  "mo-forma:viga": [
    c("88262", 1.635),
    c("88239", 0.3),
    c("40339", 1.186),
    c("40304", 0.033),
    c("40287", 0.474),
    c("40275", 0.356),
    c("10749", 1.186),
    c("4491", 0.519),
    c("2692", 0.01),
  ],
  // 92419 sem a 92263 (0,263 m²)
  "mo-forma:pilar": [
    c("88262", 0.866),
    c("88239", 0.159),
    c("40304", 0.019),
    c("40287", 0.785),
    c("40275", 0.393),
    c("40271", 0.196),
    c("2692", 0.01),
  ],
  // 92762 (montagem: armador 0,0392, ajudante 0,0064, arame, espaçador) + 92803 sem o aço
  // (corte e dobra: armador 0,0088, ajudante 0,0014)
  "mo-armacao": [c("88245", 0.048), c("88238", 0.0078), c("43132", 0.025), c("39017", 0.543)],
};

/** Composição padrão de um papel na tabela de referência (undefined se não há). */
export function composicaoSinapi(p: Papel): Componente[] | undefined {
  const [base, a, b] = p.split(":");
  if (base === "concreto") {
    const cod = CONCRETO[Number(a)];
    return cod ? [c(cod)] : undefined;
  }
  if (base === "aco") {
    const cod = VERGALHAO[`${a}:${Number(b)}`];
    return cod ? [c(cod)] : undefined;
  }
  return FIXAS[p];
}
