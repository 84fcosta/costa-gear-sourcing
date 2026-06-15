# Costa Gear Sourcing App — Guia de Deploy
### Do zero ao link compartilhável em ~30 minutos

---

## PARTE 1 — Supabase (banco de dados)

### Passo 1 · Criar conta
1. Acesse **supabase.com** → clique em **Start your project**
2. Crie conta com Google ou email
3. Clique em **New project**
4. Preencha:
   - **Name:** costa-gear
   - **Database Password:** crie uma senha forte e anote em algum lugar seguro
   - **Region:** escolha **US East (N. Virginia)** ou o mais próximo do Canada
5. Clique **Create new project** — aguarde ~2 minutos

### Passo 2 · Criar as tabelas e inserir os dados
1. No menu lateral, clique em **SQL Editor**
2. Clique em **New query** (botão no topo)
3. Abra o arquivo `supabase-setup.sql` (que você baixou junto com esse guia)
4. Copie **todo** o conteúdo e cole no editor
5. Clique em **Run** (ou Ctrl+Enter)
6. Você verá "Success. No rows returned" — isso é correto

### Passo 3 · Copiar as credenciais
1. No menu lateral, clique em **Project Settings** → **API**
2. Anote os dois valores (você vai precisar no Passo 10):
   - **Project URL** → algo como `https://xyzxyzxyz.supabase.co`
   - **anon public key** → uma string longa começando com `eyJ...`

---

## PARTE 2 — GitHub (repositório de código)

### Passo 4 · Criar conta no GitHub
1. Acesse **github.com** → **Sign up**
2. Crie conta com seu email

### Passo 5 · Criar repositório
1. Após login, clique no **+** no canto superior direito → **New repository**
2. Preencha:
   - **Repository name:** costa-gear-sourcing
   - Deixe como **Public** (necessário para Vercel gratuito)
3. Clique **Create repository**

### Passo 6 · Fazer upload dos arquivos
Na página do repositório vazio que apareceu:
1. Clique em **uploading an existing file**
2. Faça upload da pasta `costa-gear-app` inteira (ou arraste os arquivos)
   - A estrutura deve ficar assim no GitHub:
     ```
     package.json
     public/
       index.html
     src/
       index.js
       App.js
       supabase.js
     ```
3. Role para baixo e clique **Commit changes**

---

## PARTE 3 — Vercel (hospedagem gratuita)

### Passo 7 · Criar conta no Vercel
1. Acesse **vercel.com** → **Sign Up**
2. Escolha **Continue with GitHub** — isso conecta as duas contas automaticamente

### Passo 8 · Importar o projeto
1. No painel do Vercel, clique em **Add New… → Project**
2. Você verá o repositório `costa-gear-sourcing` listado
3. Clique em **Import**

### Passo 9 · Configurar o projeto
1. Em **Framework Preset**, selecione **Create React App**
2. Deixe o restante como está
3. **NÃO clique em Deploy ainda** — você precisa primeiro adicionar as variáveis de ambiente

### Passo 10 · Adicionar as credenciais do Supabase
1. Ainda na tela de configuração, role até **Environment Variables**
2. Adicione as duas variáveis (usando os valores que você copiou no Passo 3):

   | NAME | VALUE |
   |------|-------|
   | `REACT_APP_SUPABASE_URL` | `https://seuprojectid.supabase.co` |
   | `REACT_APP_SUPABASE_ANON_KEY` | `eyJhbGc...` (a chave longa) |

3. Clique **Deploy**
4. Aguarde ~2 minutos — o Vercel vai construir e publicar o app

### Passo 11 · Acessar o app
1. Quando terminar, o Vercel mostra uma URL tipo: `https://costa-gear-sourcing.vercel.app`
2. Abra essa URL — o app vai carregar com todos os dados já populados
3. **Compartilhe esse link** com a outra pessoa — ambos veem e editam os mesmos dados em tempo real

---

## Dar acesso à outra pessoa

Basta enviar a URL. Qualquer um com o link pode usar o app.

Se no futuro você quiser **proteger com senha** (para não ser público), avise e adicionamos autenticação simples.

---

## Manutenção futura

- **Atualizar o app** (mudar código): edite os arquivos no GitHub → Vercel faz redeploy automático
- **Ver/editar dados diretamente**: Supabase → Table Editor — funciona como uma planilha
- **Backup**: Supabase → Settings → Database → Backups (automático no plano gratuito)

---

## Resumo dos serviços utilizados

| Serviço | Custo | Limite gratuito |
|---------|-------|-----------------|
| Supabase | Grátis | 500 MB banco, 2 projetos |
| Vercel | Grátis | 100 GB bandwidth/mês |
| GitHub | Grátis | Repositórios públicos ilimitados |
