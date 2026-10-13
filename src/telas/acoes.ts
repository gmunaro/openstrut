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

const mensagemErro = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Abrir arquivo ou rascunho e ir para a tela da obra; os erros ficam em `erros`. */
export function useAbrirObra() {
  const navigate = useNavigate();
  const [erros, setErros] = useState<string[]>([]);

  const abrirArquivo = async () => {
    setErros([]);
    try {
      const a = await escolherArquivo();
      if (!a) return;
      const lida = lerObra(a.texto);
      if (!lida.ok) {
        setErros([`Não foi possível abrir ${a.nome}:`, ...lida.erros]);
        return;
      }
      abrirNaSessao(lida.obra, novoIdRascunho(), { handle: a.handle, nome: a.nome });
      await navigate({ to: "/obra" });
    } catch (e) {
      setErros([`Erro ao abrir o arquivo: ${mensagemErro(e)}`]);
    }
  };

  const abrirDoRascunho = async (id: string) => {
    setErros([]);
    try {
      const lida = await abrirRascunho(id);
      if (!lida.ok) {
        setErros(["Não foi possível abrir o rascunho:", ...lida.erros]);
        return;
      }
      abrirNaSessao(lida.obra, id);
      await navigate({ to: "/obra" });
    } catch (e) {
      setErros([`Erro ao ler o rascunho: ${mensagemErro(e)}`]);
    }
  };

  return { abrirArquivo, abrirDoRascunho, erros, limparErros: () => setErros([]) };
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
      setMensagem({ tipo: "erro", texto: `Erro ao salvar: ${mensagemErro(e)}` });
    }
  };

  return { salvar, mensagem };
}

/** Baixa um DXF da obra ("<obra> - <sufixo>.dxf") pela pasta de downloads, como o
 *  salvar faz sem a File System Access API. Devolve o nome. */
function baixarDxf(obra: Obra, sufixo: string, conteudo: string) {
  const nome = `${nomeArquivoSugerido(obra.nome).slice(0, -EXTENSAO.length)} - ${sufixo}.dxf`;
  const url = URL.createObjectURL(new Blob([conteudo], { type: "application/dxf" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return nome;
}

/** Baixa a planta de formas da obra inteira ("<obra> - formas.dxf"). */
export const baixarFormasDxf = (obra: Obra) => baixarDxf(obra, "formas", dxfFormasObra(obra));

/** Baixa a armação das vigas detalhadas ("<obra> - armação.dxf"). */
export const baixarArmacaoDxf = (obra: Obra, detalhamento: DetalhamentoVigasObra) =>
  baixarDxf(obra, "armação", dxfArmacaoVigas(obra, detalhamento));
