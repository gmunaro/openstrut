# Relatar problema

O botão redondo com um inseto, no canto inferior direito de todas as telas, abre o relato de problema. O atalho é **Alt+Shift+R**. Na impressão o botão some. O botão fica acima dos diálogos para continuar clicável. Se o canto tiver um controle, como a barra Aplicar/Cancelar de um diálogo ou folha em tela cheia no celular, ele sobe pela borda direita até um lugar livre (`src/components/relato/posicao.ts`).

No clique, o app faz três coisas antes de abrir qualquer janela:

1. Tira um print da página como ela está, inclusive com diálogo ou menu aberto. O print é o DOM desenhado num PNG pelo `modern-screenshot`, sem `getDisplayMedia` e sem pedido de permissão. Ele sai com até 1600 px de largura e até 3 MiB; acima disso, a resolução cai.
2. Lê o diagnóstico:
   - versão (`VITE_COMMIT`) e arquivo do bundle;
   - rota;
   - norma e modo de cálculo;
   - tamanho da janela e da tela;
   - se o app está instalado e se está online;
   - idioma e navegador;
   - os últimos 20 erros (`error`, `unhandledrejection` e `console.error`);
   - o resumo da obra aberta: nome, pavimentos, lajes, vigas e pilares.
3. Guarda a obra daquele instante.

O diálogo mostra a prévia do print e os campos "O que aconteceu", "O que esperava" e "E-mail para contato" (opcional). Também mostra o diagnóstico e, em "Ver o texto exato que vai sair", o texto que será enviado. Print e obra vêm marcados e podem ser desmarcados; o diálogo avisa que vão para uma issue pública. Nada sai antes do botão de confirmar.

O código fica em `src/components/relato/`, e o relay, em `relato-worker/`.

## Dois caminhos

O diálogo diz qual caminho o build usa.

| | Sem relay (padrão hoje) | Com relay |
|---|---|---|
| Quando | `VITE_RELATO_URL` ausente no build | `VITE_RELATO_URL` definida |
| Conta no GitHub | precisa | não precisa |
| Como sai | abre `github.com/gmunaro/openstrut/issues/new` com título, corpo e label `bug` preenchidos | POST ao Worker, que cria a issue |
| Print | copiado para a área de transferência e baixado como PNG; o corpo pede "cole o print aqui (Ctrl+V)" | enviado ao branch `relatos` e mostrado na issue como imagem |
| Obra | botão "Baixar a obra" depois de abrir a issue; o usuário arrasta o arquivo para a issue | enviada ao branch `relatos`, com link na issue |
| E-mail | vai no corpo da issue (pública), com aviso | fica no KV do Worker por 180 dias, fora da issue |
| Sem rede | o botão do GitHub fica desabilitado; o usuário salva o arquivo do relato | o relato vai para a fila (IndexedDB) e sai sozinho quando a rede volta ou o app abre |

O GitHub recusa URL longa demais, então o link fica em até 7500 caracteres. Se passar, saem primeiro os erros mais antigos. Se ainda assim não couber, os textos do usuário são cortados com aviso. O JSON da obra nunca vai na URL.

"Salvar arquivo do relato" funciona nos dois caminhos. Ele baixa um zip com `relato.md`, o PNG e a obra, quando marcados, para mandar por e-mail ou anexar numa issue depois.

Na fila, um relato que o relay recusa (conteúdo inválido) não é reenviado. O diálogo mostra esse relato com as opções "Baixar arquivo" e "Descartar".

## Relato automático da importação

Ao importar uma obra do SISTRUT, o app manda sozinho um relato quando algo dá errado. Só existe no caminho com relay.

- **Quando:**
  - a importação não abre a obra (`erros`);
  - o importador lança exceção: a tela mostra "Erro inesperado na importação" em vez de não mostrar nada, e a pilha vai ao coletor de erros;
  - a obra importa, mas o cálculo que a tela da obra roda ao abrir lança exceção ou deixa pavimento com falha.
  
  A decisão fica em `src/telas/relatoImportacao.ts`, e o envio, em `src/components/relato/automatico.ts`.
- **O que vai:**
  - o diagnóstico, sem a obra;
  - as mensagens de erro e a lista de arquivos;
  - como anexo, `arquivos-sistrut.json`: os arquivos escolhidos inteiros, em base64, e a obra montada quando existe.
  
  O anexo vai ao repositório privado dos anexos, e a issue só leva o link. No texto público, o nome da obra, o do `.COL` e o das pastas saem como "OBRA". Acima de 2 MiB, o anexo leva só a lista dos arquivos.
- **Limites:** um relato por problema (mesmos arquivos e mesmas mensagens, guardados no `localStorage`) e no máximo 5 por dia. Sem rede, o relato vai para a fila.
- **Para o usuário:** o diálogo da importação tem a opção "Enviar relato automático…", ligada por padrão (`localStorage` `openstrut.relatoAutomatico`), e diz o número da issue quando o relato sai.
- **Para reproduzir:** `bun scripts/relatos/baixar.ts <número da issue> [pasta]` baixa o anexo pelo `gh` e grava os arquivos do SISTRUT (e a obra, se houver) na pasta, prontos para importar. Do relato do botão, grava a obra da V2.

## Como a triagem acha os relatos

Quem não é colaborador do repositório abre a issue sem label, porque o GitHub ignora o `labels=bug` da URL. Por isso, nos dois caminhos:

- o título começa com `[Relato] `;
- o corpo termina com o marcador oculto `<!-- openstrut-relato v1 build=<build> -->`. O `<build>` é o commit (`VITE_COMMIT`) ou, sem ele, o arquivo do bundle (ex.: `index-B2x9.js`), só com `[A-Za-z0-9._-]`, para não fechar o comentário. O marcador continua no fim mesmo quando o texto é cortado pelo limite do link ou do GitHub.

O relay põe as labels `relato`, `triagem` e `bug` (var `LABELS`). Para a triagem, busque `repo:gmunaro/openstrut is:issue "[Relato]" in:title` e confirme pelo marcador no `body` que a API do GitHub devolve. O comentário HTML não aparece na página da issue, mas vem cru no `body`.

## Variáveis de build

O Vite lê variáveis `VITE_*` do ambiente do `bun run build:pages`.

| Variável | Para quê |
|---|---|
| `VITE_RELATO_URL` | URL do Worker com `/relato`, ex.: `https://openstrut-relato.<subdomínio>.workers.dev/relato`. Ausente: caminho sem relay. |
| `VITE_TURNSTILE_SITEKEY` | Chave pública do Turnstile, só quando o Worker exige (`TURNSTILE_SECRET`). |
| `VITE_COMMIT` | Commit do build no diagnóstico. O `pages.yml` já passa `${{ github.sha }}`. Sem ela, o diagnóstico diz "não informado no build", e o marcador da triagem usa o nome do arquivo do bundle. |

O `pages.yml` passa `VITE_COMMIT`, `VITE_RELATO_URL` (da variável `RELATO_URL`) e `VITE_TURNSTILE_SITEKEY` (de `TURNSTILE_SITEKEY`), e `src/components/relato/build.test.ts` confere as duas primeiras. Os valores ficam em Settings → Secrets and variables → Actions → **Variables** do repositório. Não são segredo: vão para o JavaScript público.

## Estado do relay

- Worker `openstrut-relato` publicado na conta Cloudflare do dono: `https://openstrut-relato.openstrut-relato.workers.dev/relato`, que é o valor da variável `RELATO_URL` do repositório.
- KV `RELATOS_KV` criado (id no `wrangler.toml`); secret `SAL_IP` gravado com valor aleatório.
- Anexos (print e obra) no repositório **privado** `gmunaro/openstrut-relatos`. A issue pública leva só os links; a obra vai com o nome fixo `obra.openstrut.json`, para o nome da obra do cliente não aparecer na issue.
- Secrets `GITHUB_TOKEN` (Issues em `gmunaro/openstrut`) e `GITHUB_TOKEN_ARQUIVOS` (Contents em `gmunaro/openstrut-relatos`) gravados, com tokens sem validade. Relato de teste em 25/10/2026: issue #7, com os anexos no repositório privado (fechada).
- O repositório de anexos precisa ter um commit: em repositório vazio o GitHub não cria o branch `relatos`, e o Worker responde 502.
- O deploy no Windows foi feito com `npx -y wrangler@4 deploy`: pelo `bun x`, o esbuild falhou ao gravar o bundle ("Access is denied").

## Ligar o relay (passo a passo do dono)

### 1. Conta Cloudflare

1. Crie uma conta em https://dash.cloudflare.com (o plano gratuito basta) e escolha o subdomínio `*.workers.dev` em Workers & Pages.
2. Dentro de `relato-worker/`, rode:

```sh
bun install
bun run check                       # typecheck + testes (sem rede)
bunx wrangler@4 login               # abre o navegador para autorizar
bunx wrangler@4 kv namespace create RELATOS_KV
```

3. Copie o `id` que o último comando mostra para `[[kv_namespaces]]` no `relato-worker/wrangler.toml`, no lugar do placeholder.
4. O limite por IP (`[[ratelimits]]`, 3 por minuto) já está no `wrangler.toml`. O `namespace_id = "1001"` só precisa ser único na conta.

### 2. Token do GitHub com escopo mínimo

GitHub → Settings → Developer settings → Personal access tokens → **Fine-grained tokens** → Generate new token:

- **Resource owner:** gmunaro.
- **Repository access:** Only select repositories → `gmunaro/openstrut`.
- **Permissions → Repository:**
  - **Issues:** Read and write;
  - **Contents:** Read and write (para o print e a obra no branch `relatos`);
  - **Metadata:** Read-only, que entra sozinha.
- **Expiration:** 90 dias. Anote a data: quando o token vencer, o relay responde 502 e o app guarda os relatos na fila.

Cuidado: com Contents: write, o token escreve em qualquer branch do repositório, inclusive `main`. Ele só existe como secret do Worker, mas há uma opção mais segura:

1. Crie um repositório público só para os anexos, ex.: `gmunaro/openstrut-relatos`.
2. Gere dois tokens:
   - `GITHUB_TOKEN`: só Issues: Read and write em `openstrut`;
   - `GITHUB_TOKEN_ARQUIVOS`: só Contents: Read and write em `openstrut-relatos`.
3. No `wrangler.toml`, descomente `GITHUB_REPO_ARQUIVOS = "gmunaro/openstrut-relatos"`.

Assim, um token vazado não escreve no código. O branch `relatos` é criado sozinho no primeiro relato com anexo, como branch órfão, sem histórico do código.

As labels `relato`, `triagem` e `bug` já existem no repositório (Issues → Labels).

### 3. Secrets e variáveis do Worker

```sh
bunx wrangler@4 secret put GITHUB_TOKEN
bunx wrangler@4 secret put GITHUB_TOKEN_ARQUIVOS   # só no repositório de anexos separado
bunx wrangler@4 secret put TURNSTILE_SECRET        # opcional, ver abaixo
```

As variáveis ficam em `[vars]` no `wrangler.toml` e já têm padrão:

| Variável | Padrão |
|---|---|
| `ALLOWED_ORIGINS` | `https://gmunaro.github.io,http://localhost:4173,http://127.0.0.1:41780` |
| `GITHUB_REPO` | `gmunaro/openstrut` |
| `GITHUB_REPO_ARQUIVOS` | igual a `GITHUB_REPO` |
| `BRANCH_ARQUIVOS` | `relatos` |
| `LABELS` | `relato,triagem,bug` (já existem no repositório) |
| `LIMITE_DIA_IP` | `10` |
| `LIMITE_DIA_TOTAL` | `50` |
| `SAL_IP` | `openstrut-relato` (sal do hash do IP; troque por um texto qualquer) |

### 4. Turnstile (opcional, recomendado se aparecer spam)

1. No painel da Cloudflare, abra Turnstile → Add site, com o domínio `gmunaro.github.io` e o modo Managed.
2. A chave secreta vai em `bunx wrangler@4 secret put TURNSTILE_SECRET`. Com ela, o Worker passa a exigir o token.
3. A chave pública vai na variável `TURNSTILE_SITEKEY` do repositório, que vira `VITE_TURNSTILE_SITEKEY` no build.

O app só mostra o desafio quando o Turnstile pede interação.

### 5. Deploy e ligação no app

```sh
bunx wrangler@4 deploy        # mostra a URL: https://openstrut-relato.<subdomínio>.workers.dev
```

1. Crie a variável `RELATO_URL` no repositório com essa URL mais `/relato`.
2. Aplique a mudança do `pages.yml` acima.
3. No próximo push na `main`, o diálogo passa a dizer "Envio direto, sem conta".

Para testar antes do Pages, rode `VITE_RELATO_URL=https://.../relato bun run build && bun run preview`. A origem `http://localhost:4173` já está liberada.

### 6. Responder a quem deixou e-mail

O e-mail fica no KV com a chave `contato:<número da issue>`:

```sh
bunx wrangler@4 kv key get --binding RELATOS_KV --remote "contato:123"
```

## Proteções do Worker

As checagens seguem esta ordem:

1. Método e rota (`POST /relato`).
2. Origem, pela lista `ALLOWED_ORIGINS`. Isso só barra navegador; a proteção real são os passos 4 a 6.
3. Tamanho: no máximo 6 MiB por requisição, 3 MiB de print e 2 MiB de obra.
4. Validação dos campos. Texto com mais de 5 links é recusado.
5. Honeypot (`site`): bot recebe um 201 falso, e nada é criado.
6. Taxa: 3 por minuto por IP, mais o limite diário por IP e o total do dia. O IP só é guardado como hash.
7. Turnstile, quando configurado.
8. GitHub.

Na issue:
- menções `@` são neutralizadas;
- o texto do usuário vai como citação;
- os erros vão num bloco de código que não pode ser fechado por dentro;
- erros do GitHub voltam ao app como 502, sem detalhes nem token.

## Contrato `POST /relato`

Os tipos estão em `src/components/relato/relay.ts` (`RelatoEnviado`) e em `relato-worker/src/tipos.ts`.

```ts
{
  versao: 1,
  titulo: string,        // 1..120
  aconteceu: string,     // 1..5000
  esperado: string,      // 0..5000
  email?: string,        // não vai para a issue
  diagnostico: { rotulo: string; valor: string }[],  // ≤ 30; valor ≤ 1000
  erros: string[],       // ≤ 20, cada ≤ 2000
  build?: string,        // ≤ 100; commit ou arquivo do build, vai no marcador oculto
  print?: string,        // PNG em base64, ≤ 3 MiB
  obra?: { nome: string; json: string },             // ≤ 2 MiB
  turnstile?: string,
}
```

As respostas são JSON:
- `201 { ok, numero, url }`: issue criada;
- `400 invalido`, `403 origem` e `413 grande`: recusa; o app não reenvia;
- `403 turnstile`, `429 limite` (com `Retry-After`) e `502 github`: temporário; o app guarda na fila e tenta depois.

## Testes

- `bun run test src/components/relato`: diagnóstico, corpo e URL da issue (limite de tamanho), fila offline, zip, relay e a tela do diálogo.
- `PORT=4398 bunx playwright test e2e/relato.spec.ts`: no celular (360 × 800) e no desktop (1920 × 1080). O teste confere que o print mostra o diálogo aberto, comparando-o com o screenshot da mesma tela, e que a URL do GitHub sai bem formada; a aba é interceptada, sem acesso ao GitHub. Também cobre o atalho, a impressão e o zip. Os prints ficam em `e2e/prints/relato/`.
- `cd relato-worker && bun run check`: o Worker, com `fetch`, KV e limite de taxa falsos.
