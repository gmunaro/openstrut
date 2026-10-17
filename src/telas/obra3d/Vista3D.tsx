// Vista 3D da obra (carregada sob demanda por AbaVista3D): o prédio inteiro ao abrir,
// as partes (nível, elemento com vizinhos, eixo/pórtico) com trilha de volta ao todo,
// visibilidade por tipo e nível, explodido, cores por estado ou por grandeza, seleção
// com resumo e links para a planta e os resultados, camadas (camadas.ts) e exportação.
// A vista é um apoio: todo número mostrado aqui também está em Resultados e na Planta.
import {
  Box,
  ChevronRight,
  Download,
  Eye,
  EyeOff,
  Layers,
  Maximize,
  MoveVertical,
  X,
} from "lucide-react";
import {
  type ComponentType,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DetalhamentoContexto } from "../detalhamento";
import { useSessao } from "../sessao";
import type { PropsVista3D } from "./AbaVista3D";
import { CAMADAS, type Camada, type ContextoVista } from "./camadas";
import { Cena3D, ESTADO_INICIAL, type EstadoVisual, type ModoCor, TIPOS, type Vista } from "./cena";
import { COR_DEFEITO, COR_ESTADO, NEUTRO, RAMPA, ROTULO_ESTADO } from "./cores";
import { dadosDosElementos, type Estado, GRANDEZAS, type GrandezaMapa } from "./dados";
import type { Ver3d } from "./link";
import { type Elemento3D, montarModelo, type TipoElemento } from "./modelo";
import { type Foco, rotuloEixo, trilha } from "./partes";
import { converter } from "../formato";

const ROTULO_TIPO: Record<TipoElemento, string> = {
  laje: "Lajes",
  viga: "Vigas",
  pilar: "Pilares",
  escada: "Escada",
  fundacao: "Fundação",
};
const NOME_TIPO: Record<TipoElemento, string> = {
  laje: "Laje",
  viga: "Viga",
  pilar: "Pilar",
  escada: "Escada",
  fundacao: "Fundação",
};
const VISTAS: { v: Vista; rotulo: string }[] = [
  { v: "perspectiva", rotulo: "Perspectiva" },
  { v: "frente", rotulo: "Frente" },
  { v: "lado", rotulo: "Lado" },
  { v: "topo", rotulo: "Topo" },
];

const fundoEscuro = () => document.documentElement.classList.contains("dark");

function baixar(blob: Blob, nome: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const nomeArquivo = (obra: string, ext: string) =>
  `${(obra || "obra").replace(/[^\w\-. ]+/g, "_")}-3d.${ext}`;

/** Elemento do modelo para o pedido "ver em 3D": o lance mais baixo do pavimento. */
function chaveDoPedido(elementos: readonly Elemento3D[], v: Ver3d | null | undefined) {
  if (!v) return null;
  return (
    elementos.find((e) => e.tipo === v.tipo && e.pavimentoId === v.pavimentoId && e.id === v.id)
      ?.chave ?? null
  );
}

export default function Vista3D({
  obra,
  calculo,
  foco: pedido,
  aoVerNaPlanta,
  aoVerNosResultados,
}: PropsVista3D) {
  const unidades = useSessao((s) => s.unidades);
  const detalhamento = useContext(DetalhamentoContexto);
  const modelo = useMemo(() => montarModelo(obra), [obra]);
  const dados = useMemo(
    () => dadosDosElementos(modelo, calculo, obra, unidades),
    [modelo, calculo, obra, unidades],
  );
  const caixa = useRef<HTMLDivElement>(null);
  const cenaRef = useRef<Cena3D | null>(null);
  const [cena, setCena] = useState<Cena3D | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ev, setEv] = useState<EstadoVisual>(ESTADO_INICIAL);
  const [vista, setVista] = useState<Vista>("perspectiva");
  const [selecao, setSelecao] = useState<string | null>(null);
  const [painel, setPainel] = useState(true);

  // camadas ligadas: limpas antes de a cena ser destruída (no desmonte, abaixo)
  const ativas = useRef(new Map<string, { camada: Camada; limpar: (() => void) | void }>());

  // cria a cena uma vez; o modelo e os dados novos vão por `atualizar`
  useEffect(() => {
    if (!caixa.current) return;
    let c: Cena3D;
    try {
      c = new Cena3D(caixa.current, {
        obra,
        calculo,
        modelo,
        dados,
        detalhamento,
        fundoEscuro: fundoEscuro(),
      });
    } catch (e) {
      setErro(
        `Não foi possível iniciar a vista 3D (${e instanceof Error ? e.message : String(e)}).`,
      );
      return;
    }
    cenaRef.current = c;
    setCena(c);
    const parar = c.aoMudar("selecao", () => setSelecao(c.selecao));
    // e2e e depuração: a cena viva, só para leitura
    (window as { __vista3d?: Cena3D }).__vista3d = c;
    const camadas = ativas.current;
    return () => {
      parar();
      for (const a of camadas.values()) a.limpar?.();
      camadas.clear();
      delete (window as { __vista3d?: Cena3D }).__vista3d;
      c.destruir();
      cenaRef.current = null;
    };
  }, []);

  useEffect(() => {
    cenaRef.current?.atualizar({ obra, calculo, modelo, dados, detalhamento });
  }, [obra, calculo, modelo, dados, detalhamento]);

  /** Muda o estado visual na cena (a fonte) e espelha na tela. */
  const mudarEstado = useCallback((p: Partial<EstadoVisual>, enquadrar = false) => {
    const c = cenaRef.current;
    if (!c) return;
    c.definirEstado(p);
    setEv(c.estado);
    if (enquadrar) void c.enquadrar(true);
  }, []);

  /** Vai a uma parte (ou ao todo) e enquadra; o eixo abre de frente para o pórtico. */
  const irPara = useCallback((foco: Foco) => {
    const c = cenaRef.current;
    if (!c) return;
    c.definirEstado({ foco });
    setEv(c.estado);
    if (foco.tipo === "eixo") {
      const eixo = c.modelo.eixos.find((e) => e.chave === foco.chave);
      const v: Vista = eixo?.direcao === "x" ? "lado" : "frente";
      setVista(v);
      c.definirVista(v);
    } else if (foco.tipo === "todo") {
      setVista("perspectiva");
      c.definirVista("perspectiva");
    } else void c.enquadrar(true);
  }, []);

  // pedido "ver em 3D": foco no elemento e seleção (só quando o pedido muda)
  useEffect(() => {
    if (!cena) return;
    const chave = chaveDoPedido(cena.modelo.elementos, pedido);
    if (!chave) return;
    irPara({ tipo: "elemento", chave });
    cena.selecionar(chave);
  }, [cena, pedido, irPara]);

  // ---- camadas -----------------------------------------------------------------------
  const [camadasLigadas, setCamadasLigadas] = useState<string[]>([]);
  const [carregando, setCarregando] = useState<string | null>(null);
  const ctx = useMemo<ContextoVista | null>(() => cena, [cena]);
  const alternarCamada = async (id: string) => {
    if (!ctx) return;
    const ligada = ativas.current.get(id);
    if (ligada) {
      ligada.limpar?.();
      ativas.current.delete(id);
      setCamadasLigadas((l) => l.filter((x) => x !== id));
      ctx.pedirRender();
      return;
    }
    const def = CAMADAS.find((c) => c.id === id);
    if (!def) return;
    setCarregando(id);
    try {
      const camada = await def.carregar();
      // a vista pode ter fechado enquanto o código da camada baixava
      if (cenaRef.current !== ctx) return;
      ativas.current.set(id, { camada, limpar: camada.ativar(ctx) });
      setCamadasLigadas((l) => [...l, id]);
      ctx.pedirRender();
    } catch (e) {
      setErro(
        `A camada "${def.nome}" não carregou (${e instanceof Error ? e.message : String(e)}).`,
      );
    } finally {
      setCarregando(null);
    }
  };

  // ---- derivados para a tela -----------------------------------------------------------
  const sel = selecao ? modelo.elementos.find((e) => e.chave === selecao) : undefined;
  const dadosSel = sel ? dados.get(sel.chave) : undefined;
  const passos = trilha(modelo, ev.foco);
  const original = obra.modoCalculo === "original";
  const calculado = calculo.tipo === "ok";
  const contagem = useMemo(() => {
    const c: Record<Estado, number> = { ok: 0, aviso: 0, falha: 0, sem: 0 };
    for (const e of modelo.elementos)
      if (e.tipo === "laje" || e.tipo === "viga" || e.tipo === "pilar")
        c[dados.get(e.chave)?.estado ?? "sem"]++;
    return c;
  }, [modelo, dados]);
  const comDefeito = useMemo(
    () =>
      original
        ? modelo.elementos.filter((e) => (dados.get(e.chave)?.defeitos.length ?? 0) > 0)
        : [],
    [original, modelo, dados],
  );
  const faixa = cena && ev.modoCor !== "estado" ? cena.faixa : undefined;
  // as peças com falha, em lista (a vista não é o único jeito de achá-las)
  const comFalha = useMemo(
    () => modelo.elementos.filter((e) => dados.get(e.chave)?.estado === "falha"),
    [modelo, dados],
  );
  const tiposPresentes = TIPOS.filter((t) => modelo.elementos.some((e) => e.tipo === t));
  const verDe = (e: Elemento3D): Ver3d | null =>
    e.tipo === "laje" || e.tipo === "viga" || e.tipo === "pilar"
      ? { pavimentoId: e.pavimentoId, tipo: e.tipo, id: e.id }
      : e.tipo === "fundacao"
        ? { pavimentoId: e.pavimentoId, tipo: "pilar", id: e.id }
        : null;

  const exportarPng = async () => {
    const b = await cena?.png();
    if (b) baixar(b, nomeArquivo(obra.nome, "png"));
  };
  const exportarGlb = async () => {
    const b = await cena?.glb();
    if (b) baixar(new Blob([b], { type: "model/gltf-binary" }), nomeArquivo(obra.nome, "glb"));
  };

  if (erro && !cena)
    return (
      <div role="alert" className="mx-auto grid max-w-xl gap-2 p-6 text-sm">
        <p className="font-semibold">{erro}</p>
        <p className="text-muted-foreground">
          A geometria está na aba Planta e os resultados de cada elemento, na aba Resultados.
        </p>
      </div>
    );

  const barra = "flex flex-wrap items-center gap-1";
  return (
    <div
      className="compacto:flex-col compacto:overflow-auto flex h-full min-h-0 flex-1"
      data-testid="vista-3d"
    >
      <div className="compacto:h-[58vh] compacto:flex-none relative min-h-0 min-w-0 flex-1">
        <div
          ref={caixa}
          className="absolute inset-0"
          aria-label={`Vista 3D de ${obra.nome || "obra sem nome"}: ${modelo.niveis.length} níveis, ${modelo.elementos.length} peças. Os mesmos dados estão nas abas Planta e Resultados.`}
        />
        {/* barra de vistas, por cima do desenho */}
        <div className="pointer-events-none absolute inset-x-2 top-2 grid gap-1">
          <nav aria-label="Trilha da vista 3D" className="pointer-events-auto w-fit">
            <ol className="bg-background/85 flex flex-wrap items-center gap-0.5 rounded-md border px-1 py-0.5 text-xs shadow-sm">
              {passos.map((p, i) => (
                <li key={`${i}-${p.rotulo}`} className="flex items-center gap-0.5">
                  {i > 0 && <ChevronRight className="text-muted-foreground size-3" aria-hidden />}
                  {i < passos.length - 1 ? (
                    <button
                      type="button"
                      className="hover:bg-accent rounded px-1.5 py-1 underline-offset-2 hover:underline"
                      onClick={() => irPara(p.foco)}
                    >
                      {p.rotulo}
                    </button>
                  ) : (
                    <span aria-current="location" className="px-1.5 py-1 font-semibold">
                      {p.rotulo}
                    </span>
                  )}
                </li>
              ))}
            </ol>
          </nav>
          <div
            role="toolbar"
            aria-label="Vistas"
            className={cn(
              barra,
              "bg-background/85 pointer-events-auto w-fit rounded-md border p-0.5 shadow-sm",
            )}
          >
            {VISTAS.map(({ v, rotulo }) => (
              <Button
                key={v}
                size="xs"
                variant={vista === v ? "secondary" : "ghost"}
                aria-pressed={vista === v}
                className="compacto:h-9"
                onClick={() => {
                  setVista(v);
                  cena?.definirVista(v);
                }}
              >
                {v === "perspectiva" && <Box />}
                {rotulo}
              </Button>
            ))}
            <Button
              size="xs"
              variant="ghost"
              className="compacto:h-9"
              onClick={() => void cena?.enquadrar(true)}
            >
              <Maximize /> Enquadrar
            </Button>
            <Button
              size="xs"
              variant={ev.explodido ? "secondary" : "ghost"}
              aria-pressed={ev.explodido}
              className="compacto:h-9"
              onClick={() => mudarEstado({ explodido: !ev.explodido }, true)}
            >
              <MoveVertical /> Explodido
            </Button>
            <Button
              size="xs"
              variant="ghost"
              className="compacto:h-9"
              aria-expanded={painel}
              aria-controls="painel-3d"
              onClick={() => setPainel((p) => !p)}
            >
              <Layers /> {painel ? "Ocultar painel" : "Painel"}
            </Button>
          </div>
        </div>

        <Legenda
          modoCor={ev.modoCor}
          contagem={contagem}
          calculado={calculado}
          faixa={faixa}
          unidadeTexto={ev.modoCor === "estado" ? "" : GRANDEZAS[ev.modoCor].unidade(unidades)}
          converter={(v) =>
            ev.modoCor === "nkPilares"
              ? converter(v, "forca", unidades)
              : ev.modoCor === "momentoLajes"
                ? converter(v, "momentoLinear", unidades)
                : v
          }
          original={original && comDefeito.length > 0}
        />

        {sel && (
          <section
            aria-label={`Elemento selecionado: ${sel.nome}`}
            className="bg-background/95 compacto:max-h-[40%] absolute right-2 bottom-2 max-h-[45%] w-[min(24rem,calc(100%-1rem))] overflow-auto rounded-md border p-3 text-xs shadow-md"
          >
            <div className="flex items-start justify-between gap-2">
              <h2 className="text-sm font-semibold">
                {NOME_TIPO[sel.tipo]} {sel.nome}
              </h2>
              <Button
                size="icon-xs"
                variant="ghost"
                aria-label="Fechar seleção"
                onClick={() => cena?.selecionar(null)}
              >
                <X />
              </Button>
            </div>
            <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5">
              <dt className="text-muted-foreground">Nível</dt>
              <dd>{modelo.niveis[sel.nivel]?.nome ?? "—"}</dd>
              <dt className="text-muted-foreground">Seção</dt>
              <dd>{sel.secao}</dd>
              <dt className="text-muted-foreground">Situação</dt>
              <dd>
                <EstadoTexto estado={dadosSel?.estado ?? "sem"} />
              </dd>
              {dadosSel?.principal && (
                <>
                  <dt className="text-muted-foreground">Resultado</dt>
                  <dd className="tabular-nums">{dadosSel.principal}</dd>
                </>
              )}
            </dl>
            {sel.notas.length > 0 && (
              <ul className="text-muted-foreground mt-1 list-disc pl-4">
                {sel.notas.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            )}
            {original && (dadosSel?.defeitos.length ?? 0) > 0 && (
              <div className="mt-2 rounded border p-1.5" style={{ borderColor: COR_DEFEITO }}>
                <p className="font-semibold" style={{ color: COR_DEFEITO }}>
                  ! Afetado por defeito do SISTRUT original
                </p>
                <ul className="list-disc pl-4">
                  {dadosSel?.defeitos.map((d) => (
                    <li key={d}>{d}</li>
                  ))}
                </ul>
              </div>
            )}
            {(dadosSel?.mensagens.length ?? 0) > 0 && dadosSel?.estado !== "sem" && (
              <details className="mt-1">
                <summary className="cursor-pointer">Avisos ({dadosSel?.mensagens.length})</summary>
                <ul className="list-disc pl-4">
                  {dadosSel?.mensagens.map((m) => (
                    <li key={m}>{m}</li>
                  ))}
                </ul>
              </details>
            )}
            <div className="mt-2 flex flex-wrap gap-1">
              {(sel.tipo === "pilar" || sel.tipo === "fundacao") && (
                <Button
                  size="xs"
                  variant="outline"
                  onClick={() => irPara({ tipo: "elemento", chave: sel.chave })}
                >
                  Coluna inteira
                </Button>
              )}
              {sel.tipo !== "pilar" && sel.tipo !== "fundacao" && (
                <Button
                  size="xs"
                  variant="outline"
                  onClick={() => irPara({ tipo: "elemento", chave: sel.chave })}
                >
                  Isolar com vizinhos
                </Button>
              )}
              {verDe(sel) && (
                <>
                  <Button size="xs" variant="outline" onClick={() => aoVerNaPlanta(verDe(sel)!)}>
                    Ver na planta
                  </Button>
                  {calculado && (
                    <Button
                      size="xs"
                      variant="outline"
                      onClick={() => aoVerNosResultados(verDe(sel)!)}
                    >
                      Ver nos resultados
                    </Button>
                  )}
                </>
              )}
            </div>
          </section>
        )}
        <p role="status" aria-live="polite" className="sr-only">
          {sel
            ? `Selecionado: ${NOME_TIPO[sel.tipo]} ${sel.nome}, ${modelo.niveis[sel.nivel]?.nome ?? ""}`
            : ""}
        </p>
      </div>

      {painel && (
        <aside
          id="painel-3d"
          aria-label="Controles da vista 3D"
          className="compacto:w-full compacto:border-t compacto:border-l-0 grid w-80 shrink-0 content-start gap-4 overflow-auto border-l p-3 pb-20 text-xs 2xl:w-96"
        >
          <section className="grid gap-1.5">
            <h2 className="text-sm font-semibold">Partes</h2>
            <label className="grid gap-1">
              <span>Pavimento isolado</span>
              <select
                className="border-input bg-background h-9 rounded-md border px-2"
                value={ev.foco.tipo === "nivel" ? ev.foco.nivel : ""}
                onChange={(e) =>
                  irPara(
                    e.target.value === ""
                      ? { tipo: "todo" }
                      : { tipo: "nivel", nivel: Number(e.target.value) },
                  )
                }
              >
                <option value="">— prédio inteiro —</option>
                {modelo.niveis.toReversed().map((n) => (
                  <option key={n.chave} value={n.indice}>
                    {n.nome}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={ev.vizinhosTransparentes}
                onChange={(e) => mudarEstado({ vizinhosTransparentes: e.target.checked })}
              />
              Pavimentos de cima e de baixo em transparência
            </label>
            <label className="grid gap-1">
              <span>Pórtico (eixo da planta)</span>
              <select
                className="border-input bg-background h-9 rounded-md border px-2"
                value={ev.foco.tipo === "eixo" ? ev.foco.chave : ""}
                onChange={(e) =>
                  irPara(
                    e.target.value === ""
                      ? { tipo: "todo" }
                      : { tipo: "eixo", chave: e.target.value },
                  )
                }
              >
                <option value="">— nenhum —</option>
                {modelo.eixos.map((e) => (
                  <option key={e.chave} value={e.chave}>
                    {rotuloEixo(e)}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1">
              <span>Elemento (com os vizinhos)</span>
              <select
                className="border-input bg-background h-9 rounded-md border px-2"
                value={ev.foco.tipo === "elemento" ? ev.foco.chave : ""}
                onChange={(e) => {
                  const chave = e.target.value;
                  if (!chave) return irPara({ tipo: "todo" });
                  irPara({ tipo: "elemento", chave });
                  cena?.selecionar(chave);
                }}
              >
                <option value="">— nenhum —</option>
                {modelo.niveis.toReversed().map((n) => (
                  <optgroup key={n.chave} label={n.nome}>
                    {modelo.elementos
                      .filter((e) => e.nivel === n.indice && e.tipo !== "fundacao")
                      .map((e) => (
                        <option key={e.chave} value={e.chave}>
                          {NOME_TIPO[e.tipo]} {e.nome}
                        </option>
                      ))}
                  </optgroup>
                ))}
              </select>
            </label>
          </section>

          <section className="grid gap-1.5">
            <h2 className="text-sm font-semibold">Mostrar</h2>
            <div className="flex flex-wrap gap-1">
              {tiposPresentes.map((t) => {
                const oculto = ev.tiposOcultos.has(t);
                return (
                  <Button
                    key={t}
                    size="xs"
                    variant={oculto ? "outline" : "secondary"}
                    aria-pressed={!oculto}
                    className="compacto:h-9"
                    onClick={() => {
                      const s = new Set(ev.tiposOcultos);
                      if (oculto) s.delete(t);
                      else s.add(t);
                      mudarEstado({ tiposOcultos: s });
                    }}
                  >
                    {oculto ? <EyeOff /> : <Eye />}
                    {ROTULO_TIPO[t]}
                  </Button>
                );
              })}
            </div>
            <fieldset className="grid gap-0.5">
              <legend className="mb-0.5">Pavimentos</legend>
              {modelo.niveis.toReversed().map((n) => (
                <label key={n.chave} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={!ev.niveisOcultos.has(n.indice)}
                    onChange={(e) => {
                      const s = new Set(ev.niveisOcultos);
                      if (e.target.checked) s.delete(n.indice);
                      else s.add(n.indice);
                      mudarEstado({ niveisOcultos: s });
                    }}
                  />
                  <span className="flex-1">{n.nome}</span>
                  <span className="text-muted-foreground tabular-nums">
                    +{n.cota.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} m
                  </span>
                </label>
              ))}
            </fieldset>
          </section>

          <section className="grid gap-1.5">
            <h2 className="text-sm font-semibold">Cores</h2>
            <select
              aria-label="Cor dos elementos"
              className="border-input bg-background h-9 rounded-md border px-2"
              value={ev.modoCor}
              onChange={(e) => mudarEstado({ modoCor: e.target.value as ModoCor })}
            >
              <option value="estado">Situação do cálculo</option>
              {(Object.keys(GRANDEZAS) as GrandezaMapa[]).map((g) => (
                <option key={g} value={g} disabled={!calculado}>
                  {GRANDEZAS[g].rotulo}
                </option>
              ))}
            </select>
            {!calculado && (
              <p className="text-muted-foreground">
                {calculo.tipo === "erro"
                  ? `Cálculo com erro: ${calculo.mensagem}`
                  : "Sem cálculo: as peças ficam em cinza."}
              </p>
            )}
            {original && (
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={ev.marcas}
                  onChange={(e) => mudarEstado({ marcas: e.target.checked })}
                />
                Marcar (!) as peças afetadas por defeitos do original ({comDefeito.length})
              </label>
            )}
          </section>

          <section className="grid gap-1.5">
            <h2 className="text-sm font-semibold">Camadas</h2>
            <div className="flex flex-wrap gap-1">
              {CAMADAS.map((c) => {
                const ligada = camadasLigadas.includes(c.id);
                return (
                  <Button
                    key={c.id}
                    size="xs"
                    variant={ligada ? "secondary" : "outline"}
                    aria-pressed={ligada}
                    title={c.descricao}
                    disabled={carregando === c.id}
                    className="compacto:h-9"
                    onClick={() => void alternarCamada(c.id)}
                  >
                    {c.nome}
                  </Button>
                );
              })}
            </div>
            {ctx &&
              camadasLigadas.map((id) => {
                const Painel = ativas.current.get(id)?.camada.Painel as
                  | ComponentType<{ ctx: ContextoVista }>
                  | undefined;
                return Painel ? <Painel key={id} ctx={ctx} /> : null;
              })}
          </section>

          <section className="grid gap-1.5">
            <h2 className="text-sm font-semibold">Exportar</h2>
            <div className="flex flex-wrap gap-1">
              <Button
                size="xs"
                variant="outline"
                className="compacto:h-9"
                onClick={() => void exportarPng()}
              >
                <Download /> PNG da vista
              </Button>
              <Button
                size="xs"
                variant="outline"
                className="compacto:h-9"
                onClick={() => void exportarGlb()}
              >
                <Download /> glTF (.glb)
              </Button>
            </div>
          </section>

          {original && comDefeito.length > 0 && (
            <section className="grid gap-1">
              <h2 className="text-sm font-semibold">Defeitos do original ({comDefeito.length})</h2>
              <ul className="grid gap-0.5">
                {comDefeito.map((e) => (
                  <li key={e.chave}>
                    <button
                      type="button"
                      className="hover:bg-accent w-full rounded px-1 py-0.5 text-left"
                      onClick={() => {
                        irPara({ tipo: "elemento", chave: e.chave });
                        cena?.selecionar(e.chave);
                      }}
                    >
                      <span className="font-semibold" style={{ color: COR_DEFEITO }}>
                        !
                      </span>{" "}
                      {NOME_TIPO[e.tipo]} {e.nome} · {modelo.niveis[e.nivel]?.nome}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {comFalha.length > 0 && (
            <section className="grid gap-1">
              <h2 className="text-sm font-semibold">Peças com falha ({comFalha.length})</h2>
              <ul className="grid gap-0.5">
                {comFalha.map((e) => (
                  <li key={e.chave}>
                    <button
                      type="button"
                      className="hover:bg-accent w-full rounded px-1 py-0.5 text-left"
                      onClick={() => {
                        irPara({ tipo: "elemento", chave: e.chave });
                        cena?.selecionar(e.chave);
                      }}
                    >
                      {NOME_TIPO[e.tipo]} {e.nome} · {modelo.niveis[e.nivel]?.nome}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {modelo.avisos.length > 0 && (
            <section className="grid gap-1">
              <h2 className="text-sm font-semibold">Montagem do modelo</h2>
              <ul className="text-muted-foreground list-disc pl-4">
                {modelo.avisos.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            </section>
          )}

          <p className="text-muted-foreground">
            A vista 3D é um apoio visual: as seções e os resultados de cada peça estão nas abas
            Planta e Resultados. Arraste para girar, use a roda ou a pinça para aproximar e o botão
            direito ou dois dedos para mover. Com o desenho em foco, as setas do teclado movem a
            vista.
          </p>
        </aside>
      )}
    </div>
  );
}

function EstadoTexto({ estado }: { estado: Estado }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span
        aria-hidden
        className="inline-block size-2.5 rounded-sm border"
        style={{ background: estado === "sem" ? NEUTRO.viga : COR_ESTADO[estado] }}
      />
      {ROTULO_ESTADO[estado]}
    </span>
  );
}

function Legenda({
  modoCor,
  contagem,
  calculado,
  faixa,
  unidadeTexto,
  converter,
  original,
}: {
  modoCor: ModoCor;
  contagem: Record<Estado, number>;
  calculado: boolean;
  faixa: { min: number; max: number } | undefined;
  unidadeTexto: string;
  converter: (v: number) => number;
  original: boolean;
}) {
  const num = (v: number) => converter(v).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  return (
    <div
      aria-label="Legenda das cores"
      className="bg-background/85 absolute bottom-2 left-2 grid max-w-[min(18rem,calc(100%-1rem))] gap-1 rounded-md border p-2 text-[11px] shadow-sm"
    >
      {modoCor === "estado" ? (
        <ul className="grid gap-0.5">
          <li className="font-semibold">Lajes, vigas e pilares por situação</li>
          {(["ok", "aviso", "falha", "sem"] as const)
            .filter((e) => calculado || e === "sem")
            .map((e) => (
              <li key={e} className="flex items-center gap-1.5">
                <EstadoTexto estado={e} />
                <span className="text-muted-foreground tabular-nums">({contagem[e]})</span>
              </li>
            ))}
        </ul>
      ) : (
        <div className="grid gap-0.5">
          <span className="font-semibold">
            {GRANDEZAS[modoCor].rotulo} ({unidadeTexto})
          </span>
          <span
            aria-hidden
            className="h-2.5 w-40 rounded-sm border"
            style={{ background: `linear-gradient(to right, ${RAMPA.join(", ")})` }}
          />
          <span className="flex justify-between tabular-nums">
            <span>{faixa ? num(faixa.min) : "—"}</span>
            <span>{faixa ? num(faixa.max) : "—"}</span>
          </span>
          <span className="text-muted-foreground">Outros tipos transparentes.</span>
        </div>
      )}
      {original && (
        <span className="flex items-center gap-1">
          <span className="rounded px-1 font-bold text-white" style={{ background: COR_DEFEITO }}>
            !
          </span>{" "}
          afetado por defeito do original (não é falha)
        </span>
      )}
    </div>
  );
}
