// Tela inicial: nova obra (nome + norma), abrir arquivo .openstrut.json, importar
// obra da V1 (.LAJ + .VIG + .COL) e obra do SISTRUT (vários arquivos de uma vez), a lista
// de rascunhos recentes do navegador, a seção de instalar o app e o aviso de origem.
import { useNavigate } from "@tanstack/react-router";
import { Download, FilePlus2, FolderOpen, Import, Trash2 } from "lucide-react";
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  apagarRascunho,
  listarRascunhos,
  novoIdRascunho,
  type ResumoRascunho,
} from "../armazenamento/rascunho";
import { importarV1 } from "../armazenamento/importarV1";
import { normaPorId } from "../calculo/normas";
import { obraNova } from "../dominio/criar";
import type { NormaId, Obra } from "../dominio/obra";
import { abrirNaSessao, useAbrirObra } from "./acoes";
import { NOME_NORMA } from "./calculo";
import { Erros } from "./Erros";
import { formatarData } from "./formato";
import {
  INSTRUCAO_INSTALAR,
  detectarPlataforma,
  estaInstalado,
  pedirInstalacao,
  useInstalacao,
} from "./instalar";
import { AVISO_RECONSTRUCAO, NOME_APP } from "./marca";
import { importarObraSistrut } from "./InicioSistrut";
import { useConfirmacao } from "./useConfirmacao";

const NORMAS: { id: NormaId; rotulo: string }[] = [
  { id: "nb1-78", rotulo: "NB-1/78 (NBR 6118:1978)" },
  { id: "nbr6118-2023", rotulo: "NBR 6118:2023" },
];

const ehNorma = (x: string): x is NormaId => NORMAS.some((n) => n.id === x);

/** Quantos lajes, vigas e pilares a obra tem, para o resumo antes de abrir a importação. */
function contar(obra: Obra) {
  let lajes = 0;
  let vigas = 0;
  let pilares = 0;
  for (const p of obra.pavimentos) {
    lajes += p.lajes.length;
    vigas += p.vigas.length;
    pilares += p.pilares.length;
  }
  return { lajes, vigas, pilares };
}

/** "1 aviso" ou "N avisos". */
const avisos = (n: number) => `${n} ${n === 1 ? "aviso" : "avisos"}`;

export function Inicio() {
  const navigate = useNavigate();
  const { abrirArquivo, abrirDoRascunho, erros, detalhe, limparErros } = useAbrirObra();
  const [nome, setNome] = useState("");
  const [norma, setNorma] = useState<NormaId>("nb1-78");
  const [recentes, setRecentes] = useState<ResumoRascunho[] | null>(null);
  const [erroLista, setErroLista] = useState<string | null>(null);
  const entradaV1 = useRef<HTMLInputElement>(null);
  const entradaSistrut = useRef<HTMLInputElement>(null);
  const [importada, setImportada] = useState<{
    obra: Obra;
    avisos: string[];
    origem: "V1" | "SISTRUT";
  } | null>(null);
  const [errosImportacao, setErrosImportacao] = useState<string[]>([]);
  const { confirmar, dialogo: dialogoConfirmacao } = useConfirmacao();

  const recarregar = () =>
    listarRascunhos()
      .then((r) => setRecentes(r))
      .catch((e: unknown) => {
        setRecentes([]);
        setErroLista(`Não foi possível ler os rascunhos do navegador (${String(e)}).`);
      });

  useEffect(() => {
    void recarregar();
  }, []);

  const criar = (e: FormEvent) => {
    e.preventDefault();
    const n = nome.trim();
    if (n === "") return;
    abrirNaSessao(obraNova(n, norma), novoIdRascunho());
    void navigate({ to: "/obra" });
  };

  /** Abre a obra importada como uma obra nova (rascunho novo, sem arquivo .openstrut.json). */
  const abrirImportada = (obra: Obra) => {
    abrirNaSessao(obra, novoIdRascunho());
    void navigate({ to: "/obra" });
  };

  /** Lê os arquivos da V1 escolhidos e importa; com avisos, mostra-os antes de abrir. */
  const importar = async (e: ChangeEvent<HTMLInputElement>) => {
    const arquivos = Array.from(e.target.files ?? []);
    e.target.value = ""; // permite escolher os mesmos arquivos de novo
    setErrosImportacao([]);
    setImportada(null);
    if (arquivos.length === 0) return;
    try {
      const lidos = await Promise.all(
        arquivos.map(async (f) => ({ nome: f.name, texto: await f.text() })),
      );
      const r = importarV1(lidos);
      if (!r.ok) setErrosImportacao(["Não foi possível importar a obra da V1:", ...r.erros]);
      else if (r.avisos.length === 0) abrirImportada(r.obra);
      else setImportada({ obra: r.obra, avisos: r.avisos, origem: "V1" });
    } catch (erro) {
      setErrosImportacao([`Erro ao ler os arquivos da V1: ${String(erro)}`]);
    }
  };

  /**
   * Lê todos os arquivos do SISTRUT escolhidos de uma vez. Sempre mostra o resumo e os
   * avisos antes de abrir, para o engenheiro conferir o que entrou na obra.
   */
  const importarSistrut = async (e: ChangeEvent<HTMLInputElement>) => {
    const arquivos = Array.from(e.target.files ?? []);
    e.target.value = "";
    setErrosImportacao([]);
    setImportada(null);
    if (arquivos.length === 0) return;
    try {
      const lidos = await Promise.all(
        arquivos.map(async (f) => ({ nome: f.name, dados: new Uint8Array(await f.arrayBuffer()) })),
      );
      const r = importarObraSistrut(lidos);
      if (!r.ok) setErrosImportacao(["Não foi possível importar a obra do SISTRUT:", ...r.erros]);
      else setImportada({ obra: r.obra, avisos: r.avisos, origem: "SISTRUT" });
    } catch (erro) {
      setErrosImportacao([`Erro ao ler os arquivos do SISTRUT: ${String(erro)}`]);
    }
  };

  const apagar = async (r: ResumoRascunho) => {
    const ok = await confirmar({
      titulo: `Apagar o rascunho "${r.nome}"?`,
      descricao:
        "O rascunho sai do navegador e não dá para desfazer. O arquivo em disco, se houver, não é afetado.",
      acao: "Apagar rascunho",
      destrutiva: true,
    });
    if (!ok) return;
    await apagarRascunho(r.id);
    await recarregar();
  };

  return (
    <main className="compacto:gap-6 compacto:p-4 mx-auto grid w-full max-w-4xl gap-8 p-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{NOME_APP}</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Cálculo de estruturas de concreto armado: lajes, vigas e pilares, pavimento por pavimento.
        </p>
      </header>

      <Erros erros={erros} aoFechar={limparErros} />
      {detalhe && (
        <details className="text-muted-foreground -mt-6 text-xs">
          <summary className="cursor-pointer">Detalhe técnico</summary>
          <p className="mt-1 font-mono break-all">{detalhe}</p>
        </details>
      )}
      <Erros erros={errosImportacao} aoFechar={() => setErrosImportacao([])} />
      {importada && (
        <section
          aria-label="Avisos da importação"
          className="border-aviso/60 bg-aviso/10 rounded-md border p-3 text-sm"
        >
          {importada.origem === "V1" ? (
            <p className="font-medium">
              Obra {importada.obra.nome} importada da V1 com {avisos(importada.avisos.length)}:
            </p>
          ) : (
            <>
              <p className="font-medium">
                Obra {importada.obra.nome} lida do SISTRUT: {contar(importada.obra).lajes} lajes,{" "}
                {contar(importada.obra).vigas} vigas e {contar(importada.obra).pilares} pilares.
              </p>
              <p className="mt-1 text-xs">
                {importada.avisos.length === 0
                  ? "Nenhum aviso da importação."
                  : `${avisos(importada.avisos.length)} da importação:`}
              </p>
            </>
          )}
          {importada.avisos.length > 0 && (
            <ul className="mt-1 list-disc pl-5 text-xs">
              {importada.avisos.map((a, i) => (
                <li key={i}>{a}</li>
              ))}
            </ul>
          )}
          <div className="mt-3 flex gap-2">
            <Button size="sm" onClick={() => abrirImportada(importada.obra)}>
              Abrir obra importada
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setImportada(null)}>
              Cancelar
            </Button>
          </div>
        </section>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <section className="bg-card rounded-lg border p-5">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide">Nova obra</h2>
          <form onSubmit={criar} className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="nome-obra">Nome</Label>
              <Input
                id="nome-obra"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Ex.: Residência Silva"
                autoFocus
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="norma-obra">Norma</Label>
              <Select value={norma} onValueChange={(v) => ehNorma(v) && setNorma(v)}>
                <SelectTrigger id="norma-obra" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {NORMAS.map((n) => (
                    <SelectItem key={n.id} value={n.id}>
                      {n.rotulo}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!normaPorId(norma) && (
                <p className="text-aviso text-xs">
                  O cálculo pela {NOME_NORMA[norma]} ainda não está disponível; a obra pode ser
                  desenhada e salva.
                </p>
              )}
            </div>
            <Button type="submit" disabled={nome.trim() === ""}>
              <FilePlus2 /> Criar obra
            </Button>
          </form>
        </section>

        <section className="bg-card rounded-lg border p-5">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide">Abrir</h2>
          <Button
            variant="outline"
            onClick={() => void abrirArquivo()}
            className="w-full"
            title="Abre também os arquivos .sistrut.json de antes do renome"
          >
            <FolderOpen /> Abrir arquivo .openstrut.json
          </Button>
          <Button
            variant="outline"
            onClick={() => entradaV1.current?.click()}
            className="mt-2 w-full"
            title="Selecione o .LAJ da obra e, se houver, o .VIG e o .COL dela"
          >
            <Import /> Importar obra da V1 (.LAJ)
          </Button>
          <input
            ref={entradaV1}
            type="file"
            multiple
            accept=".laj,.vig,.col"
            aria-label="Arquivos da V1 (.LAJ, .VIG, .COL)"
            className="hidden"
            onChange={(e) => void importar(e)}
          />
          <Button
            variant="outline"
            onClick={() => entradaSistrut.current?.click()}
            className="mt-2 w-full"
            title="Selecione de uma vez todos os arquivos da obra: o .LAJ, os .VIG, o .COL e os demais"
          >
            <Import /> Importar obra do SISTRUT
          </Button>
          <input
            ref={entradaSistrut}
            type="file"
            multiple
            accept=".laj,.vig,.sec,.for,.tab,.dsp,.ini,.col,.pip,.pil,.rep,.rlp"
            aria-label="Arquivos do SISTRUT (.LAJ, .VIG, .COL e demais)"
            className="hidden"
            onChange={(e) => void importarSistrut(e)}
          />

          <h3 className="text-muted-foreground mt-6 mb-2 text-xs font-semibold uppercase tracking-wide">
            Rascunhos recentes (neste navegador)
          </h3>
          {erroLista && <p className="text-destructive text-xs">{erroLista}</p>}
          {recentes === null ? (
            <p className="text-muted-foreground text-sm">Carregando…</p>
          ) : recentes.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nenhum rascunho.</p>
          ) : (
            <ul className="divide-y rounded-md border">
              {recentes.map((r) => (
                <li key={r.id} className="flex items-center gap-2 px-3 py-2">
                  <button
                    type="button"
                    onClick={() => void abrirDoRascunho(r.id)}
                    className="hover:text-primary min-w-0 flex-1 text-left"
                  >
                    <span className="block truncate text-sm font-medium">
                      {r.nome || "(sem nome)"}
                    </span>
                    <span className="text-muted-foreground text-xs tabular-nums">
                      {formatarData(r.atualizadoEm)}
                    </span>
                  </button>
                  <Badge variant="secondary">{NOME_NORMA[r.norma] ?? r.norma}</Badge>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    title="Apagar rascunho"
                    aria-label={`Apagar rascunho ${r.nome}`}
                    onClick={() => void apagar(r)}
                  >
                    <Trash2 />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <Instalar />

      <p className="text-muted-foreground border-t pt-3 text-xs">{AVISO_RECONSTRUCAO}</p>
      {dialogoConfirmacao}
    </main>
  );
}

/** Seção "Instalar": botão com o pedido nativo quando o navegador oferece
 *  (Chrome, Edge), senão o caminho manual do navegador detectado. Some quando o
 *  app já roda instalado. */
function Instalar() {
  const { pedido, instalado } = useInstalacao();
  if (instalado || estaInstalado(window)) return null;
  return (
    <section aria-label="Instalar" className="bg-card rounded-lg border p-5">
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide">Instalar</h2>
      <p className="text-muted-foreground mb-3 text-sm">
        Instalado no computador, celular ou tablet, o OpenStrut abre como um app e funciona sem
        internet.
      </p>
      {pedido ? (
        <Button onClick={() => void pedirInstalacao()}>
          <Download /> Instalar o OpenStrut
        </Button>
      ) : (
        <p className="text-sm">{INSTRUCAO_INSTALAR[detectarPlataforma(navigator)]}</p>
      )}
    </section>
  );
}
