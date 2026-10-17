// Editor dos dados do pavimento que o SISTRUT (NB-1/78) lê do LAJEGEOM e do LAJECALC:
// cargas de ocupação por área, alvenarias em qualquer posição, trechos de pilar-parede e
// as continuidades confirmadas no LAJECALC 1. Abre pelo painel da planta (sem seleção);
// grava tudo no Aplicar (uma entrada no desfazer).
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Laje, Pavimento } from "../../../dominio/obra";
import { substituirPavimento } from "../../../planta/edicao";
import { CampoForm, DialogoEditor, Grupo, RodapeEditor, TabelaEditavel, useAplicar } from "./comum";
import {
  acidentalAcimaDoTotal,
  type FormCarga,
  type FormPavimento,
  formDoPavimento,
  ladosDaLaje,
  lajesComPoligono,
  type LinhaContinuidade,
  novaAlvenaria,
  novaCarga,
  novaContinuidade,
  novoTrecho,
  novoVertice,
  pavimentoDoForm,
  verticesDaLaje,
} from "./pavimento";

const contagem = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/** Resumo do que o pavimento tem de dados do SISTRUT, para o painel da planta. */
export function resumoPavimento(p: Pavimento): string {
  const partes: string[] = [];
  const add = (n: number | undefined, um: string, varios: string) => {
    if (n) partes.push(contagem(n, um, varios));
  };
  add(p.cargasOcupacao?.length, "carga de ocupação", "cargas de ocupação");
  add(p.alvenarias?.length, "alvenaria", "alvenarias");
  add(p.trechosPilares?.length, "pilar-parede", "pilares-parede");
  add(p.continuidadesLajes?.length, "continuidade", "continuidades");
  return partes.length > 0 ? partes.join(" · ") : "sem dados do SISTRUT do pavimento";
}

/** Botão do painel da planta e o diálogo do editor. */
export function EditorPavimento({ pav }: { pav: Pavimento }) {
  const [aberto, setAberto] = useState(false);
  return (
    <DialogoEditor
      aberto={aberto}
      aoMudarAberto={setAberto}
      titulo={`Pavimento ${pav.nome}: dados do LAJEGEOM e do LAJECALC`}
      descricao={
        <>
          Dados que o usuário do SISTRUT digitava no LAJEGEOM 3 e no LAJECALC 1. Valem nos dois
          modos do cálculo pela NB-1/78 (corrigido e original); a NBR 6118 não os lê. Coordenadas em
          m, na planta.
        </>
      }
      gatilho={
        <button
          type="button"
          className="w-full rounded border border-border px-2 py-1 text-xs hover:bg-accent"
        >
          Cargas e continuidades do pavimento…
        </button>
      }
    >
      <FormularioPavimento pav={pav} fechar={() => setAberto(false)} />
    </DialogoEditor>
  );
}

function FormularioPavimento({ pav, fechar }: { pav: Pavimento; fechar: () => void }) {
  const [f, setF] = useState(() => formDoPavimento(pav));
  const muda: Muda = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const { erros, aplicar } = useAplicar(fechar);

  const aoAplicar = () =>
    aplicar((obra) => {
      const p = obra.pavimentos.find((x) => x.id === pav.id);
      if (!p) return ["O pavimento não existe mais na obra."];
      const r = pavimentoDoForm(f, p);
      return Array.isArray(r) ? r : substituirPavimento(obra, p.id, r);
    });

  return (
    <div className="flex min-h-0 flex-col gap-3">
      <Tabs defaultValue="cargas" className="min-h-0 flex-1">
        <TabsList variant="line">
          <TabsTrigger value="cargas">Cargas de ocupação</TabsTrigger>
          <TabsTrigger value="alvenarias">Alvenarias</TabsTrigger>
          <TabsTrigger value="pilares">Pilares-parede</TabsTrigger>
          <TabsTrigger value="continuidades">Continuidades</TabsTrigger>
        </TabsList>
        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          <TabsContent value="cargas" className="grid gap-3">
            <AbaCargas f={f} muda={muda} pav={pav} />
          </TabsContent>
          <TabsContent value="alvenarias" className="grid gap-3">
            <AbaAlvenarias f={f} muda={muda} />
          </TabsContent>
          <TabsContent value="pilares" className="grid gap-3">
            <AbaPilares f={f} muda={muda} pav={pav} />
          </TabsContent>
          <TabsContent value="continuidades" className="grid gap-3">
            <AbaContinuidades f={f} muda={muda} pav={pav} />
          </TabsContent>
        </div>
      </Tabs>
      <RodapeEditor erros={erros} aoCancelar={fechar} aoAplicar={aoAplicar} />
    </div>
  );
}

type Muda = <K extends keyof FormPavimento>(k: K, v: FormPavimento[K]) => void;

const rotulo = (base: string) => (i: number) => `${base} ${i + 1}`;

function AbaCargas({ f, muda, pav }: { f: FormPavimento; muda: Muda; pav: Pavimento }) {
  const mudaCarga = (i: number, c: FormCarga) =>
    muda(
      "cargas",
      f.cargas.map((x, k) => (k === i ? c : x)),
    );
  return (
    <>
      <p className="text-muted-foreground text-xs">
        Cargas por área do LAJEGEOM 3, cada uma com o seu polígono (vértices em qualquer sentido),
        além da sobrecarga de cada laje. Onde os polígonos se sobrepõem, as cargas se somam. O total
        inclui a acidental.
      </p>
      {f.cargas.length === 0 && (
        <p className="text-muted-foreground text-xs">Nenhuma carga de ocupação.</p>
      )}
      {f.cargas.map((c, i) => (
        <EditorCarga
          key={i}
          indice={i}
          carga={c}
          lajes={pav.lajes}
          aoMudar={(x) => mudaCarga(i, x)}
          aoRemover={() =>
            muda(
              "cargas",
              f.cargas.filter((_, k) => k !== i),
            )
          }
        />
      ))}
      <div>
        <Button
          variant="outline"
          size="xs"
          onClick={() => muda("cargas", [...f.cargas, novaCarga()])}
        >
          <Plus /> Acrescentar carga de ocupação
        </Button>
      </div>
    </>
  );
}

function EditorCarga({
  indice,
  carga,
  lajes,
  aoMudar,
  aoRemover,
}: {
  indice: number;
  carga: FormCarga;
  lajes: readonly Laje[];
  aoMudar: (c: FormCarga) => void;
  aoRemover: () => void;
}) {
  const nome = `Carga de ocupação ${indice + 1}`;
  const [lajeId, setLajeId] = useState(lajes[0]?.id ?? "");
  const laje = lajes.find((l) => l.id === lajeId);
  return (
    <Grupo titulo={nome}>
      <div className="flex flex-wrap items-end gap-3">
        <CampoForm
          rotulo="Total"
          unidade="kN/m²"
          valor={carga.total}
          aoMudar={(v) => aoMudar({ ...carga, total: v })}
          className="w-32"
        />
        <CampoForm
          rotulo="Acidental"
          unidade="kN/m²"
          valor={carga.acidental}
          aoMudar={(v) => aoMudar({ ...carga, acidental: v })}
          className="w-32"
        />
        <div className="ml-auto">
          <Button variant="ghost" size="xs" aria-label={`Remover ${nome}`} onClick={aoRemover}>
            <Trash2 /> Remover carga
          </Button>
        </div>
      </div>
      {acidentalAcimaDoTotal(carga) && (
        <p className="text-aviso text-xs">
          A acidental passa do total: o total inclui a acidental, e a parte permanente fica
          negativa.
        </p>
      )}
      {lajes.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <select
            aria-label={`${nome}, laje para preencher os vértices`}
            value={lajeId}
            onChange={(e) => setLajeId(e.target.value)}
            className="border-input dark:bg-input/30 h-7 rounded-md border bg-transparent px-1.5 text-xs"
          >
            {lajes.map((l) => (
              <option key={l.id} value={l.id} className="bg-background">
                {l.nome}
              </option>
            ))}
          </select>
          <Button
            variant="outline"
            size="xs"
            disabled={!laje}
            onClick={() => laje && aoMudar({ ...carga, vertices: verticesDaLaje(laje) })}
          >
            Usar o contorno da laje
          </Button>
          <span className="text-muted-foreground">
            o polígono da laje, ou o retângulo dela se não tem polígono
          </span>
        </div>
      )}
      <TabelaEditavel
        titulo={`Vértices da ${nome.toLowerCase()}`}
        colunas={[
          { chave: "x", rotulo: "x", unidade: "m" },
          { chave: "y", rotulo: "y", unidade: "m" },
        ]}
        linhas={carga.vertices}
        aoMudar={(v) => aoMudar({ ...carga, vertices: v })}
        novaLinha={novoVertice}
        rotuloLinha={rotulo("Vértice")}
        vazio="Nenhum vértice: são precisos ao menos 3."
      />
    </Grupo>
  );
}

function AbaAlvenarias({ f, muda }: { f: FormPavimento; muda: Muda }) {
  return (
    <Grupo
      titulo="Alvenarias (LAJEGEOM 3)"
      extra="Trechos de alvenaria em qualquer posição, além da carga linear de cada viga. Sobre uma viga, a carga vai para a viga; sobre a laje, entra na carga dela e a montagem a distribui pela posição."
    >
      <TabelaEditavel
        titulo="Alvenarias"
        colunas={[
          { chave: "x1", rotulo: "Início x", unidade: "m" },
          { chave: "y1", rotulo: "Início y", unidade: "m" },
          { chave: "x2", rotulo: "Fim x", unidade: "m" },
          { chave: "y2", rotulo: "Fim y", unidade: "m" },
          { chave: "carga", rotulo: "Carga", unidade: "kN/m" },
        ]}
        linhas={f.alvenarias}
        aoMudar={(l) => muda("alvenarias", l)}
        novaLinha={novaAlvenaria}
        rotuloLinha={rotulo("Alvenaria")}
        vazio="Nenhuma alvenaria."
      />
    </Grupo>
  );
}

function AbaPilares({ f, muda, pav }: { f: FormPavimento; muda: Muda; pav: Pavimento }) {
  const ids = new Set(pav.pilares.map((p) => p.id));
  // trecho que aponta para um pilar que sumiu continua visível, para o usuário decidir
  const perdidos = [...new Set(f.trechos.map((t) => t.pilar))].filter(
    (id) => id !== "" && !ids.has(id),
  );
  return (
    <Grupo
      titulo="Trechos de pilar-parede (LAJEGEOM)"
      extra="O pilar da planta fica no centro do trecho, com a seção b × h; a montagem do SISTRUT usa o trecho: o bordo de laje e a alvenaria sobre ele vão ao pilar, e as vigas se apoiam nele em cada ponto do eixo que cai no trecho. Sem trechos, todos os pilares são pontuais."
    >
      {pav.pilares.length === 0 && f.trechos.length === 0 ? (
        <p className="text-muted-foreground text-xs">O pavimento não tem pilares.</p>
      ) : (
        <TabelaEditavel
          titulo="Trechos de pilar-parede"
          colunas={[
            {
              chave: "pilar",
              rotulo: "Pilar",
              tipo: [
                { valor: "", rotulo: "escolha…" },
                ...pav.pilares.map((p) => ({ valor: p.id, rotulo: p.nome })),
                ...perdidos.map((id) => ({ valor: id, rotulo: `${id} (não existe)` })),
              ],
            },
            { chave: "x1", rotulo: "Início x", unidade: "m" },
            { chave: "y1", rotulo: "Início y", unidade: "m" },
            { chave: "x2", rotulo: "Fim x", unidade: "m" },
            { chave: "y2", rotulo: "Fim y", unidade: "m" },
          ]}
          linhas={f.trechos}
          aoMudar={(l) => muda("trechos", l)}
          novaLinha={novoTrecho}
          rotuloLinha={rotulo("Pilar-parede")}
          vazio="Nenhum pilar-parede: todos os pilares são pontuais."
        />
      )}
    </Grupo>
  );
}

function AbaContinuidades({ f, muda, pav }: { f: FormPavimento; muda: Muda; pav: Pavimento }) {
  const comPoligono = lajesComPoligono(pav);
  const mudaLinha = (i: number, c: LinhaContinuidade) =>
    muda(
      "continuidades",
      f.continuidades.map((x, k) => (k === i ? c : x)),
    );
  return (
    <Grupo
      titulo="Continuidades confirmadas no LAJECALC 1"
      extra="Cada linha liga um lado do polígono de uma laje ao lado de outra, ou é um trecho engastado sem vizinha (sem laje B). Com a lista, a continuidade automática não roda e os vínculos engastado/apoiado das lajes não entram: valem estas linhas, os lados livres e os coeficientes dos lados. Lista vazia = a continuidade automática."
    >
      {comPoligono.length === 0 && (
        <p className="text-aviso text-xs">
          Nenhuma laje deste pavimento tem polígono. As continuidades ligam lados do polígono da
          laje; o polígono se edita no editor da laje.
        </p>
      )}
      {f.continuidades.length === 0 ? (
        <p className="text-muted-foreground text-xs">
          Nenhuma continuidade: roda a continuidade automática.
        </p>
      ) : (
        <div role="group" aria-label="Continuidades" className="grid gap-1">
          {f.continuidades.map((c, i) => (
            <LinhaContinuidadeEditor
              key={i}
              indice={i}
              linha={c}
              pav={pav}
              comPoligono={comPoligono}
              aoMudar={(x) => mudaLinha(i, x)}
              aoRemover={() =>
                muda(
                  "continuidades",
                  f.continuidades.filter((_, k) => k !== i),
                )
              }
            />
          ))}
        </div>
      )}
      <div>
        <Button
          variant="outline"
          size="xs"
          disabled={comPoligono.length === 0}
          onClick={() =>
            muda("continuidades", [...f.continuidades, novaContinuidade(comPoligono[0]?.id)])
          }
        >
          <Plus /> Acrescentar continuidade
        </Button>
      </div>
    </Grupo>
  );
}

const CLASSE_SELECT =
  "border-input dark:bg-input/30 h-7 rounded-md border bg-transparent pr-6 pl-1 text-xs disabled:opacity-50";

function LinhaContinuidadeEditor({
  indice,
  linha,
  pav,
  comPoligono,
  aoMudar,
  aoRemover,
}: {
  indice: number;
  linha: LinhaContinuidade;
  pav: Pavimento;
  comPoligono: readonly Laje[];
  aoMudar: (c: LinhaContinuidade) => void;
  aoRemover: () => void;
}) {
  const nome = `Continuidade ${indice + 1}`;
  /** Opções de laje: as com polígono e, se a da linha não está entre elas, ela marcada. */
  const opcoesLaje = (id: string) => {
    const lista = comPoligono.map((l) => ({ valor: l.id, rotulo: l.nome }));
    if (id !== "" && !comPoligono.some((l) => l.id === id)) {
      const l = pav.lajes.find((x) => x.id === id);
      lista.push({ valor: id, rotulo: l ? `${l.nome} (sem polígono)` : `${id} (não existe)` });
    }
    return lista;
  };
  /** Opções de lado da laje e, se o da linha não existe, ele marcado. */
  const opcoesLado = (lajeId: string, lado: string) => {
    const laje = pav.lajes.find((x) => x.id === lajeId);
    const lista = (laje ? ladosDaLaje(laje) : []).map((r, k) => ({ valor: String(k), rotulo: r }));
    if (!lista.some((o) => o.valor === lado))
      lista.push({ valor: lado, rotulo: `lado ${lado} (não existe)` });
    return lista;
  };
  const semVizinha = linha.lajeB === "";
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="w-24 whitespace-nowrap">{nome}</span>
      <Seletor
        rotulo={`${nome}, laje A`}
        valor={linha.lajeA}
        opcoes={[{ valor: "", rotulo: "escolha…" }, ...opcoesLaje(linha.lajeA)]}
        aoMudar={(v) => aoMudar({ ...linha, lajeA: v, ladoA: "0" })}
      />
      <Seletor
        rotulo={`${nome}, lado A`}
        valor={linha.ladoA}
        opcoes={opcoesLado(linha.lajeA, linha.ladoA)}
        aoMudar={(v) => aoMudar({ ...linha, ladoA: v })}
      />
      <span className="text-muted-foreground">continua com</span>
      <Seletor
        rotulo={`${nome}, laje B`}
        valor={linha.lajeB}
        opcoes={[
          { valor: "", rotulo: "nenhuma: engastado sem vizinha" },
          ...opcoesLaje(linha.lajeB),
        ]}
        aoMudar={(v) => aoMudar({ ...linha, lajeB: v, ladoB: "0" })}
      />
      <Seletor
        rotulo={`${nome}, lado B`}
        valor={semVizinha ? "" : linha.ladoB}
        opcoes={semVizinha ? [{ valor: "", rotulo: "—" }] : opcoesLado(linha.lajeB, linha.ladoB)}
        desabilitado={semVizinha}
        aoMudar={(v) => aoMudar({ ...linha, ladoB: v })}
      />
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={`Remover ${nome}`}
        title="Remover"
        onClick={aoRemover}
      >
        <Trash2 />
      </Button>
    </div>
  );
}

/** Select nativo sem rótulo visível (o nome acessível vem de `rotulo`). */
function Seletor({
  rotulo,
  valor,
  opcoes,
  aoMudar,
  desabilitado = false,
}: {
  rotulo: string;
  valor: string;
  opcoes: readonly { valor: string; rotulo: string }[];
  aoMudar: (v: string) => void;
  desabilitado?: boolean;
}) {
  return (
    <select
      aria-label={rotulo}
      value={valor}
      disabled={desabilitado}
      onChange={(e) => aoMudar(e.target.value)}
      className={CLASSE_SELECT}
    >
      {opcoes.map((o) => (
        <option key={o.valor} value={o.valor} className="bg-background">
          {o.rotulo}
        </option>
      ))}
    </select>
  );
}
