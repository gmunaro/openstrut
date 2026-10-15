// Semântica numérica do QuickBASIC 4.5 (runtime BRUN45) para o modo "Como o
// SISTRUT original". Os módulos de `src/calculo/sistrut/` usam estas funções no
// lugar da aritmética do JavaScript sempre que o original arredonda, trunca ou
// formata um número.
//
// Precisão (PLANO.md X1; livros U32-031, U64-015):
// - Toda variável `!` do original é SINGLE (IEEE 754 binary32). O QB4.5 calcula
//   a expressão inteira na pilha do x87, em precisão estendida (64 bits de
//   mantissa), e só arredonda para SINGLE ao gravar a variável (FSTP). Aqui a
//   expressão roda em float64 e `sng` arredonda na atribuição. float64 tem 53
//   bits de mantissa contra 64 do x87: em contas longas o resultado pode diferir
//   no último bit do SINGLE. É a aproximação aceita; quando um teste do oráculo
//   divergir no último dígito, esta é a primeira suspeita.
// - Constantes literais do original também são SINGLE (a V1 mostra `1.4` como
//   1.39999997615814208984375##): escreva `sng(1.4)`, não `1.4`.
// - Variáveis `#` (DOUBLE) não passam por `sng`.
//
// Referências: runtime da V1 nova, `dist/src-original/comum/RT45.BM` (FX##,
// RT_SNG!, RT_PU#), conferido byte a byte contra o oráculo.

/** Erro de runtime do QB4.5 (ex.: 6 = Overflow, 13 = Type mismatch). */
export class ErroQB extends Error {
  readonly codigo: number;
  constructor(codigo: number, mensagem: string) {
    super(`${mensagem} (erro ${codigo} do QuickBASIC)`);
    this.codigo = codigo;
  }
}

/** Ponto em que o original entraria em laço sem fim. Lançado nos dois modos onde o
 *  porte põe um teto de passos: recálculos da otimização dos negativos (lajes/esforcos.ts,
 *  R3), código do bordo que não muda na otimização (lajes/otimizacao.ts, R3, com o
 *  `estado` da tela parada) e busca do equilíbrio do pilar (pilares/elu.ts e
 *  armadura.ts, D-2). `estado` = o que a tela do original mostraria travada, quando há.
 *  Ao capturar com `instanceof`, anote o tipo do estado esperado:
 *  `const estado: EstadoX | undefined = erro.estado`. */
export class ErroNaoConverge<Estado = undefined> extends Error {
  readonly estado: Estado | undefined;
  constructor(mensagem: string, estado?: Estado) {
    super(mensagem);
    this.name = "ErroNaoConverge";
    this.estado = estado;
  }
}

/** Arredonda para SINGLE, como a atribuição a uma variável `!` do original.
 *  Use em toda atribuição do modo original: `const q = sng(g + pp)`. */
export const sng = (x: number) => Math.fround(x);

/** `INT(x)`: maior inteiro ≤ x (piso). INT(-64.8) = -65. */
export const qbInt = (x: number) => Math.floor(x) + 0;

/** `FIX(x)`: parte inteira, truncando para zero. FIX(-64.8) = -64. */
export const qbFix = (x: number) => Math.trunc(x) + 0;

/** Arredonda ao inteiro mais próximo; no meio exato, ao par (como o FRNDINT do x87). */
function arredondaAoPar(x: number) {
  const piso = Math.floor(x);
  const resto = x - piso;
  if (resto > 0.5) return piso + 1;
  if (resto < 0.5) return piso + 0;
  return piso % 2 === 0 ? piso + 0 : piso + 1;
}

/** `CINT(x)`: inteiro de 16 bits arredondado ao par. CINT(2.5) = 2, CINT(3.5) = 4,
 *  CINT(-2.5) = -2. Fora da faixa ou NaN dá -32768 SEM erro: é o "inteiro
 *  indefinido" do FISTP do x87 (sondas T17/T19 no oráculo, docs/RETRADUCAO.md da
 *  V1; RT_CINT% em RT45.BM). Ex.: kg/m da viga acima de 32,767 t/m (livros_laje D12). */
export function qbCint(x: number) {
  if (Number.isNaN(x) || x >= 32767.5 || x < -32768.5) return -32768;
  return arredondaAoPar(x);
}

/** `CLNG(x)`: inteiro de 32 bits arredondado ao par (Ma do pilar, PILAR.BAS:4806).
 *  Fora da faixa ou NaN dá -2147483648 sem erro (RT_CLNG& em RT45.BM). */
export function qbClng(x: number) {
  if (Number.isNaN(x) || x >= 2147483647.5 || x < -2147483648.5) return -2147483648;
  return arredondaAoPar(x);
}

/** `INT(x * 10^casas) / 10^casas`: o truncamento para baixo que o original faz ao
 *  gravar ou transferir valores (PLANO.md X3; .REP em VIGA.BAS:2413). Devolve
 *  float64; quem atribui a uma variável `!` aplica `sng`. */
export function qbIntCasas(x: number, casas: number) {
  const escala = 10 ** casas;
  return qbInt(x * escala) / escala;
}

/** `STR$(x)` de um SINGLE: 7 algarismos significativos, sem zeros à direita,
 *  espaço inicial nos não negativos e "-" nos negativos, sem o zero antes do
 *  ponto (".15", "-.65"). Usa notação E ("1.234568E+07", "1E-08") quando a forma
 *  fixa precisaria de mais de 7 algarismos inteiros ou de mais de 7 casas
 *  decimais (regra do PRINT/STR$ de SINGLE do BASIC da Microsoft; ver o teste). */
export function qbStr(x: number) {
  const v = sng(x);
  if (v === 0) return " 0";
  // infinito e NaN como o BRUN45 escreve (sonda T13, docs/RETRADUCAO.md da V1)
  if (Number.isNaN(v)) return "-1.#IND";
  if (!Number.isFinite(v)) return v > 0 ? " 1.#INF" : "-1.#INF";
  const sinal = v < 0 ? "-" : " ";
  const [mantissa = "", expoenteTexto = "0"] = Math.abs(v).toExponential(6).split("e");
  const digitos = mantissa.replace(".", "").replace(/0+$/, "");
  const expoente = Number(expoenteTexto);
  const casas = digitos.length - 1 - expoente;
  if (expoente <= 6 && casas <= 7) {
    if (expoente < 0) return `${sinal}.${"0".repeat(-expoente - 1)}${digitos}`;
    const inteiro = digitos.slice(0, expoente + 1).padEnd(expoente + 1, "0");
    const fracao = digitos.slice(expoente + 1);
    return sinal + inteiro + (fracao ? `.${fracao}` : "");
  }
  const m = digitos.length > 1 ? `${digitos[0]}.${digitos.slice(1)}` : digitos;
  const e = `${expoente < 0 ? "-" : "+"}${String(Math.abs(expoente)).padStart(2, "0")}`;
  return `${sinal}${m}E${e}`;
}

// ---------------------------------------------------------------- PRINT USING

type CampoNumero = {
  tipo: "numero";
  /** Posições antes do ponto ('#' e ','). */
  inteiros: number;
  decimais: number;
  temPonto: boolean;
  /** ',' antes do ponto: separador de milhar. */
  milhar: boolean;
  /** '+' no começo do campo: sinal sempre impresso antes do número. */
  sinalAntes: boolean;
  /** '+' ou '-' no fim do campo: sinal depois do número. */
  sinalDepois: "+" | "-" | null;
};
type CampoTexto = { tipo: "texto"; largura: number | "tudo" };
type Peca = { tipo: "literal"; texto: string } | CampoNumero | CampoTexto;

/** Separa a máscara em literais e campos, pelas regras do PRINT USING do QB4.5. */
function lerMascara(mascara: string) {
  const pecas: Peca[] = [];
  let literal = "";
  const fechaLiteral = () => {
    if (literal) pecas.push({ tipo: "literal", texto: literal });
    literal = "";
  };
  let i = 0;
  while (i < mascara.length) {
    const c = mascara[i];
    const proximo = mascara[i + 1];
    if (c === "_" && proximo !== undefined) {
      literal += proximo;
      i += 2;
    } else if (c === "!" || c === "&") {
      fechaLiteral();
      pecas.push({ tipo: "texto", largura: c === "!" ? 1 : "tudo" });
      i += 1;
    } else if (c === "\\") {
      const fim = mascara.indexOf("\\", i + 1);
      const entre = fim < 0 ? "" : mascara.slice(i + 1, fim);
      if (fim < 0 || /[^ ]/.test(entre)) {
        literal += c;
        i += 1;
      } else {
        fechaLiteral();
        pecas.push({ tipo: "texto", largura: fim - i + 1 });
        i = fim + 1;
      }
    } else if (
      c === "#" ||
      (c === "." && proximo === "#") ||
      (c === "+" && (proximo === "#" || (proximo === "." && mascara[i + 2] === "#")))
    ) {
      fechaLiteral();
      const campo: CampoNumero = {
        tipo: "numero",
        inteiros: 0,
        decimais: 0,
        temPonto: false,
        milhar: false,
        sinalAntes: false,
        sinalDepois: null,
      };
      if (c === "+") {
        campo.sinalAntes = true;
        i += 1;
      }
      while (i < mascara.length) {
        const d = mascara[i];
        const depois = mascara[i + 1];
        if (d === "#") {
          if (campo.temPonto) campo.decimais += 1;
          else campo.inteiros += 1;
        } else if (d === "." && !campo.temPonto) {
          campo.temPonto = true;
        } else if (
          d === "," &&
          !campo.temPonto &&
          (depois === "#" || depois === "." || depois === ",")
        ) {
          campo.milhar = true;
          campo.inteiros += 1;
        } else {
          break;
        }
        i += 1;
      }
      const s = mascara[i];
      if (!campo.sinalAntes && (s === "+" || s === "-")) {
        campo.sinalDepois = s;
        i += 1;
      }
      pecas.push(campo);
    } else {
      literal += c;
      i += 1;
    }
  }
  fechaLiteral();
  return pecas;
}

/** |v| arredondado a `casas` decimais, metade para cima, sobre os 16 algarismos
 *  significativos do valor (como o RT_PU# da V1, que lê STR$ do DOUBLE). */
function arredondaCasas(v: number, casas: number) {
  const [mantissa = "0", expoenteTexto = "0"] = Math.abs(v).toExponential(15).split("e");
  const n = BigInt(mantissa.replace(".", ""));
  const k = Number(expoenteTexto) - 15 + casas;
  let r: bigint;
  if (k >= 0) {
    r = n * 10n ** BigInt(k);
  } else {
    const divisor = 10n ** BigInt(-k);
    r = n / divisor;
    if ((n % divisor) * 2n >= divisor) r += 1n;
  }
  const texto = r.toString().padStart(casas + 1, "0");
  return {
    inteiro: texto.slice(0, texto.length - casas),
    fracao: texto.slice(texto.length - casas),
  };
}

function formataNumero(campo: CampoNumero, v: number) {
  // Negativo que arredonda para zero sai "-0.00" (dúvida aberta: sem prova no oráculo).
  const negativo = v < 0;
  const { inteiro, fracao } = arredondaCasas(v, campo.decimais);
  let parteInteira = inteiro.replace(/^0+(?=\d)/, "");
  if (campo.milhar) parteInteira = parteInteira.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const sinalNaFrente = campo.sinalDepois === null;
  const sinal = campo.sinalAntes ? (negativo ? "-" : "+") : negativo ? "-" : "";
  const largura = campo.inteiros + (campo.sinalAntes ? 1 : 0);
  const caudaSinal =
    campo.sinalDepois === "+"
      ? negativo
        ? "-"
        : "+"
      : campo.sinalDepois === "-"
        ? negativo
          ? "-"
          : " "
        : "";
  const cauda = (campo.temPonto ? `.${fracao}` : "") + caudaSinal;
  const frente = (s: string) => (sinalNaFrente ? sinal : "") + s;
  // O zero antes do ponto só sai se couber ("0.25" com "#.##", ".25" com ".##").
  if (parteInteira === "0" && campo.temPonto && frente("0").length > largura) parteInteira = "";
  const corpo = frente(parteInteira);
  if (corpo.length > largura) return `%${corpo}${cauda}`;
  return corpo.padStart(largura, " ") + cauda;
}

function formataTexto(campo: CampoTexto, s: string) {
  if (campo.largura === "tudo") return s;
  return s.slice(0, campo.largura).padEnd(campo.largura, " ");
}

/** `PRINT USING mascara; v1; v2; ...` sem o fim de linha. Números com '#', '.',
 *  ',' de milhar e sinal '+'/'-' antes ou depois; textos com '\  \', '!' e '&';
 *  '_' torna literal o caractere seguinte. Os números são arredondados metade
 *  para cima pelo valor (não pelos 7 algarismos do SINGLE: no caso b, x = 1,8750001
 *  sai 1.88 e x = 1,8749999 sai 1.87). Número que não cabe sai com '%' na frente,
 *  sem cortar. A máscara recomeça quando sobram valores; depois do último valor,
 *  o literal até o próximo campo ainda é impresso.
 *  Passe o valor com a precisão que o original tinha: `sng(x)` para SINGLE. */
export function qbUsing(mascara: string, ...valores: (number | string)[]) {
  const pecas = lerMascara(mascara);
  if (!pecas.some((p) => p.tipo !== "literal")) {
    throw new ErroQB(5, `Máscara sem campo: "${mascara}"`);
  }
  let saida = "";
  let p = 0;
  let restantes = valores.length;
  for (const valor of valores) {
    for (;;) {
      const peca = pecas[p % pecas.length]!;
      p += 1;
      if (peca.tipo === "literal") {
        saida += peca.texto;
        continue;
      }
      if (peca.tipo === "numero") {
        if (typeof valor !== "number") throw new ErroQB(13, `Texto "${valor}" em campo numérico`);
        saida += formataNumero(peca, valor);
      } else {
        if (typeof valor !== "string") throw new ErroQB(13, `Número ${valor} em campo de texto`);
        saida += formataTexto(peca, valor);
      }
      break;
    }
    restantes -= 1;
    // fim da máscara (p múltiplo do tamanho) = nada mais a imprimir
    if (restantes === 0 && p % pecas.length !== 0) {
      for (let q = p % pecas.length; q < pecas.length; q++) {
        const peca = pecas[q]!;
        if (peca.tipo !== "literal") break;
        saida += peca.texto;
      }
    }
  }
  return saida;
}

/** Arredondamento de atribuição do modo: `sng` no original (SINGLE a cada
 *  atribuição), identidade no corrigido (float64). Uso: `const s = atribuicao(modo)`. */
export const atribuicao = (modo: "original" | "corrigido") =>
  modo === "original" ? sng : (x: number) => x;
