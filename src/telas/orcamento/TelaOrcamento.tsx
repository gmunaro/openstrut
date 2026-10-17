// Aba Orçamento: quantitativos da obra calculada × tabela de preços. Escolhe e importa
// a tabela (CSV, XLSX ou a planilha da SINAPI), edita preços, composições, perdas,
// reaproveitamento de fôrma e BDI, e mostra o custo por pavimento, tipo, insumo e
// elemento, com a comparação entre os modos de cálculo na NB-1/78. Exporta CSV e XLSX.
import { Download, FileUp, RotateCcw, Trash2 } from "lucide-react";
import { useEffect, useId, useMemo, useState, type KeyboardEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { baixar } from "../../components/relato/arquivos";
import {
  bdiTcu,
  orcar,
  rotuloPapel,
  ROTULO_TIPO,
  type Componente,
  type Papel,
  type TabelaPrecos,
} from "../../dominio/orcamento";
import type { Obra } from "../../dominio/obra";
import type { Calculo } from "../calculo";
import type { DetalhamentoObra } from "../detalhamento";
import { formatarNumero, lerNumero } from "../formato";
import { CampoNumero } from "../obra/campos";
import { SemCalculo } from "../resultados/Resultados";
import { Cabecalho, Corpo, Linha, Tabela, Td, Th, TituloBloco } from "../resultados/tabela";
import {
  configEfetiva,
  lerComposicao,
  levantamentoOutroModo,
  papeisDoLevantamento,
  textoComposicao,
  useOrcamento,
  type ResultadoOrcamento,
} from "./estado";
import { abasOrcamento, csvOrcamento, xlsxOrcamento, type Comparacao } from "./exportar";
import {
  abrirPlanilha,
  itensDaAba,
  juntarItens,
  metadadosSinapi,
  tabelaImportada,
  type Planilha,
} from "./importar";
import { ID_SINAPI } from "./sinapi";
import {
  AvisoOrcamento,
  OrigemPrecos,
  reais,
  Resumo,
  TabelaComparacao,
  TabelaGrupos,
} from "./SecaoOrcamento";

const UFS =
  "AC AL AM AP BA CE DF ES GO MA MG MS MT PA PB PE PI PR RJ RN RO RR RS SC SE SP TO".split(" ");

const SELECT =
  "border-input h-7 rounded-md border bg-transparent px-2 text-sm dark:bg-input/30 focus-visible:ring-ring/50 focus-visible:ring-[3px] outline-none";

/** Nome de arquivo a partir do nome da obra. */
const arquivoBase = (nome: string) =>
  `orcamento-${(nome || "obra").replace(/[\\/:*?"<>|]+/g, "-").trim()}`;

export function TelaOrcamento({
  obra,
  calculo,
  detalhamento,
}: {
  obra: Obra;
  calculo: Calculo;
  detalhamento: DetalhamentoObra | null;
}) {
  const resultado = calculo.tipo === "ok" ? calculo.resultado : null;
  const o = useOrcamento(obra, resultado, detalhamento);
  // o outro modo só depende da obra; o orçamento dele, da tabela e da configuração
  const levOutro = useMemo(
    () => (resultado ? levantamentoOutroModo(obra) : null),
    [obra, resultado],
  );
  const comp = useMemo((): Comparacao | null => {
    if (!o.atual || !levOutro) return null;
    const outro = orcar(levOutro, o.atual.tabela, {
      ...configEfetiva(o.guardada, papeisDoLevantamento(levOutro)),
      tabelaId: o.atual.tabela.id,
    });
    const atualOriginal = (obra.modoCalculo ?? "corrigido") === "original";
    const corrigido = atualOriginal ? outro : o.atual.orc;
    const original = atualOriginal ? o.atual.orc : outro;
    return {
      rotulos: ["Corrigido", "Original"],
      a: corrigido,
      b: original,
      cargaA: atualOriginal ? levOutro.cargaFundacao : o.atual.lev.cargaFundacao,
      cargaB: atualOriginal ? o.atual.lev.cargaFundacao : levOutro.cargaFundacao,
    };
  }, [o.atual, o.guardada, levOutro, obra.modoCalculo]);

  if (calculo.tipo !== "ok") return <SemCalculo calculo={calculo} />;
  if (!o.carregado || !o.atual) return <p className="text-muted-foreground text-sm">Carregando…</p>;
  const r = o.atual;

  const exportar = (tipo: "csv" | "xlsx") => {
    const abas = abasOrcamento(obra.nome, r, comp);
    const blob =
      tipo === "csv"
        ? new Blob([csvOrcamento(abas)], { type: "text/csv;charset=utf-8" })
        : new Blob([xlsxOrcamento(abas) as BlobPart], {
            type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          });
    baixar(blob, `${arquivoBase(obra.nome)}.${tipo}`);
  };
  const mudar = (parcial: Partial<typeof o.guardada>) =>
    o.mudarConfig({ ...o.guardada, ...parcial });

  return (
    // coluna minmax(0, 1fr): as tabelas rolam por dentro e nada passa da largura da tela;
    // pb-28: o fim da aba sobe acima do botão flutuante de relatar problema
    <div className="grid max-w-[110rem] grid-cols-[minmax(0,1fr)] gap-1 pb-28">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-base font-semibold">Orçamento da estrutura</h2>
        <span className="flex-1" />
        <Button size="sm" variant="outline" onClick={() => exportar("csv")}>
          <Download /> CSV
        </Button>
        <Button size="sm" variant="outline" onClick={() => exportar("xlsx")}>
          <Download /> XLSX
        </Button>
      </div>
      <AvisoOrcamento />

      <Bloco titulo="Resumo">
        <Resumo r={r} />
      </Bloco>

      <Bloco titulo="Tabela de preços">
        <EscolhaTabela o={o} r={r} mudarTabela={(id) => mudar({ tabelaId: id })} />
      </Bloco>

      <Bloco titulo="Perdas, reaproveitamento e BDI">
        <Parametros r={r} mudar={mudar} />
      </Bloco>

      <Bloco titulo="Composições e custo por insumo">
        <Composicoes
          r={r}
          mudar={(p, comps) => {
            const vinculos = { ...o.guardada.vinculos };
            if (comps === null) delete vinculos[p];
            else vinculos[p] = comps;
            mudar({ vinculos });
          }}
          salvarPreco={(codigo, preco) =>
            o.salvarTabela({
              ...r.tabela,
              itens: r.tabela.itens.map((i) => (i.codigo === codigo ? { ...i, preco } : i)),
            })
          }
        />
      </Bloco>

      <div className="flex flex-wrap gap-x-8">
        <TabelaGrupos
          titulo="Por pavimento"
          primeira="Pavimento"
          grupos={r.orc.porPavimento}
          orc={r.orc}
        />
        <TabelaGrupos titulo="Por tipo" primeira="Tipo" grupos={r.orc.porTipo} orc={r.orc} />
      </div>

      {comp && <TabelaComparacao comp={comp} />}

      <PorElemento r={r} />
      <PrecosDaTabela tabela={r.tabela} salvar={o.salvarTabela} />
    </div>
  );
}

function Bloco({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="mt-2">
      <TituloBloco>{titulo}</TituloBloco>
      {children}
    </section>
  );
}

// ---- tabela de preços ---------------------------------------------------------------

function EscolhaTabela({
  o,
  r,
  mudarTabela,
}: {
  o: ReturnType<typeof useOrcamento>;
  r: ResultadoOrcamento;
  mudarTabela: (id: string) => void;
}) {
  const id = useId();
  const [importando, setImportando] = useState(false);
  const referencia = r.tabela.id === ID_SINAPI;
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <label htmlFor={id}>Tabela</label>
        <select
          id={id}
          className={cn(SELECT, "w-full min-w-0 sm:w-auto sm:max-w-full")}
          value={r.tabela.id}
          onChange={(e) => mudarTabela(e.target.value)}
        >
          {o.tabelas.map((t) => (
            <option key={t.id} value={t.id}>
              {t.nome}
            </option>
          ))}
        </select>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setImportando((v) => !v)}
          aria-expanded={importando}
        >
          <FileUp /> Importar…
        </Button>
        {referencia ? (
          o.editada && (
            <Button size="sm" variant="ghost" onClick={() => o.apagarTabela(ID_SINAPI)}>
              <RotateCcw /> Desfazer edições da referência
            </Button>
          )
        ) : (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              o.apagarTabela(r.tabela.id);
              mudarTabela(ID_SINAPI);
            }}
          >
            <Trash2 /> Excluir esta tabela
          </Button>
        )}
      </div>
      <OrigemPrecos r={r} />
      {referencia && (
        <p className="text-muted-foreground max-w-3xl text-xs">
          Recorte da SINAPI com os itens das composições padrão, conferidos na planilha oficial.
          Para outra UF, outro mês ou com desoneração, importe o ZIP mensal da SINAPI (caixa.gov.br,
          "Relatórios mensais", formato XLSX): aba ISD ou ICD para insumos, CSD ou CCD para
          composições.
          {o.editada && " Esta cópia tem preços editados por você."}
        </p>
      )}
      {importando && (
        <Importacao
          atual={r.tabela}
          aoImportar={(t, nova) => {
            o.salvarTabela(t);
            if (nova) mudarTabela(t.id);
          }}
        />
      )}
    </div>
  );
}

function Importacao({
  atual,
  aoImportar,
}: {
  atual: TabelaPrecos;
  aoImportar: (t: TabelaPrecos, nova: boolean) => void;
}) {
  const id = useId();
  const [arquivo, setArquivo] = useState<{ nome: string; planilha: Planilha } | null>(null);
  const [aba, setAba] = useState("");
  const [uf, setUf] = useState("SP");
  const [destino, setDestino] = useState<"nova" | "atual">("nova");
  const [msg, setMsg] = useState<{ erro: boolean; texto: string } | null>(null);
  const [lendo, setLendo] = useState(false);

  const abrir = async (f: File) => {
    setMsg(null);
    setLendo(true);
    try {
      const planilha = await abrirPlanilha(f.name, new Uint8Array(await f.arrayBuffer()));
      setArquivo({ nome: f.name, planilha });
      setAba(planilha.nomes.find((n) => /^(ISD|ICD|CSD|CCD)$/i.test(n)) ?? planilha.nomes[0] ?? "");
    } catch (e) {
      setArquivo(null);
      setMsg({ erro: true, texto: e instanceof Error ? e.message : String(e) });
    } finally {
      setLendo(false);
    }
  };
  const importar = async () => {
    if (!arquivo) return;
    setLendo(true);
    try {
      const a = await arquivo.planilha.ler(aba);
      const imp = itensDaAba(a, uf);
      if (!imp.ok) return setMsg({ erro: true, texto: imp.erro });
      const meta = metadadosSinapi(a);
      const t =
        destino === "nova"
          ? tabelaImportada(arquivo.nome, imp, meta)
          : juntarItens(atual, imp.itens);
      aoImportar(t, destino === "nova");
      const semUf =
        imp.ufs.length > 0 && imp.uf !== uf ? ` A planilha não tem ${uf}; usei ${imp.uf}.` : "";
      setMsg({
        erro: false,
        texto: `${imp.itens.length} ${imp.itens.length === 1 ? "item importado" : "itens importados"} da aba ${imp.aba}${imp.uf ? ` (${imp.uf})` : ""}${destino === "atual" ? ` para ${atual.nome}` : ""}.${semUf}${imp.ignoradas ? ` ${imp.ignoradas} linhas sem código ou descrição ficaram de fora.` : ""}`,
      });
    } finally {
      setLendo(false);
    }
  };

  return (
    <div className="bg-muted/30 grid max-w-3xl gap-2 rounded-md border p-3 text-sm">
      <p className="text-muted-foreground text-xs">
        CSV ou XLSX com as colunas código, descrição, unidade e preço (o cabeçalho pode estar abaixo
        de um título), ou o ZIP/XLSX mensal da SINAPI, com o preço numa coluna por UF. A tabela fica
        guardada neste navegador.
      </p>
      <label className="flex flex-wrap items-center gap-2">
        Arquivo
        <input
          type="file"
          accept=".csv,.txt,.xlsx,.zip"
          className="text-xs"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void abrir(f);
          }}
        />
      </label>
      {arquivo && (
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-1">
            Aba
            <select className={SELECT} value={aba} onChange={(e) => setAba(e.target.value)}>
              {arquivo.planilha.nomes.map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1">
            UF
            <select className={SELECT} value={uf} onChange={(e) => setUf(e.target.value)}>
              {UFS.map((u) => (
                <option key={u}>{u}</option>
              ))}
            </select>
          </label>
          <fieldset className="flex items-center gap-2">
            <legend className="sr-only">Destino</legend>
            <label className="flex items-center gap-1">
              <input
                type="radio"
                name={id}
                checked={destino === "nova"}
                onChange={() => setDestino("nova")}
              />
              nova tabela
            </label>
            <label className="flex items-center gap-1">
              <input
                type="radio"
                name={id}
                checked={destino === "atual"}
                onChange={() => setDestino("atual")}
              />
              juntar à tabela atual
            </label>
          </fieldset>
          <Button size="sm" onClick={() => void importar()} disabled={lendo || !aba}>
            Importar
          </Button>
        </div>
      )}
      {lendo && <p className="text-muted-foreground text-xs">Lendo a planilha…</p>}
      {msg && (
        <p
          role={msg.erro ? "alert" : "status"}
          className={cn("text-xs", msg.erro ? "text-destructive" : "text-foreground")}
        >
          {msg.texto}
        </p>
      )}
    </div>
  );
}

// ---- parâmetros ---------------------------------------------------------------------

function Parametros({
  r,
  mudar,
}: {
  r: ResultadoOrcamento;
  mudar: (p: Partial<ResultadoOrcamento["cfg"]>) => void;
}) {
  const { cfg, orc } = r;
  const pct = (x: number) => Math.round(x * 1e6) / 1e4;
  const fracao = (n: number) => n >= 0 && n < 100;
  return (
    <div className="grid gap-2 text-sm">
      <div className="flex flex-wrap gap-x-5 gap-y-2">
        <CampoNumero
          rotulo="Perda de concreto"
          unidade="%"
          valor={pct(cfg.perdaConcreto)}
          valido={fracao}
          confirmar={(n) => mudar({ perdaConcreto: n / 100 })}
          className="w-16"
        />
        <CampoNumero
          rotulo="Perda de aço"
          unidade="%"
          valor={pct(cfg.perdaAco)}
          valido={fracao}
          confirmar={(n) => mudar({ perdaAco: n / 100 })}
          className="w-16"
        />
        <CampoNumero
          rotulo="Perda de fôrma"
          unidade="%"
          valor={pct(cfg.perdaForma)}
          valido={fracao}
          confirmar={(n) => mudar({ perdaForma: n / 100 })}
          className="w-16"
        />
        <CampoNumero
          rotulo="Usos de cada jogo de fôrma"
          valor={cfg.usosForma}
          casas={0}
          valido={(n) => Number.isInteger(n) && n >= 1 && n <= 50}
          mensagemInvalido="Inteiro de 1 a 50."
          confirmar={(n) => mudar({ usosForma: n })}
          className="w-14"
        />
        <CampoNumero
          rotulo="BDI"
          unidade="%"
          valor={pct(cfg.bdi)}
          valido={(n) => n >= 0 && n < 200}
          confirmar={(n) => mudar({ bdi: n / 100 })}
          className="w-20"
        />
      </div>
      <p className="text-muted-foreground max-w-3xl text-xs">
        Fôrma fabricada de cada tipo = máx(maior área de um nível; área total ÷ usos), com a perda:
        lajes {formatarNumero(orc.formaFabricada.laje, 1)} m², vigas{" "}
        {formatarNumero(orc.formaFabricada.viga, 1)} m², pilares{" "}
        {formatarNumero(orc.formaFabricada.pilar, 1)} m² (de{" "}
        {formatarNumero(orc.indicadores.forma, 1)} m² de fôrma). Montagem e desmontagem em toda a
        área. A perda de aço vale sobre as barras do detalhamento; a mão de obra de armação, sobre o
        aço sem perda.
      </p>
      <CalculoBdi aplicar={(b) => mudar({ bdi: b })} />
    </div>
  );
}

/** BDI pela fórmula do Acórdão TCU 2622/2013, com as parcelas digitadas pelo usuário. */
function CalculoBdi({ aplicar }: { aplicar: (bdi: number) => void }) {
  const [p, setP] = useState({ ac: 0, s: 0, r: 0, g: 0, df: 0, l: 0, i: 0 });
  const bdi = bdiTcu({
    ac: p.ac / 100,
    s: p.s / 100,
    r: p.r / 100,
    g: p.g / 100,
    df: p.df / 100,
    l: p.l / 100,
    i: p.i / 100,
  });
  const campos: [keyof typeof p, string][] = [
    ["ac", "AC"],
    ["s", "S"],
    ["r", "R"],
    ["g", "G"],
    ["df", "DF"],
    ["l", "L"],
    ["i", "I"],
  ];
  return (
    <details className="max-w-3xl text-xs">
      <summary className="cursor-pointer">Calcular o BDI pela fórmula do TCU</summary>
      <p className="text-muted-foreground mt-1">
        BDI = (1 + AC + S + R + G)(1 + DF)(1 + L) / (1 − I) − 1 (Acórdão TCU 2622/2013). AC
        administração central; S, R, G seguro, risco e garantia; DF despesas financeiras; L lucro; I
        tributos. Informe as parcelas da sua obra, em %.
      </p>
      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1">
        {campos.map(([k, rotulo]) => (
          <CampoNumero
            key={k}
            rotulo={rotulo}
            unidade="%"
            valor={p[k]}
            valido={(n) => n >= 0 && n < 100}
            confirmar={(n) => setP((x) => ({ ...x, [k]: n }))}
            className="w-16"
          />
        ))}
        <span>
          = <span className="font-mono">{formatarNumero(bdi * 100, 2)} %</span>
        </span>
        <Button
          size="xs"
          variant="outline"
          disabled={!Number.isFinite(bdi)}
          onClick={() => aplicar(bdi)}
        >
          Usar este BDI
        </Button>
      </div>
    </details>
  );
}

// ---- composições --------------------------------------------------------------------

/** Campo de texto que confirma no Enter ou ao sair; `confirmar` devolve o erro ou null.
 *  `linhas`: campo de várias linhas que cresce com o texto (a composição inteira à vista). */
function CampoCelula({
  valor,
  rotulo,
  confirmar,
  className,
  numero = false,
  linhas = false,
}: {
  valor: string;
  rotulo: string;
  confirmar: (texto: string) => string | null;
  className?: string;
  numero?: boolean;
  linhas?: boolean;
}) {
  const [texto, setTexto] = useState(valor);
  const [erro, setErro] = useState<string | null>(null);
  useEffect(() => {
    setTexto(valor);
    setErro(null);
  }, [valor]);
  const aplicar = () => setErro(texto === valor ? null : confirmar(texto));
  const teclas = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      aplicar();
    }
    if (e.key === "Escape") {
      setTexto(valor);
      setErro(null);
    }
  };
  return (
    <span className="inline-flex max-w-full flex-col">
      {linhas ? (
        <textarea
          aria-label={rotulo}
          title={erro ?? rotulo}
          value={texto}
          aria-invalid={erro !== null}
          // ~26 caracteres por linha na largura do campo; o Chrome ajusta com field-sizing
          rows={Math.max(1, Math.ceil(texto.length / 26))}
          className={cn(
            "border-input dark:bg-input/30 focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:border-destructive min-h-7 max-w-full resize-none rounded-md border bg-transparent px-2 py-1 text-xs leading-snug whitespace-pre-wrap outline-none focus-visible:ring-[3px] [field-sizing:content]",
            className,
          )}
          onChange={(e) => setTexto(e.target.value)}
          onBlur={aplicar}
          onKeyDown={teclas}
        />
      ) : (
        <Input
          aria-label={rotulo}
          title={erro ?? rotulo}
          value={texto}
          aria-invalid={erro !== null}
          inputMode={numero ? "decimal" : undefined}
          className={cn(
            "h-7 px-2 text-xs",
            numero && "text-right font-mono tabular-nums",
            className,
          )}
          onChange={(e) => setTexto(e.target.value)}
          onBlur={aplicar}
          onKeyDown={teclas}
        />
      )}
      {erro && <span className="text-destructive mt-0.5 max-w-64 text-[11px]">{erro}</span>}
    </span>
  );
}

function Composicoes({
  r,
  mudar,
  salvarPreco,
}: {
  r: ResultadoOrcamento;
  mudar: (p: Papel, comps: Componente[] | null) => void;
  salvarPreco: (codigo: string, preco: number | null) => void;
}) {
  const porCodigo = new Map(r.tabela.itens.map((i) => [i.codigo, i]));
  const grupos = new Map(r.orc.porInsumo.map((g) => [g.papel, g]));
  // papéis sem quantidade (fundação sem composição) também aparecem para editar
  const papeis = r.papeis;
  return (
    <>
      <Tabela className="w-auto">
        <Cabecalho>
          <Linha>
            <Th>Insumo</Th>
            <Th num>Quantidade</Th>
            <Th>Un</Th>
            <Th>Composição (código × coeficiente)</Th>
            <Th num unidade="R$">
              Preço unitário
            </Th>
            <Th num unidade="R$">
              Custo direto
            </Th>
          </Linha>
        </Cabecalho>
        <Corpo>
          {papeis.map((p) => {
            const g = grupos.get(p);
            const comps = r.cfg.vinculos[p];
            const unico =
              comps?.length === 1 && comps[0]!.coef === 1
                ? porCodigo.get(comps[0]!.codigo)
                : undefined;
            const faltam = (comps ?? [])
              .filter((c) => !porCodigo.has(c.codigo))
              .map((c) => c.codigo);
            return (
              <Linha key={p} data-papel={p}>
                <Td className="whitespace-normal">{rotuloPapel(p)}</Td>
                <Td num>{formatarNumero(g?.quantidade ?? 0, 2)}</Td>
                <Td>{g?.unidade ?? (p === "fundacao" ? "tf" : "")}</Td>
                <Td>
                  <CampoCelula
                    rotulo={`Composição de ${rotuloPapel(p)}`}
                    valor={textoComposicao(comps)}
                    className="w-56 font-mono"
                    linhas
                    confirmar={(t) => {
                      if (t.trim() === "") {
                        mudar(p, null);
                        return null;
                      }
                      const c = lerComposicao(t);
                      if (typeof c === "string") return c;
                      mudar(p, c);
                      return null;
                    }}
                  />
                  {faltam.length > 0 && (
                    <span className="text-aviso block text-[11px]">
                      fora da tabela: {faltam.join(", ")}
                    </span>
                  )}
                  {unico && (
                    <span className="text-muted-foreground block max-w-72 truncate text-[11px]">
                      {unico.descricao}
                    </span>
                  )}
                </Td>
                <Td num>
                  {unico ? (
                    <CampoCelula
                      numero
                      rotulo={`Preço de ${unico.codigo}`}
                      valor={
                        unico.preco === null
                          ? ""
                          : formatarNumero(unico.preco, 2).replace(/\./g, "")
                      }
                      className="w-24"
                      confirmar={(t) => {
                        const n = t.trim() === "" ? null : lerNumero(t);
                        if (t.trim() !== "" && (n === null || n < 0)) return "Preço inválido.";
                        salvarPreco(unico.codigo, n);
                        return null;
                      }}
                    />
                  ) : (
                    reais(g?.preco)
                  )}
                </Td>
                <Td num className={g && g.semPreco > 0 ? "text-aviso" : ""}>
                  {!g ? "—" : g.semPreco > 0 ? "sem preço" : reais(g.custo)}
                </Td>
              </Linha>
            );
          })}
        </Corpo>
      </Tabela>
      <p className="text-muted-foreground mt-1 max-w-3xl text-xs">
        Preço unitário = Σ coeficiente × preço do item. Composição vazia deixa o insumo sem preço;
        apague o texto e confirme para voltar à composição padrão da SINAPI. Com um item só, o preço
        dele se edita aqui; com vários, em "Preços da tabela". A fundação só entra com uma
        composição (R$ por tf de carga na fundação).
      </p>
    </>
  );
}

// ---- por elemento e preços ----------------------------------------------------------

function PorElemento({ r }: { r: ResultadoOrcamento }) {
  const { orc } = r;
  return (
    <details className="mt-4" open={orc.porElemento.length <= 40}>
      <summary className="cursor-pointer text-sm font-semibold">
        Por elemento ({orc.porElemento.length})
      </summary>
      <Tabela className="mt-1 w-auto">
        <Cabecalho>
          <Linha>
            <Th>Elemento</Th>
            <Th>Pavimento</Th>
            <Th>Tipo</Th>
            <Th num unidade="m³">
              Concreto
            </Th>
            <Th num unidade="m²">
              Fôrma
            </Th>
            <Th num unidade="kg">
              Aço
            </Th>
            <Th num unidade="R$">
              Custo direto
            </Th>
          </Linha>
        </Cabecalho>
        <Corpo>
          {orc.porElemento.map((g) => {
            const e = orc.elementos[Number(g.chave)]!;
            return (
              <Linha key={g.chave}>
                <Td>{g.nome}</Td>
                <Td>{g.pavimento}</Td>
                <Td>{ROTULO_TIPO[g.tipo]}</Td>
                <Td num>{formatarNumero(e.concreto, 3)}</Td>
                <Td num>{formatarNumero(e.forma, 2)}</Td>
                <Td num>
                  {formatarNumero(
                    e.aco.reduce((a, m) => a + m.massa, 0),
                    1,
                  )}
                </Td>
                <Td num>
                  {reais(g.custo)}
                  {g.semPreco > 0 && <span className="text-aviso"> *</span>}
                </Td>
              </Linha>
            );
          })}
        </Corpo>
      </Tabela>
      {r.lev.semAco.length > 0 && (
        <p className="text-aviso mt-1 text-xs">
          Sem barras no detalhamento (aço fora do orçamento): {r.lev.semAco.join(", ")}.
        </p>
      )}
    </details>
  );
}

const LIMITE_LINHAS = 100;

function PrecosDaTabela({
  tabela,
  salvar,
}: {
  tabela: TabelaPrecos;
  salvar: (t: TabelaPrecos) => void;
}) {
  const [filtro, setFiltro] = useState("");
  const [novo, setNovo] = useState({ codigo: "", descricao: "", unidade: "", preco: "" });
  const f = filtro
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
  const itens = tabela.itens.filter(
    (i) =>
      !f ||
      i.codigo.toLowerCase().includes(f) ||
      i.descricao
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .includes(f),
  );
  const salvarPreco = (codigo: string, preco: number | null) =>
    salvar({
      ...tabela,
      itens: tabela.itens.map((i) => (i.codigo === codigo ? { ...i, preco } : i)),
    });
  const acrescentar = () => {
    const preco = novo.preco.trim() === "" ? null : lerNumero(novo.preco);
    if (!novo.codigo.trim() || tabela.itens.some((i) => i.codigo === novo.codigo.trim())) return;
    salvar({
      ...tabela,
      itens: [
        ...tabela.itens,
        {
          codigo: novo.codigo.trim(),
          descricao: novo.descricao.trim() || novo.codigo.trim(),
          unidade: novo.unidade.trim(),
          preco,
        },
      ],
    });
    setNovo({ codigo: "", descricao: "", unidade: "", preco: "" });
  };
  return (
    <details className="mt-4">
      <summary className="cursor-pointer text-sm font-semibold">
        Preços da tabela ({tabela.itens.length} {tabela.itens.length === 1 ? "item" : "itens"})
      </summary>
      <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
        <Input
          aria-label="Filtrar itens por código ou descrição"
          placeholder="Filtrar por código ou descrição"
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
          className="h-7 w-72 text-xs"
        />
        <span className="text-muted-foreground text-xs">
          {itens.length > LIMITE_LINHAS
            ? `mostrando ${LIMITE_LINHAS} de ${itens.length}`
            : `${itens.length} ${itens.length === 1 ? "item" : "itens"}`}
        </span>
      </div>
      <Tabela className="mt-1 w-auto">
        <Cabecalho>
          <Linha>
            <Th>Código</Th>
            <Th>Descrição</Th>
            <Th>Un</Th>
            <Th num unidade="R$">
              Preço
            </Th>
          </Linha>
        </Cabecalho>
        <Corpo>
          {itens.slice(0, LIMITE_LINHAS).map((i) => (
            <Linha key={i.codigo}>
              <Td className="font-mono">{i.codigo}</Td>
              <Td className="max-w-[36rem] whitespace-normal">{i.descricao}</Td>
              <Td>{i.unidade}</Td>
              <Td num>
                <CampoCelula
                  numero
                  rotulo={`Preço de ${i.codigo}`}
                  valor={i.preco === null ? "" : formatarNumero(i.preco, 2).replace(/\./g, "")}
                  className="w-24"
                  confirmar={(t) => {
                    const n = t.trim() === "" ? null : lerNumero(t);
                    if (t.trim() !== "" && (n === null || n < 0)) return "Preço inválido.";
                    salvarPreco(i.codigo, n);
                    return null;
                  }}
                />
              </Td>
            </Linha>
          ))}
        </Corpo>
      </Tabela>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
        <span>Novo item:</span>
        <Input
          aria-label="Código do novo item"
          placeholder="código"
          value={novo.codigo}
          onChange={(e) => setNovo({ ...novo, codigo: e.target.value })}
          className="h-7 w-24 text-xs"
        />
        <Input
          aria-label="Descrição do novo item"
          placeholder="descrição"
          value={novo.descricao}
          onChange={(e) => setNovo({ ...novo, descricao: e.target.value })}
          className="h-7 w-64 text-xs"
        />
        <Input
          aria-label="Unidade do novo item"
          placeholder="un"
          value={novo.unidade}
          onChange={(e) => setNovo({ ...novo, unidade: e.target.value })}
          className="h-7 w-14 text-xs"
        />
        <Input
          aria-label="Preço do novo item"
          placeholder="preço"
          inputMode="decimal"
          value={novo.preco}
          onChange={(e) => setNovo({ ...novo, preco: e.target.value })}
          className="h-7 w-24 text-right text-xs"
        />
        <Button size="xs" variant="outline" onClick={acrescentar} disabled={!novo.codigo.trim()}>
          Acrescentar
        </Button>
      </div>
    </details>
  );
}
