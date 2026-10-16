// Editor dos parâmetros da obra pela NB-1/78, que antes só entravam pelo importador: as
// opções da rodada (otimização dos negativos, predimensionamento, variação da armadura,
// .RLP e rigidez das vigas), o .LAP, o VIGA.INI e o .DSP, o PILAR.INI e o .PIP. Campo
// vazio vale o de fábrica (mostrado apagado); uma tabela ligada vem inteira. Grava tudo no
// Aplicar (uma entrada no desfazer). O botão vai no cabeçalho da tela da obra.
import { SlidersHorizontal } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  PARAMETROS_DSP,
  PARAMETROS_LAJE,
  PARAMETROS_PILAR,
  PARAMETROS_PIP,
  PARAMETROS_VIGA,
} from "../../../calculo/sistrut/base/parametros";
import type { Obra } from "../../../dominio/obra";
import { formatarNumero } from "../../formato";
import {
  CampoForm,
  DialogoEditor,
  Escolha,
  Grupo,
  MarcaOriginal,
  type OpcaoEscolha,
  opcoesTri,
  RodapeEditor,
  TabelaEditavel,
  useAplicar,
} from "./comum";
import type { LinhaForm } from "./formulario";
import {
  type ComPadrao,
  type DefBool,
  DEFS,
  type DefLista,
  type DefNumero,
  type Escalares,
  type FormDsp,
  type FormIni,
  type FormLaje,
  type FormParametros,
  type FormPip,
  type FormVigaIni,
  formDosParametros,
  type Lista,
  obraDosParametros,
  type PadroesParametros,
  padroesDosParametros,
  type Predimensionamento,
} from "./parametros";

/** Botão "Parâmetros" e o diálogo do editor. */
/** `classeGatilho`: estilo do botão que abre (no menu de ações do celular ele ocupa a linha). */
export function EditorParametros({ obra, classeGatilho }: { obra: Obra; classeGatilho?: string }) {
  const [aberto, setAberto] = useState(false);
  return (
    <DialogoEditor
      aberto={aberto}
      aoMudarAberto={setAberto}
      titulo="Parâmetros do SISTRUT (NB-1/78)"
      descricao={
        <>
          Parâmetros que o usuário do SISTRUT editava no .LAP, no VIGA.INI, no .DSP, no PILAR.INI e
          no .PIP, e as escolhas da rodada. Só o cálculo pela NB-1/78 os lê. Campo vazio vale o de
          fábrica (mostrado apagado); uma tabela ligada substitui a de fábrica inteira. Valem nos
          dois modos de cálculo, menos os marcados
          <MarcaOriginal />. Unidades do original.
        </>
      }
      gatilho={
        <Button variant="outline" size="sm" className={classeGatilho}>
          <SlidersHorizontal /> Parâmetros
        </Button>
      }
    >
      <FormularioParametros obra={obra} fechar={() => setAberto(false)} />
    </DialogoEditor>
  );
}

function FormularioParametros({ obra, fechar }: { obra: Obra; fechar: () => void }) {
  const [f, setF] = useState(() => formDosParametros(obra));
  const padroes = useMemo(() => padroesDosParametros(obra), [obra]);
  const muda = <K extends keyof FormParametros>(k: K, v: FormParametros[K]) =>
    setF((x) => ({ ...x, [k]: v }));
  const { erros, aplicar } = useAplicar(fechar);
  const aoAplicar = () => aplicar((atual) => obraDosParametros(f, atual));

  return (
    <div className="flex min-h-0 flex-col gap-3">
      <Tabs defaultValue="rodada" className="min-h-0 flex-1">
        <TabsList variant="line">
          <TabsTrigger value="rodada">Rodada</TabsTrigger>
          <TabsTrigger value="lajes">Lajes (.LAP)</TabsTrigger>
          <TabsTrigger value="vigas">Vigas (VIGA.INI e .DSP)</TabsTrigger>
          <TabsTrigger value="pilares">Pilares (PILAR.INI e .PIP)</TabsTrigger>
        </TabsList>
        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          <TabsContent value="rodada" className="grid gap-3">
            <AbaRodada f={f} muda={muda} />
          </TabsContent>
          <TabsContent value="lajes" className="grid gap-3">
            <AbaLajes laje={f.laje} aoMudar={(v) => muda("laje", v)} padroes={padroes} />
          </TabsContent>
          <TabsContent value="vigas" className="grid gap-3">
            <AbaVigas
              viga={f.viga}
              dsp={f.dsp}
              aoMudarViga={(v) => muda("viga", v)}
              aoMudarDsp={(v) => muda("dsp", v)}
              padroes={padroes}
            />
          </TabsContent>
          <TabsContent value="pilares" className="grid gap-3">
            <AbaPilares
              ini={f.ini}
              pip={f.pip}
              aoMudarIni={(v) => muda("ini", v)}
              aoMudarPip={(v) => muda("pip", v)}
              padroes={padroes}
            />
          </TabsContent>
        </div>
      </Tabs>
      <RodapeEditor erros={erros} aoCancelar={fechar} aoAplicar={aoAplicar} />
    </div>
  );
}

// ---------------------------------------------------------------- peças

/** Opções de uma escolha com o padrão escrito ("padrão (E: estática)"). */
function comPadrao<const T extends string>(
  padrao: string,
  opcoes: readonly OpcaoEscolha<T>[],
): OpcaoEscolha<ComPadrao<T>>[] {
  const rotulo = opcoes.find((o) => o.valor === padrao)?.rotulo ?? padrao;
  return [{ valor: "padrao", rotulo: `padrão (${rotulo})` }, ...opcoes];
}

const OPCOES_CLASSE = [
  { valor: "A", rotulo: "A (laminado a quente)" },
  { valor: "B", rotulo: "B (encruado a frio)" },
] as const;

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

/** Campos numéricos e sim/não de um grupo (os descritores com `grupo` igual). */
function CamposEscalares<N extends string, B extends string>({
  numeros,
  booleanos,
  grupo,
  valor,
  aoMudar,
  padraoNumero,
  padraoBool,
}: {
  numeros: readonly DefNumero<N>[];
  booleanos: readonly DefBool<B>[];
  grupo?: string;
  valor: Escalares<N, B>;
  aoMudar: (v: Escalares<N, B>) => void;
  padraoNumero: Record<N, string>;
  padraoBool: Record<B, boolean>;
}) {
  const doGrupo = <D extends { grupo?: string }>(d: D) => grupo === undefined || d.grupo === grupo;
  return (
    <div className="compacto:grid-cols-2 grid grid-cols-3 gap-x-3 gap-y-2">
      {numeros.filter(doGrupo).map((d) => (
        <CampoForm
          key={d.chave}
          rotulo={d.rotulo}
          {...(d.unidade ? { unidade: d.unidade } : {})}
          {...(d.original ? { original: true } : {})}
          padrao={padraoNumero[d.chave]}
          valor={valor.numeros[d.chave]}
          aoMudar={(t) => aoMudar({ ...valor, numeros: { ...valor.numeros, [d.chave]: t } })}
        />
      ))}
      {booleanos.filter(doGrupo).map((d) => (
        <Escolha
          key={d.chave}
          rotulo={d.rotulo}
          {...(d.original ? { original: true } : {})}
          valor={valor.booleanos[d.chave]}
          opcoes={opcoesTri(padraoBool[d.chave], d.sim, d.nao)}
          aoMudar={(t) => aoMudar({ ...valor, booleanos: { ...valor.booleanos, [d.chave]: t } })}
        />
      ))}
    </div>
  );
}

const linhaVazia = <C extends string>(def: DefLista<C>) =>
  Object.fromEntries(def.colunas.map((c) => [c.chave, ""])) as LinhaForm<C>;

/** Tabela de parâmetros: liga (a obra dá a tabela inteira) e edita as linhas. */
function ListaParametros<C extends string>({
  def,
  secao,
  lista,
  aoMudar,
}: {
  def: DefLista<C>;
  secao: string;
  lista: Lista<C>;
  aoMudar: (l: Lista<C>) => void;
}) {
  const titulo = `${def.titulo} (${secao})`;
  const tamanho = def.fixo ? `${lista.linhas.length} linhas, tamanho fixo` : "lista variável";
  return (
    <Grupo titulo={titulo} extra={`Sem edição vale a de fábrica (${tamanho}).`}>
      <Ligar
        rotulo={`Editar ${def.titulo.toLowerCase()} (${secao})`}
        marcado={lista.ligada}
        aoMudar={(m) => aoMudar({ ...lista, ligada: m })}
      />
      {lista.ligada && (
        <TabelaEditavel
          titulo={titulo}
          colunas={def.colunas}
          linhas={lista.linhas}
          aoMudar={(linhas) => aoMudar({ ...lista, linhas })}
          rotuloLinha={def.rotuloLinha}
          {...(def.fixo ? {} : { novaLinha: () => linhaVazia(def) })}
          vazio="Nenhum valor."
        />
      )}
    </Grupo>
  );
}

// ---------------------------------------------------------------- abas

const OPCOES_PREDIM = [
  { valor: "padrao", rotulo: "padrão (não roda)" },
  { valor: "tensoes", rotulo: "só as tensões, com a seção da obra" },
  { valor: "secao", rotulo: "a seção escolhida passa a ser a da coluna" },
] as const satisfies readonly OpcaoEscolha<Predimensionamento>[];

function AbaRodada({
  f,
  muda,
}: {
  f: FormParametros;
  muda: <K extends keyof FormParametros>(k: K, v: FormParametros[K]) => void;
}) {
  return (
    <>
      <Grupo
        titulo="Lajes: otimização dos negativos (LAJECALC 6)"
        extra="No original, um passo que o usuário escolhe rodar. Padrão: roda."
      >
        <Escolha
          rotulo="Otimização dos negativos"
          valor={f.otimizaNegativos}
          opcoes={opcoesTri(true, "roda", "não roda")}
          aoMudar={(v) => muda("otimizaNegativos", v)}
          className="max-w-xs"
        />
      </Grupo>
      <Grupo
        titulo="Pilares: PILAREDI e PILGEEDI"
        extra='O predimensionamento (PILAREDI 3.1) roda em cada coluna desde a fundação. A variação da armadura é o "Vario a armadura ao longo da coluna": 0 = N, uma armadura por trecho de seção constante; n ≥ 1 = de n em n níveis, até o máximo de variações do PILAR.INI. O .RLP dá a inclinação de cada viga no pilar; o .SEC, a rigidez Bw·Hw³/12 que reparte o momento entre a viga e os lances.'
      >
        <div className="grid grid-cols-2 gap-x-3 gap-y-2">
          <Escolha
            rotulo="Predimensionamento"
            valor={f.predimensionamento}
            opcoes={OPCOES_PREDIM}
            aoMudar={(v) => muda("predimensionamento", v)}
          />
          <CampoForm
            rotulo="Variação da armadura ao longo da coluna"
            unidade="de n em n níveis; 0 = N"
            padrao="0"
            valor={f.variaArmadura}
            aoMudar={(v) => muda("variaArmadura", v)}
          />
          <Escolha
            rotulo="Lê o .RLP do LAJEMONT com o .REP"
            valor={f.rlp}
            opcoes={opcoesTri(true, "lê", "não lê: inclinação 0")}
            aoMudar={(v) => muda("rlp", v)}
          />
          <Escolha
            rotulo='Rigidez das vigas pelo .SEC ("Prossigo com a Leitura")'
            valor={f.rigidezVigas}
            opcoes={opcoesTri(true, "S: lê", "N: rigidez 0")}
            aoMudar={(v) => muda("rigidezVigas", v)}
          />
        </div>
      </Grupo>
    </>
  );
}

function AbaLajes({
  laje,
  aoMudar,
  padroes,
}: {
  laje: FormLaje;
  aoMudar: (v: FormLaje) => void;
  padroes: PadroesParametros;
}) {
  const d = DEFS.laje;
  const escalares = (grupo: string) => (
    <CamposEscalares
      numeros={d.numeros}
      booleanos={d.booleanos}
      grupo={grupo}
      valor={laje}
      aoMudar={(v) => aoMudar({ ...laje, ...v })}
      padraoNumero={padroes.laje}
      padraoBool={PARAMETROS_LAJE}
    />
  );
  const fl = laje.flecha;
  const pf = padroes.flecha;
  const mudaFlecha = (p: Partial<FormLaje["flecha"]>) =>
    aoMudar({ ...laje, flecha: { ...fl, ...p } });
  return (
    <>
      <Grupo
        titulo="Segurança e altura útil"
        extra="Os γ do .LAP valem só nas lajes. fck, fyk, classe do aço, cobrimento e densidade vêm dos materiais e do modo de cálculo, não daqui."
      >
        {escalares("seg")}
      </Grupo>
      <Grupo titulo="Espessura mínima">{escalares("h")}</Grupo>
      <Grupo titulo="Armadura">{escalares("arm")}</Grupo>
      <Grupo titulo="Negativos e continuidade">{escalares("neg")}</Grupo>
      <Grupo titulo="Tolerâncias geométricas">{escalares("tol")}</Grupo>
      <Grupo
        titulo="Flecha (.LAP)"
        extra="O original lê e não usa (defeito R1); o modo corrigido verifica a flecha com estes valores."
      >
        <Ligar
          rotulo="Editar a flecha (.LAP)"
          marcado={fl.ligada}
          aoMudar={(m) => mudaFlecha({ ligada: m })}
        />
        {fl.ligada && (
          <div className="compacto:grid-cols-2 grid grid-cols-4 gap-x-3 gap-y-2">
            <CampoForm
              rotulo="L/f total"
              unidade="L/f"
              padrao={formatarNumero(pf.lfTotal, 0)}
              valor={fl.lfTotal}
              aoMudar={(v) => mudaFlecha({ lfTotal: v })}
            />
            <CampoForm
              rotulo="L/f acidental"
              unidade="L/f"
              padrao={formatarNumero(pf.lfAcidental, 0)}
              valor={fl.lfAcidental}
              aoMudar={(v) => mudaFlecha({ lfAcidental: v })}
            />
            <CampoForm
              rotulo="Multiplicador de Ec da flecha"
              unidade="×"
              padrao={formatarNumero(pf.multiplicadorEc, 1)}
              valor={fl.multiplicadorEc}
              aoMudar={(v) => mudaFlecha({ multiplicadorEc: v })}
            />
            <Escolha
              rotulo="Deformação lenta"
              valor={fl.deformacaoLenta}
              opcoes={[
                { valor: "sim", rotulo: "S" },
                { valor: "nao", rotulo: "N" },
              ]}
              aoMudar={(v) => mudaFlecha({ deformacaoLenta: v })}
            />
          </div>
        )}
      </Grupo>
      <div className="grid grid-cols-2 items-start gap-3">
        <ListaParametros
          def={d.listas.bitolas}
          secao=".LAP"
          lista={laje.bitolas}
          aoMudar={(l) => aoMudar({ ...laje, bitolas: l })}
        />
        <ListaParametros
          def={d.listas.bitolaPorH}
          secao=".LAP"
          lista={laje.bitolaPorH}
          aoMudar={(l) => aoMudar({ ...laje, bitolaPorH: l })}
        />
        <ListaParametros
          def={d.listas.relacaoMu}
          secao=".LAP"
          lista={laje.relacaoMu}
          aoMudar={(l) => aoMudar({ ...laje, relacaoMu: l })}
        />
        <div className="grid gap-3">
          <ListaParametros
            def={d.listas.espacamentoMinimoPorH}
            secao=".LAP"
            lista={laje.espacamentoMinimoPorH}
            aoMudar={(l) => aoMudar({ ...laje, espacamentoMinimoPorH: l })}
          />
          <ListaParametros
            def={d.listas.espacamentos}
            secao=".LAP"
            lista={laje.espacamentos}
            aoMudar={(l) => aoMudar({ ...laje, espacamentos: l })}
          />
        </div>
      </div>
    </>
  );
}

function AbaVigas({
  viga,
  dsp,
  aoMudarViga,
  aoMudarDsp,
  padroes,
}: {
  viga: FormVigaIni;
  dsp: FormDsp;
  aoMudarViga: (v: FormVigaIni) => void;
  aoMudarDsp: (v: FormDsp) => void;
  padroes: PadroesParametros;
}) {
  const dv = DEFS.viga;
  const dd = DEFS.dsp;
  const escalaresDsp = (grupo: string) => (
    <CamposEscalares
      numeros={dd.numeros}
      booleanos={dd.booleanos}
      grupo={grupo}
      valor={dsp}
      aoMudar={(v) => aoMudarDsp({ ...dsp, ...v })}
      padraoNumero={padroes.dsp}
      padraoBool={PARAMETROS_DSP}
    />
  );
  return (
    <>
      <Grupo
        titulo="VIGA.INI"
        extra="A análise das vigas no VIGA (VICALC). O DESDIM usa a redução dos negativos, as acidentais e os momentos externos do .DSP."
      >
        <CamposEscalares
          numeros={dv.numeros}
          booleanos={dv.booleanos}
          valor={viga}
          aoMudar={(v) => aoMudarViga({ ...viga, ...v })}
          padraoNumero={padroes.viga}
          padraoBool={PARAMETROS_VIGA}
        />
        <Escolha
          rotulo="Reação levada ao pilar"
          valor={viga.reacaoNoPilar}
          opcoes={comPadrao(padroes.reacaoNoPilar, [
            { valor: "estatica", rotulo: "E: estática" },
            { valor: "maxima", rotulo: "M: máxima" },
          ])}
          aoMudar={(v) => aoMudarViga({ ...viga, reacaoNoPilar: v })}
          className="max-w-xs"
        />
      </Grupo>
      <Grupo
        titulo=".DSP: análise no DESDIM"
        extra="Os coeficientes de medida e de força vêm do DESENHO.INI; o resto, do .DSP."
      >
        {escalaresDsp("analise")}
      </Grupo>
      <Grupo
        titulo=".DSP: materiais e cobrimento"
        extra="No modo corrigido, fck, fyk, classe do aço, γ e cobrimento das vigas são os da obra (materiais); estes só valem no original. Vazio no original = os materiais da obra (fck e fyk em t/cm², MPa/100) e o cobrimento de fábrica."
      >
        {escalaresDsp("mat")}
        <Escolha
          rotulo="Classe do aço"
          original
          valor={dsp.classeAco}
          opcoes={comPadrao(padroes.dspClasseAco, OPCOES_CLASSE)}
          aoMudar={(v) => aoMudarDsp({ ...dsp, classeAco: v })}
          className="max-w-xs"
        />
      </Grupo>
      <Grupo titulo=".DSP: flexão e ancoragem">{escalaresDsp("flexao")}</Grupo>
      <Grupo titulo=".DSP: flecha e fissuração">
        {escalaresDsp("els")}
        <Escolha
          rotulo="Limite de fissuração (NB-1)"
          valor={dsp.classeFissuracao}
          opcoes={comPadrao(String(padroes.classeFissuracao), [
            { valor: "1", rotulo: "1" },
            { valor: "2", rotulo: "2" },
            { valor: "3", rotulo: "3" },
          ])}
          aoMudar={(v) => aoMudarDsp({ ...dsp, classeFissuracao: v })}
          className="max-w-xs"
        />
      </Grupo>
      <Grupo titulo=".DSP: estribos">
        {escalaresDsp("estribo")}
        <Escolha
          rotulo="Espaçamento máximo comparado com"
          valor={dsp.comparaEspacamentoMaximo}
          opcoes={comPadrao(padroes.comparaEspacamentoMaximo, [
            { valor: "d/2", rotulo: "d/2" },
            { valor: "H/2", rotulo: "H/2" },
          ])}
          aoMudar={(v) => aoMudarDsp({ ...dsp, comparaEspacamentoMaximo: v })}
          className="max-w-xs"
        />
      </Grupo>
      <Grupo titulo=".DSP: detalhamento">
        {escalaresDsp("detalhe")}
        <CampoForm
          rotulo="Letra dos ferros"
          unidade="texto"
          numerico={false}
          padrao={padroes.letraFerros}
          valor={dsp.letraFerros}
          aoMudar={(v) => aoMudarDsp({ ...dsp, letraFerros: v })}
          className="max-w-40"
        />
      </Grupo>
      <p className="text-muted-foreground text-xs">
        As listas de arranjos por intervalo de bw e de grupo de corte do .DSP não são editadas aqui:
        as da obra (ou as de fábrica) ficam como estão. O número de grupos de bitolas precisa bater
        com elas.
      </p>
      <div className="grid grid-cols-2 items-start gap-3">
        <ListaParametros
          def={dd.listas.bitolas}
          secao=".DSP"
          lista={dsp.bitolas}
          aoMudar={(l) => aoMudarDsp({ ...dsp, bitolas: l })}
        />
        <ListaParametros
          def={dd.listas.bitolasEstribo}
          secao=".DSP"
          lista={dsp.bitolasEstribo}
          aoMudar={(l) => aoMudarDsp({ ...dsp, bitolasEstribo: l })}
        />
        <ListaParametros
          def={dd.listas.dobrasPorBitola}
          secao=".DSP"
          lista={dsp.dobrasPorBitola}
          aoMudar={(l) => aoMudarDsp({ ...dsp, dobrasPorBitola: l })}
        />
        <div className="grid gap-3">
          <ListaParametros
            def={dd.listas.limitesIntervalos}
            secao=".DSP"
            lista={dsp.limitesIntervalos}
            aoMudar={(l) => aoMudarDsp({ ...dsp, limitesIntervalos: l })}
          />
          <ListaParametros
            def={dd.listas.espacamentosEstribo}
            secao=".DSP"
            lista={dsp.espacamentosEstribo}
            aoMudar={(l) => aoMudarDsp({ ...dsp, espacamentosEstribo: l })}
          />
          <ListaParametros
            def={dd.listas.tabelaBitola1}
            secao=".DSP"
            lista={dsp.tabelaBitola1}
            aoMudar={(l) => aoMudarDsp({ ...dsp, tabelaBitola1: l })}
          />
          <ListaParametros
            def={dd.listas.tabelaBitola2}
            secao=".DSP"
            lista={dsp.tabelaBitola2}
            aoMudar={(l) => aoMudarDsp({ ...dsp, tabelaBitola2: l })}
          />
        </div>
      </div>
    </>
  );
}

function AbaPilares({
  ini,
  pip,
  aoMudarIni,
  aoMudarPip,
  padroes,
}: {
  ini: FormIni;
  pip: FormPip;
  aoMudarIni: (v: FormIni) => void;
  aoMudarPip: (v: FormPip) => void;
  padroes: PadroesParametros;
}) {
  const di = DEFS.ini;
  const dp = DEFS.pip;
  const escalaresIni = (grupo: string) => (
    <CamposEscalares
      numeros={di.numeros}
      booleanos={di.booleanos}
      grupo={grupo}
      valor={ini}
      aoMudar={(v) => aoMudarIni({ ...ini, ...v })}
      padraoNumero={padroes.ini}
      padraoBool={PARAMETROS_PILAR}
    />
  );
  const escalaresPip = (grupo: string) => (
    <CamposEscalares
      numeros={dp.numeros}
      booleanos={dp.booleanos}
      grupo={grupo}
      valor={pip}
      aoMudar={(v) => aoMudarPip({ ...pip, ...v })}
      padraoNumero={padroes.pip}
      padraoBool={PARAMETROS_PIP}
    />
  );
  return (
    <>
      <Grupo titulo="PILAR.INI: geral">{escalaresIni("geral")}</Grupo>
      <Grupo
        titulo="PILAR.INI: materiais dos pilares"
        extra="fck e fyk em MPa. Vazio = os da obra (materiais); preenchido, vale no lugar deles nos pilares, nos dois modos."
      >
        {escalaresIni("mat")}
        <Escolha
          rotulo="Classe do aço dos pilares"
          valor={ini.classeAco}
          opcoes={comPadrao(padroes.iniClasseAco, OPCOES_CLASSE)}
          aoMudar={(v) => aoMudarIni({ ...ini, classeAco: v })}
          className="max-w-xs"
        />
      </Grupo>
      <Grupo titulo="PILAR.INI: excentricidades">
        {escalaresIni("exc")}
        <Escolha
          rotulo="Excentricidades acidentais"
          valor={ini.excentricidades}
          opcoes={comPadrao(padroes.excentricidades, [
            { valor: "isoladas", rotulo: "I: isoladas" },
            { valor: "simultaneas", rotulo: "S: simultâneas" },
          ])}
          aoMudar={(v) => aoMudarIni({ ...ini, excentricidades: v })}
          className="max-w-xs"
        />
      </Grupo>
      <Grupo titulo="PILAR.INI: esbeltez e fluência">{escalaresIni("lambda")}</Grupo>
      <ListaParametros
        def={di.listas.bitolas}
        secao="PILAR.INI"
        lista={ini.bitolas}
        aoMudar={(l) => aoMudarIni({ ...ini, bitolas: l })}
      />
      <Grupo titulo=".PIP: predimensionamento">{escalaresPip("predim")}</Grupo>
      <Grupo
        titulo=".PIP: cargas e cobrimento"
        extra="Densidade em kN/m³ (vazio: 25 no corrigido, 2,5 t/m³ no original). Um cobrimento preenchido vale também no corrigido, no lugar do cobrimento dos pilares da obra."
      >
        {escalaresPip("carga")}
      </Grupo>
      <Grupo
        titulo=".PIP: armadura"
        extra="Ordem da menor bitola longitudinal na tabela de bitolas do .PIP (5 = 10 mm)."
      >
        {escalaresPip("arm")}
      </Grupo>
      <div className="grid grid-cols-2 items-start gap-3">
        <ListaParametros
          def={dp.listas.bitolas}
          secao=".PIP"
          lista={pip.bitolas}
          aoMudar={(l) => aoMudarPip({ ...pip, bitolas: l })}
        />
        <ListaParametros
          def={dp.listas.estriboPorBitola}
          secao=".PIP"
          lista={pip.estriboPorBitola}
          aoMudar={(l) => aoMudarPip({ ...pip, estriboPorBitola: l })}
        />
        <ListaParametros
          def={dp.listas.coeficienteFlambagem}
          secao=".PIP"
          lista={pip.coeficienteFlambagem}
          aoMudar={(l) => aoMudarPip({ ...pip, coeficienteFlambagem: l })}
        />
      </div>
    </>
  );
}
