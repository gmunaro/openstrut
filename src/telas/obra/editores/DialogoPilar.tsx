// Editor dos dados do pilar no PILGEEDI, PILAREDI e PILAR do SISTRUT (NB-1/78): seção
// circular ou poligonal e rotação, vínculos e excentricidade, vento, cargas no topo e na
// base, transição, a armadura da variação e as verificações do PILAR opção 6. Abre pelo
// painel de propriedades do pilar; grava tudo no Aplicar (uma entrada no desfazer).
import { Plus, Trash2 } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { type Pavimento, type Pilar, VINCULOS_PILAR } from "../../../dominio/obra";
import { substituirPavimento, validarPilar } from "../../../planta/edicao";
import { formatarNumero } from "../../formato";
import {
  CampoForm,
  type Coluna,
  DialogoEditor,
  Escolha,
  Grupo,
  type OpcaoEscolha,
  RodapeEditor,
  TabelaEditavel,
  useAplicar,
} from "./comum";
import {
  type ArmaduraForm,
  type Barra,
  type FormCarga,
  type FormEstribo,
  type FormPilar,
  type FormVerificacao,
  type FormVinculos,
  formDoPilar,
  linhaBarra,
  linhaMomentoCarga,
  linhaMomentoVento,
  linhaVertice,
  MAX_MOMENTOS_CARGA,
  MAX_MOMENTOS_VENTO,
  type ModoCargaTopo,
  pilarDoForm,
  previaCaixa,
  ROTULO_VINCULO,
  type TipoSecao,
  verificacaoVazia,
} from "./pilar";

export { resumoPilar } from "./pilar";

/** Botão do painel do pilar e o diálogo do editor. */
export function EditorPilar({ pav, pilar }: { pav: Pavimento; pilar: Pilar }) {
  const [aberto, setAberto] = useState(false);
  return (
    <DialogoEditor
      aberto={aberto}
      aoMudarAberto={setAberto}
      titulo={`Pilar ${pilar.nome}: dados do PILGEEDI, PILAREDI e PILAR`}
      descricao={
        <>
          Dados que o usuário do SISTRUT digitava no PILGEEDI, no PILAREDI e no PILAR. Valem nos
          dois modos do cálculo pela NB-1/78; a NBR 6118 os ignora. Campo vazio ou grupo desligado
          vale o padrão do original. O pilar deste pavimento é o lance que vai do nível de baixo até
          o nível do pavimento.
        </>
      }
      gatilho={
        <button
          type="button"
          className="w-full rounded border border-border px-2 py-1 text-xs hover:bg-accent"
        >
          Dados do SISTRUT do pilar…
        </button>
      }
    >
      <FormularioPilar pav={pav} pilar={pilar} fechar={() => setAberto(false)} />
    </DialogoEditor>
  );
}

function FormularioPilar({
  pav,
  pilar,
  fechar,
}: {
  pav: Pavimento;
  pilar: Pilar;
  fechar: () => void;
}) {
  const [f, setF] = useState(() => formDoPilar(pilar));
  const muda: Muda = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const { erros, aplicar } = useAplicar(fechar);

  const aoAplicar = () =>
    aplicar((obra) => {
      const p = obra.pavimentos.find((x) => x.id === pav.id);
      const atual = p?.pilares.find((x) => x.id === pilar.id);
      if (!p || !atual) return ["O pilar não existe mais na obra."];
      const r = pilarDoForm(f, atual);
      if (Array.isArray(r)) return r;
      const erro = validarPilar(r);
      if (erro) return [`Seção do pilar: ${erro}`];
      return substituirPavimento(obra, p.id, {
        ...p,
        pilares: p.pilares.map((x) => (x.id === pilar.id ? r : x)),
      });
    });

  return (
    <div className="flex min-h-0 flex-col gap-3">
      <Tabs defaultValue="secao" className="min-h-0 flex-1">
        <TabsList variant="line">
          <TabsTrigger value="secao">Seção</TabsTrigger>
          <TabsTrigger value="vinculos">Vínculos e excentricidade</TabsTrigger>
          <TabsTrigger value="cargas">Cargas</TabsTrigger>
          <TabsTrigger value="armadura">Armadura e verificações</TabsTrigger>
        </TabsList>
        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          <TabsContent value="secao" className="grid gap-3">
            <AbaSecao f={f} muda={muda} pilar={pilar} />
          </TabsContent>
          <TabsContent value="vinculos" className="grid gap-3">
            <AbaVinculos f={f} muda={muda} />
          </TabsContent>
          <TabsContent value="cargas" className="grid gap-3">
            <AbaCargas f={f} muda={muda} />
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

type Muda = <K extends keyof FormPilar>(k: K, v: FormPilar[K]) => void;

/** Caixa de marcar que liga um grupo opcional (desligado = o campo sai do arquivo). */
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

const rotulo = (base: string) => (i: number) => `${base} ${i + 1}`;

const OPCOES_SECAO = [
  { valor: "retangular", rotulo: "retangular b × h (a da planta)" },
  { valor: "circular", rotulo: "circular (PILDADOS tipo 2)" },
  { valor: "poligonal", rotulo: "poligonal (PILDADOS tipo 3)" },
] as const satisfies readonly OpcaoEscolha<TipoSecao>[];

const cm = (n: number) => `${formatarNumero(n, 1)} cm`;

function AbaSecao({ f, muda, pilar }: { f: FormPilar; muda: Muda; pilar: Pilar }) {
  const caixa = previaCaixa(f);
  return (
    <>
      <Grupo
        titulo="Seção do lance (PILDADOS)"
        extra="Com seção circular ou poligonal, b e h do pilar viram a caixa da seção ao aplicar (circular: b = h = D; poligonal: b = Δx e h = Δy dos vértices), para a planta, o DESDIM e o fluxo da V2. Na retangular, b e h ficam como estão (edite no painel)."
      >
        <Escolha
          rotulo="Tipo da seção"
          valor={f.tipoSecao}
          opcoes={OPCOES_SECAO}
          aoMudar={(v) => muda("tipoSecao", v)}
          className="max-w-xs"
        />
        {f.tipoSecao === "retangular" && (
          <div className="compacto:grid-cols-1 grid grid-cols-[auto_10rem] items-end gap-3">
            <p className="text-xs">
              b × h = {cm(pilar.b)} × {cm(pilar.h)}
            </p>
            <CampoForm
              rotulo="Rotação"
              unidade="graus, 0 a 360"
              padrao="0"
              valor={f.rotacao}
              aoMudar={(v) => muda("rotacao", v)}
            />
          </div>
        )}
        {f.tipoSecao === "retangular" && (
          <p className="text-muted-foreground text-xs">
            A rotação gira o retângulo b × h em torno do canto (0, 0) (A_1338). Só vale na seção
            retangular: com seção circular ou poligonal ela sai do arquivo.
          </p>
        )}
        {f.tipoSecao === "circular" && (
          <div className="grid max-w-md grid-cols-2 gap-3">
            <CampoForm rotulo="Diâmetro D" unidade="cm" valor={f.d} aoMudar={(v) => muda("d", v)} />
            <CampoForm
              rotulo="Vazado Dint"
              unidade="cm, 0 = maciça"
              valor={f.dInterno}
              aoMudar={(v) => muda("dInterno", v)}
            />
          </div>
        )}
        {f.tipoSecao === "poligonal" && (
          <>
            <p className="text-muted-foreground text-xs">
              Vértices em cm, sem repetir o primeiro, no sentido horário. No anti-horário, o modo
              original reproduz a área negativa do SISTRUT (D-6) e o corrigido a inverte.
            </p>
            <TabelaEditavel
              titulo="Vértices da seção"
              colunas={[
                { chave: "x", rotulo: "x", unidade: "cm" },
                { chave: "y", rotulo: "y", unidade: "cm" },
              ]}
              linhas={f.vertices}
              aoMudar={(l) => muda("vertices", l)}
              novaLinha={linhaVertice}
              rotuloLinha={rotulo("Vértice")}
              vazio="Nenhum vértice."
            />
          </>
        )}
        {f.tipoSecao !== "retangular" && (
          <p className="text-xs" aria-live="polite">
            Ao aplicar: b × h = {caixa ? `${cm(caixa.b)} × ${cm(caixa.h)}` : "— (complete a seção)"}{" "}
            (hoje {cm(pilar.b)} × {cm(pilar.h)}).
          </p>
        )}
      </Grupo>
    </>
  );
}

const OPCOES_DAR_VINCULO = [
  { valor: "padrao", rotulo: "padrão (continuidade nas duas direções)" },
  { valor: "dado", rotulo: "dar x e y" },
] as const satisfies readonly OpcaoEscolha<"padrao" | "dado">[];

const OPCOES_VINCULO = VINCULOS_PILAR.map((v) => ({ valor: v, rotulo: ROTULO_VINCULO[v] }));

function GrupoVinculos({
  titulo,
  extra,
  valor,
  aoMudar,
}: {
  titulo: string;
  extra: string;
  valor: FormVinculos;
  aoMudar: (v: FormVinculos) => void;
}) {
  return (
    <Grupo titulo={titulo} extra={extra}>
      <Escolha
        rotulo={titulo}
        valor={valor.dado ? "dado" : "padrao"}
        opcoes={OPCOES_DAR_VINCULO}
        aoMudar={(v) => aoMudar({ ...valor, dado: v === "dado" })}
      />
      {valor.dado && (
        <div className="grid grid-cols-2 gap-3">
          <Escolha
            rotulo={`${titulo}, direção x`}
            valor={valor.x}
            opcoes={OPCOES_VINCULO}
            aoMudar={(x) => aoMudar({ ...valor, x })}
          />
          <Escolha
            rotulo={`${titulo}, direção y`}
            valor={valor.y}
            opcoes={OPCOES_VINCULO}
            aoMudar={(y) => aoMudar({ ...valor, y })}
          />
        </div>
      )}
    </Grupo>
  );
}

function AbaVinculos({ f, muda }: { f: FormPilar; muda: Muda }) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <GrupoVinculos
          titulo="Vínculo na base do lance"
          extra="Código Rx/Ry do nível (A_130a): a linha da matriz de flambagem do .PIP (Parâmetros da obra, pilares). le = Δcota × coeficiente(inferior, superior)."
          valor={f.vinculos}
          aoMudar={(v) => muda("vinculos", v)}
        />
        <GrupoVinculos
          titulo="Vínculo no topo do lance"
          extra="Só vale no último lance da coluna (o pavimento mais alto com este pilar); nos outros, o topo de um lance é a base do de cima e este campo é ignorado."
          valor={f.vinculosTopo}
          aoMudar={(v) => muda("vinculosTopo", v)}
        />
      </div>
      <Grupo
        titulo="Excentricidade da seção (A_1338)"
        extra="Do centro desta seção em relação ao da seção do lance de baixo. Só entra onde a seção muda: −(ΣN − Nj − Nj+1)·e vai ao topo do lance de baixo."
      >
        <Ligar
          rotulo="Dar a excentricidade (sem isto, 0)"
          marcado={f.comExcentricidade}
          aoMudar={(m) => muda("comExcentricidade", m)}
        />
        {f.comExcentricidade && (
          <div className="grid max-w-md grid-cols-2 gap-3">
            <CampoForm
              rotulo="Excentricidade x"
              unidade="cm"
              valor={f.excentricidadeX}
              aoMudar={(v) => muda("excentricidadeX", v)}
            />
            <CampoForm
              rotulo="Excentricidade y"
              unidade="cm"
              valor={f.excentricidadeY}
              aoMudar={(v) => muda("excentricidadeY", v)}
            />
          </div>
        )}
      </Grupo>
    </>
  );
}

const COLUNAS_MOMENTO_CARGA: readonly Coluna<"m" | "inclinacao" | "vao" | "rigidez">[] = [
  { chave: "m", rotulo: "M", unidade: "kN·m" },
  { chave: "inclinacao", rotulo: "Inclinação", unidade: "graus" },
  { chave: "vao", rotulo: "Vão", unidade: "m, com sinal" },
  { chave: "rigidez", rotulo: "Rigidez", unidade: "cm⁴" },
];

function GrupoCarga({
  titulo,
  extra,
  valor,
  aoMudar,
  children,
}: {
  titulo: string;
  extra: string;
  valor: FormCarga;
  aoMudar: (c: FormCarga) => void;
  children?: ReactNode;
}) {
  return (
    <Grupo titulo={titulo} extra={extra}>
      <Ligar
        rotulo={`Dar a ${titulo.toLowerCase()}`}
        marcado={valor.ligada}
        aoMudar={(ligada) => aoMudar({ ...valor, ligada })}
      />
      {valor.ligada && (
        <>
          <div className="compacto:grid-cols-1 grid grid-cols-[10rem_1fr] gap-3">
            <CampoForm
              rotulo={`${titulo}, normal`}
              unidade="kN"
              valor={valor.normal}
              aoMudar={(normal) => aoMudar({ ...valor, normal })}
            />
            {children}
          </div>
          <TabelaEditavel
            titulo={`Momentos da ${titulo.toLowerCase()}`}
            colunas={COLUNAS_MOMENTO_CARGA}
            linhas={valor.momentos}
            aoMudar={(momentos) => aoMudar({ ...valor, momentos })}
            novaLinha={linhaMomentoCarga}
            maximo={MAX_MOMENTOS_CARGA}
            rotuloLinha={rotulo("Momento")}
            vazio="Nenhum momento."
          />
        </>
      )}
    </Grupo>
  );
}

const OPCOES_MODO_TOPO = [
  { valor: "padrao", rotulo: "padrão (soma)" },
  { valor: "soma", rotulo: "soma com o .REP" },
  { valor: "substitui", rotulo: "substitui o .REP (zera o nível)" },
  { valor: "maxima", rotulo: "substitui só se a normal for maior" },
] as const satisfies readonly OpcaoEscolha<ModoCargaTopo>[];

const NOTA_MOMENTOS =
  "Até 4 momentos, como o slot A_1280 do PILGEEDI: M com sinal, inclinação, vão (m, com sinal) e rigidez da viga (≥ 0; só conta com vão > 0). Digitado no original: vão 1 e rigidez = Jvig/Lvig.";

function AbaCargas({ f, muda }: { f: FormPilar; muda: Muda }) {
  return (
    <>
      <Grupo
        titulo="Vento do lance (A_12dc)"
        extra="A normal soma no Nk do lance; os momentos (até 2, ângulo 0 = direção x) vão ao topo, à base e ao caso f."
      >
        <Ligar
          rotulo="Dar o vento (sem isto, sem vento)"
          marcado={f.comVento}
          aoMudar={(m) => muda("comVento", m)}
        />
        {f.comVento && (
          <>
            <CampoForm
              rotulo="Vento, normal"
              unidade="kN"
              valor={f.ventoNormal}
              aoMudar={(v) => muda("ventoNormal", v)}
              className="max-w-40"
            />
            <TabelaEditavel
              titulo="Momentos do vento"
              colunas={[
                { chave: "m", rotulo: "M", unidade: "kN·m" },
                { chave: "angulo", rotulo: "Ângulo", unidade: "graus" },
              ]}
              linhas={f.ventoMomentos}
              aoMudar={(l) => muda("ventoMomentos", l)}
              novaLinha={linhaMomentoVento}
              maximo={MAX_MOMENTOS_VENTO}
              rotuloLinha={rotulo("Momento")}
              vazio="Nenhum momento."
            />
          </>
        )}
      </Grupo>
      <GrupoCarga
        titulo="Carga no topo"
        extra={`A "Normal + Momento" do nível do topo do lance, além da que vem das vigas do pavimento (A_1280). A normal soma com a do .REP e os momentos vão aos slots livres depois dos dele. ${NOTA_MOMENTOS}`}
        valor={f.cargaTopo}
        aoMudar={(c) => muda("cargaTopo", c)}
      >
        <Escolha
          rotulo="Com o .REP do pavimento"
          valor={f.modoCargaTopo}
          opcoes={OPCOES_MODO_TOPO}
          aoMudar={(v) => muda("modoCargaTopo", v)}
          className="max-w-xs"
        />
      </GrupoCarga>
      <GrupoCarga
        titulo="Carga na base"
        extra={`A do nível da base do lance mais baixo da coluna (fundação ou viga de transição); nos outros lances é ignorada. Não entra em lance nenhum: só soma no resumo na fundação. ${NOTA_MOMENTOS}`}
        valor={f.cargaBase}
        aoMudar={(c) => muda("cargaBase", c)}
      />
      <Grupo
        titulo="Pilar sobre viga de transição"
        extra="Marque se a carga da base deste pilar já foi lançada na viga (carga concentrada no editor da viga), como no original. Sem isto, a carga da base de um pilar que não chega à fundação é marcada como falha."
      >
        <Ligar
          rotulo="A carga da base já está na viga de transição"
          marcado={f.transicao}
          aoMudar={(m) => muda("transicao", m)}
        />
      </Grupo>
    </>
  );
}

const COLUNAS_BARRA: readonly Coluna<"x" | "y" | "bitola">[] = [
  { chave: "x", rotulo: "x", unidade: "cm" },
  { chave: "y", rotulo: "y", unidade: "cm" },
  { chave: "bitola", rotulo: "Bitola", unidade: "mm", largura: "w-16" },
];

const NOTA_BARRAS =
  "Posição em cm a partir do canto inferior esquerdo da retangular (antes da rotação; as barras giram com ela) ou da origem dos vértices; bitola em mm, da tabela do PILAR.INI.";

const OPCOES_ARMADURA = [
  { valor: "nenhuma", rotulo: "nenhuma (o lance segue a variação de baixo ou a do plano)" },
  { valor: "dimensionada", rotulo: "começa uma variação, dimensionada pelo PILAREDI (<V>)" },
  { valor: "dada", rotulo: 'começa uma variação com as barras dadas (<R>, "Redefine")' },
] as const satisfies readonly OpcaoEscolha<ArmaduraForm>[];

function CamposEstribo({
  titulo,
  valor,
  aoMudar,
  semEstribo,
}: {
  titulo: string;
  valor: FormEstribo;
  aoMudar: (e: FormEstribo) => void;
  semEstribo: string;
}) {
  return (
    <>
      <Ligar
        rotulo={`${titulo}: dar o estribo (sem isto, ${semEstribo})`}
        marcado={valor.ligado}
        aoMudar={(ligado) => aoMudar({ ...valor, ligado })}
      />
      {valor.ligado && (
        <div className="grid max-w-md grid-cols-2 gap-3">
          <CampoForm
            rotulo={`${titulo}, estribo, bitola`}
            unidade="mm"
            valor={valor.bitola}
            aoMudar={(bitola) => aoMudar({ ...valor, bitola })}
          />
          <CampoForm
            rotulo={`${titulo}, estribo, espaçamento`}
            unidade="cm"
            valor={valor.espacamento}
            aoMudar={(espacamento) => aoMudar({ ...valor, espacamento })}
          />
        </div>
      )}
    </>
  );
}

function AbaArmadura({ f, muda }: { f: FormPilar; muda: Muda }) {
  const mudaVerificacao = (i: number, v: FormVerificacao) =>
    muda(
      "verificacoes",
      f.verificacoes.map((x, k) => (k === i ? v : x)),
    );
  return (
    <>
      <Grupo
        titulo="Armadura da variação (PILAREDI 3.2)"
        extra={
          <>
            O lance pode começar uma variação de armadura (ver "Vario a armadura" nos Parâmetros da
            obra, pilares). Com as barras dadas, o PILAREDI só as verifica; se não resistem, o nível
            é recusado ("NAO"). {NOTA_BARRAS}
          </>
        }
      >
        <Escolha
          rotulo="Armadura neste lance"
          valor={f.armadura}
          opcoes={OPCOES_ARMADURA}
          aoMudar={(v) => muda("armadura", v)}
          className="max-w-xl"
        />
        {f.armadura === "dada" && (
          <TabelaEditavel
            titulo="Barras da armadura"
            colunas={COLUNAS_BARRA}
            linhas={f.barrasArmadura}
            aoMudar={(l) => muda("barrasArmadura", l)}
            novaLinha={linhaBarra}
            rotuloLinha={rotulo("Barra")}
            vazio="Nenhuma barra: a armadura dada precisa de ao menos uma."
          />
        )}
        {f.armadura !== "nenhuma" && (
          <CamposEstribo
            titulo="Armadura"
            valor={f.estriboArmadura}
            aoMudar={(e) => muda("estriboArmadura", e)}
            semEstribo="o da tabela do .PIP pela bitola"
          />
        )}
      </Grupo>
      <Grupo
        titulo="Verificações da seção (PILAR opção 6)"
        extra={`A seção do lance com as barras dadas. Com os esforços digitados, uma verificação; sem eles, uma por lance, com Nk, Mk do caso e e o le do PILAREDI. O estribo não entra na verificação. ${NOTA_BARRAS}`}
      >
        {f.verificacoes.length === 0 && (
          <p className="text-muted-foreground text-xs">Nenhuma verificação.</p>
        )}
        {f.verificacoes.map((v, i) => (
          <Verificacao
            key={i}
            indice={i}
            valor={v}
            aoMudar={(x) => mudaVerificacao(i, x)}
            aoRemover={() =>
              muda(
                "verificacoes",
                f.verificacoes.filter((_, k) => k !== i),
              )
            }
          />
        ))}
        <div>
          <Button
            variant="outline"
            size="xs"
            onClick={() => muda("verificacoes", [...f.verificacoes, verificacaoVazia()])}
          >
            <Plus /> Acrescentar verificação
          </Button>
        </div>
      </Grupo>
    </>
  );
}

function Verificacao({
  indice,
  valor,
  aoMudar,
  aoRemover,
}: {
  indice: number;
  valor: FormVerificacao;
  aoMudar: (v: FormVerificacao) => void;
  aoRemover: () => void;
}) {
  const titulo = `Verificação ${indice + 1}`;
  const campo = (k: "nk" | "mxk" | "myk" | "lex" | "ley", r: string, unidade: string) => (
    <CampoForm
      rotulo={`${titulo}, ${r}`}
      unidade={unidade}
      valor={valor[k]}
      aoMudar={(x) => aoMudar({ ...valor, [k]: x })}
    />
  );
  return (
    <Grupo titulo={titulo}>
      <div className="flex justify-end">
        <Button variant="ghost" size="xs" aria-label={`Remover ${titulo}`} onClick={aoRemover}>
          <Trash2 /> Remover
        </Button>
      </div>
      <TabelaEditavel
        titulo={`Barras da ${titulo.toLowerCase()}`}
        colunas={COLUNAS_BARRA}
        linhas={valor.barras}
        aoMudar={(barras: Barra[]) => aoMudar({ ...valor, barras })}
        novaLinha={linhaBarra}
        rotuloLinha={rotulo("Barra")}
        vazio="Nenhuma barra."
      />
      <CamposEstribo
        titulo={titulo}
        valor={valor.estribo}
        aoMudar={(estribo) => aoMudar({ ...valor, estribo })}
        semEstribo="nenhum"
      />
      <Ligar
        rotulo={`${titulo}: digitar os esforços (sem isto, os de cada lance calculado)`}
        marcado={valor.comEsforcos}
        aoMudar={(comEsforcos) => aoMudar({ ...valor, comEsforcos })}
      />
      {valor.comEsforcos && (
        <div className="compacto:grid-cols-2 grid grid-cols-5 gap-3">
          {campo("nk", "Nk", "kN")}
          {campo("mxk", "Mxk", "kN·m")}
          {campo("myk", "Myk", "kN·m")}
          {campo("lex", "lex", "m")}
          {campo("ley", "ley", "m")}
        </div>
      )}
    </Grupo>
  );
}
