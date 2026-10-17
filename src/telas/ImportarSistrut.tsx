// Importação de obra do SISTRUT na tela inicial: arquivos escolhidos de uma vez, a pasta
// inteira da obra ou arrastados (arquivos ou pastas). Antes de abrir, um diálogo mostra
// o que foi reconhecido: os pavimentos na ordem, os arquivos lidos e os ignorados com o
// motivo, e os avisos. A leitura é `importarObraSistrut` (InicioSistrut.ts).
//
// Cada arquivo leva o caminho dentro do que foi escolhido. Com arquivos de obra do
// SISTRUT em mais de uma pasta (uma pasta de obras, por exemplo), a tela pergunta qual
// obra importar: juntar pastas misturaria obras, e nomes iguais em pastas diferentes não
// têm como ser escolhidos sozinhos. Uma pasta só de parâmetros (.DSP, .PIP, .LAP, .INI,
// como a EXEC40 do SISTRUT) vai junto com a obra. Com vários .DSP e nada que diga qual a
// obra usou, a tela pergunta qual. Só os arquivos que a importação lê vão para a memória.
//
// A pasta do Google Drive (ImportarDrive.tsx) entra pelo mesmo caminho: a listagem vira
// a mesma lista de arquivos com caminho, e o conteúdo só é baixado na leitura, com o
// progresso num diálogo que dá para cancelar.
import { FolderInput, Import } from "lucide-react";
import { useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Obra } from "../dominio/obra";
import { ImportarDrive } from "./ImportarDrive";
import {
  dspsAEscolher,
  extensaoDoSistrut,
  importarObraSistrut,
  type ArquivoEntrada,
  type ResultadoImportacaoSistrut,
} from "./InicioSistrut";
import { doDisco, lerSelecao, type Escolhido } from "./selecao";

/** Arquivos de uma entrada arrastada: o arquivo ou, numa pasta, todos os de dentro. Uma
 *  entrada que não abre vai para `falhas` e não derruba as outras. */
async function arquivosDaEntrada(entrada: FileSystemEntry, falhas: string[]): Promise<Escolhido[]> {
  const caminho = entrada.fullPath.replace(/^\//, "") || entrada.name;
  try {
    if (entrada.isFile) {
      const arquivo = await new Promise<File>((ok, falha) =>
        (entrada as FileSystemFileEntry).file(ok, falha),
      );
      return [doDisco(arquivo, caminho)];
    }
    if (!entrada.isDirectory) return [];
    const leitor = (entrada as FileSystemDirectoryEntry).createReader();
    const filhos: FileSystemEntry[] = [];
    // readEntries devolve aos poucos: lê até vir vazio
    for (;;) {
      const lote = await new Promise<FileSystemEntry[]>((ok, falha) =>
        leitor.readEntries(ok, falha),
      );
      if (lote.length === 0) break;
      filhos.push(...lote);
    }
    return (await Promise.all(filhos.map((f) => arquivosDaEntrada(f, falhas)))).flat();
  } catch (erro) {
    falhas.push(`${caminho}: não foi possível ler (${String(erro)}).`);
    return [];
  }
}

/** Arquivos soltos na área: pelas entradas (pastas inteiras) ou pela lista de arquivos. */
async function arquivosSoltos(e: DragEvent, falhas: string[]): Promise<Escolhido[]> {
  const entradas = Array.from(e.dataTransfer.items ?? [])
    .map((i) => i.webkitGetAsEntry?.())
    .filter((x): x is FileSystemEntry => !!x);
  if (entradas.length === 0)
    return Array.from(e.dataTransfer.files).map((arquivo) => doDisco(arquivo, arquivo.name));
  return (await Promise.all(entradas.map((x) => arquivosDaEntrada(x, falhas)))).flat();
}

const pastaDe = (caminho: string) => {
  const i = caminho.lastIndexOf("/");
  return i < 0 ? "" : caminho.slice(0, i);
};

/** Extensões dos parâmetros da instalação (a pasta EXEC40), que valem para qualquer obra. */
const PARAMETROS = new Set(["DSP", "PIP", "LAP", "INI"]);
const extensao = (nome: string) => nome.slice(nome.lastIndexOf(".") + 1).toUpperCase();

/** As pastas com arquivos do SISTRUT, cada uma com os arquivos dela (sem subpastas):
 *  `obras`, as que têm arquivos de obra, e `parametros`, as que só têm parâmetros. */
function porPasta(escolhidos: readonly Escolhido[]) {
  const pastas = new Map<string, Escolhido[]>();
  for (const e of escolhidos) {
    const p = pastaDe(e.caminho);
    pastas.set(p, [...(pastas.get(p) ?? []), e]);
  }
  const todas = [...pastas]
    .map(([pasta, arquivos]) => {
      const doSistrut = arquivos.filter((a) => extensaoDoSistrut(a.nome));
      return {
        pasta,
        arquivos,
        doSistrut: doSistrut.length,
        soParametros: doSistrut.every((a) => PARAMETROS.has(extensao(a.nome))),
      };
    })
    .filter((p) => p.doSistrut > 0)
    .sort((a, b) => (a.pasta < b.pasta ? -1 : a.pasta > b.pasta ? 1 : 0));
  return {
    obras: todas.filter((p) => !p.soParametros),
    parametros: todas.filter((p) => p.soParametros),
  };
}

/** Duas pastas de parâmetros com arquivos de mesmo nome (duas instalações, ou duas cópias
 *  da EXEC40): juntas, a importação recusaria os nomes repetidos. */
function parametrosEmConflito(parametros: readonly { arquivos: Escolhido[] }[]) {
  if (parametros.length < 2) return false;
  const vistos = new Map<string, number>();
  parametros.forEach((p, i) => {
    for (const a of p.arquivos) {
      const nome = a.nome.toUpperCase();
      const antes = vistos.get(nome);
      if (antes !== undefined && antes !== i) vistos.set(nome, -1);
      else if (antes === undefined) vistos.set(nome, i);
    }
  });
  return [...vistos.values()].includes(-1);
}

/** Os arquivos da obra com os das pastas de parâmetros. Um parâmetro com o nome de um
 *  arquivo da obra fica de fora (vale o da obra), com a nota em `falhas`. */
function comParametros(
  obra: readonly Escolhido[],
  parametros: readonly { arquivos: Escolhido[] }[],
  falhas: string[],
): Escolhido[] {
  const nomes = new Set(obra.map((a) => a.nome.toUpperCase()));
  const extras = parametros.flatMap((p) => p.arquivos);
  for (const e of extras)
    if (nomes.has(e.nome.toUpperCase()))
      falhas.push(`${e.caminho}: a pasta da obra já tem um ${e.nome}; valeu o da obra.`);
  return [...obra, ...extras.filter((e) => !nomes.has(e.nome.toUpperCase()))];
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
const metros = (x: number) => x.toLocaleString("pt-BR", { maximumFractionDigits: 3 });

/** Botões, área de soltar e o diálogo de resumo. `aoAbrir` recebe a obra confirmada. */
export function ImportarSistrut({ aoAbrir }: { aoAbrir: (obra: Obra) => void }) {
  const entradaArquivos = useRef<HTMLInputElement>(null);
  const entradaPasta = useRef<HTMLInputElement>(null);
  const [resultado, setResultado] = useState<ResultadoImportacaoSistrut | null>(null);
  const [falhas, setFalhas] = useState<string[]>([]);
  const [escolha, setEscolha] = useState<ReturnType<typeof porPasta> | null>(null);
  /** Os arquivos lidos à espera da escolha do .DSP, e os .DSP entre os quais escolher. */
  const [perguntaDsp, setPerguntaDsp] = useState<{
    lidos: ArquivoEntrada[];
    dsps: string[];
  } | null>(null);
  /** A obra escolhida à espera da pasta de parâmetros, quando duas têm os mesmos nomes. */
  const [perguntaParametros, setPerguntaParametros] = useState<{
    obra: Escolhido[];
    pastas: ReturnType<typeof porPasta>["parametros"];
    falhas: string[];
  } | null>(null);
  const [lendo, setLendo] = useState(false);
  /** Arquivos lidos (ou baixados) de quantos a importação lê, durante a leitura. */
  const [progresso, setProgresso] = useState<{ feitos: number; total: number } | null>(null);
  /** A seleção veio do Drive: o progresso aparece num diálogo, com Cancelar. */
  const [doDrive, setDoDrive] = useState(false);
  /** Arquivos do Drive que não baixaram sem login: o diálogo oferece entrar. */
  const [faltouLogin, setFaltouLogin] = useState(false);
  /** Muda para o diálogo do Drive abrir oferecendo entrar. */
  const [pedirLoginDrive, setPedirLoginDrive] = useState(0);
  const [sobre, setSobre] = useState(false);
  /** A leitura mais recente: o resultado de uma anterior que termina depois é descartado. */
  const leitura = useRef(0);
  /** Interrompe os downloads da leitura em andamento (Cancelar, outra seleção). */
  const interromper = useRef<AbortController | null>(null);

  /** Lê os arquivos de uma pasta e importa. */
  const importar = async (escolhidos: readonly Escolhido[], falhasAntes: string[]) => {
    const minha = ++leitura.current;
    setResultado(null);
    setEscolha(null);
    setPerguntaDsp(null);
    setPerguntaParametros(null);
    setFalhas(falhasAntes);
    setFaltouLogin(false);
    setLendo(true);
    interromper.current?.abort();
    const controle = new AbortController();
    interromper.current = controle;
    try {
      // o que a importação não lê só entra no resumo: não carrega nem baixa o conteúdo
      const {
        lidos,
        falhas: falhasLeitura,
        pedemLogin,
      } = await lerSelecao(
        escolhidos,
        (feitos, total) => {
          if (minha === leitura.current) setProgresso({ feitos, total });
        },
        controle.signal,
      );
      if (minha !== leitura.current) return;
      setFalhas([...falhasAntes, ...falhasLeitura]);
      setFaltouLogin(pedemLogin);
      const dsps = dspsAEscolher(lidos);
      if (dsps) setPerguntaDsp({ lidos, dsps });
      else setResultado(importarObraSistrut(lidos));
    } catch (erro) {
      // só a interrupção chega aqui (Cancelar ou outra seleção), e quem interrompeu já
      // limpou a tela
      if (!controle.signal.aborted) throw erro;
    } finally {
      if (minha === leitura.current) {
        setLendo(false);
        setProgresso(null);
      }
    }
  };

  /** Importa a obra com as pastas de parâmetros; se duas têm os mesmos nomes, pergunta
   *  qual usar. */
  const seguir = (
    obra: Escolhido[],
    parametros: ReturnType<typeof porPasta>["parametros"],
    falhasAntes: string[],
  ) => {
    if (parametrosEmConflito(parametros)) {
      setResultado(null);
      setEscolha(null);
      setFalhas(falhasAntes);
      setPerguntaParametros({ obra, pastas: parametros, falhas: falhasAntes });
      return;
    }
    const falhas = [...falhasAntes];
    void importar(comParametros(obra, parametros, falhas), falhas);
  };

  /** Com uma obra só (ou nenhuma do SISTRUT), importa; com várias, pergunta qual. As
   *  pastas só de parâmetros vão junto com a obra. */
  const separar = (escolhidos: readonly Escolhido[], falhasAntes: string[]) => {
    if (escolhidos.length === 0 && falhasAntes.length === 0) return;
    const pastas = porPasta(escolhidos);
    if (pastas.obras.length > 1) {
      setResultado(null);
      setFalhas(falhasAntes);
      setEscolha(pastas);
      return;
    }
    const obra = pastas.obras[0]?.arquivos;
    if (obra || pastas.parametros.length > 0) seguir(obra ?? [], pastas.parametros, falhasAntes);
    else void importar(escolhidos, falhasAntes);
  };

  const escolhidos = (e: ChangeEvent<HTMLInputElement>) => {
    const arquivos = Array.from(e.target.files ?? []).map((arquivo) => doDisco(arquivo));
    e.target.value = ""; // permite escolher os mesmos arquivos de novo
    setDoDrive(false);
    separar(arquivos, []);
  };

  const soltar = (e: DragEvent) => {
    e.preventDefault();
    setSobre(false);
    if (lendo) return; // uma leitura de cada vez
    const falhasSoltos: string[] = [];
    setDoDrive(false);
    void arquivosSoltos(e, falhasSoltos).then((x) => separar(x, falhasSoltos));
  };

  const fechar = () => {
    leitura.current++;
    interromper.current?.abort();
    interromper.current = null;
    setLendo(false);
    setProgresso(null);
    setFaltouLogin(false);
    setResultado(null);
    setFalhas([]);
    setEscolha(null);
    setPerguntaDsp(null);
    setPerguntaParametros(null);
  };
  const pergunta = escolha !== null || perguntaDsp !== null || perguntaParametros !== null;
  const baixando = lendo && doDrive;
  const aberto = resultado !== null || pergunta || baixando || (!lendo && falhas.length > 0);
  const contagem =
    progresso && progresso.total > 0 ? ` ${progresso.feitos} de ${progresso.total}` : "";

  return (
    <>
      <Button
        variant="outline"
        onClick={() => entradaArquivos.current?.click()}
        className="mt-2 w-full"
        title="Selecione de uma vez todos os arquivos da obra: os .LAJ, os .VIG, o .COL e os demais"
        disabled={lendo}
      >
        <Import /> Importar obra do SISTRUT
      </Button>
      <input
        ref={entradaArquivos}
        type="file"
        multiple
        aria-label="Arquivos do SISTRUT (.LAJ, .VIG, .COL e demais)"
        className="hidden"
        onChange={escolhidos}
      />
      <Button
        variant="outline"
        onClick={() => entradaPasta.current?.click()}
        className="mt-2 w-full"
        title="Selecione a pasta da obra: todos os arquivos dela entram"
        disabled={lendo}
      >
        <FolderInput /> Importar pasta do SISTRUT
      </Button>
      <input
        ref={entradaPasta}
        type="file"
        multiple
        {...{ webkitdirectory: "", directory: "" }}
        aria-label="Pasta da obra do SISTRUT"
        className="hidden"
        onChange={escolhidos}
      />
      <ImportarDrive
        desabilitado={lendo}
        pedirLogin={pedirLoginDrive}
        aoEscolher={(arquivos, notas) => {
          setDoDrive(true);
          separar(arquivos, notas);
        }}
      />
      <div
        role="region"
        aria-label="Soltar arquivos do SISTRUT"
        aria-busy={lendo}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = lendo ? "none" : "copy";
          setSobre(!lendo);
        }}
        onDragLeave={() => setSobre(false)}
        onDrop={soltar}
        className={`text-muted-foreground mt-2 rounded-md border border-dashed p-3 text-center text-xs ${sobre ? "border-primary bg-primary/5" : ""}`}
      >
        {lendo
          ? `Lendo os arquivos…${contagem}`
          : "Ou arraste para cá os arquivos ou a pasta da obra do SISTRUT"}
      </div>

      <Dialog open={aberto} onOpenChange={(a) => !a && fechar()}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
          {baixando ? (
            <DialogHeader>
              <DialogTitle>Baixando do Google Drive</DialogTitle>
              <DialogDescription>
                {progresso && progresso.total > 0
                  ? `${progresso.feitos} de ${plural(progresso.total, "arquivo", "arquivos")}. Só os arquivos que a importação lê são baixados.`
                  : "Preparando o download…"}
              </DialogDescription>
              <progress
                aria-label="Arquivos baixados"
                className="w-full"
                max={progresso?.total || 1}
                value={progresso?.feitos ?? 0}
              />
            </DialogHeader>
          ) : escolha ? (
            <>
              <DialogHeader>
                <DialogTitle>Qual obra importar?</DialogTitle>
                <DialogDescription>
                  Há arquivos do SISTRUT em {escolha.obras.length} pastas. Cada obra fica numa
                  pasta: escolha uma. As subpastas dela não entram.
                  {escolha.parametros.length > 0 &&
                    ` Os parâmetros de ${escolha.parametros.map((p) => p.pasta || "(arquivos soltos)").join(", ")} vão junto.`}
                </DialogDescription>
              </DialogHeader>
              <ul aria-label="Pastas com arquivos do SISTRUT" className="grid gap-2">
                {escolha.obras.map((p) => (
                  <li key={p.pasta}>
                    <Button
                      variant="outline"
                      className="w-full justify-between"
                      onClick={() => seguir(p.arquivos, escolha.parametros, falhas)}
                    >
                      <span>{p.pasta || "(arquivos soltos)"}</span>
                      <span className="text-muted-foreground text-xs">
                        {plural(p.doSistrut, "arquivo do SISTRUT", "arquivos do SISTRUT")}
                      </span>
                    </Button>
                  </li>
                ))}
              </ul>
            </>
          ) : perguntaParametros ? (
            <>
              <DialogHeader>
                <DialogTitle>Quais parâmetros usar?</DialogTitle>
                <DialogDescription>
                  Há arquivos de parâmetros com o mesmo nome em {perguntaParametros.pastas.length}{" "}
                  pastas. Escolha a pasta da instalação que a obra usou; as outras ficam de fora.
                </DialogDescription>
              </DialogHeader>
              <ul aria-label="Pastas de parâmetros" className="grid gap-2">
                {perguntaParametros.pastas.map((p) => (
                  <li key={p.pasta}>
                    <Button
                      variant="outline"
                      className="w-full justify-between"
                      onClick={() => {
                        const { obra, falhas: f } = perguntaParametros;
                        seguir(obra, [p], f);
                      }}
                    >
                      <span>{p.pasta || "(arquivos soltos)"}</span>
                      <span className="text-muted-foreground text-xs">
                        {plural(p.doSistrut, "arquivo do SISTRUT", "arquivos do SISTRUT")}
                      </span>
                    </Button>
                  </li>
                ))}
              </ul>
            </>
          ) : perguntaDsp ? (
            <>
              <DialogHeader>
                <DialogTitle>Qual parametrização do desenho?</DialogTitle>
                <DialogDescription>
                  Vieram {perguntaDsp.dsps.length} arquivos .DSP, e nem o DESENHO.INI nem o .COL
                  dizem qual a obra usou. Escolha o .DSP com que as vigas foram detalhadas; os
                  outros ficam de fora.
                </DialogDescription>
              </DialogHeader>
              <ul aria-label="Arquivos .DSP" className="grid gap-2">
                {perguntaDsp.dsps.map((nome) => (
                  <li key={nome}>
                    <Button
                      variant="outline"
                      className="w-full justify-start"
                      onClick={() => {
                        const { lidos } = perguntaDsp;
                        setPerguntaDsp(null);
                        setResultado(importarObraSistrut(lidos, { dsp: nome }));
                      }}
                    >
                      {nome}
                    </Button>
                  </li>
                ))}
              </ul>
            </>
          ) : resultado?.ok ? (
            <ResumoObra resultado={resultado} />
          ) : (
            <DialogHeader>
              <DialogTitle>Não foi possível importar a obra do SISTRUT</DialogTitle>
              <DialogDescription>Nada foi aberto. Veja o motivo abaixo.</DialogDescription>
            </DialogHeader>
          )}
          {!pergunta && !baixando && (falhas.length > 0 || (resultado && !resultado.ok)) && (
            <ul
              role="alert"
              className={`list-disc pl-5 text-sm ${resultado?.ok ? "text-aviso" : "text-destructive"}`}
            >
              {falhas.map((f, i) => (
                <li key={`f${i}`}>{f}</li>
              ))}
              {resultado && !resultado.ok && resultado.erros.map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          )}
          <DialogFooter>
            {faltouLogin && !pergunta && !baixando && (
              <Button
                variant="outline"
                onClick={() => {
                  fechar();
                  setPedirLoginDrive((n) => n + 1);
                }}
              >
                Entrar com Google e marcar os arquivos
              </Button>
            )}
            {resultado?.ok && !pergunta && (
              <Button
                onClick={() => {
                  const { obra } = resultado;
                  fechar();
                  aoAbrir(obra);
                }}
              >
                Abrir obra importada
              </Button>
            )}
            <Button variant="ghost" onClick={fechar}>
              {(resultado?.ok && !pergunta) || baixando ? "Cancelar" : "Voltar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** O que a importação reconheceu: pavimentos, arquivos e avisos. */
function ResumoObra({
  resultado,
}: {
  resultado: Extract<ResultadoImportacaoSistrut, { ok: true }>;
}) {
  const { obra, resumo } = resultado;
  // os ignorados já aparecem com o motivo na lista deles
  const motivos = new Set(resumo.ignorados.map((x) => x.motivo));
  const avisos = resultado.avisos.filter((a) => ![...motivos].some((m) => a.endsWith(`: ${m}`)));
  return (
    <>
      <DialogHeader>
        <DialogTitle>Obra {obra.nome} lida do SISTRUT</DialogTitle>
        <DialogDescription>
          {plural(resumo.pavimentos.length, "pavimento", "pavimentos")},{" "}
          {plural(resumo.lidos.length, "arquivo lido", "arquivos lidos")},{" "}
          {plural(resumo.ignorados.length, "ignorado", "ignorados")} e{" "}
          {plural(avisos.length, "aviso", "avisos")}. Confira antes de abrir.
        </DialogDescription>
      </DialogHeader>
      <section aria-label="Pavimentos importados">
        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide">
          Pavimentos, do topo para a base
        </h3>
        <table className="w-full text-sm tabular-nums">
          <thead className="text-muted-foreground text-xs">
            <tr className="border-b">
              <th className="py-1 text-left font-medium">Pavimento</th>
              <th className="py-1 text-right font-medium">Pé-direito (m)</th>
              <th className="py-1 text-right font-medium">Lajes</th>
              <th className="py-1 text-right font-medium">Vigas</th>
              <th className="py-1 text-right font-medium">Pilares</th>
            </tr>
          </thead>
          <tbody>
            {resumo.pavimentos.map((p, i) => (
              <tr key={i} className="border-b last:border-0">
                <td className="py-1">{p.nome}</td>
                <td className="py-1 text-right">{metros(p.peDireito)}</td>
                <td className="py-1 text-right">{p.lajes}</td>
                <td className="py-1 text-right">{p.vigas}</td>
                <td className="py-1 text-right">{p.pilares}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section aria-label="Arquivos lidos" className="text-xs">
        <h3 className="mb-1 font-semibold uppercase tracking-wide">Lidos</h3>
        <p>{resumo.lidos.join(", ") || "nenhum"}</p>
      </section>
      {resumo.ignorados.length > 0 && (
        <section aria-label="Arquivos ignorados" className="text-xs">
          <h3 className="mb-1 font-semibold uppercase tracking-wide">Ignorados</h3>
          <ul className="list-disc pl-5">
            {resumo.ignorados.map((x, i) => (
              <li key={i}>
                <span className="font-medium">{x.arquivo}</span>: {x.motivo}
              </li>
            ))}
          </ul>
        </section>
      )}
      {avisos.length > 0 && (
        <section aria-label="Avisos da importação" className="text-xs">
          <h3 className="mb-1 font-semibold uppercase tracking-wide">Avisos</h3>
          <ul className="list-disc pl-5">
            {avisos.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
