// Escritor STEP (ISO 10303-21) mínimo para IFC, sem dependências: numera as
// instâncias, escreve cada atributo no formato do STEP e monta o arquivo com
// HEADER e DATA. Não conhece o esquema: quem chama passa os atributos na ordem do
// EXPRESS do IFC4 (docs/IFC.md lista a fonte). Também gera os GlobalId de 22
// caracteres do IFC a partir de um texto, para a mesma obra dar sempre os mesmos ids.

/** Referência a uma instância (#n). */
export interface Ref {
  readonly ref: number;
}

/** Valor de enumeração do EXPRESS: .MAIN., .T., .F. */
export interface Enum {
  readonly enum: string;
}

/** Valor com o tipo explícito (select do EXPRESS): IFCLABEL('V1'), IFCREAL(2.5). */
export interface Tipado {
  readonly tipo: string;
  readonly valor: Atributo;
}

/** Número que precisa sair como REAL mesmo inteiro (coordenadas, medidas). */
export interface Real {
  readonly real: number;
}

/** Atributo de uma instância. string = STRING do STEP; number = INTEGER (inteiro) ou
 *  REAL; null = não informado ($); "*" derivado vem de `DERIVADO`. */
export type Atributo =
  | string
  | number
  | boolean
  | null
  | Ref
  | Enum
  | Tipado
  | Real
  | typeof DERIVADO
  | readonly Atributo[];

/** Atributo redeclarado como DERIVE no subtipo: sai "*". */
export const DERIVADO: unique symbol = Symbol("*");

export const en = (valor: string): Enum => ({ enum: valor });
export const real = (valor: number): Real => ({ real: valor });
export const tipado = (tipo: string, valor: Atributo): Tipado => ({ tipo, valor });

/** REAL do STEP: sempre com ponto decimal, até 9 casas, sem "-0" e sem expoente para
 *  valores de desenho. */
export function numeroStep(v: number) {
  if (!Number.isFinite(v)) throw new Error(`número inválido no IFC: ${v}`);
  const arredondado = Number(v.toFixed(9)) + 0;
  let s = String(arredondado);
  if (/e/i.test(s)) s = arredondado.toFixed(9).replace(/0+$/, "");
  return s.includes(".") ? s : `${s}.`;
}

/** STRING do STEP: apóstrofo e barra invertida dobrados; fora do ASCII imprimível,
 *  \X2\HHHH\X0\ (UTF-16, ISO 10303-21 6.4.3.4). */
export function textoStep(t: string) {
  let s = "";
  let largo = "";
  const fecha = () => {
    if (largo) s += `\\X2\\${largo}\\X0\\`;
    largo = "";
  };
  for (let i = 0; i < t.length; i++) {
    const c = t.charCodeAt(i);
    if (c >= 32 && c < 127) {
      fecha();
      const ch = t[i]!;
      s += ch === "'" ? "''" : ch === "\\" ? "\\\\" : ch;
    } else largo += (c < 32 ? 32 : c).toString(16).toUpperCase().padStart(4, "0");
  }
  fecha();
  return `'${s}'`;
}

const ehRef = (a: object): a is Ref => "ref" in a;
const ehEnum = (a: object): a is Enum => "enum" in a;
const ehReal = (a: object): a is Real => "real" in a;

function atributoStep(a: Atributo): string {
  if (a === null) return "$";
  if (a === DERIVADO) return "*";
  if (typeof a === "string") return textoStep(a);
  if (typeof a === "boolean") return a ? ".T." : ".F.";
  if (typeof a === "number") return Number.isInteger(a) ? String(a) : numeroStep(a);
  if (Array.isArray(a)) return `(${a.map(atributoStep).join(",")})`;
  if (ehRef(a)) return `#${a.ref}`;
  if (ehEnum(a)) return `.${a.enum}.`;
  if (ehReal(a)) return numeroStep(a.real);
  const t = a as Tipado;
  return `${t.tipo}(${atributoStep(t.valor)})`;
}

/** Arquivo STEP em construção: `add` devolve a referência da instância nova. */
export class ArquivoStep {
  private readonly linhas: string[] = [];

  add(entidade: string, ...atributos: Atributo[]): Ref {
    const ref = this.linhas.length + 1;
    this.linhas.push(
      `#${ref}=${entidade.toUpperCase()}(${atributos.map(atributoStep).join(",")});`,
    );
    return { ref };
  }

  get tamanho() {
    return this.linhas.length;
  }

  /** O arquivo inteiro. `cabecalho` vai em FILE_DESCRIPTION e FILE_NAME. */
  escrever(cabecalho: {
    descricao: string[];
    nome: string;
    data: string;
    autor: string;
    organizacao: string;
    sistema: string;
    esquema: string;
  }): string {
    const lista = (xs: string[]) => `(${xs.map(textoStep).join(",")})`;
    return [
      "ISO-10303-21;",
      "HEADER;",
      `FILE_DESCRIPTION(${lista(cabecalho.descricao)},'2;1');`,
      `FILE_NAME(${textoStep(cabecalho.nome)},${textoStep(cabecalho.data)},${lista([cabecalho.autor])},${lista([cabecalho.organizacao])},${textoStep(cabecalho.sistema)},${textoStep(cabecalho.sistema)},'');`,
      `FILE_SCHEMA((${textoStep(cabecalho.esquema)}));`,
      "ENDSEC;",
      "DATA;",
      ...this.linhas,
      "ENDSEC;",
      "END-ISO-10303-21;",
      "",
    ].join("\n");
  }
}

// ---- GlobalId ----------------------------------------------------------------------

/** Alfabeto do GlobalId comprimido do IFC (IfcGloballyUniqueId). */
const ALFABETO = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$";

/** Hash de 128 bits (cyrb128) do texto, em 4 palavras de 32 bits. */
function hash128(texto: string): [number, number, number, number] {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0; i < texto.length; i++) {
    const k = texto.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

/** GlobalId de 22 caracteres derivado do texto: a mesma chave dá o mesmo id, para o
 *  elemento manter a identidade entre exportações (BCF, comparação de versões). Os
 *  128 bits saem como 2 + 21 × 6 bits, como o GUID comprimido do IFC. */
export function globalId(chave: string): string {
  let bits = BigInt(0);
  for (const w of hash128(chave)) bits = (bits << BigInt(32)) | BigInt(w);
  let s = "";
  for (let i = 0; i < 22; i++) {
    const desloca = BigInt(6 * (21 - i));
    s += ALFABETO[Number((bits >> desloca) & BigInt(63))];
  }
  return s;
}
