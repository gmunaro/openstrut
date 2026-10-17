# Vista 3D

A aba 3D da tela da obra mostra o prédio montado a partir do modelo da obra, sem nenhum passo manual. Ela abre com o prédio inteiro enquadrado e leva às partes dele: um pavimento, um elemento com os vizinhos ou um pórtico. A vista é um apoio visual. Todo número que ela mostra também está nas abas Planta e Resultados.

O código fica em `src/telas/obra3d/`. A tela da obra (`src/telas/obra/TelaObra.tsx`) só ganhou a aba e a ligação com a planta e os resultados.

## Fotos

As fotos são de uma obra do oráculo de vários pavimentos: os arquivos da obra E2E do oráculo (`src/telas/__fixtures__/sistrut/`) em três pavimentos, TER, TIPO e COB, empilhados por um `.COL` com as cotas 0,40, 3,40 e 6,40 m. O `e2e/vista3d.spec.ts` gera essas fotos.

| Arquivo | O que mostra |
|---|---|
| `vista-3d/todo-1366.png` | o prédio inteiro ao abrir, com a escada sem posição ao lado |
| `vista-3d/pavimento-1366.png` | o TIPO isolado, com o COB e o TER transparentes |
| `vista-3d/viga-com-vizinhos-1366.png` | a V2 do COB com os pilares do eixo, as vigas que cruzam e as lajes |
| `vista-3d/coluna-1366.png` | a coluna do P5 inteira, da fundação ao topo |
| `vista-3d/portico-1366.png` | o pórtico do eixo x = 0, em vista de lado |
| `vista-3d/corte-1366.png` | a camada de corte 1 m acima da laje do TIPO |
| `vista-3d/explodido-nk-1366.png` | o explodido com os pilares coloridos pelo Nk |
| `vista-3d/todo-360.png`, `selecao-360.png` | o celular em pé, com um elemento tocado |
| `vista-3d/todo-4k.png`, `selecao-4k.png` | a tela 3840 × 2160 |

## Como o modelo é montado

`montarModelo(obra)` (`modelo.ts`) devolve os níveis, os sólidos de cada peça, as colunas e os eixos. É uma função pura, em metros, com z para cima. A cena só triangula esses sólidos (`geometria.ts`).

**Níveis e cotas.** A obra não guarda cota. A fundação é a cota 0, e a cota de cada nível é a soma dos pés-direitos de baixo para cima (`obra.pavimentos` vem do topo para a base). O importador do SISTRUT converte as cotas do `.COL` em pé-direito, então a pilha sai igual à do `.COL`. Cada repetição de um pavimento-tipo é um nível; a repetição 1 é a mais baixa, como no motor (`sistrut/obra.ts`).

**Pilares.** O lance de um pavimento vai da cota do nível de baixo à cota do nível dele. A seção é a real. O retângulo b × h tem b em x e gira `rotacao` graus, no sentido anti-horário, em torno do centro. A circular vira um polígono de 24 lados (12 em obras com mais de 400 lances), sem o vazado. A poligonal fica com o centro da caixa no ponto do pilar.

**Colunas.** Os lances de níveis seguidos formam uma coluna quando têm o mesmo nome a menos de 50 cm (pilar deslocado, como o P3 da Alpha1, a 10,5 cm) ou, com nomes diferentes, quando ficam a menos de 15 cm. Um lance sem par embaixo, fora do primeiro nível, começa uma coluna que nasce sobre viga de transição. Essa coluna não tem fundação e leva uma nota.

**Vigas.** O topo da viga fica na cota do nível. Com `secoes.trechos` na mesma quantidade dos trechos entre os nós de `geometriaDasVigas`, cada trecho tem a sua seção; senão, a viga inteira usa a seção do `.SEC` (quando todas são iguais) ou bw × h. A seção T põe a mesa bf × hf no topo, junto com a alma.

**Lajes.** A placa ocupa o `poligono` ou o retângulo x, y, lx, ly, sem buracos, com a espessura abaixo da cota. A laje rebaixada desce o rebaixo: o `grupo` negativo do SISTRUT vale −(Hmáx − H) em cm. A viga continua com o topo no nível, como o rebaixo pe/pd do `.FOR` do DESENHO.

**Fundação.** Cada coluna que chega ao chão tem um bloco de marcação de −0,50 a 0, com 25 cm de folga em volta da seção. A fundação não é calculada.

### Escada

O importador do SISTRUT põe as vigas de um `.VIG` sem `.LAJ` (a escada calculada à parte no VIGA) num pavimento só delas. Esse pavimento não tem lajes, todos os apoios das vigas estão desconsiderados e todos os pilares estão marcados como transição (`InicioSistrut.ts`, `pavimentoDeVigasAvulsas`). Ele também vem deslocado na planta. `pavimentoAvulso` reconhece esse pavimento pela marca, e a vista não o empilha.

A posição sai das cargas. O usuário do original lança a reação de cada apoio da escada como carga concentrada nas vigas que a recebem. Para cada viga da escada, `escada.ts` faz o seguinte:

1. calcula as duas reações de viga biapoiada pela estática, com as cargas da própria viga;
2. procura nas vigas do prédio com o nome dos apoios do `.FOR` uma carga concentrada igual a menos de 2 % ou uma carga `reacao` que cite a viga;
3. converte o trecho e a posição da carga em ponto da planta pelos nós da viga que a recebe;
4. liga os dois pontos, cada um na cota do seu nível.

Na Alpha1, as reações da VE1 (12,77 kN) e da VE2 (20,70 e 17,52 kN) casam com as cargas da V7 e da V9 do TER e do SUP. A escada sobe de y = 2,35 m no TER a y = 6,365 m no SUP, em x = 1,10 e 2,475 m. Entre duas vigas paralelas que vencem os mesmos níveis, a vista desenha uma placa de 10 cm que é só visual, porque o SISTRUT não tem a laje da escada.

Sem os dois apoios casados em níveis diferentes, a viga fica ao lado do prédio, 2 m à direita, no primeiro nível. Ela leva o rótulo "posição desconhecida", e o painel mostra um aviso. Ela nunca vai para cima da cobertura.

Um campo opcional resolveria os casos sem carga lançada. Seria `Pavimento.entreNiveis?: { de: string; ate: string }`, com os ids dos pavimentos que a escada liga, gravado pelo importador ou pelo usuário. O importador é de outro trabalho, então o campo não foi criado.

## Partes e navegação

O foco (`partes.ts`) é um destes:

- **Prédio.** Tudo sólido. É o foco ao abrir.
- **Pavimento isolado.** O nível sólido, os de cima e de baixo transparentes ou ocultos (opção no painel).
- **Elemento com vizinhos.** Numa viga, os pilares do nível sobre o eixo, as vigas que cruzam ou terminam nela e as lajes com um lado no eixo. Num pilar, a coluna inteira, da fundação ao topo, com as vigas sobre cada lance. Numa laje, as vigas dos lados e os pilares dos cantos. As lajes vizinhas de uma viga ou de um pilar ficam transparentes para não esconder o que está embaixo.
- **Pórtico.** Uma linha da planta com vigas (x = c ou y = c). Dois planos de corte deixam uma faixa de 60 cm em volta da linha, e a câmera fica de frente para ela.

A trilha no alto ("Prédio › COB › V2", "Prédio › Coluna P5", "Prédio › Eixo x = 1,10 m (V6, V7)") volta a cada passo. A seleção que sai do foco deixa de valer.

### Ver em 3D a partir da planta e dos resultados

A planta e os resultados são de outros trabalhos, então o atalho ficou só como ponto de entrada (`link.ts`):

- dentro do app, `pedirVer3d({ pavimentoId, tipo, id })` abre a aba 3D com o elemento em foco e selecionado;
- por URL, `/obra?ver3d=<tipo>~<pavimentoId>~<id>` (`valorVer3d`) faz o mesmo ao abrir a tela.

Para ligar o botão "Ver em 3D" no painel de propriedades da planta ou numa linha dos resultados, basta chamar `pedirVer3d` com o pavimento ativo e a seleção. O caminho de volta já existe: o cartão do elemento tem "Ver na planta" (seleciona o elemento no pavimento dele) e "Ver nos resultados" (abre a aba no pavimento).

## Cores e marcas

**Situação.** As cores são as da planta (`COR_SITUACAO`): verde sem avisos, âmbar com avisos e vermelho com falha, pela mesma regra (`planta/situacao.ts`). Sem cálculo, cada tipo fica num cinza próprio. A legenda conta lajes, vigas e pilares por situação, e o painel lista as peças com falha. As vigas da escada recebem a situação do cálculo delas.

**Grandeza.** O mapa de cor opcional pinta um tipo numa rampa azul de um só matiz, do claro (menor) ao escuro (maior), e deixa os outros tipos transparentes. As grandezas são o Nk de cada lance de pilar (na base do lance), a taxa de armadura das vigas (As máximo / bw·h do primeiro trecho) e o maior momento positivo das lajes. A legenda mostra a unidade e os extremos, já convertidos para tf quando a obra está em tf.

**Defeitos do original.** No modo "Como o SISTRUT original", uma placa "!" fúcsia marca as peças que algum erro documentado em `docs/MODO-CALCULO.md` atinge. Ela não usa o vermelho de falha:

- pilar que nasce sobre viga com a carga dele lançada, a carga em dobro na fundação (P-b, aviso do lance);
- verificação de pilar em laço ou com Nk nulo (D-2, D-3);
- viga parada em "Continuo com o processamento desta Viga S/N";
- laje em que a otimização dos negativos não converge (R3);
- os avisos com opção (`avisosComOpcao`): pilar sobre transição e viga acima do limite.

O cartão do elemento repete o texto do defeito, e o painel lista as peças marcadas.

## Interação e acessibilidade

- Órbita, zoom e pan pelo `OrbitControls`. No mouse, arrastar gira, a roda aproxima e o botão direito move. No toque, um dedo gira e dois dedos fazem pinça e pan. Com o desenho em foco, as setas do teclado movem a vista.
- Os botões de vista são Perspectiva, Frente, Lado, Topo e Enquadrar. Frente, lado e topo usam câmera ortográfica.
- Tocar ou clicar numa peça seleciona e mostra o cartão com nome, nível, seção, situação e resultado principal (As, Nd ou momento).
- Mostrar e ocultar por tipo (lajes, vigas, pilares, escada, fundação) e por pavimento.
- O explodido afasta os níveis 0,8 vez o pé-direito médio (no mínimo 1,5 m) e só move os grupos, sem refazer a geometria.
- Todos os controles são botões, caixas de seleção e listas comuns, operáveis por teclado. A lista "Elemento (com os vizinhos)" seleciona qualquer peça sem apontar no desenho. Uma região `aria-live` anuncia a seleção.
- Com `prefers-reduced-motion`, a câmera e o explodido mudam sem animação e a órbita não tem inércia.
- Sem WebGL, a aba mostra uma mensagem e indica as abas Planta e Resultados. O pedaço do three.js nem é baixado.

## Exportar

"PNG da vista" baixa o que está na tela. "glTF (.glb)" baixa as malhas sólidas visíveis com a cor de cada peça, um grupo por nível. O exportador do three.js é carregado só no clique.

## Desempenho

A cena mescla a geometria por nível e por tipo. Cada grupo tem uma malha sólida, uma transparente e as arestas, com a cor por vértice. A seleção acha a peça pelo índice do triângulo. O LOD é simples: as arestas somem nos níveis a mais de 60 m da câmera, e os pilares circulares têm menos lados em obra grande. A vista só desenha quando algo muda.

O e2e mede uma obra de 20 níveis (cobertura, tipo × 18 e primeiro) com 50 pilares por planta, com a CPU 4 vezes mais lenta pelo DevTools e WebGL por software (SwiftShader). A máquina estava com a CPU a 100 % por outros trabalhos, então os tempos variaram bastante entre rodadas:

| Medida | Valor |
|---|---|
| níveis, lances de pilar | 20, 1000 |
| chamadas de desenho | 81 |
| triângulos | 24 880 |
| reconstruir a geometria (foco, cor, visibilidade) | 159 a 405 ms |
| desenhar um quadro (CPU, SwiftShader) | 1,9 a 18 ms |
| abrir a aba (baixar o pedaço, montar, primeiro quadro) | 3,0 a 15,3 s |

Num celular com GPU, o quadro não passa pela rasterização em software. As 81 chamadas e os 25 mil triângulos ficam bem abaixo do que um celular desenha a 60 quadros por segundo. A medida em aparelho real não foi feita.

## Tamanho e PWA

A aba carrega `Vista3D` por `import()` dinâmico. O three.js e o código da vista vão para pedaços com o prefixo `3d-` (`vite.config.ts`, `chunkFileNames`), que ficam fora do precache do service worker. Eles entram no cache "vista-3d" na primeira vez que a aba abre e funcionam offline daí em diante. Antes disso, a aba 3D precisa de rede.

| Pedaço | Tamanho | gzip | Quando baixa |
|---|---|---|---|
| `3d-Vista3D` (vista + three.js) | 624,3 kB | 160,1 kB | ao abrir a aba 3D |
| `3d-GLTFExporter` | 36,8 kB | 10,7 kB | ao exportar glTF |
| `3d-corte` | 1,4 kB | 0,7 kB | ao ligar a camada de corte |
| carregamento inicial (`index`) | +0,4 kB | +0,03 kB | sempre |
| tela da obra (`obra`) | +2,1 kB | +1,0 kB | ao abrir uma obra |
| CSS | +2,0 kB | +0,3 kB | sempre |

O precache do PWA ficou com 1539,8 KiB, contra 1535,6 KiB na `main` (912bd50). Sem a regra do prefixo, os pedaços da 3D somariam 2186,8 KiB.

## Ponto de extensão: camadas

Recursos novos da vista (armadura 3D, render PBR, tour, comparação Original × Corrigido, sequência construtiva, realidade aumentada) entram como camadas, sem editar o núcleo (`cena.ts`, `Vista3D.tsx`). Uma camada é carregada sob demanda quando o usuário a liga na seção "Camadas" do painel. O contrato está em `camadas.ts`.

```ts
export interface Camada {
  /** Liga a camada; devolve a limpeza (chamada ao desligar ou ao sair da vista). */
  ativar(ctx: ContextoVista): (() => void) | void;
  /** Controles da camada, no painel lateral enquanto ela estiver ligada. */
  Painel?: ComponentType<{ ctx: ContextoVista }>;
}
```

O `ContextoVista` dá acesso a:

| Membro | Para quê |
|---|---|
| `cena`, `renderer`, `camera`, `controles` | os objetos vivos do three.js (`renderer.xr` para a realidade aumentada) |
| `modelo`, `obra`, `calculo`, `dados` | o modelo 3D, a obra, o cálculo e os dados por chave de elemento |
| `elemento(chave)`, `grupoDoNivel(i)` | o elemento do modelo e o grupo do nível (filhos andam com o explodido) |
| `alturaNaCena(nivel, cota)` | a altura Y de uma cota, com o deslocamento do explodido |
| `selecao`, `selecionar(chave)` | a seleção atual |
| `aoMudar("selecao" \| "cena" \| "camera", f)` | eventos da vista |
| `aoQuadro(f)` | callback a cada quadro, para animação e path tracing; enquanto houver algum, a vista desenha todo quadro |
| `pedirRender()` | redesenhar no próximo quadro |
| `moverCamera(posicao, alvo, animar?)`, `travarControles(sim)` | a câmera controlada por fora (tour, 4D) |
| `definirMateriais(fabrica)` | trocar os materiais "solido", "fantasma", "arestas" e "destaque" (PBR); `null` volta aos padrão |
| `definirPlanosCorte(id, planos)` | planos de corte de uma fonte; a vista junta os de todas |
| `definirFiltro(id, f)` | esconder elementos (4D, comparação); a cena é refeita |

As malhas sólidas e transparentes têm o atributo `color` por vértice. Um material trocado por `definirMateriais` precisa de `vertexColors: true` para manter as cores de situação.

Para registrar uma camada, acrescente uma linha a `CAMADAS` em `camadas.ts`. O import dinâmico faz o pedaço dela sair com o prefixo `3d-`, fora do precache. Cada recurso fica na pasta dele (`obra3d/armadura/`, `obra3d/render/`, `obra3d/tour/`, `obra3d/comparar/`, `obra3d/sequencia/`, `obra3d/ar/`).

### Exemplo mínimo

Uma camada que gira a câmera em volta do prédio enquanto está ligada:

```ts
// src/telas/obra3d/tour/giro.ts
import { Vector3 } from "three";
import type { Camada } from "../camadas";

export const camada: Camada = {
  ativar(ctx) {
    ctx.travarControles(true);
    const alvo = ctx.controles.target.clone();
    const raio = ctx.camera.position.distanceTo(alvo);
    const altura = ctx.camera.position.y;
    let angulo = 0;
    const parar = ctx.aoQuadro((dt) => {
      angulo += dt * 0.3;
      ctx.camera.position.set(alvo.x + raio * Math.cos(angulo), altura, alvo.z + raio * Math.sin(angulo));
      ctx.camera.lookAt(alvo);
    });
    return () => {
      parar();
      ctx.travarControles(false);
      void ctx.moverCamera(new Vector3(alvo.x + raio, altura, alvo.z), alvo, false);
    };
  },
};
```

```ts
// em CAMADAS (camadas.ts)
{
  id: "giro",
  nome: "Girar o prédio",
  descricao: "Gira a câmera em volta do prédio.",
  carregar: () => import("./tour/giro").then((m) => m.camada),
},
```

O corte por pavimento (`camadas/corte.tsx`) é uma camada real, que usa `definirPlanosCorte`, `alturaNaCena`, `aoMudar("cena")` e um `Painel`.

## Testes

- `src/telas/obra3d/modelo.test.ts` (20 testes, com conta à mão): cotas com repetições, seção girada 90° e 30°, circular, poligonal horário, colunas com pilar deslocado e de transição, bloco de fundação, seção por trecho e mesa T, laje rebaixada, normais para fora, reações da escada, posição da escada pelas cargas e fora do prédio, vizinhos, eixo e trilha.
- `e2e/vista3d.spec.ts` (5 testes, `PORT=4407 bun x playwright test e2e/vista3d.spec.ts`): obra de 3 pavimentos (girar, selecionar, ocultar, explodido, teclado, ver na planta), obra do oráculo de vários pavimentos importada (todo, partes, trilha, camada de corte, mapa de Nk, PNG e glTF), 360 × 800 com toque, 3840 × 2160 e o desempenho de 20 pavimentos. Todos conferem que o console não tem erro nem aviso.

## Limitações

- A circular com vazado aparece cheia.
- A escada sem carga lançada no prédio não tem posição (ver "Escada").
- O alinhamento da viga com a laje rebaixada segue o `.FOR` (topo da viga no nível); o `alinhamento` e o `eixo` do `.FOR` não deslocam a viga.
- A medida de desempenho foi feita com WebGL por software numa máquina carregada, não num celular.
