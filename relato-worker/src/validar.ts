// Validação do corpo enviado pelo botão "Relatar problema". Função pura: recebe o
// JSON já parseado e devolve o Relato limpo ou a mensagem em pt-BR que o app
// mostra ao usuário.
import type { ItemDiagnostico, Relato } from "./tipos";

/** Formato que o app envia (contrato com o cliente; não renomeie campos). */
export interface RelatoEnviado {
  versao: 1;
  titulo: string;
  aconteceu: string;
  esperado: string;
  email?: string;
  diagnostico: ItemDiagnostico[];
  erros: string[];
  print?: string;
  obra?: { nome: string; json: string };
  turnstile?: string;
  site?: string;
}

const MIB = 1024 * 1024;
export const LIMITES = {
  titulo: 120,
  texto: 5000,
  email: 200,
  itensDiagnostico: 30,
  rotulo: 60,
  valor: 1000,
  erros: 20,
  erro: 2000,
  printBytes: 3 * MIB,
  nomeObra: 100,
  obraBytes: 2 * MIB,
  links: 5,
} as const;

const ASSINATURA_PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export type ResultadoValidacao = { ok: true; relato: Relato } | { ok: false; mensagem: string };

class Invalido extends Error {}

/** Confere o corpo do relato contra os limites do contrato. */
export function validarRelato(corpo: unknown): ResultadoValidacao {
  try {
    return { ok: true, relato: lerRelato(corpo) };
  } catch (erro) {
    if (erro instanceof Invalido) return { ok: false, mensagem: erro.message };
    throw erro;
  }
}

function lerRelato(corpo: unknown): Relato {
  if (!ehObjeto(corpo)) throw new Invalido("O relato chegou num formato inválido.");
  if (corpo.versao !== 1) {
    throw new Invalido("Versão do relato não suportada. Recarregue a página e tente de novo.");
  }

  const titulo = texto(corpo.titulo, "Título", LIMITES.titulo, true);
  if (/[\r\n]/.test(titulo)) throw new Invalido('O campo "Título" não pode ter quebra de linha.');
  const aconteceu = texto(corpo.aconteceu, "O que aconteceu", LIMITES.texto, true);
  const esperado = texto(corpo.esperado ?? "", "O que você esperava", LIMITES.texto, false);
  if (contarLinks(`${aconteceu}\n${esperado}`) > LIMITES.links) {
    throw new Invalido(`O relato tem links demais (máximo ${LIMITES.links}).`);
  }

  return {
    titulo,
    aconteceu,
    esperado,
    email: lerEmail(corpo.email),
    diagnostico: lerDiagnostico(corpo.diagnostico),
    erros: lerErros(corpo.erros),
    print: lerPrint(corpo.print),
    obra: lerObra(corpo.obra),
    turnstile: typeof corpo.turnstile === "string" && corpo.turnstile ? corpo.turnstile : undefined,
    robo: corpo.site !== undefined && corpo.site !== null && corpo.site !== "",
  };
}

/** Quantos links http/https o texto tem. */
export function contarLinks(texto: string) {
  return texto.match(/https?:\/\//gi)?.length ?? 0;
}

/** Nome da obra seguro para caminho no repositório: só [A-Za-z0-9._-], termina em .json. */
export function nomeSeguroObra(nome: string) {
  const base = nome
    .trim()
    .replace(/[^A-Za-z0-9._-]/g, "_")
    .replace(/\.json$/i, "")
    .replace(/^\.+/, "");
  return `${base || "obra"}.json`;
}

function ehObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

/** Tamanho em caracteres (pontos de código, não unidades UTF-16). */
function tamanho(s: string) {
  return Array.from(s).length;
}

function texto(valor: unknown, campo: string, maximo: number, obrigatorio: boolean) {
  if (typeof valor !== "string") throw new Invalido(`O campo "${campo}" chegou inválido.`);
  const limpo = valor.trim();
  if (obrigatorio && !limpo) throw new Invalido(`O campo "${campo}" está vazio.`);
  if (tamanho(limpo) > maximo) {
    throw new Invalido(`O campo "${campo}" passa de ${maximo} caracteres.`);
  }
  return limpo;
}

function lerEmail(valor: unknown) {
  if (valor === undefined || valor === null) return undefined;
  const email = texto(valor, "E-mail", LIMITES.email, false);
  if (!email) return undefined;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Invalido('O campo "E-mail" não parece um endereço de e-mail.');
  }
  return email;
}

function lerDiagnostico(valor: unknown) {
  if (valor === undefined) return [];
  if (!Array.isArray(valor)) throw new Invalido("O diagnóstico chegou inválido.");
  if (valor.length > LIMITES.itensDiagnostico) {
    throw new Invalido(`O diagnóstico passa de ${LIMITES.itensDiagnostico} itens.`);
  }
  return valor.map((item): ItemDiagnostico => {
    if (!ehObjeto(item) || typeof item.rotulo !== "string" || typeof item.valor !== "string") {
      throw new Invalido("Um item do diagnóstico chegou inválido.");
    }
    if (tamanho(item.rotulo) > LIMITES.rotulo || tamanho(item.valor) > LIMITES.valor) {
      throw new Invalido("Um item do diagnóstico passa do tamanho permitido.");
    }
    return { rotulo: item.rotulo, valor: item.valor };
  });
}

function lerErros(valor: unknown) {
  if (valor === undefined) return [];
  if (!Array.isArray(valor) || !valor.every((e): e is string => typeof e === "string")) {
    throw new Invalido("A lista de erros chegou inválida.");
  }
  if (valor.length > LIMITES.erros) {
    throw new Invalido(`A lista de erros passa de ${LIMITES.erros} itens.`);
  }
  if (valor.some((e) => tamanho(e) > LIMITES.erro)) {
    throw new Invalido(`Um dos erros passa de ${LIMITES.erro} caracteres.`);
  }
  return valor;
}

function lerPrint(valor: unknown) {
  if (valor === undefined || valor === null || valor === "") return undefined;
  if (
    typeof valor !== "string" ||
    valor.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(valor)
  ) {
    throw new Invalido("O print não é uma imagem PNG válida.");
  }
  const bytes = (valor.length / 4) * 3 - (valor.match(/=+$/)?.[0].length ?? 0);
  if (bytes > LIMITES.printBytes) throw new Invalido("O print passa de 3 MiB.");
  // 12 caracteres de base64 dão 9 bytes, o bastante para a assinatura de 8.
  const inicio = atob(valor.slice(0, 12));
  if (!ASSINATURA_PNG.every((byte, i) => inicio.charCodeAt(i) === byte)) {
    throw new Invalido("O print não é uma imagem PNG válida.");
  }
  return valor;
}

function lerObra(valor: unknown) {
  if (valor === undefined || valor === null) return undefined;
  if (!ehObjeto(valor) || typeof valor.nome !== "string" || typeof valor.json !== "string") {
    throw new Invalido("O arquivo da obra chegou inválido.");
  }
  if (tamanho(valor.nome) > LIMITES.nomeObra) {
    throw new Invalido(`O nome do arquivo da obra passa de ${LIMITES.nomeObra} caracteres.`);
  }
  if (
    valor.json.length > LIMITES.obraBytes ||
    new TextEncoder().encode(valor.json).length > LIMITES.obraBytes
  ) {
    throw new Invalido("O arquivo da obra passa de 2 MiB.");
  }
  try {
    JSON.parse(valor.json);
  } catch {
    throw new Invalido("O arquivo da obra não é um JSON válido.");
  }
  return { nome: nomeSeguroObra(valor.nome), json: valor.json };
}
