# Importar do Google Drive

A tela inicial tem a opção "Importar do Google Drive", ao lado de "Importar pasta do SISTRUT". Ela lê a obra direto do Drive, no navegador, e entrega os arquivos à mesma importação da pasta do disco (`importarObraSistrut`, ver `docs/MODO-CALCULO.md`). Este documento explica como a opção funciona e o que o dono do app precisa configurar no Google Cloud para ligá-la.

## Como funciona

O usuário tem três caminhos.

1. **Colar o link** de uma pasta ou de um arquivo do Drive. O campo aceita também o link sem `https://` e o id puro. O app tenta primeiro só com a API key, sem login. Isso abre pastas compartilhadas como "qualquer pessoa com o link". Se o Google responde 403 ou 404, a tela pede login. Para o link de uma pasta, "Entrar com Google e abrir a pasta" entra com leitura do Drive e lê a pasta do link inteira, sem Picker. "Entrar com Google e marcar os arquivos" abre o Google Picker já na pasta do link (ou mostrando só o arquivo do link), e o usuário marca os arquivos da obra.
2. **Escolher a pasta no Drive** pelo Google Picker, com login de leitura. O Picker mostra só pastas; o usuário escolhe a pasta da obra, e o app a lê inteira, com as subpastas, como a pasta pública pelo link.
3. **Marcar arquivos no Drive** pelo Google Picker, com login. O usuário abre a pasta da obra e marca os arquivos; dá para marcar vários de uma vez. Se os parâmetros (.DSP, .PIP, .INI) estão em outra pasta, como a EXEC40, "Marcar arquivos de outra pasta" abre o Picker de novo e soma os arquivos. "Importar os arquivos marcados" segue para a importação. Os arquivos de cada pasta do Drive entram como uma pasta própria ("Pasta 1", "Pasta 2"), e a tela trata a pasta só de parâmetros como trata a EXEC40 do disco.

Pelo link de uma pasta pública, ou com a pasta escolhida no login de leitura, o app lista a pasta pela Drive API v3 (`files.list` com `q='<id>' in parents and trashed=false`), página por página, e entra nas subpastas, até 4 níveis e 2000 arquivos. Uma subpasta mais funda fica de fora com nota. Mais de 2000 arquivos param a leitura com a mensagem "Parece uma pasta de várias obras: mande o link da pasta de uma obra só". Cada arquivo leva o caminho dentro da pasta (`PREDIO/EXEC40/SISTRUT.DSP`), igual ao que o seletor de pasta do disco dá. A tela segue como na pasta do disco: pergunta a subpasta quando há mais de uma obra, pergunta o .DSP quando nada decide, e mostra o resumo antes de abrir.

O app só baixa (`files.get?alt=media`) os arquivos que a importação lê. Os .DXF, .PLT, .BAK e os outros de `NAO_LIDOS` aparecem no resumo, entre os ignorados, sem sair do Drive. Documentos do Google (Docs, Planilhas) e atalhos para pasta ficam de fora, com uma nota no resumo. Um atalho para arquivo baixa o arquivo de destino. Uma barra no nome do Drive vira `_`, com nota, para não virar pasta. O Drive aceita dois arquivos com o mesmo nome na mesma pasta e a importação não: a tela recusa e mostra a data de modificação e o id de cada um, para o usuário saber qual apagar.

O diálogo "Baixando do Google Drive" mostra "n de N arquivos" e tem Cancelar, que interrompe os downloads. Fechar o diálogo do Drive interrompe a leitura em andamento e descarta o resultado. Se algum arquivo de uma pasta pública não baixa sem login, o resumo oferece "Entrar com Google e marcar os arquivos".

Código: `src/telas/drive/api.ts` (Drive API), `src/telas/drive/google.ts` (login e Picker), `src/telas/ImportarDrive.tsx` (diálogo) e `src/telas/selecao.ts` (leitura sob demanda, comum ao disco e ao Drive).

### Escopos OAuth: `drive.file` e `drive.readonly`

O app pede um escopo de cada vez, só quando o usuário escolhe o caminho que precisa dele (`src/telas/drive/google.ts`). Cada escopo tem o seu token em memória; o de leitura serve também para os arquivos marcados.

**`drive.file`** (`https://www.googleapis.com/auth/drive.file`), em "Marcar arquivos no Drive" e "Entrar com Google e marcar os arquivos". O Google classifica esse escopo como não sensível. A documentação o descreve como acesso por arquivo: vale para os arquivos "that the user shares with an app while using the Google Picker API" ([Choose Google Drive API scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth)). Escolher uma pasta com ele não dá acesso ao que ela tem. Isso foi testado em 17/10/2026 com o Google de verdade, no site publicado: a pasta escolhida respondeu 200, e a listagem dela (`'<id>' in parents`) voltou vazia. Por isso esse Picker não deixa escolher pasta (`setSelectFolderEnabled(false)`): as pastas servem só para navegar, e o usuário marca os arquivos. O Drive falso dos testes (`src/telas/drive/__fixtures__/driveFalso.ts`, opção `concedidos`) segue essa regra: com token, só existe o que foi marcado.

**`drive.readonly`** (`https://www.googleapis.com/auth/drive.readonly`), em "Escolher a pasta no Drive" e "Entrar com Google e abrir a pasta". Com ele o app lista a pasta e as subpastas, como na pasta pública. O app só lê a pasta que o usuário escolhe ou cujo link cola. O Google classifica esse escopo como restrito ([OAuth 2.0 scopes](https://developers.google.com/identity/protocols/oauth2/scopes)). Até o app passar pela verificação de escopo restrito, a tela de login mostra o aviso "O Google não verificou este app" (o usuário toca em Avançado e segue), e o app fica limitado a 100 usuários no total. A verificação, segundo o Google, "can potentially take several weeks", tem de ser refeita todo ano, e pode exigir uma avaliação de segurança paga (CASA) quando os dados passam por servidor ([Restricted scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification)); aqui nada passa por servidor. O diálogo explica o aviso ao lado do botão.

O caso comum, a pasta pública pelo link, não precisa de escopo nenhum.

A política de privacidade que o Google pede para publicar o app é `public/privacidade.html` (`https://gmunaro.github.io/openstrut/privacidade.html`). O service worker não a troca pelo app (`navigateFallbackDenylist` no `vite.config.ts`).

### Privacidade

- Nada passa por servidor do OpenStrut. O navegador fala direto com `www.googleapis.com`, `accounts.google.com` e `apis.google.com`, e a obra fica no navegador, como na importação do disco.
- O token de acesso vem do Google Identity Services (token client, popup). Ele fica só numa variável em memória (`src/telas/drive/google.ts`), nunca em localStorage, e vence em cerca de 1 hora. Fechar ou recarregar a página o descarta. Um token que o Google recusa (401) é esquecido, e a tela pede para entrar de novo.
- O Client ID e a API key não são segredo: vão no JavaScript público do site. A proteção da API key é a restrição por referrer e por API, configurada no passo 5.
- O app carrega os scripts do Google só quando o usuário abre o diálogo do Drive.

### Celular e PWA

O login usa o popup do Google, que o navegador só deixa abrir no toque do usuário. O app carrega o script do login quando o diálogo abre, e os botões de entrar ficam desabilitados ("Carregando o login do Google…") até ele chegar. Assim o pedido do token sai na mesma pilha do toque em "Escolher a pasta no Drive", "Marcar arquivos no Drive", "Entrar com Google e abrir a pasta" ou "Entrar com Google e marcar os arquivos". O e2e confere isso pelo `window.event` do clique no momento do pedido. Um bloqueio de popup vira a mensagem "O navegador bloqueou a janela de login do Google. Libere os popups deste site e tente de novo."

O Picker não é popup: ele aparece por cima da página, e o diálogo do app sai da frente enquanto ele está aberto. O app carrega o Picker antes de fechar o diálogo, com 20 s de prazo. O diálogo ignora toques fora do app (o Picker fica fora da raiz do React), porque o Radix os tratava como "clique fora" e fechava o diálogo logo depois de reabri-lo.

O e2e (`e2e/drive.spec.ts`) confere esse fluxo em 390x844 e 1366x768 com o Google falso. Não foi testado com o Google de verdade, no Chrome do Android nem com o app instalado como PWA. Veja o roteiro em "Teste manual".

## Configuração no Google Cloud (passo a passo do dono)

Feito em 17/10/2026, na conta do dono: projeto `openstrut` (número 939144067082), Drive API e Picker API ativas, tela de consentimento externa, Client ID web e API key `OpenStrut Pages`, e as duas variáveis no GitHub. Falta publicar o app (passo 3.6). Os passos ficam aqui para refazer a configuração noutro projeto. Sem as duas variáveis, o build mostra a opção desabilitada com a explicação "não está ligada nesta versão do app".

### 1. Criar o projeto

1. Entre em https://console.cloud.google.com com a conta que vai ser dona do app.
2. No seletor de projetos, no topo, clique em "Novo projeto". Nome sugerido: `OpenStrut`. Sem organização serve.
3. Anote o **número do projeto** (Painel do projeto, "Informações do projeto"). O Client ID começa por ele, e o app o usa no Picker (`setAppId`).

### 2. Ativar as APIs

Em "APIs e serviços" → "Biblioteca", ative:

- **Google Drive API**
- **Google Picker API**

### 3. Tela de consentimento OAuth

Em "APIs e serviços" → "Tela de consentimento OAuth" (no console novo, "Google Auth Platform" → "Branding", "Público" e "Acesso a dados"):

1. Tipo de usuário: **Externo**.
2. Nome do app: `OpenStrut V2`. E-mail de suporte e e-mail do desenvolvedor: os seus.
3. Domínios autorizados: `gmunaro.github.io`. Página inicial: `https://gmunaro.github.io/openstrut/`. Política de privacidade: `https://gmunaro.github.io/openstrut/privacidade.html` (`public/privacidade.html`). Ela é exigida para publicar.
4. Escopos ("Acesso a dados"): adicione `.../auth/drive.file` e `.../auth/drive.readonly`. Não adicione `drive`, que escreve.
5. **Modo de teste.** O app começa em "Teste". Só os usuários de teste cadastrados (até 100) conseguem entrar, e a autorização deles vence em 7 dias. Cadastre o seu e-mail e o de quem for testar.
6. **Produção.** Clique em "Publicar app" em "Público". A partir daí qualquer conta Google entra, sem lista de usuários de teste. Com `drive.file`, que é não sensível, o login não mostra aviso. Com `drive.readonly`, que é restrito, o login mostra "O Google não verificou este app" e o app fica limitado a 100 usuários até passar pela verificação de escopo restrito ("Central de verificação"), que leva semanas e se repete todo ano.

Fontes: https://developers.google.com/identity/protocols/oauth2/scopes (classificação dos escopos), https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification (escopo restrito) e https://support.google.com/cloud/answer/15549945 (limites do modo de teste).

### 4. Client ID OAuth (Aplicativo da Web)

Em "APIs e serviços" → "Credenciais" → "Criar credenciais" → "ID do cliente OAuth":

1. Tipo de aplicativo: **Aplicativo da Web**. Nome: `OpenStrut Pages`.
2. **Origens JavaScript autorizadas**:
   - `https://gmunaro.github.io`
   - `http://localhost:5173` (`bun run dev`)
   - `http://localhost:4173` (`bun run preview`)
   - mais uma linha `http://localhost:<porta>` para cada porta que você usar em desenvolvimento
3. **URIs de redirecionamento**: deixe vazio. O token client usa popup e não precisa de redirecionamento.
4. Copie o Client ID (`<número do projeto>-<...>.apps.googleusercontent.com`). Não há segredo a guardar: o app não usa o "client secret".

A origem é só esquema, domínio e porta, sem caminho. Por isso é `https://gmunaro.github.io`, e não `.../openstrut/`.

### 5. API key restrita

Em "Credenciais" → "Criar credenciais" → "Chave de API", depois "Editar chave":

1. Nome: `OpenStrut Pages`.
2. **Restrições de aplicativo**: "Sites (referenciadores HTTP)", com:
   - `https://gmunaro.github.io/*`
   - `http://localhost:5173/*`
   - `http://localhost:4173/*`

   Use `https://gmunaro.github.io/*`, sem o `/openstrut/`. O navegador manda para o Google só a origem como referenciador (política padrão `strict-origin-when-cross-origin`), e uma restrição com caminho recusaria todas as chamadas. O erro aparece no app como "A ligação com o Google Drive deste site está mal configurada (ipRefererBlocked)" ou "(API_KEY_HTTP_REFERRER_BLOCKED)".
3. **Restrições de API**: "Restringir chave", marcando só **Google Drive API** e **Google Picker API**.

Quotas: a Drive API não cobra pelo uso. O limite padrão por usuário é bem maior que o que uma importação gasta: uma chamada por página de 1000 itens, uma por subpasta e uma por arquivo lido. Se o Google limitar, o app mostra "O Google Drive limitou as leituras deste app agora. Espere alguns minutos e tente de novo."

### 6. Variáveis no GitHub e no `pages.yml`

1. No repositório, em Settings → Secrets and variables → Actions → aba **Variables**, crie:
   - `GOOGLE_CLIENT_ID` com o Client ID do passo 4;
   - `GOOGLE_API_KEY` com a API key do passo 5.

   Use "Variables", não "Secrets". Os dois valores vão para o JavaScript público de qualquer forma.
2. O passo de build do `.github/workflows/pages.yml` passa as duas ao Vite (já está assim no branch `importa-drive`):

```yaml
      # base /openstrut/ e 404.html = index.html (recarregar uma rota interna abre o app)
      - run: bun run build:pages
        env:
          # importação pelo Google Drive (docs/GOOGLE-DRIVE.md); vazias, a opção fica desabilitada
          VITE_GOOGLE_CLIENT_ID: ${{ vars.GOOGLE_CLIENT_ID }}
          VITE_GOOGLE_API_KEY: ${{ vars.GOOGLE_API_KEY }}
```

Se o relato de problema também for ligado (`docs/RELATO.md`), as variáveis dele entram no mesmo bloco `env`.

Para testar na sua máquina antes do Pages:

```sh
VITE_GOOGLE_CLIENT_ID=<client id> VITE_GOOGLE_API_KEY=<api key> bun run build
bun run preview   # http://localhost:4173, que está nas origens e nos referenciadores
```

## Teste manual

O e2e usa o Google falso. Com as chaves reais, confira uma vez:

1. Pasta "qualquer pessoa com o link": colar o link abre o resumo sem pedir login.
2. Pasta compartilhada só com você: colar o link mostra "Entrar com Google e abrir a pasta", que abre a pasta inteira depois do login de leitura, e "Entrar com Google e marcar os arquivos": o popup abre, o Picker abre na pasta, e depois de marcar os arquivos e tocar em Selecionar aparece a lista dos marcados. "Importar os arquivos marcados" leva ao resumo. Confira também que o Picker não deixa selecionar a pasta.
3. Pasta pública com subpastas (a obra mais a EXEC40): a tela pergunta a obra e leva os parâmetros junto, como na pasta do disco. "Escolher a pasta no Drive" com a pasta acima dá o mesmo resultado. Pelo Picker de arquivos, marque os arquivos da obra, depois "Marcar arquivos de outra pasta" e os da EXEC40.
4. Link de um arquivo privado: o Picker mostra só aquele arquivo.
5. Link antigo com `?resourcekey=`: abre como os outros.
6. No Chrome do Android, no navegador e com o app instalado ("Adicionar à tela inicial"): o popup de login abre e volta para o app, e o Picker aparece por cima da página e aceita o toque.
7. Depois de 1 hora, "Marcar arquivos no Drive" e "Escolher a pasta no Drive" pedem login de novo.
