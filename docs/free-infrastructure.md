# Firebase Spark, Supabase Storage Free e Render Free

Arquitetura do MVP acadêmico: Firebase Authentication Google e Firestore no projeto
`monisystem-f6d63`; fotografias em bucket privado Supabase; API Node.js no Render
Free. Os contratos de domínio e de serviço são preservados. Esta entrega não cria
recursos, não ativa faturamento e não executa deployment.

## Fluxo

O Android autentica com Google/Firebase. Cada chamada à API inclui ID token Firebase
no cabeçalho Bearer. O servidor valida token e revogação; a conta Admin é restrita
ao servidor. O Firestore continua negando leitura e escrita direta dos clientes.
O aplicativo não recebe credencial Supabase nem acesso direto ao bucket.

A reserva de foto gera um caminho associado ao proprietário no Firestore. O app
envia bytes para `POST /api/upload?path=...` com token e MIME de imagem. O servidor
verifica dono, reserva vigente, formato e limite de 5 MiB e bloqueia sobrescrita.
A finalização valida bytes reais com sharp, normaliza JPEG e remove metadados.
A publicação mantém chave/entrada idempotentes. As leituras de fotos passam pelo
endpoint autenticado, verificando vínculo e retenção, sem URL pública ou assinada.

Nenhum arquivo precisa persistir no disco efêmero do Render. O bucket privado é
verificado na inicialização; bucket público bloqueia o serviço. Nenhuma política
Supabase deve conceder acesso ao papel anon ou authenticated: só o servidor usa
a chave administrativa para os objetos. Firestore armazena dados e autorizações,
Supabase apenas os bytes. Não migrar dados administrativos ou senhas para o app.

## Configuração manual após autorização de deployment

1. Manter Firebase no Spark, sem vincular faturamento. Criar/verificar Firestore e
   implantar somente suas regras restritivas e índices. Google Auth, pacote e
   certificados Android continuam os mesmos. Não implantar Cloud Functions nem
   habilitar Firebase Storage para esta arquitetura.
2. No Supabase Free, criar/verificar bucket privado com limite de 5 MiB e tipos
   JPEG/PNG/WebP. Não criar políticas de acesso público. Obter URL do projeto,
   nome do bucket (`monisystem-photos`, já informado pelo responsável) e chave de
   serviço para uso exclusivo na API.
3. No Render, criar um Web Service Free somente após autorização. `render.yaml`
   fornece build/start e desliga deployments automáticos. Não adicionar cartão,
   discos persistentes, cron pago, banco Postgres ou serviços adicionais.
4. Configurar segredos somente no ambiente do servidor: `FIREBASE_SERVICE_ACCOUNT_JSON`
   (conta de serviço Firebase com permissões mínimas necessárias a Auth/Firestore),
   `SUPABASE_SERVICE_ROLE_KEY`; configurar também `SUPABASE_URL`,
   `SUPABASE_STORAGE_BUCKET`, `GCLOUD_PROJECT=monisystem-f6d63` e
   `MONISYSTEM_ENV=production`. Nunca usar prefixo `EXPO_PUBLIC_` nesses segredos.
   Render fornece `PORT`. Não registrar cabeçalhos/token/corpos sensíveis.
5. Após deployment autorizado, usar a URL HTTPS real terminada em `/api` em
   `EXPO_PUBLIC_FIREBASE_API_URL`. Nenhum hostname foi inventado nesta entrega.
   Preservar as outras variáveis públicas Google/Firebase e o arquivo nativo local
   ignorado. Recompilar o development build depois de remover Firebase Storage.

## Inicialização e retenção

O app usa `GET /healthz` com espera limitada para inicialização lenta; erros são
recuperáveis. Somente a sondagem de prontidão pode ser repetida automaticamente.
Uploads e publicações não são reenviados automaticamente: o mesmo relato mantém
a mesma chave e entrada quando a resposta é incerta.

A limpeza física aproveita inicialização, intervalos e atividade da API e mantém
a exclusão recuperável de fotos e documentos. Render Free dorme sem tráfego: os
intervalos não executam enquanto o processo está suspenso. A expiração bloqueia
a leitura imediatamente, mas não garante exclusão física no exato prazo durante
inatividade. Para verificação acadêmica, executar o `npm --prefix backend run cleanup -- --confirm-project=monisystem-f6d63`
com ambiente administrativo carregado e confirmar seu resultado. Uma garantia contínua exige
executor externo aprovado; nenhum agendamento externo foi criado.

## Limites dos planos

Render Free pode suspender o processo após 15 minutos sem tráfego e levar cerca
de um minuto para iniciar; seu disco é efêmero. Sem forma de pagamento, ultrapassar
limites pode suspender o serviço. Não usar pings artificiais para impedir suspensão.
[Render Free](https://render.com/docs/free),
[Render FAQ](https://render.com/docs/faq).

Supabase Free anuncia 1 GB de arquivos e cotas de transferência; projetos podem
ser pausados após inatividade. Evitar fotografias grandes e downloads repetidos;
a aplicação deve apresentar falhas de quota sem expor detalhes ou perder a chave
de publicação. [Supabase preços](https://supabase.com/pricing),
[buckets privados](https://supabase.com/docs/guides/storage/buckets/fundamentals).

Firestore Spark possui cotas diárias. A busca por geohash pode consumir muitas
leituras, especialmente em regiões densas. Medir uso no Console e manter limites
de consulta; não elevar quotas ativando faturamento.
[Firebase Spark](https://firebase.google.com/docs/projects/billing/firebase-pricing-plans).

Testes locais, adapters simulados e Firebase Emulator Suite não certificam Supabase
ou Render hospedados nem Android real. Resultados e limites da migração devem
ser registrados em `qa/migration.md` antes da publicação.
