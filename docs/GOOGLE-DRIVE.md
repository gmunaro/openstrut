# Importar do Google Drive

A tela inicial tem a opção "Importar do Google Drive", ao lado de "Importar pasta do SISTRUT". Ela lê a pasta da obra direto do Drive, no navegador, e entrega os arquivos à mesma importação da pasta do disco (`importarObraSistrut`, ver `docs/MODO-CALCULO.md`). Este documento explica como a opção funciona e o que o dono do app precisa configurar no Google Cloud para ligá-la.

## Como funciona

O usuário tem dois caminhos.

1. **Colar o link** de uma pasta ou de um arquivo do Drive. O app tenta primeiro só com a API key, sem login. Isso abre pastas compartilhadas como "qualquer pessoa com o link". Se o Google responde 403 ou 404, a tela pede login e abre o Google Picker já na pasta do link, e o usuário marca a pasta (ou os arquivos) e toca em Selecionar.
2. **Escolher no Drive** pelo Google Picker, com login.

Depois de escolhida a pasta, o app a lista pela Drive API v3 (`files.list` com `q='<id>' in parents and trashed=false`), página por página, e entra nas subpastas. Cada arquivo leva o caminho dentro da pasta (`PREDIO/EXEC40/SISTRUT.DSP`), igual ao que o seletor de pasta do disco dá. A tela segue como na pasta do disco: pergunta a subpasta quando há mais de uma obra, pergunta o .DSP quando nada decide, e mostra o resumo antes de abrir.

O app só baixa (`files.get?alt=media`) os arquivos que a importação lê. Os .DXF, .PLT, .BAK e os outros de `NAO_LIDOS` aparecem no resumo, entre os ignorados, sem sair do Drive. Documentos do Google (Docs, Planilhas) e atalhos para pasta ficam de fora, com uma nota no resumo. Um atalho para arquivo baixa o arquivo de destino. O diálogo "Baixando do Google Drive" mostra "n de N arquivos" e tem Cancelar.

Código: `src/telas/drive/api.ts` (Drive API), `src/telas/drive/google.ts` (login e Picker), `src/telas/ImportarDrive.tsx` (diálogo) e `src/telas/selecao.ts` (leitura sob demanda, comum ao disco e ao Drive).

### Escopo OAuth: só `drive.file`

O app pede só `https://www.googleapis.com/auth/drive.file`. Com ele, o app lê apenas o que o usuário escolhe no Picker. O Google classifica esse escopo como não sensível.

O `drive.readonly` leria qualquer pasta pelo link, sem o passo do Picker. O app não o pede porque o Google o classifica como restrito. Um app em produção com escopo restrito passa por verificação, que segundo o Google "can potentially take several weeks", tem de ser refeita todo ano, e pode exigir uma avaliação de segurança paga (CASA) quando os dados passam por servidor. Até a verificação sair, a tela de consentimento mostra o aviso de app não verificado e o app fica limitado a 100 usuários. Para o caso comum, a pasta pública, nenhum escopo é necessário, e para a pasta privada o Picker resolve com um toque a mais.

Ponto a testar com o Google de verdade: não há documentação oficial que diga se escolher uma pasta no Picker com `drive.file` libera os arquivos de dentro dela. O app trata os dois casos. Se a pasta escolhida vier vazia, a tela diz "O Google deu acesso só à pasta, não aos arquivos dentro dela" e reabre o Picker na pasta para o usuário marcar os arquivos (dá para marcar vários).

### Privacidade

- Nada passa por servidor do OpenStrut. O navegador fala direto com `www.googleapis.com`, `accounts.google.com` e `apis.google.com`, e a obra fica no navegador, como na importação do disco.
- O token de acesso vem do Google Identity Services (token client, popup). Ele fica só numa variável em memória (`src/telas/drive/google.ts`), nunca em localStorage, e vence em cerca de 1 hora. Fechar ou recarregar a página o descarta.
- O Client ID e a API key não são segredo: vão no JavaScript público do site. A proteção da API key é a restrição por referrer e por API, configurada no passo 5.
- O app carrega os scripts do Google só quando o usuário abre o diálogo do Drive.

### Celular e PWA

O login usa o popup do Google, que o navegador só deixa abrir no toque do usuário. O app carrega o script do login quando o diálogo abre e pede o token no próprio toque em "Escolher no Drive" ou "Entrar com Google e escolher a pasta". Um bloqueio de popup vira a mensagem "O navegador bloqueou a janela de login do Google. Libere os popups deste site e tente de novo." O Picker não é popup: ele aparece por cima da página, e o diálogo do app sai da frente enquanto ele está aberto.

O e2e (`e2e/drive.spec.ts`) confere esse fluxo em 390x844 e 1366x768 com o Google falso. Não foi testado com o Google de verdade, no Chrome do Android nem com o app instalado como PWA. Veja o roteiro em "Teste manual".

## Configuração no Google Cloud (passo a passo do dono)

Nada disto foi feito. Sem as duas variáveis, o build mostra a opção desabilitada com a explicação "não está ligada nesta versão do app".

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
3. Domínios autorizados: `gmunaro.github.io`. Página inicial: `https://gmunaro.github.io/openstrut/`. Política de privacidade: uma página pública que diga que o app lê do Drive só o que o usuário escolhe, no navegador, e não guarda nada em servidor. Ela é exigida para publicar.
4. Escopos ("Acesso a dados"): adicione só `.../auth/drive.file`. Não adicione `drive.readonly` nem `drive`.
5. **Modo de teste.** O app começa em "Teste". Só os usuários de teste cadastrados (até 100) conseguem entrar, e a autorização deles vence em 7 dias. Cadastre o seu e-mail e o de quem for testar.
6. **Produção.** Quando o teste passar, clique em "Publicar app". Com só `drive.file`, que é não sensível, o Google não exige verificação de escopo. Se o console pedir verificação da marca (nome e logo na tela de consentimento), ela costuma levar poucos dias úteis. Se um dia o app pedir `drive.readonly`, ele passa a precisar da verificação de escopo restrito, que leva semanas e se repete todo ano.

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
2. Pasta compartilhada só com você: colar o link mostra "Entrar com Google e escolher a pasta", o popup abre, o Picker abre na pasta, e depois de Selecionar o resumo aparece. Se a tela disser que o Google deu acesso só à pasta, marque os arquivos.
3. Pasta com subpastas (a obra mais a EXEC40): a tela pergunta a obra e leva os parâmetros junto, como na pasta do disco.
4. Link antigo com `?resourcekey=`: abre como os outros.
5. No Chrome do Android, no navegador e com o app instalado ("Adicionar à tela inicial"): o popup de login abre e volta para o app, e o Picker aparece por cima da página e aceita o toque.
6. Depois de 1 hora, "Escolher no Drive" pede login de novo.
