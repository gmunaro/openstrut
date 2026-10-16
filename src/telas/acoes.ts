// Ações de arquivo compartilhadas pela tela inicial e pela tela da obra:
// abrir obra (nova, de arquivo ou de rascunho), salvar em arquivo e exportar os DXF de
// formas e de armação.
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { EXTENSAO, lerObra, serializarObra } from "../armazenamento/arquivo";
import { abrirRascunho, novoIdRascunho } from "../armazenamento/rascunho";
import type { Obra } from "../dominio/obra";
import { useObra } from "../estado/obra";
import { dxfArmacaoVigas } from "../exportacao/armacaoVigas";
import { dxfFormasObra } from "../exportacao/plantaFormas";
import { escolherArquivo, gravarArquivo, nomeArquivoSugerido } from "./arquivoLocal";
import type { DetalhamentoVigasObra } from "./detalhamento";
import { useSessao } from "./sessao";

/** Abre a obra no estado e começa a sessão (rascunho e arquivo ligados a ela). */
export function abrirNaSessao(
  obra: Obra,
  rascunhoId: string,
  arquivo?: { handle: FileSystemFileHandle | null; nome: string },
) {
  useObra.getState().abrir(obra);
  useSessao.getState().iniciar(rascunhoId, arquivo ? { ...arquivo, salva: obra } : undefined);
}

/** Erros de acesso ao arquivo pelo navegador (permissão, leitura, gravação bloqueada). */
const ERROS_DE_ACESSO = new Set(["NotReadableError", "NotAllowedError", "SecurityError"]);

/**
 * Traduz a exceção de abrir ou salvar em motivo para o usuário. `verbo` completa
 * "o navegador não conseguiu <verbo> o arquivo". Erro desconhecido devolve a mensagem
 * crua em `detalhe`, para a tela mostrar recolhida.
 */
export function descreverFalha(
  e: unknown,
  verbo: "ler" | "gravar",
): { motivo: string; detalhe: string | null } {
  if (e instanceof SyntaxError) {
    return { motivo: "o arquivo não é uma obra da OpenStrut ou está corrompido.", detalhe: null };
  }
  if (e instanceof DOMException && ERROS_DE_ACESSO.has(e.name)) {
    return { motivo: `o navegador não conseguiu ${verbo} o arquivo.`, detalhe: null };
  }
  return {
    motivo: "ocorreu um erro inesperado.",
    detalhe: e instanceof Error ? e.message : String(e),
  };
}

/** Estado de erro da abertura: `erros` vai para a caixa de erros, `detalhe` para o recolhido. */
const SEM_FALHA: { erros: string[]; detalhe: string | null } = { erros: [], detalhe: null };

const falhaDe = (e: unknown, titulo: string, verbo: "ler" | "gravar") => {
  const { motivo, detalhe } = descreverFalha(e, verbo);
  return { erros: [`${titulo}: ${motivo}`], detalhe };
};

/**
 * Abrir arquivo ou rascunho e ir para a tela da obra; os erros ficam em `erros`, e o
 * detalhe técnico de erro desconhecido em `detalhe`.
 */
export function useAbrirObra() {
  const navigate = useNavigate();
  const [falha, setFalha] = useState(SEM_FALHA);

  const abrirArquivo = async () => {
    setFalha(SEM_FALHA);
    try {
      const a = await escolherArquivo();
      if (!a) return;
      const lida = lerObra(a.texto);
      if (!lida.ok) {
        setFalha({ erros: [`Não foi possível abrir ${a.nome}:`, ...lida.erros], detalhe: null });
        return;
      }
      abrirNaSessao(lida.obra, novoIdRascunho(), { handle: a.handle, nome: a.nome });
      await navigate({ to: "/obra" });
    } catch (e) {
      setFalha(falhaDe(e, "Não foi possível abrir o arquivo", "ler"));
    }
  };

  const abrirDoRascunho = async (id: string) => {
    setFalha(SEM_FALHA);
    try {
      const lida = await abrirRascunho(id);
      if (!lida.ok) {
        setFalha({ erros: ["Não foi possível abrir o rascunho:", ...lida.erros], detalhe: null });
        return;
      }
      abrirNaSessao(lida.obra, id);
      await navigate({ to: "/obra" });
    } catch (e) {
      setFalha(falhaDe(e, "Não foi possível abrir o rascunho", "ler"));
    }
  };

  return {
    abrirArquivo,
    abrirDoRascunho,
    erros: falha.erros,
    detalhe: falha.detalhe,
    limparErros: () => setFalha(SEM_FALHA),
  };
}

/** Salvar a obra aberta em arquivo. `comoNovo` pergunta o lugar mesmo se já houver arquivo. */
export function useSalvarArquivo() {
  const [mensagem, setMensagem] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);

  const salvar = async (comoNovo = false) => {
    const obra = useObra.getState().obra;
    if (!obra) return;
    const sessao = useSessao.getState();
    try {
      const r = await gravarArquivo(
        serializarObra(obra),
        nomeArquivoSugerido(obra.nome),
        comoNovo ? null : sessao.arquivo,
      );
      if (r.tipo === "cancelado") return;
      sessao.marcarSalvo(obra, r.nome, r.tipo === "gravado" ? r.handle : null);
      const hora = new Date().toLocaleTimeString("pt-BR", { timeStyle: "short" });
      setMensagem({
        tipo: "ok",
        texto:
          r.tipo === "gravado" ? `Salvo em ${r.nome} às ${hora}.` : `${r.nome} baixado às ${hora}.`,
      });
    } catch (e) {
      const { motivo } = descreverFalha(e, "gravar");
      setMensagem({ tipo: "erro", texto: `Não foi possível salvar o arquivo: ${motivo}` });
    }
  };

  return { salvar, mensagem };
}

/** Falha de exportar DXF, no mesmo formato de `useAbrirObra`; `null` quando baixou. */
export type FalhaDxf = { erros: string[]; detalhe: string | null } | null;

/**
 * Gera o DXF e baixa pela pasta de downloads ("<obra> - <sufixo>.dxf"), como o salvar
 * faz sem a File System Access API. Se gerar ou baixar falhar, devolve a falha em vez
 * de lançar, para a tela mostrar.
 */
function baixarDxf(obra: Obra, sufixo: string, gerar: () => string): FalhaDxf {
  try {
    const conteudo = gerar();
    const nome = `${nomeArquivoSugerido(obra.nome).slice(0, -EXTENSAO.length)} - ${sufixo}.dxf`;
    const url = URL.createObjectURL(new Blob([conteudo], { type: "application/dxf" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = nome;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return null;
  } catch (e) {
    return falhaDe(e, `Não foi possível exportar o DXF de ${sufixo}`, "gravar");
  }
}

/** Baixa a planta de formas da obra inteira ("<obra> - formas.dxf"). */
export const baixarFormasDxf = (obra: Obra): FalhaDxf =>
  baixarDxf(obra, "formas", () => dxfFormasObra(obra));

/** Baixa a armação das vigas detalhadas ("<obra> - armação.dxf"). */
export const baixarArmacaoDxf = (obra: Obra, detalhamento: DetalhamentoVigasObra): FalhaDxf =>
  baixarDxf(obra, "armação", () => dxfArmacaoVigas(obra, detalhamento));
