// Coletor leve dos últimos erros da página, para o diagnóstico do relato de problema.
// Ouve `error` e `unhandledrejection` da janela e o `console.error` (o React e o router
// registram ali os erros que eles mesmos capturam). Guarda só os últimos LIMITE_ERROS.

export const LIMITE_ERROS = 20;
/** Tamanho máximo de cada erro guardado (mensagem + pilha). */
const TAMANHO_ERRO = 2000;

export interface ErroColetado {
  /** ISO 8601 do momento do erro. */
  quando: string;
  origem: "erro" | "promessa" | "console";
  texto: string;
}

const erros: ErroColetado[] = [];
let instalado = false;

/** Os erros coletados, do mais antigo para o mais novo. */
export const ultimosErros = (): readonly ErroColetado[] => erros.slice();

/** Esvazia o buffer (testes). */
export function limparErros() {
  erros.length = 0;
}

/** Acrescenta um erro ao buffer, descartando o mais antigo quando passa do limite. */
export function registrarErro(origem: ErroColetado["origem"], causa: unknown, agora = new Date()) {
  const texto = descrever(causa).slice(0, TAMANHO_ERRO);
  erros.push({ quando: agora.toISOString(), origem, texto });
  if (erros.length > LIMITE_ERROS) erros.splice(0, erros.length - LIMITE_ERROS);
}

/** Texto de um erro qualquer: mensagem e pilha de um Error; o resto vira string. */
export function descrever(causa: unknown): string {
  if (causa instanceof Error) {
    const pilha = causa.stack ?? "";
    return pilha.includes(causa.message) ? pilha : `${causa.name}: ${causa.message}\n${pilha}`;
  }
  if (typeof causa === "string") return causa;
  try {
    return JSON.stringify(causa) ?? String(causa);
  } catch {
    return String(causa);
  }
}

interface AlvoErros {
  addEventListener: Window["addEventListener"];
}

/** Liga o coletor uma vez por página. Chame cedo, antes de montar o app. */
export function instalarColetorErros(alvo: AlvoErros = window, saida: Console = console) {
  if (instalado) return;
  instalado = true;
  alvo.addEventListener("error", (e) => {
    const ev = e as ErrorEvent;
    const local = ev.filename ? ` (${ev.filename}:${ev.lineno}:${ev.colno})` : "";
    registrarErro("erro", ev.error ?? `${ev.message}${local}`);
  });
  alvo.addEventListener("unhandledrejection", (e) => {
    registrarErro("promessa", (e as PromiseRejectionEvent).reason);
  });
  const original = saida.error.bind(saida);
  saida.error = (...args: unknown[]) => {
    registrarErro("console", args.map(descrever).join(" "));
    original(...args);
  };
}
