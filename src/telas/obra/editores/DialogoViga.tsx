// Editor da entrada de viga do VIGA e do DESENHO do SISTRUT (NB-1/78): cargas da viga,
// seções por trecho (seção T) e fôrma, vãos, J, engastes e apoios, as opções da rodada
// ("Continuo com o processamento", "apoia em", repetições) e a armadura alterada no DESDIM.
// Abre pelo painel de propriedades da viga; grava tudo no Aplicar (uma entrada no desfazer).
import { useMemo, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Pavimento, Viga } from "../../../dominio/obra";
import { substituirPavimento } from "../../../planta/edicao";
import { useObra } from "../../../estado/obra";
import {
  CampoForm,
  type Coluna,
  DialogoEditor,
  Escolha,
  Grupo,
  MarcaOriginal,
  opcoesTri,
  RodapeEditor,
  TabelaEditavel,
  useAplicar,
} from "./comum";
import {
  ABAS_VIGA,
  type AbaViga,
  abasComErro,
  type CampoArmadura,
  type Engaste,
  type FormViga,
  formDaViga,
  type GeometriaEditor,
  geometriaDaViga,
  type LajesNoCorte,
  linhaArmadura,
  linhaConcentrada,
  linhaDistribuida,
  linhaReacao,
  TIPOS_APOIO_FORMA,
  vigaDoForm,
  vigasQueCruzam,
} from "./viga";

/** Resumo do que a viga tem de entrada do SISTRUT, para o painel ("2 cargas · seção T"). */
export function resumoViga(v: Viga): string {
  const partes: string[] = [];
  const n = v.cargas?.length ?? 0;
  if (n > 0) partes.push(`${n} carga${n > 1 ? "s" : ""}`);
  if (v.somenteCargasProprias) partes.push("só cargas próprias");
  if (v.secoes?.trechos?.some((t) => t.bf > 0 && t.hf > 0)) partes.push("seção T");
  else if (v.secoes) partes.push("seção por trecho");
  if (v.vaos || v.inercias || v.engaste || v.momentosExternos) partes.push("vãos/apoios digitados");
  if (v.continuaSeExcederLimite) partes.push("continua acima do limite");
  if (v.apoiaEm?.length) partes.push("apoia em viga");
  if (v.armaduraDigitada?.length) partes.push("armadura alterada");
  return partes.length > 0 ? partes.join(" · ") : "sem dados do SISTRUT (valem os da planta)";
}

/** Botão do painel da viga e o diálogo do editor. */
export function EditorViga({ pav, viga }: { pav: Pavimento; viga: Viga }) {
  const [aberto, setAberto] = useState(false);
  return (
    <DialogoEditor
      aberto={aberto}
      aoMudarAberto={setAberto}
      titulo={`Viga ${viga.nome}: entrada do VIGA e do DESENHO`}
      descricao={
        <>
          Dados que o usuário do SISTRUT digitava no VIGA e no DESENHO. Só o cálculo pela NB-1/78 os
          lê; campo vazio vale o que vem da planta. Trechos e apoios seguem o eixo crescente (trecho
          0 é o primeiro, inclusive o balanço).
        </>
      }
      gatilho={
        <button
          type="button"
          className="w-full rounded border border-slate-600 px-2 py-1 text-xs hover:bg-slate-800"
        >
          Dados do SISTRUT da viga…
        </button>
      }
    >
      <FormularioViga pav={pav} viga={viga} fechar={() => setAberto(false)} />
    </DialogoEditor>
  );
}

function FormularioViga({ pav, viga, fechar }: { pav: Pavimento; viga: Viga; fechar: () => void }) {
  const geo = useMemo(() => geometriaDaViga(pav, viga.id), [pav, viga.id]);
  const [f, setF] = useState(() => formDaViga(viga, geo));
  const muda = <K extends keyof FormViga>(k: K, v: FormViga[K]) => setF((x) => ({ ...x, [k]: v }));
  const { erros, aplicar } = useAplicar(fechar);
  const momentosNoIni = useObra((s) => s.obra?.parametrosViga?.viga?.momentosExternos ?? false);
  const [aba, setAba] = useState<AbaViga>("cargas");
  const comErro = abasComErro(erros);

  const aoAplicar = () =>
    aplicar((obra) => {
      const p = obra.pavimentos.find((x) => x.vigas.some((v) => v.id === viga.id));
      const atual = p?.vigas.find((v) => v.id === viga.id);
      if (!p || !atual) return ["A viga não existe mais na obra."];
      const r = vigaDoForm(f, atual, geo);
      if (Array.isArray(r)) {
        // o erro pode estar noutra aba: abre a primeira que tem erro
        const primeira = abasComErro(r)[0];
        if (primeira && !abasComErro(r).includes(aba)) setAba(primeira);
        return r;
      }
      return substituirPavimento(obra, p.id, {
        ...p,
        vigas: p.vigas.map((v) => (v.id === viga.id ? r : v)),
      });
    });

  return (
    <div className="flex min-h-0 flex-col gap-3">
      <Tabs value={aba} onValueChange={(v) => setAba(v as AbaViga)} className="min-h-0 flex-1">
        <TabsList variant="line">
          {(Object.keys(ABAS_VIGA) as AbaViga[]).map((a) => (
            <TabsTrigger key={a} value={a}>
              {ABAS_VIGA[a]}
              {comErro.includes(a) && (
                <>
                  <span aria-hidden className="text-destructive text-[10px]">
                    ●
                  </span>
                  <span className="sr-only"> (com erro)</span>
                </>
              )}
            </TabsTrigger>
          ))}
        </TabsList>
        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          <TabsContent value="cargas" className="grid gap-3">
            <AbaCargas f={f} muda={muda} geo={geo} pav={pav} viga={viga} />
          </TabsContent>
          <TabsContent value="secoes" className="grid gap-3">
            <AbaSecoes f={f} muda={muda} geo={geo} />
          </TabsContent>
          <TabsContent value="vaos" className="grid gap-3">
            <AbaVaos f={f} muda={muda} geo={geo} momentosNoIni={momentosNoIni} />
          </TabsContent>
          <TabsContent value="rodada" className="grid gap-3">
            <AbaRodada f={f} muda={muda} pav={pav} viga={viga} />
          </TabsContent>
          <TabsContent value="armadura" className="grid gap-3">
            <AbaArmadura f={f} muda={muda} />
          </TabsContent>
        </div>
      </Tabs>
      <RodapeEditor erros={erros} aoCancelar={fechar} aoAplicar={aoAplicar} />
    </div>
  );
}

type Muda = <K extends keyof FormViga>(k: K, v: FormViga[K]) => void;

/** Coluna "trecho": escolha entre os trechos da geometria, ou número sem ela. */
function colunaTrecho(geo: GeometriaEditor | undefined): Coluna<"trecho"> {
  return {
    chave: "trecho",
    rotulo: "Trecho",
    largura: "w-14",
    ...(geo ? { tipo: geo.trechos.map((t, k) => ({ valor: String(k), rotulo: t.rotulo })) } : {}),
  };
}

const rotulo = (base: string) => (i: number) => `${base} ${i + 1}`;

function AbaCargas({
  f,
  muda,
  geo,
  pav,
  viga,
}: {
  f: FormViga;
  muda: Muda;
  geo: GeometriaEditor | undefined;
  pav: Pavimento;
  viga: Viga;
}) {
  const trecho = colunaTrecho(geo);
  const outras = pav.vigas.filter((v) => v.id !== viga.id);
  return (
    <>
      <div className="compacto:grid-cols-1 grid grid-cols-[1fr_1fr] gap-3">
        <Escolha
          rotulo="Só as cargas desta tela (.VIG digitado no VIGA)"
          valor={f.somenteCargasProprias}
          opcoes={opcoesTri(false, "sim: a montagem não leva carga à viga", "não")}
          aoMudar={(v) => muda("somenteCargasProprias", v)}
        />
        <CampoForm
          rotulo="Peso próprio digitado"
          unidade="kN/m"
          padrao="bw · h · peso do concreto"
          valor={f.pesoProprio}
          aoMudar={(v) => muda("pesoProprio", v)}
        />
      </div>
      <Grupo
        titulo="Cargas distribuídas"
        extra="De início a fim, em m a partir da ponta esquerda do trecho. O total inclui a acidental; sem acidental, vale a gerada pelo % do VIGA.INI (acidental G) ou zero."
      >
        <TabelaEditavel
          titulo="Cargas distribuídas"
          colunas={[
            trecho,
            { chave: "inicio", rotulo: "Início", unidade: "m" },
            { chave: "fim", rotulo: "Fim", unidade: "m" },
            { chave: "total", rotulo: "Total", unidade: "kN/m" },
            { chave: "acidental", rotulo: "Acidental", unidade: "kN/m" },
          ]}
          linhas={f.distribuidas}
          aoMudar={(l) => muda("distribuidas", l)}
          novaLinha={linhaDistribuida}
          rotuloLinha={rotulo("Carga distribuída")}
          vazio="Nenhuma carga distribuída."
        />
      </Grupo>
      <Grupo
        titulo="Cargas concentradas"
        extra="Na posição, em m a partir da ponta esquerda do trecho."
      >
        <TabelaEditavel
          titulo="Cargas concentradas"
          colunas={[
            trecho,
            { chave: "posicao", rotulo: "Posição", unidade: "m" },
            { chave: "total", rotulo: "Total", unidade: "kN" },
            { chave: "acidental", rotulo: "Acidental", unidade: "kN" },
          ]}
          linhas={f.concentradas}
          aoMudar={(l) => muda("concentradas", l)}
          novaLinha={linhaConcentrada}
          rotuloLinha={rotulo("Carga concentrada")}
          vazio="Nenhuma carga concentrada."
        />
      </Grupo>
      <Grupo
        titulo="Reações de vigas apoiadas (carga indexada *n.aa)"
        extra="A reação do apoio dado da viga apoiada nesta, no ponto: o VIGA a resolve depois de calcular a viga apoiada."
      >
        <TabelaEditavel
          titulo="Reações de vigas apoiadas"
          colunas={[
            trecho,
            { chave: "posicao", rotulo: "Posição", unidade: "m" },
            {
              chave: "viga",
              rotulo: "Viga apoiada",
              tipo: [
                { valor: "", rotulo: "escolha…" },
                ...outras.map((v) => ({ valor: v.nome, rotulo: v.nome })),
              ],
            },
            { chave: "apoio", rotulo: "Apoio dela", largura: "w-14" },
          ]}
          linhas={f.reacoes}
          aoMudar={(l) => muda("reacoes", l)}
          novaLinha={linhaReacao}
          rotuloLinha={rotulo("Reação")}
          vazio="Nenhuma reação de viga apoiada."
        />
      </Grupo>
    </>
  );
}

const OPCOES_LAJES_NO_CORTE = [
  { valor: "planta", rotulo: "pela planta (espessura da laje vizinha)" },
  { valor: "nao", rotulo: "não: pe, Hle, pd e Hld 0 (fôrma da viga inteira)" },
  { valor: "mesa", rotulo: "seção T: Hle = Hld = hf da seção do trecho" },
] as const satisfies readonly { valor: LajesNoCorte; rotulo: string }[];

/** Linhas de uma tabela por trecho ou por apoio, com o rótulo da geometria. */
const rotuloTrecho = (geo: GeometriaEditor | undefined) => (i: number) =>
  geo?.trechos[i]?.rotulo ?? `Trecho ${i}`;
const rotuloApoio = (geo: GeometriaEditor | undefined) => (i: number) =>
  geo?.apoios[i] ?? `Apoio ${i}`;

function Ligar({
  rotulo,
  marcado,
  aoMudar,
}: {
  rotulo: string;
  marcado: boolean;
  aoMudar: (m: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-xs">
      <input type="checkbox" checked={marcado} onChange={(e) => aoMudar(e.target.checked)} />
      {rotulo}
    </label>
  );
}

function AbaSecoes({
  f,
  muda,
  geo,
}: {
  f: FormViga;
  muda: Muda;
  geo: GeometriaEditor | undefined;
}) {
  return (
    <>
      <Grupo
        titulo="Seção por trecho (.SEC): alma e mesa da seção T"
        extra="bf e hf 0 = seção retangular. No balanço, bw e h 0 herdam a seção do apoio vizinho."
      >
        <Ligar
          rotulo="Dar a seção de cada trecho (sem isto, bw × h em toda a viga)"
          marcado={f.comSecoesTrechos}
          aoMudar={(m) => muda("comSecoesTrechos", m)}
        />
        {f.comSecoesTrechos && (
          <TabelaEditavel
            titulo="Seção por trecho"
            colunas={[
              { chave: "bw", rotulo: "Alma bw", unidade: "cm" },
              { chave: "h", rotulo: "Altura h", unidade: "cm" },
              { chave: "bf", rotulo: "Mesa bf", unidade: "cm" },
              { chave: "hf", rotulo: "Mesa hf", unidade: "cm" },
            ]}
            linhas={f.secoesTrechos}
            aoMudar={(l) => muda("secoesTrechos", l)}
            rotuloLinha={rotuloTrecho(geo)}
          />
        )}
      </Grupo>
      <Grupo titulo="Seção por apoio (.SEC)">
        <Ligar
          rotulo="Dar a seção em cada apoio"
          marcado={f.comSecoesApoios}
          aoMudar={(m) => muda("comSecoesApoios", m)}
        />
        {f.comSecoesApoios && (
          <TabelaEditavel
            titulo="Seção por apoio"
            colunas={[
              { chave: "bw", rotulo: "bw", unidade: "cm" },
              { chave: "h", rotulo: "h", unidade: "cm" },
            ]}
            linhas={f.secoesApoios}
            aoMudar={(l) => muda("secoesApoios", l)}
            rotuloLinha={rotuloApoio(geo)}
          />
        )}
      </Grupo>
      <Grupo titulo="Fôrma (.FOR)">
        <Escolha
          rotulo='Lajes no corte ("Forneço dados sobre a posição das Lajes no Corte")'
          valor={f.lajesNoCorte}
          opcoes={OPCOES_LAJES_NO_CORTE}
          aoMudar={(v) => muda("lajesNoCorte", v)}
          className="max-w-xl"
        />
        <Ligar
          rotulo="Dar a fôrma de cada trecho (campo vazio = o da planta)"
          marcado={f.comFormaTrechos}
          aoMudar={(m) => muda("comFormaTrechos", m)}
        />
        {f.comFormaTrechos && (
          <TabelaEditavel
            titulo="Fôrma por trecho"
            colunas={[
              { chave: "vaoLivre", rotulo: "Vão livre", unidade: "cm" },
              { chave: "pe", rotulo: "pe", unidade: "cm", largura: "w-14" },
              { chave: "hle", rotulo: "Hle", unidade: "cm", largura: "w-14" },
              { chave: "pd", rotulo: "pd", unidade: "cm", largura: "w-14" },
              { chave: "hld", rotulo: "Hld", unidade: "cm", largura: "w-14" },
              { chave: "eixo", rotulo: "Eixo", unidade: "cm", largura: "w-14" },
              { chave: "alinhamento", rotulo: "Alinhamento", largura: "w-14" },
            ]}
            linhas={f.formaTrechos}
            aoMudar={(l) => muda("formaTrechos", l)}
            rotuloLinha={rotuloTrecho(geo)}
          />
        )}
        <Ligar
          rotulo="Dar a fôrma de cada apoio (campo vazio = o da planta)"
          marcado={f.comFormaApoios}
          aoMudar={(m) => muda("comFormaApoios", m)}
        />
        {f.comFormaApoios && (
          <TabelaEditavel
            titulo="Fôrma por apoio"
            colunas={[
              { chave: "largura", rotulo: "Largura", unidade: "cm" },
              {
                chave: "tipo",
                rotulo: "Tipo",
                tipo: [
                  { valor: "", rotulo: "da planta" },
                  ...TIPOS_APOIO_FORMA.map((t) => ({ valor: t, rotulo: ROTULO_TIPO_APOIO[t] })),
                ],
              },
              { chave: "titulo", rotulo: "Título", tipo: "texto", largura: "w-16" },
              { chave: "codigo", rotulo: "Código", largura: "w-14" },
              { chave: "lps", rotulo: "LPs", unidade: "cm", largura: "w-14" },
              { chave: "dis", rotulo: "Dis", unidade: "cm", largura: "w-14" },
            ]}
            linhas={f.formaApoios}
            aoMudar={(l) => muda("formaApoios", l)}
            rotuloLinha={rotuloApoio(geo)}
          />
        )}
      </Grupo>
    </>
  );
}

const ROTULO_TIPO_APOIO: Record<(typeof TIPOS_APOIO_FORMA)[number], string> = {
  P: "P (pilar)",
  V: "V (viga)",
  O: "O (outro)",
  A: "A (apoio)",
};

const OPCOES_ENGASTE = [
  { valor: "montagem", rotulo: "pela montagem (pilar-parede)" },
  { valor: "nenhum", rotulo: "nenhum" },
  { valor: "esquerdo", rotulo: "só o esquerdo" },
  { valor: "direito", rotulo: "só o direito" },
  { valor: "ambos", rotulo: "os dois" },
] as const satisfies readonly { valor: Engaste; rotulo: string }[];

function AbaVaos({
  f,
  muda,
  geo,
  momentosNoIni,
}: {
  f: FormViga;
  muda: Muda;
  geo: GeometriaEditor | undefined;
  momentosNoIni: boolean;
}) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <Grupo
          titulo="Vãos digitados no VIGA"
          extra="Sem isto, o vão vem da planta. O vão digitado precisa bater com a planta a menos de 5 mm."
        >
          <Ligar
            rotulo="Digitar o vão de cada trecho"
            marcado={f.comVaos}
            aoMudar={(m) => muda("comVaos", m)}
          />
          {f.comVaos && (
            <TabelaEditavel
              titulo="Vãos"
              colunas={[{ chave: "vao", rotulo: "Vão", unidade: "m" }]}
              linhas={f.vaos}
              aoMudar={(l) => muda("vaos", l)}
              rotuloLinha={rotuloTrecho(geo)}
            />
          )}
        </Grupo>
        <Grupo
          titulo="Inércia relativa J"
          extra="Sem isto, vale a da montagem (1 + número do pilar/100000)."
        >
          <Ligar
            rotulo="Digitar o J de cada trecho"
            marcado={f.comInercias}
            aoMudar={(m) => muda("comInercias", m)}
          />
          {f.comInercias && (
            <TabelaEditavel
              titulo="Inércias"
              colunas={[{ chave: "j", rotulo: "J" }]}
              linhas={f.inercias}
              aoMudar={(l) => muda("inercias", l)}
              rotuloLinha={rotuloTrecho(geo)}
            />
          )}
        </Grupo>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Grupo titulo="Pontas da viga">
          <Escolha
            rotulo="Engaste perfeito (Ee/Ed)"
            valor={f.engaste}
            opcoes={OPCOES_ENGASTE}
            aoMudar={(v) => muda("engaste", v)}
          />
          <Ligar
            rotulo="Momentos externos nos apoios extremos"
            marcado={f.comMomentos}
            aoMudar={(m) => muda("comMomentos", m)}
          />
          {f.comMomentos && (
            <div className="grid grid-cols-2 gap-2">
              <CampoForm
                rotulo="Esquerdo"
                unidade="kN·m"
                valor={f.momentoEsquerdo}
                aoMudar={(v) => muda("momentoEsquerdo", v)}
              />
              <CampoForm
                rotulo="Direito"
                unidade="kN·m"
                valor={f.momentoDireito}
                aoMudar={(v) => muda("momentoDireito", v)}
              />
            </div>
          )}
          {f.comMomentos && !momentosNoIni && (
            <p className="text-aviso text-xs">
              Os momentos externos só entram com "Momentos externos" ligado no VIGA.INI (Parâmetros
              da obra, vigas).
            </p>
          )}
        </Grupo>
        <Grupo
          titulo="Apoios (VIGA opção 7)"
          extra="Desconsiderar = o '*' no número do pilar: a reação não vai a pilar nenhum. Nº do pilar = o 'P<número>' que recebe a reação no .REP; vazio = o pilar da planta."
        >
          <TabelaEditavel
            titulo="Apoios"
            colunas={[
              {
                chave: "desconsiderado",
                rotulo: "Desconsiderar",
                tipo: [
                  { valor: "nao", rotulo: "não" },
                  { valor: "sim", rotulo: "sim (*)" },
                ],
              },
              { chave: "pilar", rotulo: "Nº do pilar", largura: "w-16" },
            ]}
            linhas={f.apoios}
            aoMudar={(l) => muda("apoios", l)}
            rotuloLinha={rotuloApoio(geo)}
            vazio="A viga não tem apoios na planta."
          />
        </Grupo>
      </div>
    </>
  );
}

function AbaRodada({
  f,
  muda,
  pav,
  viga,
}: {
  f: FormViga;
  muda: Muda;
  pav: Pavimento;
  viga: Viga;
}) {
  const candidatas = vigasQueCruzam(pav, viga);
  // as já escolhidas ficam na lista mesmo que a planta tenha mudado
  const ids = new Set([...candidatas.map((v) => v.id), ...f.apoiaEm]);
  const lista = pav.vigas.filter((v) => ids.has(v.id));
  return (
    <>
      <Grupo
        titulo='"Continuo com o processamento desta Viga S/N" (DESDIM)'
        original
        extra="Com cisalhamento acima do limite ou momento acima de 40 % do limite da armadura simples, o DESDIM pergunta se segue. Com o padrão N, no modo original a viga fica sem detalhamento nem quadro. O modo corrigido sempre segue, com aviso."
      >
        <Escolha
          rotulo="Continuar mesmo acima do limite"
          original
          valor={f.continuaSeExcederLimite}
          opcoes={opcoesTri(false, "S: continua", "N: para a viga")}
          aoMudar={(v) => muda("continuaSeExcederLimite", v)}
          className="max-w-xs"
        />
      </Grupo>
      <Grupo
        titulo='"Vx apoia em Vy" (LAJEMONT)'
        extra="Nos cruzamentos sem pilar, as vigas em que esta se apoia. Sem escolha vale a regra da V2: a viga que termina se apoia na que passa."
      >
        {lista.length === 0 ? (
          <p className="text-muted-foreground text-xs">Nenhuma viga cruza esta.</p>
        ) : (
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {lista.map((v) => (
              <Ligar
                key={v.id}
                rotulo={`${viga.nome} apoia em ${v.nome}`}
                marcado={f.apoiaEm.includes(v.id)}
                aoMudar={(m) =>
                  muda("apoiaEm", m ? [...f.apoiaEm, v.id] : f.apoiaEm.filter((id) => id !== v.id))
                }
              />
            ))}
          </div>
        )}
      </Grupo>
      <Grupo
        titulo="Repetições da viga na tabela (DESENHO)"
        extra='"Vigas com repetições para consideração na Tabela": o resumo conta MAX(1, repetições). Vazio = as do pavimento.'
      >
        <CampoForm
          rotulo="Repetições"
          padrao={String(pav.repeticoes)}
          valor={f.repeticoes}
          aoMudar={(v) => muda("repeticoes", v)}
          className="max-w-40"
        />
      </Grupo>
    </>
  );
}

const COLUNAS_ARMADURA: readonly Coluna<CampoArmadura>[] = [
  {
    chave: "em",
    rotulo: "Em",
    tipo: [
      { valor: "apoio", rotulo: "apoio" },
      { valor: "tramo", rotulo: "tramo" },
    ],
  },
  { chave: "numero", rotulo: "Nº", largura: "w-12" },
  { chave: "bitola", rotulo: "φ tracionada", unidade: "mm", largura: "w-16" },
  { chave: "bitolaMistura", rotulo: "+φ mistura", unidade: "mm", largura: "w-16" },
  { chave: "barras", rotulo: "Barras", largura: "w-14" },
  { chave: "barrasMistura", rotulo: "+barras", largura: "w-14" },
  { chave: "comprimida", rotulo: "Comprimida", tipo: "texto", largura: "w-20" },
  { chave: "fisBitola", rotulo: "Fiss. φ", unidade: "mm", largura: "w-14" },
  { chave: "fisQuantidade", rotulo: "Fiss. quant.", largura: "w-14" },
];

function AbaArmadura({ f, muda }: { f: FormViga; muda: Muda }) {
  return (
    <Grupo
      titulo='Armadura alterada no DESDIM ("Altero a armadura")'
      extra={
        <>
          Uma linha por tela de "Altero a Armação" (apoio 0..n, tramo 1..n, como o DESDIM numera).
          Vazio = Enter no original (a mesma bitola, o número necessário). Comprimida: "-" anula,
          "a#b" dá a armadura. Fissuração: "Modifico as Armaduras", aceita só se a abertura do grupo
          passou do limite. A viga que para em "Continuo com o processamento"
          <MarcaOriginal /> não recebe esta armadura.
        </>
      }
    >
      <TabelaEditavel
        titulo="Armadura alterada"
        colunas={COLUNAS_ARMADURA}
        linhas={f.armaduras}
        aoMudar={(l) => muda("armaduras", l)}
        novaLinha={linhaArmadura}
        rotuloLinha={rotulo("Alteração")}
        vazio="Nenhuma alteração: vale a armadura que o DESDIM escolhe."
      />
    </Grupo>
  );
}
