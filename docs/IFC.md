# Exportação IFC (BIM)

O botão "Exportar IFC" baixa `<obra>.ifc`, um arquivo IFC4 da estrutura, para abrir em Revit, ArchiCAD, Tekla, BIMcollab, Solibri e visualizadores IFC abertos. Na tela da obra, o botão fica junto dos DXF, no cabeçalho, e no menu "Mais ações" no celular. A obra exporta mesmo sem cálculo; aí os resultados e a armadura não entram e o Pset marca `Calculado = falso`.

Código: `src/exportacao/ifc/`.

| Arquivo | O que faz |
|---|---|
| `modelo.ts` | Monta o modelo BIM puro: níveis, perfis, trechos de viga, barras e propriedades, em metros |
| `escrever.ts` | Traduz o modelo para entidades IFC4 |
| `step.ts` | Escreve o STEP (ISO 10303-21) e gera os GlobalId |
| `exportarIfc.ts` | Entrada carregada sob demanda |
| `baixar.ts` | Ação do botão: carrega o chunk, gera e baixa |

## Por que IFC4 e escritor próprio

IFC4 (ADD2 TC1) é o esquema que Revit, ArchiCAD, Tekla e BIMcollab importam hoje, e ele tem `IfcReinforcingBar` com `PredefinedType` e `BarSurface`. Não há nada na exportação que exija IFC2x3.

O STEP sai de um escritor próprio (`step.ts`, 180 linhas). O web-ifc, a biblioteca mais usada para IFC no navegador, tem 1,6 MB só de `.wasm` (versão 0.0.78). O `@thatopen/components` tem 476 KB minificado. Não existe no npm um escritor IFC4 pequeno (`ifc-writer` não existe). O chunk da exportação tem 20,9 KB (8,4 KB gzip) e só é baixado no primeiro clique em "Exportar IFC". A tela da obra ganhou cerca de 0,7 KB com o botão.

A ordem dos atributos de cada entidade segue o EXPRESS oficial `IFC4_ADD2_TC1.exp` (buildingSMART, espelho em `github.com/buildingSMART/IFC4.x-development`, `reference_schemas/`).

## O que o arquivo tem

Estrutura espacial: `IfcProject` → `IfcSite` → `IfcBuilding` → `IfcBuildingStorey`.

- O primeiro nível é "Fundação", em 0.
- Depois vem um nível por pavimento, na cota do topo da laje dele. A elevação é a soma dos pés-direitos da base até ele.
- O pavimento-tipo vira um nível por repetição, "Tipo (k/n)". A repetição 1 é a de cima, como no cálculo dos pilares (`calculo/pilares/acumulacao.ts`).

| Elemento | Entidade | Geometria |
|---|---|---|
| Pilar | `IfcColumn` (`COLUMN`) | Lance do nível de baixo até o do pavimento, como no modelo da obra. Seção retangular b × h girada de `rotacao` em torno do centro, circular (`IfcCircleHollowProfileDef` se vazada) ou poligonal centrada pela caixa |
| Viga | `IfcBeam` (`BEAM`) | Extrudada ao longo do eixo, com o topo no nível. Um sólido por tramo com a seção do DESENHO (`Viga.secoes.trechos`, T com `IfcTShapeProfileDef` quando a mesa é mais larga que a alma); sem ela, bw × h na viga inteira |
| Laje | `IfcSlab` (`FLOOR`) | Polígono da laje (ou o retângulo) extrudado para baixo com a espessura h, a partir do nível. Sem furos |
| Barra | `IfcReinforcingBar` | Uma por posição (N1, N2…), agregada ao elemento por `IfcRelAggregates`. A barra modelo é um `IfcSweptDiskSolid` sobre uma polilinha, repetida com `IfcMappedItem` em cada cópia |

As vigas avulsas que a importação do SISTRUT cria para um `.VIG` sem `.LAJ` (uma escada calculada à parte no VIGA) entram como `IfcBeam`. Elas recebem `ObjectType` "Escada (viga avulsa do SISTRUT)", `Escada = verdadeiro` no Pset e a descrição do nível. Os pilares desse pavimento são só apoios de cálculo e não entram.

Material: `IfcMaterial` "Concreto C{fck}" (categoria `concrete`) em todos os elementos de concreto, e "Aço CA-50" (ou o aço da barra) nas barras.

Psets:

- `Pset_ColumnCommon`, `Pset_BeamCommon` e `Pset_SlabCommon` levam `Reference` (o nome, P3, V1) e `LoadBearing`. A viga leva também o `Span`.
- `Pset_ReinforcingBarCommon` leva `Reference` (a posição).
- `Pset_OpenStrut` em cada elemento: nome original, pavimento e nível, seção, `Concreto`, `fck_MPa`, `Aco`, `AcoEstribo`, `Cobrimento_cm`, `Norma`, `ModoCalculo` (NB-1/78) e `Calculado`. Com cálculo, entram também os resultados principais:
  - pilar: `Nk_kN`, `Nd_kN`, `MdX_kNm`, `MdY_kNm`, λ, As necessária e adotada, `Armadura`, `Estribos`, taxa;
  - viga: `MdPositivo_kNm`, `MdNegativo_kNm`, `Vd_kN`, As positiva e negativa, armadura e estribos por tramo;
  - laje: momentos, Asx e Asy, barras, e `Flecha_cm` e `FlechaLimite_cm` pela NBR 6118 (o caminho do SISTRUT não calcula flecha, e a propriedade não sai);
  - todos: o número de avisos e o texto deles.
- `Pset_OpenStrut` do projeto: norma, materiais, número de pavimentos, a frase de conferência por engenheiro responsável e os avisos da exportação.

As grandezas vão como `IfcReal` com a unidade no nome da propriedade (`Nk_kN`), para não depender da unidade de força do arquivo.

## Armadura

Com cálculo, a exportação inclui as barras. `gerarIfc(obra, calculo, { armadura: false })` as deixa de fora.

Vigas, pela NB-1/78, usam o detalhamento do SISTRUT (`resultado.sistrut`, o DESINIT, com a armadura editada do `.EDV`). O DESINIT mede as barras a partir da face externa do primeiro apoio. Isso foi conferido na obra E2E do oráculo: positiva de 2 a 818 cm numa viga de 8 m com apoios de 20 cm, e estribos de 20 a 400 e de 420 a 800. Pela NBR 6118, as vigas usam o detalhamento da V2 (`telas/detalhamento.ts`), medido a partir do primeiro nó. Em cada viga:

- as longitudinais ficam numa camada, espalhadas na largura útil (bw − 2·(c + φt) − φ): positivas e construtivas embaixo, negativas e porta-estribos em cima;
- os ganchos ficam voltados para dentro da viga e limitados à altura útil;
- a pele fica nas faces;
- os estribos são retangulares na alma, um em cada abscissa do detalhamento.

Pilares retangulares usam a distribuição por face que o cálculo verificou (`porFaceX`, `porFaceY`). Pilares circulares têm as barras em círculo. Os estribos seguem o espaçamento do cálculo ao longo do lance.

O estribo é uma polilinha aberta que termina 2φ antes do ponto inicial. O IfcOpenShell não gera o sólido de um `IfcSweptDiskSolid` sobre polilinha fechada.

## Unidades, origem e GlobalId

O arquivo usa metro, m², m³ e radiano. A origem do `IfcSite` e do `IfcBuilding` é a origem da planta do OpenStrut, sem georreferência (a obra não guarda coordenadas geográficas nem CRS).

O GlobalId é um hash de 128 bits do nome da obra com o id do elemento, o nível e o papel. Exportar a mesma obra de novo dá os mesmos ids, e os comentários do BCF (BIMcollab) continuam ligados aos elementos. Renomear a obra muda todos os ids.

## Validação

- `bun run test src/exportacao/ifc` roda os testes de unidade (`ifc.test.ts`): escritor STEP, níveis, contagens, dimensões, perfis, origem das barras do SISTRUT, escada, saída determinística e GlobalIds únicos.
- `ifc.ifcopenshell.test.ts` faz o roundtrip com o IfcOpenShell. O teste gera o IFC da obra de 3 pavimentos e da obra E2E do oráculo. Depois roda `__validacao__/conferir.py` com `python -I`, numa pasta temporária. O script valida o esquema e as regras WHERE do EXPRESS, gera a geometria de cada elemento e confere níveis, contagens e caixas. Sem a variável `OPENSTRUT_IFC_PYTHON` o teste é pulado. Para rodar:

  ```sh
  py -3 -m venv C:/tmp/openstrut-ifc/venv
  C:/tmp/openstrut-ifc/venv/Scripts/python.exe -m pip install ifcopenshell pytest
  OPENSTRUT_IFC_PYTHON=C:/tmp/openstrut-ifc/venv/Scripts/python.exe bun run test src/exportacao/ifc
  ```

  O `pytest` é necessário para as regras WHERE (`express_rules`). O teste leva cerca de 1 min.
- `PORT=4409 bunx playwright test e2e/ifc.spec.ts` importa a obra E2E pela tela, baixa o IFC pelo cabeçalho e pelo menu do celular, e confere que o chunk `exportarIfc-*.js` só é pedido no clique.

## Limitações

- A seção da viga é a do `.SEC` quando existe, que pode diferir de bw × h da planta (na E2E, 12 × 40 contra 12 × 50). A viga vai de eixo a eixo dos apoios e sobrepõe os pilares e a laje; a mesa da seção T sobrepõe a laje. Quem tira quantitativo de concreto do IFC precisa descontar essas sobreposições.
- A rotação do pilar é em torno do centro da seção. O PILDADOS gira em torno do canto (0, 0); a planta da V2 não desenha a rotação.
- O pilar vai de piso a piso, sem a excentricidade entre lances (`Pilar.excentricidade`). A laje rebaixada (grupo negativo do SISTRUT) fica no nível.
- Não entram como barras: as das lajes, os grampos das vigas, a segunda camada (todas as barras numa camada) e o estribo duplo (`ladoALado`). Também não entram os traspasses dos pilares nem a armadura de pilar poligonal. O arquivo lista os grampos e os pilares poligonais em `AvisosExportacao`.
- A flecha só sai nas lajes pela NBR 6118. O resultado comum das vigas não tem flecha, e o caminho do SISTRUT não calcula a das lajes.
- As vigas avulsas (escada) ficam num nível próprio, no topo da pilha, na posição que a importação deu a elas, abaixo da planta do prédio.
- Não há `IfcElementQuantity` (Qto_*), tipos (`IfcColumnType` etc.), eixo analítico (`Axis`) nem `IfcMaterialProfileSetUsage`.
