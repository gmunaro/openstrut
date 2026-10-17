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

**Níveis e cotas.** A obra não guarda cota. A fundação é a cota 0, e a cota de cada nível é a soma dos pés-direitos de baixo para cima (`obra.pavimentos` vem do topo para a base). O importador do SISTRUT converte as cotas do `.COL` em pé-direito, então a pilha sai igual à do `.COL`. Cada repetição de um pavimento-tipo é um nível. A repetição 1 é a mais alta e a n é a de baixo, como no motor (`sistrut/obra.ts`, `pilares/acumulacao.ts`) e na aba Resultados: "TIPO (3/3)" é o primeiro tipo acima do térreo.

**Pilares.** O lance de um pavimento vai da cota do nível de baixo à cota do nível dele. A seção é a real. O retângulo b × h tem b em x e gira `rotacao` graus, no sentido anti-horário, em torno do centro. A circular vira um polígono de 24 lados (12 em obras com mais de 400 lances), sem o vazado. A poligonal fica com o centro da caixa no ponto do pilar.

**Colunas.** Os lances de níveis seguidos formam uma coluna quando têm o mesmo nome a menos de 50 cm (pilar deslocado, como o P3 da Alpha1, a 10,5 cm) ou, com nomes diferentes, quando ficam a menos de 15 cm. Um lance sem par embaixo, fora do primeiro nível, começa uma coluna que nasce sobre viga de transição. Essa coluna não tem fundação e leva uma nota.

**Vigas.** O topo da viga fica na cota do nível. Com `secoes.trechos` na mesma quantidade dos trechos entre os nós de `geometriaDasVigas`, cada trecho tem a sua seção; senão, a viga inteira usa a seção do `.SEC` (quando todas são iguais) ou bw × h. A seção T põe a mesa bf × hf no topo, junto com a alma.

**Lajes.** A placa ocupa o `poligono` ou o retângulo x, y, lx, ly, sem buracos, com a espessura abaixo da cota. A laje rebaixada desce o rebaixo: o `grupo` negativo do SISTRUT vale −(Hmáx − H) em cm. A viga continua com o topo no nível, como o rebaixo pe/pd do `.FOR` do DESENHO.

**Fundação.** Cada coluna que chega ao chão tem um bloco de marcação de −0,50 a 0, com 25 cm de folga em volta da seção. A fundação não é calculada.

### Escada

O importador do SISTRUT põe as vigas de um `.VIG` sem `.LAJ` (a escada calculada à parte no VIGA) num pavimento só delas. Esse pavimento não tem lajes, todos os apoios das vigas estão desconsiderados e todos os pilares estão marcados como transição (`InicioSistrut.ts`, `pavimentoDeVigasAvulsas`). Ele também vem deslocado na planta. `pavimentoAvulso` reconhece esse pavimento por essas marcas juntas (sem lajes, com vigas, todos os pilares de transição e todos os apoios desconsiderados), e a vista não o empilha.

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

**Situação.** As cores são as da planta (`COR_SITUACAO` em `planta/Desenho.tsx`): verde sem avisos, âmbar com avisos e vermelho com falha. A regra que decide a situação também é a da planta (`planta/situacao.ts`). Sem cálculo, cada tipo fica num cinza próprio. A legenda conta lajes, vigas e pilares por situação, e o painel lista as peças com falha. As vigas da escada recebem a situação do cálculo delas.

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

A cena mescla a geometria por nível e por tipo. Cada grupo tem uma malha sólida, uma transparente e as arestas, com a cor por vértice. A seleção acha a peça pelo índice do triângulo. O LOD é simples: na perspectiva, as arestas somem nos níveis a mais de 60 m da câmera; na ortográfica, quando a vista mostra mais de 60 m de altura. Os pilares circulares têm menos lados em obra grande. A vista só desenha quando algo muda.

O e2e mede uma obra de 20 níveis (cobertura, tipo × 18 e primeiro) com 50 pilares por planta, com a CPU 4 vezes mais lenta pelo DevTools e WebGL por software (SwiftShader). A máquina estava com a CPU a 100 % por outros trabalhos, então os tempos variaram bastante entre rodadas:

| Medida | Valor |
|---|---|
| níveis, lances de pilar | 20, 1000 |
| chamadas de desenho | 81 |
| triângulos | 24 880 |
| reconstruir a geometria (foco, cor, visibilidade) | 159 a 405 ms |
| aplicar um filtro de camada (`definirFiltro`) | 1,2 ms |
| desenhar um quadro (CPU, SwiftShader) | 1,9 a 18 ms |
| abrir a aba (baixar o pedaço, montar, primeiro quadro) | 3,0 a 15,3 s |

Num celular com GPU, o quadro não passa pela rasterização em software. As 81 chamadas e os 25 mil triângulos ficam bem abaixo do que um celular desenha a 60 quadros por segundo. A medida em aparelho real não foi feita.

## Tamanho e PWA

A aba carrega `Vista3D` por `import()` dinâmico. O three.js e o código da vista vão para pedaços com o prefixo `3d-` (`vite.config.ts`, `chunkFileNames`), que ficam fora do precache do service worker. Eles entram no cache "vista-3d" na primeira vez que a aba abre e funcionam offline daí em diante. Antes disso, a aba 3D precisa de rede.

| Pedaço | Tamanho | gzip (relatório do Vite) | Quando baixa |
|---|---|---|---|
| `3d-Vista3D` (vista + three.js) | 626,6 kB | 160,6 kB | ao abrir a aba 3D |
| `3d-GLTFExporter` | 36,8 kB | 10,7 kB | ao exportar glTF |
| `3d-corte` | 1,5 kB | 0,8 kB | ao ligar a camada de corte |
| carregamento inicial (`index`) | +0,4 kB | +0,04 kB | sempre |
| tela da obra (`obra`) | +2,1 kB | +1,0 kB | ao abrir uma obra |
| CSS | +1,7 kB | +0,3 kB | sempre |

Pelo relatório do vite-plugin-pwa, o precache ficou com 1539,5 KiB, contra 1535,6 KiB na `main` (912bd50). Sem a regra do prefixo, ele iria a 2186,8 KiB.

## Ponto de extensão: camadas

Recursos novos da vista (armadura 3D, render PBR, tour, comparação Original × Corrigido, sequência construtiva 4D, realidade aumentada) entram como camadas, sem editar o núcleo (`cena.ts`, `Vista3D.tsx`). Cada recurso fica na pasta dele (`obra3d/armadura/`, `obra3d/render/`, `obra3d/tour/`, `obra3d/comparar/`, `obra3d/sequencia/`, `obra3d/ar/`) e acrescenta uma linha a `CAMADAS` em `camadas.ts`. O botão da camada aparece na seção "Camadas" do painel. O código dela só é baixado quando o usuário liga o botão, num pedaço `3d-` fora do precache.

### Contrato

```ts
// camadas.ts
export interface Camada {
  /** Liga a camada; devolve a limpeza (chamada ao desligar ou ao sair da vista). */
  ativar(ctx: ContextoVista): (() => void) | void;
  /** Controles da camada, no painel lateral enquanto ela estiver ligada. */
  Painel?: ComponentType<{ ctx: ContextoVista }>;
}

export interface DefinicaoCamada {
  id: string;
  nome: string; // texto do botão
  descricao: string; // dica do botão
  carregar: () => Promise<Camada>; // () => import("./pasta/arquivo").then((m) => m.camada)
}
```

`ativar` roda uma vez ao ligar. A função que ele devolve roda ao desligar o botão e também ao sair da aba 3D, sempre antes de a cena ser destruída. Ela deve desfazer tudo o que a camada fez: tirar objetos da cena, cancelar `aoQuadro` e `aoMudar`, remover filtros e planos de corte, devolver os materiais e destravar os controles. O `Painel` é um componente React comum. Ele recebe o mesmo `ctx` e some quando a camada desliga. Estado que precisa sobreviver entre ligar e desligar fica no módulo da camada.

<!-- tipos:inicio -->
### Tipos

Importe os tipos de `obra3d/api.ts` (`import type { Camada, ContextoVista, Elemento3D } from "../api";`). As declarações abaixo são cópia do código; `api.test.ts` falha se elas mudarem e este texto não. `EstadoElemento` é o nome de `Estado` em `api.ts`. `Ponto` é `{ x: number; y: number }` em metros da planta.

`camadas.ts`:

```ts
export interface Camada {
  /** Liga a camada; devolve a limpeza (chamada ao desligar ou ao sair da vista). */
  ativar(ctx: ContextoVista): (() => void) | void;
  /** Controles da camada, no painel lateral enquanto ela estiver ligada. */
  Painel?: ComponentType<{ ctx: ContextoVista }>;
}

/** Entrada da barra: o botão liga/desliga e só então carrega o código da camada. */
export interface DefinicaoCamada {
  id: string;
  nome: string;
  descricao: string;
  carregar: () => Promise<Camada>;
}

/** O que a vista expõe para uma camada. Objetos do three.js são os vivos: a camada pode
 *  ler e mexer, mas deve desfazer o que fez na limpeza (retorno de `ativar`). */
/** O que a vista expõe para uma camada. Objetos do three.js são os vivos: a camada pode
 *  ler e mexer, mas deve desfazer o que fez na limpeza (retorno de `ativar`).
 *  A cena tem Y para cima: X = x da planta, Y = z (cota), Z = −y da planta, em metros. */
export interface ContextoVista {
  readonly cena: Scene;
  readonly renderer: WebGLRenderer;
  /** A câmera atual (perspectiva ou ortográfica, conforme a vista). */
  readonly camera: PerspectiveCamera | OrthographicCamera;
  readonly controles: OrbitControls;
  /** Níveis de baixo para cima (`modelo.niveis[i].indice === i`), elementos, colunas e
   *  eixos. `Elemento3D.nivel` é o índice do nível; fundação e escada sem posição ficam
   *  no nível 0. Troca quando a obra muda (evento "cena"). */
  readonly modelo: Modelo3D;
  readonly obra: Obra;
  readonly calculo: Calculo;
  /** Dados do cálculo por chave de elemento (situação, resultado principal). */
  readonly dados: ReadonlyMap<string, DadosElemento>;
  /** Chave do elemento selecionado. */
  readonly selecao: string | null;
  selecionar(chave: string | null): void;
  elemento(chave: string): Elemento3D | undefined;
  /** O grupo do nível (filhos dele andam com o explodido). Índice de modelo.niveis. Os
   *  grupos são recriados a cada evento "cena": guarde o índice, não o objeto. */
  grupoDoNivel(indice: number): Object3D | undefined;
  /** Altura na cena (Y) de uma cota do nível, com o deslocamento do explodido como está
   *  desenhado agora (durante a animação, "explodido" avisa a cada quadro). */
  alturaNaCena(indiceNivel: number, cota: number): number;
  /** Ponto da planta (x, y em m; z = cota) na cena, sem o explodido. */
  paraCena(x: number, y: number, z: number): Vector3;
  /** Caixa do modelo inteiro na cena, sem o explodido. */
  caixaNaCena(): Box3;
  /** Esfera das peças sólidas visíveis (foco e filtros), com o explodido. */
  esferaVisivel(): Sphere;
  /** Caixa da peça na cena, com o explodido como está desenhado agora (topo = max.y). */
  caixaDe(chave: string): Box3 | undefined;
  /** Sólida, transparente ou oculta pelo foco e pela visibilidade por tipo e pavimento. */
  exibicao(chave: string): Exibicao;
  /** A peça aparece: não está oculta (exibicao), passa em todos os filtros e alguma parte
   *  dela fica do lado mantido de todos os planos de corte (inclusive o do pórtico e o da
   *  camada de corte). Transparente conta como visível. */
  estaVisivel(chave: string): boolean;
  /** Redesenha no próximo quadro (a vista só desenha quando algo muda). */
  pedirRender(): void;
  /** Chamado a cada quadro enquanto registrado, com o tempo desde o quadro anterior em
   *  segundos (animação, path tracing); devolve o cancelamento. Enquanto houver algum, a
   *  vista desenha todo quadro. */
  aoQuadro(f: (dtSegundos: number) => void): () => void;
  /** Avisa nos eventos da vista; devolve o cancelamento. */
  aoMudar(evento: EventoVista, f: () => void): () => void;
  /** Leva a câmera a `posicao` olhando para `alvo` (coordenadas da cena). Anima em 0,45 s,
   *  salvo com prefers-reduced-motion ou `animar` false. Uma chamada nova cancela a em
   *  curso, cuja Promise resolve "cancelada". */
  moverCamera(
    posicao: Vector3,
    alvo: Vector3,
    animar?: boolean,
  ): Promise<"concluida" | "cancelada">;
  /** Liga ou desliga a órbita, o zoom e o pan do usuário (o tour e o 4D animam a câmera).
   *  Não trava os botões de vista nem `moverCamera`. */
  travarControles(travar: boolean): void;
  /** Troca os materiais do núcleo (null volta aos padrão); refaz a geometria. */
  definirMateriais(f: FabricaMateriais | null): void;
  /** Planos de corte desta fonte (`id`); a vista junta os de todas as fontes no renderer.
   *  Fica o que está do lado positivo de todos os planos. Lista vazia remove. */
  definirPlanosCorte(id: string, planos: Plane[]): void;
  /** Filtro de visibilidade desta fonte (`id`): a peça aparece só se todos os filtros
   *  devolvem true (interseção); `null` remove o filtro. Não refaz a geometria nem emite
   *  "cena" (custo linear nos vértices, alguns ms): dá para chamar a cada quadro. Peça
   *  filtrada não aparece, não é selecionável e perde a seleção. O filtro vale também
   *  para o modelo novo depois de editar a obra: confira índices contra `modelo.niveis`. */
  definirFiltro(id: string, f: ((e: Elemento3D) => boolean) | null): void;
}

export type EventoVista =
  /** Seleção mudou (ctx.selecao). */
  | "selecao"
  /** A geometria foi refeita (modelo, cores, foco, tipos ou pavimentos ocultos, materiais).
   *  Os filtros (`definirFiltro`) não refazem a geometria nem emitem este evento. */
  | "cena"
  /** A câmera mexeu (órbita, vista, animação). */
  | "camera"
  /** Os níveis se moveram no explodido: a cada quadro da animação e no fim. */
  | "explodido"
  /** Um filtro ou plano de corte mudou, de qualquer fonte (`estaVisivel` pode ter mudado).
   *  Não dispara de novo dentro do próprio aviso: chamar `definirFiltro` aqui não faz laço. */
  | "visibilidade";

/** Como uma peça aparece pelo foco e pela visibilidade por tipo e pavimento: sólida,
 *  transparente (contexto) ou oculta. Filtros e planos de corte não entram aqui. */
export type Exibicao = "solido" | "fantasma" | "oculto";

/** Papel de cada material do núcleo; `definirMateriais` troca qualquer um deles.
 *  "solido" e "fantasma" recebem a cor por vértice (atributo `color`). */
export type PapelMaterial = "solido" | "fantasma" | "arestas" | "destaque";
```

`modelo.ts`:

```ts
export interface Modelo3D {
  niveis: Nivel[];
  elementos: Elemento3D[];
  colunas: Coluna[];
  eixos: Eixo3D[];
  /** O que a montagem deduziu ou não conseguiu (escada sem posição etc.). */
  avisos: string[];
  caixa: { min: Ponto3; max: Ponto3 };
}

/** Um nível da obra: cada repetição de um pavimento-tipo é um nível. A cota é a da face
 *  de cima da laje do pavimento; o lance de pilar do nível vai de `cotaPiso` a `cota`. */
export interface Nivel {
  chave: string;
  pavimentoId: string;
  nome: string;
  /** Repetição do pavimento-tipo: 1 = a mais alta, n = a mais baixa, como no motor
   *  (sistrut/obra.ts, niveisDoEdificio; pilares/acumulacao.ts) e na aba Resultados. */
  repeticao: number;
  /** 0 = o primeiro acima da fundação. */
  indice: number;
  cotaPiso: number;
  cota: number;
}

export interface Elemento3D {
  /** Única no modelo: tipo, nível e id. */
  chave: string;
  tipo: TipoElemento;
  /** Id na obra (laje, viga ou pilar; na fundação, o do pilar). */
  id: string;
  nome: string;
  pavimentoId: string;
  /** Índice do nível; a fundação fica no 0 e a escada no nível de baixo dela. */
  nivel: number;
  repeticao: number;
  solidos: Solido[];
  /** Seção em texto, cm. */
  secao: string;
  /** Coluna do pilar (pilar e fundação). */
  coluna?: string;
  /** Notas que a vista mostra com o elemento (ex.: pilar que nasce em transição). */
  notas: string[];
  /** Rótulo na cena, em cima da peça (ex.: "ESCADA"). */
  rotulo?: string;
}

export type TipoElemento = "laje" | "viga" | "pilar" | "escada" | "fundacao";

/** Sólido, m. Prisma vertical: polígono da planta (anti-horário) de z0 a z1. Barra: o
 *  eixo da face de cima vai de `a` a `b` (pode inclinar, como na escada); a seção tem
 *  `largura` na horizontal, perpendicular ao eixo, e `altura` na vertical, para baixo. */
export type Solido =
  | { tipo: "prisma"; base: Ponto[]; z0: number; z1: number }
  | { tipo: "barra"; a: Ponto3; b: Ponto3; largura: number; altura: number };

export interface Ponto3 {
  x: number;
  y: number;
  z: number;
}

/** Lances de um pilar empilhados, da base ao topo (chaves de Elemento3D). */
export interface Coluna {
  id: string;
  nome: string;
  chaves: string[];
  /** O lance mais baixo não está no primeiro nível: nasce sobre uma viga. */
  nasceEmTransicao: boolean;
}

/** Linha da planta com vigas (pórtico): x = c (vigas verticais) ou y = c (horizontais). */
export interface Eixo3D {
  chave: string;
  direcao: "x" | "y";
  c: number;
  vigas: string[];
}
```

`dados.ts`:

```ts
export interface DadosElemento {
  estado: Estado;
  /** Avisos e falhas do elemento, como na planta. */
  mensagens: string[];
  /** Resultado principal, já formatado com unidade (ex.: "Nd = 812,40 kN"). */
  principal?: string;
  /** Valor SI da grandeza do mapa de cor do tipo (Nk, kN; taxa, %; momento, kN·m/m). */
  grandeza?: number;
  /** Defeitos do SISTRUT original que atingem o elemento (só no modo original). */
  defeitos: string[];
}

/** "sem": sem cálculo (obra não calculada ou elemento fora do resultado). */
export type Estado = Situacao | "sem";

export type GrandezaMapa = "nkPilares" | "taxaVigas" | "momentoLajes";
```

<!-- tipos:fim -->

### Coordenadas

- A cena tem Y para cima, em metros: X = x da planta, Y = cota (z), Z = −y da planta. `ctx.paraCena(x, y, z)` faz a conversão.
- `ctx.modelo.niveis` vem de baixo para cima, e `niveis[i].indice === i`. `cota` é a face de cima da laje do nível e `cotaPiso` é a do nível de baixo, as duas em metros a partir da fundação (cota 0).
- `Elemento3D.nivel` é esse índice. A fundação fica no nível 0. A escada fica no nível de baixo dela, e a escada sem posição no nível 0.
- Os sólidos de `Elemento3D.solidos` estão em coordenadas da planta: prisma (polígono anti-horário de z0 a z1) ou barra (eixo da face de cima de `a` a `b`, com `largura` e `altura` para baixo).
- O explodido desloca o grupo de cada nível para cima. Para pôr algo junto de um nível, acrescente o objeto ao `ctx.grupoDoNivel(i)` (ele anda junto, mas o grupo é recriado a cada evento "cena") ou calcule a altura com `ctx.alturaNaCena(i, cota)` a cada evento "explodido".

### O que o contexto oferece

| Membro | Uso |
|---|---|
| `cena`, `renderer`, `camera`, `controles` | os objetos vivos do three.js. `camera` troca entre perspectiva e ortográfica pelos botões de vista; leia `ctx.camera` na hora, sem guardar. `renderer.xr` serve à realidade aumentada |
| `modelo`, `obra`, `calculo`, `dados` | o modelo 3D, a obra, o cálculo (`calculo.tipo === "ok"` traz `calculo.resultado`) e os dados por chave de elemento (`estado`, `principal`, `grandeza`, `defeitos`) |
| `elemento(chave)`, `grupoDoNivel(i)` | o elemento do modelo e o grupo do nível |
| `paraCena(x, y, z)`, `caixaNaCena()`, `esferaVisivel()` | conversão da planta (devolve `Vector3`), caixa do modelo inteiro (`Box3`, sem o explodido) e esfera das peças visíveis (`Sphere`, com o explodido) |
| `caixaDe(chave)` | caixa da peça na cena (`Box3`), com o explodido como está desenhado agora; o topo é `max.y`. Para marcadores e paradas de tour |
| `estaVisivel(chave)`, `exibicao(chave)` | se a peça aparece considerando tudo (foco, tipos e pavimentos ocultos, filtros de todas as camadas e planos de corte) e como o foco a mostra (`"solido"`, `"fantasma"` ou `"oculto"`) |
| `alturaNaCena(nivel, cota)` | a altura Y de uma cota, com o deslocamento do explodido como está desenhado agora |
| `selecao`, `selecionar(chave)` | a seleção atual (chave de `Elemento3D`) |
| `aoMudar(evento, f)` | eventos, ver abaixo. Devolve o cancelamento |
| `aoQuadro(f)` | `f(dt)` a cada quadro, com `dt` em segundos. Enquanto houver algum registrado, a vista desenha todo quadro; sem nenhum, só desenha quando algo muda. Devolve o cancelamento |
| `pedirRender()` | redesenhar no próximo quadro, depois de mexer em objetos fora de um `aoQuadro` |
| `moverCamera(posicao, alvo, animar?)` | leva a câmera em 0,45 s (sem animação com `prefers-reduced-motion` ou `animar` false). Uma chamada nova cancela a anterior, cuja Promise resolve `"cancelada"`; a que termina resolve `"concluida"` |
| `travarControles(sim)` | trava só a órbita, o zoom e o pan do mouse e do toque. Os botões de vista do usuário e `moverCamera` continuam valendo |
| `definirMateriais(fabrica)` | troca os materiais dos papéis `"solido"`, `"fantasma"`, `"arestas"` e `"destaque"` (PBR). `null` volta aos padrão. Refaz a geometria |
| `definirPlanosCorte(id, planos)` | planos de corte desta fonte. A vista junta os de todas as fontes e mantém o lado positivo de todos. Lista vazia remove |
| `definirFiltro(id, f)` | esconde as peças para as quais `f` devolve `false`; `null` remove o filtro desta fonte. Vários filtros valem juntos: a peça aparece só se todos devolvem `true` |

**Eventos.** `"selecao"` dispara quando a seleção muda. `"cena"` dispara quando a geometria foi refeita: obra editada (modelo novo), foco, cores, tipos ou pavimentos ocultos, materiais. `"explodido"` dispara a cada quadro da animação do explodido e no fim dela. `"visibilidade"` dispara quando um filtro ou plano de corte muda, de qualquer camada (o corte do pórtico e os tipos ou pavimentos ocultos vêm com `"cena"`). `"camera"` dispara quando a câmera mexe. Nenhum evento dispara de novo dentro do próprio aviso: chamar `definirFiltro` no aviso de `"visibilidade"`, ou `definirMateriais` no de `"cena"`, não entra em laço. Para saber se uma peça aparece depois de qualquer mudança, ouça `"cena"` e `"visibilidade"` e consulte `estaVisivel`.

**Filtro.** `definirFiltro` não refaz a geometria e não emite `"cena"`. Ele só zera os vértices das peças escondidas, o que custa cerca de 1 ms na obra de 20 pavimentos. Dá para chamar a cada quadro de uma animação. Peça filtrada não aparece, não é selecionável e perde a seleção. O filtro continua valendo depois que a obra é editada e o modelo muda. Por isso ele deve tolerar níveis e chaves que deixaram de existir (compare o índice com `ctx.modelo.niveis.length`).

**Materiais.** As malhas `"solido"` e `"fantasma"` têm o atributo `color` por vértice com a cor da situação ou da grandeza. Um material trocado precisa de `vertexColors: true` para mantê-la. `"fantasma"` é a peça de contexto transparente. `"destaque"` é a seleção, desenhada sem teste de profundidade.

**Câmera.** Uma camada que anima a câmera (tour, 4D) deve chamar `travarControles(true)` ao ligar e `travarControles(false)` na limpeza. Para animar continuamente, use `aoQuadro` e mexa em `ctx.camera.position` e `ctx.controles.target`. Para ir a um ponto, use `moverCamera`.

### Exemplo: sequência construtiva 4D mínima

A camada abaixo mostra o prédio sendo construído nível por nível, com um controle deslizante de etapa e um botão de reprodução. A fundação aparece na etapa 0. A escada aparece junto com o nível de cima dela.

```tsx
// src/telas/obra3d/sequencia/camada.tsx
import { useEffect, useState } from "react";
import type { Camada, ContextoVista } from "../api";

/** Etapa atual: os níveis 0..etapa aparecem. Fica no módulo entre ligar e desligar. */
const estado = { etapa: Number.POSITIVE_INFINITY, tocando: false };
const ouvintes = new Set<() => void>();
const avisar = () => ouvintes.forEach((f) => f());

function aplicar(ctx: ContextoVista) {
  const ultimo = ctx.modelo.niveis.length - 1;
  const etapa = Math.min(estado.etapa, ultimo);
  ctx.definirFiltro("sequencia", (e) =>
    e.tipo === "escada" ? e.nivel + 1 <= etapa : e.nivel <= etapa,
  );
}

function Painel({ ctx }: { ctx: ContextoVista }) {
  const [, redesenhar] = useState(0);
  useEffect(() => {
    const f = () => redesenhar((n) => n + 1);
    ouvintes.add(f);
    return () => void ouvintes.delete(f);
  }, []);
  const ultimo = ctx.modelo.niveis.length - 1;
  const etapa = Math.min(estado.etapa, ultimo);
  return (
    <div className="grid gap-2 text-xs">
      <label className="grid gap-1">
        <span>Etapa: {ctx.modelo.niveis[etapa]?.nome ?? "—"}</span>
        <input
          type="range"
          min={0}
          max={ultimo}
          value={etapa}
          onChange={(e) => {
            estado.etapa = Number(e.target.value);
            estado.tocando = false;
            aplicar(ctx);
            avisar();
          }}
        />
      </label>
      <button
        type="button"
        className="rounded border px-2 py-1"
        onClick={() => {
          estado.tocando = !estado.tocando;
          if (estado.tocando && estado.etapa >= ultimo) estado.etapa = 0;
          avisar();
        }}
      >
        {estado.tocando ? "Pausar" : "Reproduzir"}
      </button>
    </div>
  );
}

export const camada: Camada = {
  ativar(ctx) {
    aplicar(ctx);
    let acumulado = 0;
    const pararQuadro = ctx.aoQuadro((dt) => {
      if (!estado.tocando) return;
      acumulado += dt;
      if (acumulado < 0.8) return; // um nível a cada 0,8 s
      acumulado = 0;
      const ultimo = ctx.modelo.niveis.length - 1;
      estado.etapa = Math.min(estado.etapa + 1, ultimo);
      if (estado.etapa >= ultimo) estado.tocando = false;
      aplicar(ctx);
      avisar();
    });
    // obra editada: o filtro continua, mas a etapa é limitada ao modelo novo
    const pararCena = ctx.aoMudar("cena", () => aplicar(ctx));
    return () => {
      pararQuadro();
      pararCena();
      estado.tocando = false;
      ctx.definirFiltro("sequencia", null);
    };
  },
  Painel,
};
```

```ts
// em CAMADAS (camadas.ts)
{
  id: "sequencia",
  nome: "Sequência construtiva",
  descricao: "Mostra o prédio sendo construído, nível por nível.",
  carregar: () => import("./sequencia/camada").then((m) => m.camada),
},
```

O `aoQuadro` dessa camada mantém a vista desenhando todo quadro enquanto ela está ligada. Uma camada que anima só às vezes pode registrar o `aoQuadro` ao começar e cancelar ao parar.

O corte por pavimento (`camadas/corte.tsx`) é uma camada real e mais curta. Ela usa `definirPlanosCorte`, `alturaNaCena`, os eventos `"cena"` e `"explodido"` e um `Painel`.

## Testes

- `src/telas/obra3d/modelo.test.ts` (21 testes, com conta à mão ou referência independente): cotas com repetições (a repetição 1 é a mais alta), seção girada 90° e 30°, circular, poligonal horário, colunas com pilar deslocado e de transição, bloco de fundação, seção por trecho e mesa T, laje rebaixada, normais para fora, reações da escada, posição da escada pelas cargas e fora do prédio, vizinhos, eixo, trilha e o Nk do pavimento-tipo crescendo para baixo.
- `src/telas/obra3d/api.test.ts` (18 testes): a seção "Tipos" deste documento é igual às declarações do código, e `api.ts` exporta todas.
- `e2e/vista3d.spec.ts` (5 testes, `PORT=4407 bun x playwright test e2e/vista3d.spec.ts`): obra de 3 pavimentos (girar, selecionar, filtro de camada que esconde e tira a seleção, ocultar, explodido, teclado, ver na planta), obra do oráculo de vários pavimentos importada (todo, partes, trilha, camada de corte, mapa de Nk, PNG e glTF), 360 × 800 com toque, 3840 × 2160 e o desempenho de 20 pavimentos. Todos conferem que o console não tem erro nem aviso.

## Limitações

- A circular com vazado aparece cheia.
- A escada sem carga lançada no prédio não tem posição (ver "Escada").
- O alinhamento da viga com a laje rebaixada segue o `.FOR` (topo da viga no nível); o `alinhamento` e o `eixo` do `.FOR` não deslocam a viga.
- A medida de desempenho foi feita com WebGL por software numa máquina carregada, não num celular.
