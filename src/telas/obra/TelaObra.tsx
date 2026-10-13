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
import { baixarArmacaoDxf, baixarFormasDxf, useAbrirObra, useSalvarArquivo } from "../acoes";
import { calcular, NOME_NORMA } from "../calculo";
import { DetalhamentoContexto, detalharObra } from "../detalhamento";
import { Erros } from "../Erros";
import { Relatorio } from "../relatorio/Relatorio";
import { Resultados } from "../resultados/Resultados";
import { useSessao } from "../sessao";
import { BarraPavimentos } from "./BarraPavimentos";
import { DialogoMateriais } from "./DialogoMateriais";
import { DialogoUnidades } from "./DialogoUnidades";

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

  const abrirOutra = () => {
    if (
      naoSalvo &&
      !window.confirm(
        "A obra atual tem alterações não salvas em arquivo (o rascunho fica no navegador). Abrir outra?",
      )
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
          <Button variant="outline" size="sm" onClick={() => setDialogo("materiais")}>
            <SlidersHorizontal /> Materiais
          </Button>
          <Button variant="outline" size="sm" onClick={() => setDialogo("unidades")}>
            <Ruler /> Unidades
          </Button>
          <Button variant="outline" size="sm" onClick={abrirOutra}>
            <FolderOpen /> Abrir
          </Button>
          <Button size="sm" onClick={() => void salvar(false)}>
            <Save /> Salvar
          </Button>
          <Button variant="ghost" size="sm" onClick={() => void salvar(true)}>
            Salvar como…
          </Button>
          <Button variant="outline" size="sm" onClick={() => baixarFormasDxf(obra)}>
            <FileDown /> Exportar DXF (formas)
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!detalhamento || detalhamento.vigas.length === 0}
            title={detalhamento ? undefined : "Sem cálculo: não há armação para exportar"}
            onClick={() => detalhamento && baixarArmacaoDxf(obra, detalhamento)}
          >
            <FileDown /> Exportar DXF (armação)
          </Button>
        </div>
      </header>

      {(mensagem || erroRascunho || erros.length > 0) && (
        <div className="grid gap-2 px-4 pt-2 print:hidden">
          {mensagem && (
            <p className={mensagem.tipo === "ok" ? "text-ok text-xs" : "text-destructive text-xs"}>
              {mensagem.texto}
            </p>
          )}
          {erroRascunho && <p className="text-destructive text-xs">{erroRascunho}</p>}
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
      />
      <DialogoUnidades
        aberto={dialogo === "unidades"}
        aoMudarAberto={(a) => setDialogo(a ? "unidades" : null)}
      />
    </div>
  );
}
