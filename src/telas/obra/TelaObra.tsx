// Tela da obra aberta: cabeçalho (arquivo, desfazer/refazer, materiais,
// unidades), barra de pavimentos e as abas Planta | Resultados | Relatório.
// Salva o rascunho no navegador a cada edição (com debounce).
import { Link } from "@tanstack/react-router";
import {
  FileDown,
  FolderOpen,
  Home,
  Redo2,
  Ruler,
  Save,
  SlidersHorizontal,
  Undo2,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { criarSalvadorRascunho } from "../../armazenamento/rascunho";
import type { Obra } from "../../dominio/obra";
import { useObra } from "../../estado/obra";
import { EditorPlanta } from "../../planta/EditorPlanta";
import {
  baixarArmacaoDxf,
  baixarFormasDxf,
  type FalhaDxf,
  useAbrirObra,
  useSalvarArquivo,
} from "../acoes";
import { calcular, NOME_NORMA } from "../calculo";
import { DetalhamentoContexto, type DetalhamentoObra, detalharObra } from "../detalhamento";
import { Erros } from "../Erros";
import { Relatorio } from "../relatorio/Relatorio";
import { Resultados } from "../resultados/Resultados";
import { useSessao } from "../sessao";
import { BarraPavimentos } from "./BarraPavimentos";
import { DialogoMateriais } from "./DialogoMateriais";
import { DialogoUnidades } from "./DialogoUnidades";
import { useConfirmacao } from "../useConfirmacao";

export function TelaObra() {
  const obra = useObra((e) => e.obra);
  if (!obra)
    return (
      <main className="mx-auto grid max-w-xl gap-3 p-8">
        <h1 className="text-lg font-semibold">Nenhuma obra aberta</h1>
        <p className="text-muted-foreground text-sm">
          Crie uma obra, abra um arquivo ou recupere um rascunho na tela inicial.
        </p>
        <Button asChild className="w-fit">
          <Link to="/">
            <Home /> Ir para o início
          </Link>
        </Button>
      </main>
    );
  return <ObraAberta obra={obra} />;
}

/** Grava o rascunho a cada mudança da obra e descarrega ao esconder a aba ou sair da tela. */
function useRascunhoAutomatico(obra: Obra) {
  const rascunhoId = useSessao((s) => s.rascunhoId);
  const [erro, setErro] = useState<string | null>(null);
  const salvador = useRef(
    criarSalvadorRascunho(800, (e) => setErro(`Rascunho não salvo no navegador: ${String(e)}`)),
  );

  useEffect(() => {
    if (rascunhoId) salvador.current.agendar(rascunhoId, obra);
  }, [obra, rascunhoId]);

  useEffect(() => {
    const s = salvador.current;
    const aoEsconder = () => {
      if (document.visibilityState === "hidden") void s.descarregar();
    };
    const aoSair = () => void s.descarregar();
    document.addEventListener("visibilitychange", aoEsconder);
    window.addEventListener("pagehide", aoSair);
    return () => {
      document.removeEventListener("visibilitychange", aoEsconder);
      window.removeEventListener("pagehide", aoSair);
      void s.descarregar();
    };
  }, []);

  return erro;
}

/** Detalhe técnico de uma falha, quando a ação traz um (`{ mensagem, detalhe? }`). */
const detalheDe = (m: object) =>
  "detalhe" in m && typeof m.detalhe === "string" ? m.detalhe : undefined;

/** Resultado de exportar um DXF: null quando deu certo; senão, os erros e o detalhe técnico. */

/** Motivo para a armação não sair, ou undefined quando dá para exportar. */
function motivoSemArmacao(d: DetalhamentoObra | null) {
  if (!d) return "Calcule a obra primeiro: sem cálculo não há armação para exportar.";
  if (d.vigas.length === 0) return "Não há viga calculada para exportar.";
  return undefined;
}

/** Detalhe técnico recolhido em <details>; não renderiza nada quando não há texto. */
function Detalhe({ texto }: { texto: string | null | undefined }) {
  if (!texto) return null;
  return (
    <details className="text-muted-foreground text-xs">
      <summary className="cursor-pointer">Detalhe técnico</summary>
      <p className="font-mono break-all">{texto}</p>
    </details>
  );
}

/** Frase da tela e, embaixo, o detalhe técnico recolhido quando a falha traz um. */
function Recado({
  role,
  texto,
  detalhe,
  className,
}: {
  role: "status" | "alert";
  texto: string;
  detalhe?: string | undefined;
  className: string;
}) {
  return (
    <div className="grid gap-1">
      <p role={role} className={className}>
        {texto}
      </p>
      <Detalhe texto={detalhe} />
    </div>
  );
}

function ObraAberta({ obra }: { obra: Obra }) {
  const pavimentoId = useObra((e) => e.pavimentoId);
  const podeDesfazer = useObra((e) => e.passado.length > 0);
  const podeRefazer = useObra((e) => e.futuro.length > 0);
  const desfazer = useObra((e) => e.desfazer);
  const refazer = useObra((e) => e.refazer);
  const obraSalva = useSessao((s) => s.obraSalva);
  const nomeArquivo = useSessao((s) => s.nomeArquivo);
  const unidades = useSessao((s) => s.unidades);
  const { abrirArquivo, erros, limparErros } = useAbrirObra();
  const { salvar, mensagem } = useSalvarArquivo();
  const erroRascunho = useRascunhoAutomatico(obra);
  const [dialogo, setDialogo] = useState<"materiais" | "unidades" | null>(null);
  // Os diálogos devolvem o foco a estes botões ao fechar.
  const botaoMateriais = useRef<HTMLButtonElement>(null);
  const botaoUnidades = useRef<HTMLButtonElement>(null);
  const botaoAbrir = useRef<HTMLButtonElement>(null);
  const { confirmar, dialogo: dialogoConfirmacao } = useConfirmacao(botaoAbrir);
  const [aba, setAba] = useState("planta");

  const calculo = useMemo(() => calcular(obra), [obra]);
  const detalhamento = useMemo(
    () => (calculo.tipo === "ok" ? detalharObra(calculo.resultado, obra) : null),
    [calculo, obra],
  );
  const resultadoPavimento =
    calculo.tipo === "ok"
      ? calculo.resultado.pavimentos.find((p) => p.pavimento.id === pavimentoId)
      : undefined;
  const naoSalvo = obra !== obraSalva;
  // Exportações bloqueadas não baixam nada; o motivo aparece na tela (também para teclado).
  const [bloqueio, setBloqueio] = useState<string | null>(null);
  // Falha ao gerar o DXF: os erros ficam na tela até fechar; uma exportação bem-sucedida limpa.
  const [falhaDxf, setFalhaDxf] = useState<FalhaDxf>(null);
  const motivoFormas = obra.pavimentos.every((p) => p.lajes.length === 0)
    ? "Não há lajes para exportar as formas."
    : undefined;
  const motivoArmacao = motivoSemArmacao(detalhamento);
  const exportar = async (
    motivo: string | undefined,
    fazer: () => FalhaDxf | Promise<FalhaDxf>,
  ) => {
    setBloqueio(motivo ?? null);
    if (motivo) return;
    setFalhaDxf(await fazer());
  };

  // Sem arquivo (obraSalva null), a confirmação também aparece: a obra só existe no rascunho.
  const abrirOutra = async () => {
    if (
      naoSalvo &&
      !(await confirmar({
        titulo: "Abrir outra obra?",
        descricao:
          "A obra atual tem alterações não salvas em arquivo (o rascunho fica no navegador).",
        acao: "Abrir outra",
      }))
    )
      return;
    void abrirArquivo();
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex flex-wrap items-center gap-2 border-b px-4 py-2 print:hidden">
        <Button asChild variant="ghost" size="icon-sm" title="Início" aria-label="Início">
          <Link to="/">
            <Home />
          </Link>
        </Button>
        <div className="mr-2 min-w-0">
          <h1 className="truncate text-base leading-tight font-semibold">
            {obra.nome || "(sem nome)"}
          </h1>
          <p className="text-muted-foreground truncate text-[11px]">
            {nomeArquivo ?? "sem arquivo"}
            {naoSalvo ? " · alterações não salvas em arquivo" : " · salvo"}
          </p>
        </div>
        <Badge variant="outline">{NOME_NORMA[obra.norma]}</Badge>
        <Badge variant="outline">{unidades === "si" ? "SI" : "tf"}</Badge>

        <div className="ml-auto flex flex-wrap items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={desfazer}
            disabled={!podeDesfazer}
            title="Desfazer"
          >
            <Undo2 /> Desfazer
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={refazer}
            disabled={!podeRefazer}
            title="Refazer"
          >
            <Redo2 /> Refazer
          </Button>
          <Button
            ref={botaoMateriais}
            variant="outline"
            size="sm"
            onClick={() => setDialogo("materiais")}
          >
            <SlidersHorizontal /> Materiais
          </Button>
          <Button
            ref={botaoUnidades}
            variant="outline"
            size="sm"
            onClick={() => setDialogo("unidades")}
          >
            <Ruler /> Unidades
          </Button>
          <Button ref={botaoAbrir} variant="outline" size="sm" onClick={() => void abrirOutra()}>
            <FolderOpen /> Abrir
          </Button>
          <Button size="sm" onClick={() => void salvar(false)}>
            <Save /> Salvar
          </Button>
          <Button variant="ghost" size="sm" onClick={() => void salvar(true)}>
            Salvar como…
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="aria-disabled:opacity-50"
            aria-disabled={motivoFormas !== undefined}
            title={motivoFormas}
            onClick={() => void exportar(motivoFormas, () => baixarFormasDxf(obra))}
          >
            <FileDown /> Exportar DXF (formas)
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="aria-disabled:opacity-50"
            aria-disabled={motivoArmacao !== undefined}
            title={motivoArmacao}
            onClick={() =>
              void exportar(motivoArmacao, () =>
                detalhamento ? baixarArmacaoDxf(obra, detalhamento) : null,
              )
            }
          >
            <FileDown /> Exportar DXF (armação)
          </Button>
        </div>
      </header>

      {(mensagem || bloqueio || erroRascunho || falhaDxf || erros.length > 0) && (
        <div className="grid gap-2 px-4 pt-2 print:hidden">
          {mensagem && (
            <Recado
              role={mensagem.tipo === "ok" ? "status" : "alert"}
              texto={mensagem.texto}
              detalhe={detalheDe(mensagem)}
              className={mensagem.tipo === "ok" ? "text-ok text-xs" : "text-destructive text-xs"}
            />
          )}
          {bloqueio && (
            <p role="status" className="text-muted-foreground text-xs">
              {bloqueio}
            </p>
          )}
          {erroRascunho && <p className="text-destructive text-xs">{erroRascunho}</p>}
          {falhaDxf && (
            <div className="grid gap-1">
              <Erros erros={falhaDxf.erros} aoFechar={() => setFalhaDxf(null)} />
              <Detalhe texto={falhaDxf.detalhe} />
            </div>
          )}
          <Erros erros={erros} aoFechar={limparErros} />
        </div>
      )}

      <BarraPavimentos obra={obra} ativoId={pavimentoId} />

      <Tabs value={aba} onValueChange={setAba} className="flex min-h-0 flex-1 flex-col gap-0">
        <TabsList variant="line" className="mx-4 mt-2 print:hidden">
          <TabsTrigger value="planta">Planta</TabsTrigger>
          <TabsTrigger value="resultados">Resultados</TabsTrigger>
          <TabsTrigger value="relatorio">Relatório</TabsTrigger>
        </TabsList>
        <TabsContent value="planta" className="min-h-0 flex-1">
          <EditorPlanta
            {...(resultadoPavimento ? { resultado: resultadoPavimento } : {})}
            {...(calculo.tipo === "ok" ? { pilares: calculo.resultado.pilares } : {})}
          />
        </TabsContent>
        <TabsContent value="resultados" className="overflow-auto px-4 py-3">
          <DetalhamentoContexto value={detalhamento}>
            <Resultados calculo={calculo} />
          </DetalhamentoContexto>
        </TabsContent>
        <TabsContent
          value="relatorio"
          className="overflow-auto px-4 py-3 print:overflow-visible print:p-0"
        >
          <DetalhamentoContexto value={detalhamento}>
            <Relatorio obra={obra} calculo={calculo} />
          </DetalhamentoContexto>
        </TabsContent>
      </Tabs>

      <DialogoMateriais
        obra={obra}
        aberto={dialogo === "materiais"}
        aoMudarAberto={(a) => setDialogo(a ? "materiais" : null)}
        botaoOrigem={botaoMateriais}
      />
      <DialogoUnidades
        aberto={dialogo === "unidades"}
        aoMudarAberto={(a) => setDialogo(a ? "unidades" : null)}
        botaoOrigem={botaoUnidades}
      />
      {dialogoConfirmacao}
    </div>
  );
}
