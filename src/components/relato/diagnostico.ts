// Diagnóstico automático do relato de problema: versão do build, rota, norma e modo de
// cálculo, tela, navegador, últimos erros e um resumo da obra aberta. O usuário vê
// tudo isso no diálogo antes de enviar; nada aqui sai sem a confirmação dele.
import type { Obra } from "../../dominio/obra";
import { NOME_MODO, NOME_NORMA } from "../../telas/calculo";
import { type ErroColetado, ultimosErros } from "./coletorErros";

/** Tetos de cada valor e de cada erro, os mesmos do relay. */
const LIMITE_VALOR = 1000;
const LIMITE_ERRO = 2000;

export interface ItemDiagnostico {
  rotulo: string;
  valor: string;
}

export interface Diagnostico {
  itens: ItemDiagnostico[];
  /** Últimos erros, já em texto (`quando [origem] texto`). */
  erros: string[];
  /** Identificação do build para a triagem: o commit, ou o arquivo do bundle sem ele. */
  build: string;
}

/** O que o diagnóstico lê do ambiente. Separado para testar sem navegador. */
export interface AmbienteDiagnostico {
  /** Commit do build (`VITE_COMMIT`), quando o build informa. */
  commit: string | undefined;
  /** Arquivo do bundle em que este código está, que muda a cada build (hash do Vite). */
  arquivoBuild: string;
  rota: string;
  obra: Obra | null;
  janela: { largura: number; altura: number; dpr: number };
  tela: { largura: number; altura: number };
  instalado: boolean;
  online: boolean;
  idioma: string;
  userAgent: string;
  erros: readonly ErroColetado[];
  agora: Date;
}

/** Contagem da obra para o diagnóstico: nome, pavimentos e elementos somados. */
export function resumoObra(obra: Obra) {
  let lajes = 0;
  let vigas = 0;
  let pilares = 0;
  for (const p of obra.pavimentos) {
    lajes += p.lajes.length;
    vigas += p.vigas.length;
    pilares += p.pilares.length;
  }
  return { nome: obra.nome, pavimentos: obra.pavimentos.length, lajes, vigas, pilares };
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

export function montarDiagnostico(a: AmbienteDiagnostico): Diagnostico {
  const itens: ItemDiagnostico[] = [
    { rotulo: "Versão (commit)", valor: a.commit || "não informado no build" },
    { rotulo: "Arquivo do build", valor: a.arquivoBuild },
    { rotulo: "Rota", valor: a.rota },
  ];
  const obra = a.obra;
  if (obra) {
    const r = resumoObra(obra);
    itens.push(
      { rotulo: "Norma", valor: NOME_NORMA[obra.norma] },
      {
        rotulo: "Modo de cálculo",
        valor: obra.norma === "nb1-78" ? NOME_MODO[obra.modoCalculo] : "não se aplica (NBR 6118)",
      },
      {
        rotulo: "Obra",
        valor: [
          `"${r.nome}"`,
          plural(r.pavimentos, "pavimento", "pavimentos"),
          plural(r.lajes, "laje", "lajes"),
          plural(r.vigas, "viga", "vigas"),
          plural(r.pilares, "pilar", "pilares"),
        ].join(", "),
      },
    );
  } else {
    itens.push({ rotulo: "Obra", valor: "nenhuma obra aberta" });
  }
  const { janela, tela } = a;
  itens.push(
    {
      rotulo: "Tela",
      valor: `janela ${janela.largura} × ${janela.altura} px (densidade ${janela.dpr}), tela ${tela.largura} × ${tela.altura} px`,
    },
    { rotulo: "Instalado como app", valor: a.instalado ? "sim" : "não" },
    { rotulo: "Conexão", valor: a.online ? "online" : "offline" },
    { rotulo: "Idioma", valor: a.idioma },
    { rotulo: "Navegador", valor: a.userAgent },
    { rotulo: "Data", valor: a.agora.toISOString() },
  );
  // os mesmos tetos que o relay aceita (relato-worker/src/validar.ts)
  return {
    itens: itens.map((i) => ({ ...i, valor: i.valor.slice(0, LIMITE_VALOR) })),
    erros: a.erros.map((e) => `${e.quando} [${e.origem}] ${e.texto}`.slice(0, LIMITE_ERRO)),
    build: a.commit || a.arquivoBuild,
  };
}

/** Nome do arquivo do bundle, que identifica o build quando não há commit. */
export function arquivoDoBuild(url: string) {
  const nome = new URL(url).pathname.split("/").pop();
  return nome || url;
}

/** Diagnóstico lido do navegador agora. */
export function coletarDiagnostico(obra: Obra | null, rota: string): Diagnostico {
  return montarDiagnostico({
    commit: import.meta.env.VITE_COMMIT,
    arquivoBuild: arquivoDoBuild(import.meta.url),
    rota,
    obra,
    janela: { largura: innerWidth, altura: innerHeight, dpr: devicePixelRatio },
    tela: { largura: screen.width, altura: screen.height },
    instalado: matchMedia("(display-mode: standalone)").matches,
    online: navigator.onLine,
    idioma: navigator.language,
    userAgent: navigator.userAgent,
    erros: ultimosErros(),
    agora: new Date(),
  });
}
