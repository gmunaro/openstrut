// Tela inicial: nova obra (nome + norma), abrir arquivo .sistrut.json, importar
// obra da V1 (.LAJ + .VIG + .COL) e a lista de rascunhos recentes do navegador.
import { useNavigate } from "@tanstack/react-router";
import { FilePlus2, FolderOpen, Import, Trash2 } from "lucide-react";
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

const NORMAS: { id: NormaId; rotulo: string }[] = [
  { id: "nb1-78", rotulo: "NB-1/78 (NBR 6118:1978)" },
  { id: "nbr6118-2023", rotulo: "NBR 6118:2023" },
];

const ehNorma = (x: string): x is NormaId => NORMAS.some((n) => n.id === x);

export function Inicio() {
  const navigate = useNavigate();
  const { abrirArquivo, abrirDoRascunho, erros, limparErros } = useAbrirObra();
  const [nome, setNome] = useState("");
  const [norma, setNorma] = useState<NormaId>("nb1-78");
  const [recentes, setRecentes] = useState<ResumoRascunho[] | null>(null);
  const [erroLista, setErroLista] = useState<string | null>(null);
  const entradaV1 = useRef<HTMLInputElement>(null);
  const [importada, setImportada] = useState<{ obra: Obra; avisos: string[] } | null>(null);
  const [errosV1, setErrosV1] = useState<string[]>([]);

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

  /** Abre a obra importada como uma obra nova (rascunho novo, sem arquivo .sistrut.json). */
  const abrirImportada = (obra: Obra) => {
    abrirNaSessao(obra, novoIdRascunho());
    void navigate({ to: "/obra" });
  };

  /** Lê os arquivos da V1 escolhidos e importa; com avisos, mostra-os antes de abrir. */
  const importar = async (e: ChangeEvent<HTMLInputElement>) => {
    const arquivos = Array.from(e.target.files ?? []);
    e.target.value = ""; // permite escolher os mesmos arquivos de novo
    setErrosV1([]);
    setImportada(null);
    if (arquivos.length === 0) return;
    try {
      const lidos = await Promise.all(
        arquivos.map(async (f) => ({ nome: f.name, texto: await f.text() })),
      );
      const r = importarV1(lidos);
      if (!r.ok) setErrosV1(["Não foi possível importar a obra da V1:", ...r.erros]);
      else if (r.avisos.length === 0) abrirImportada(r.obra);
      else setImportada(r);
    } catch (erro) {
      setErrosV1([`Erro ao ler os arquivos da V1: ${String(erro)}`]);
    }
  };

  const apagar = async (r: ResumoRascunho) => {
    if (
      !window.confirm(
        `Apagar o rascunho "${r.nome}" do navegador? O arquivo em disco, se houver, não é afetado.`,
      )
    )
      return;
    await apagarRascunho(r.id);
    await recarregar();
  };

  return (
    <main className="mx-auto grid w-full max-w-4xl gap-8 p-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">SISTRUT V2</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Cálculo de estruturas de concreto armado: lajes, vigas e pilares, pavimento por pavimento.
        </p>
      </header>

      <Erros erros={erros} aoFechar={limparErros} />
      <Erros erros={errosV1} aoFechar={() => setErrosV1([])} />
      {importada && (
        <section
          aria-label="Avisos da importação"
          className="border-aviso/60 bg-aviso/10 rounded-md border p-3 text-sm"
        >
          <p className="font-medium">
            Obra {importada.obra.nome} importada da V1 com {importada.avisos.length}{" "}
            {importada.avisos.length === 1 ? "aviso" : "avisos"}:
          </p>
          <ul className="mt-1 list-disc pl-5 text-xs">
            {importada.avisos.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
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
          <Button variant="outline" onClick={() => void abrirArquivo()} className="w-full">
            <FolderOpen /> Abrir arquivo .sistrut.json
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
    </main>
  );
}
