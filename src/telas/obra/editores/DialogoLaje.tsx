// Editor dos dados de laje do SISTRUT (NB-1/78) que a planta não mostra: tipo do LAJEGEOM,
// ângulo da armadura (ou das nervuras), grupo, μ informado e positivas impostas no
// LAJEPROC; e o polígono do LAJEGEOM com o vínculo, a negativa imposta e o i de cada lado.
// Abre pelo painel de propriedades da laje; grava tudo no Aplicar (uma entrada no desfazer).
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Laje, Pavimento, TipoLaje } from "../../../dominio/obra";
import { substituirPavimento } from "../../../planta/edicao";
import {
  CampoForm,
  type Coluna,
  DialogoEditor,
  Escolha,
  Grupo,
  opcoesTri,
  RodapeEditor,
  TabelaEditavel,
  useAplicar,
} from "./comum";
import { textoDe } from "./formulario";
import {
  type CampoLado,
  type FormLaje,
  formDaLaje,
  lajeDoForm,
  linhaDoRetangulo,
  linhaLado,
  pavimentoComLaje,
  rotuloAngulo,
} from "./laje";

export { resumoLaje } from "./laje";

/** Botão do painel da laje e o diálogo do editor. */
export function EditorLaje({ pav, laje }: { pav: Pavimento; laje: Laje }) {
  const [aberto, setAberto] = useState(false);
  return (
    <DialogoEditor
      aberto={aberto}
      aoMudarAberto={setAberto}
      titulo={`Laje ${laje.nome}: dados do LAJEGEOM, LAJECALC e LAJEPROC`}
      descricao={
        <>
          Dados que o usuário do SISTRUT digitava no LAJEGEOM, no LAJECALC e no LAJEPROC. Valem nos
          dois modos do cálculo pela NB-1/78 (nenhum é só do original); a NBR 6118 os ignora. Campo
          vazio vale o padrão.
        </>
      }
      gatilho={
        <button
          type="button"
          className="w-full rounded border border-slate-600 px-2 py-1 text-xs hover:bg-slate-800"
        >
          Dados do SISTRUT da laje…
        </button>
      }
    >
      <FormularioLaje pav={pav} laje={laje} fechar={() => setAberto(false)} />
    </DialogoEditor>
  );
}

function FormularioLaje({ pav, laje, fechar }: { pav: Pavimento; laje: Laje; fechar: () => void }) {
  const [f, setF] = useState(() => formDaLaje(laje));
  const muda = <K extends keyof FormLaje>(k: K, v: FormLaje[K]) => setF((x) => ({ ...x, [k]: v }));
  const { erros, aplicar } = useAplicar(fechar);

  const aoAplicar = () =>
    aplicar((obra) => {
      const p = obra.pavimentos.find((x) => x.id === pav.id);
      const atual = p?.lajes.find((l) => l.id === laje.id);
      if (!p || !atual) return ["A laje não existe mais na obra."];
      const r = lajeDoForm(f, atual);
      if (Array.isArray(r)) return r;
      const e = pavimentoComLaje(p, r);
      if (!e.ok) return [e.erro];
      return substituirPavimento(obra, p.id, e.pavimento);
    });

  return (
    <div className="flex min-h-0 flex-col gap-3">
      <Tabs defaultValue="tipo" className="min-h-0 flex-1">
        <TabsList variant="line">
          <TabsTrigger value="tipo">Tipo e armadura</TabsTrigger>
          <TabsTrigger value="poligono">Polígono e lados</TabsTrigger>
        </TabsList>
        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          <TabsContent value="tipo" className="grid gap-3">
            <AbaTipo f={f} muda={muda} laje={laje} />
          </TabsContent>
          <TabsContent value="poligono" className="grid gap-3">
            <AbaPoligono f={f} muda={muda} laje={laje} />
          </TabsContent>
        </div>
      </Tabs>
      <RodapeEditor erros={erros} aoCancelar={fechar} aoAplicar={aoAplicar} />
    </div>
  );
}

type Muda = <K extends keyof FormLaje>(k: K, v: FormLaje[K]) => void;

const OPCOES_TIPO = [
  { valor: "macica", rotulo: "maciça (0, o padrão)" },
  { valor: "pre-moldada", rotulo: "pré-moldada (1)" },
  { valor: "comum-nao-calculada", rotulo: "comum não calculada (3)" },
] as const satisfies readonly { valor: TipoLaje; rotulo: string }[];

const NOTA_TIPO: Record<TipoLaje, string> = {
  macica: "O LAJECALC calcula e o LAJEPROC arma.",
  "pre-moldada":
    "O LAJECALC não calcula nem impõe H; a montagem leva a carga às vigas na direção das nervuras, sem peso próprio da laje (ele vai na carga permanente). Não liga continuidade: engaste forçado é ignorado, com aviso.",
  "comum-nao-calculada":
    "O LAJECALC calcula e o LAJEPROC não arma. Não liga continuidade: engaste forçado é ignorado, com aviso.",
};

const PADRAO_ANGULO: Record<TipoLaje, string> = {
  macica: "0",
  "pre-moldada": "0",
  "comum-nao-calculada": "−1 (sem direção)",
};

const rotulos = (nomes: readonly string[]) => (i: number) => nomes[i] ?? `Linha ${i + 1}`;

function AbaTipo({ f, muda, laje }: { f: FormLaje; muda: Muda; laje: Laje }) {
  const mu = textoDe(laje.mu);
  return (
    <>
      <Grupo titulo="Tipo da laje (LAJEGEOM)" extra={NOTA_TIPO[f.tipo]}>
        <Escolha
          rotulo="Tipo"
          valor={f.tipo}
          opcoes={OPCOES_TIPO}
          aoMudar={(v) => muda("tipo", v)}
          className="max-w-xs"
        />
      </Grupo>
      <div className="grid grid-cols-2 gap-3">
        <Grupo
          titulo={
            f.tipo === "pre-moldada" ? "Direção das nervuras (LAJEGEOM)" : "Direção (LAJECALC 2)"
          }
          extra={
            f.tipo === "pre-moldada"
              ? "Inclinação das nervuras, que a montagem usa para levar a carga às vigas. Vazio = 0."
              : "Ângulo da armadura principal com o eixo x, 0 a 180° (sem o 180). Vazio = 0 na maciça e −1 (sem <D>ireção) na comum não calculada."
          }
        >
          <CampoForm
            rotulo={rotuloAngulo(f.tipo)}
            unidade="graus"
            padrao={PADRAO_ANGULO[f.tipo]}
            valor={f.anguloArmadura}
            aoMudar={(v) => muda("anguloArmadura", v)}
            className="max-w-48"
          />
        </Grupo>
        <Grupo
          titulo="Grupo (LAJEGEOM)"
          extra="A continuidade automática só liga lajes do mesmo grupo. Vazio = 0."
        >
          <CampoForm
            rotulo="Grupo"
            padrao="0"
            valor={f.grupo}
            aoMudar={(v) => muda("grupo", v)}
            className="max-w-48"
          />
        </Grupo>
      </div>
      <Grupo
        titulo="μ informado (<R>elação do LAJECALC 2)"
        extra={
          <>
            μ desta laje: {mu} (muda-se no painel). A marca só faz diferença com μ = 1: sem ela, μ =
            1 quer dizer "não informado" (o LAJECALC 2 tira o μ das cordas na maciça e deixa 0 na
            comum não calculada); com ela, o 1 vale como informado. Na pré-moldada o μ não entra.
          </>
        }
      >
        <Escolha
          rotulo="μ = 1 informado"
          valor={f.muInformado}
          opcoes={opcoesTri(false, "sim: o μ vale como informado", "não")}
          aoMudar={(v) => muda("muInformado", v)}
          className="max-w-xs"
        />
      </Grupo>
      <Grupo
        titulo="Positivas impostas (LAJEPROC)"
        extra="Bitola e espaçamento da armadura positiva que o usuário impõe: o LAJEPROC a mantém se basta. Vazio = a escolha do LAJEPROC."
      >
        <TabelaEditavel
          titulo="Positivas impostas"
          colunas={[
            { chave: "bitola", rotulo: "Bitola", unidade: "mm" },
            { chave: "espacamento", rotulo: "Espaçamento", unidade: "cm" },
          ]}
          linhas={f.armaduraImposta}
          aoMudar={(l) => {
            const [p, s] = l;
            if (p && s) muda("armaduraImposta", [p, s]);
          }}
          rotuloLinha={rotulos(["Principal", "Secundária"])}
        />
      </Grupo>
    </>
  );
}

const COLUNAS_LADO: readonly Coluna<CampoLado>[] = [
  { chave: "x", rotulo: "x", unidade: "m" },
  { chave: "y", rotulo: "y", unidade: "m" },
  {
    chave: "vinculo",
    rotulo: "Vínculo do lado",
    tipo: [
      { valor: "", rotulo: "pela vizinhança" },
      { valor: "engastado", rotulo: "engastado" },
      { valor: "apoiado", rotulo: "apoiado" },
      { valor: "livre", rotulo: "livre" },
    ],
  },
  { chave: "negBitola", rotulo: "Negativa imposta φ", unidade: "mm", largura: "w-16" },
  {
    chave: "negEspacamento",
    rotulo: "Negativa imposta espaçamento",
    unidade: "cm",
    largura: "w-16",
  },
  { chave: "coeficiente", rotulo: "i (Mneg/Mpos)", largura: "w-16" },
];

const AVISO_CONTINUIDADE =
  "Com polígono explícito, o motor não acrescenta aos lados os cantos das lajes vizinhas: a continuidade automática só liga lados com os mesmos dois vértices. Os resultados podem mudar.";

function AbaPoligono({ f, muda, laje }: { f: FormLaje; muda: Muda; laje: Laje }) {
  if (!f.comPoligono)
    return (
      <Grupo titulo="Polígono (LAJEGEOM)">
        <p className="text-xs">
          Esta laje é o retângulo da planta: x {textoDe(laje.x)} m, y {textoDe(laje.y)} m,{" "}
          {textoDe(laje.lx)} × {textoDe(laje.ly)} m. O vínculo, a negativa imposta e o i por lado só
          existem com polígono, um por lado; sem ele valem os vínculos por bordo do painel.
        </p>
        <p className="text-aviso text-xs">{AVISO_CONTINUIDADE}</p>
        <div>
          <Button
            variant="outline"
            size="xs"
            onClick={() => {
              muda("lados", linhaDoRetangulo(laje));
              muda("comPoligono", true);
            }}
          >
            Criar polígono a partir do retângulo
          </Button>
        </div>
      </Grupo>
    );
  return (
    <Grupo
      titulo="Polígono (LAJEGEOM) e lados (LAJECALC 1)"
      extra={
        <>
          Vértices em sentido horário (o LAJEGEOM só aceita o horário). Cada linha é um vértice e o
          lado que sai dele: o lado k vai do vértice k ao k+1, e o último fecha no primeiro. x, y,
          lx e ly da laje passam a ser o retângulo envolvente, que a planta e a NBR 6118 usam. Com
          polígono, os vínculos por bordo do painel não valem. Vínculo: engastado num lado sem
          vizinha é trecho engastado. Negativa imposta (LAJECALC): a otimização reduz o i até ela
          bastar; os dois campos vazios = nenhuma. i: o do &lt;A&gt;ltera, num lado engastado; vazio
          = o máximo do .LAP.
        </>
      }
    >
      {!laje.poligono && <p className="text-aviso text-xs">{AVISO_CONTINUIDADE}</p>}
      <TabelaEditavel
        titulo="Polígono"
        colunas={COLUNAS_LADO}
        linhas={f.lados}
        aoMudar={(l) => muda("lados", l)}
        novaLinha={linhaLado}
        rotuloLinha={(i) => `Vértice ${i + 1}`}
        vazio="Nenhum vértice."
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="xs"
          onClick={() => {
            muda("comPoligono", false);
            muda("lados", []);
          }}
        >
          Remover o polígono
        </Button>
        <span className="text-muted-foreground text-xs">
          A laje volta ao retângulo envolvente, e o vínculo, a negativa e o i por lado somem.
        </span>
      </div>
    </Grupo>
  );
}
