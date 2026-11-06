# Diagnóstico seguro de inicialização no Render

O log antigo `API não iniciada: confira configuração administrativa e bucket privado.`
é genérico: o catch final de server.ts descartava a causa. Ele não permite atribuir
a falha ao Firebase ou Supabase. O código atualizado informa somente etapa fixa
e, na consulta ao bucket, status HTTP numérico. Não imprimir Error, stack, env,
JSON de conta administrativa, URL completa ou resposta do provedor para depurar.

## Procedimento

1. Confirmar o commit usado pelo deploy e os comandos já configurados: Root Directory
   vazio; Build `npm ci --prefix backend && npm --prefix backend run build`; Start
   `npm --prefix backend start`. O runtime testado é Node 22.23.0.
2. No ambiente Render, conferir nomes exatos e ausência de aspas externas/espaços
   acidentais. O servidor exige `MONISYSTEM_ENV=production` e
   `GCLOUD_PROJECT=monisystem-f6d63`. Não usar development no MONISYSTEM_ENV.
   Os três FIREBASE_*_EMULATOR_HOST/FIRESTORE_EMULATOR_HOST não devem existir.
3. `FIREBASE_SERVICE_ACCOUNT_JSON` deve ser o conteúdo completo do JSON de conta de
   serviço Firebase, com project_id, client_email e private_key. Não usar
   google-services.json, caminho de arquivo, bloco de código, aspas de shell externas
   ou JSON duplamente serializado. Preservar os escapes de newline do JSON original
   da chave; não substituir manualmente trechos da chave.
4. `SUPABASE_URL` deve ser a URL HTTPS raiz do mesmo projeto da chave, sem `/storage/v1`,
   `/rest/v1`, URL de arquivo, parâmetros ou credenciais embutidas.
   `SUPABASE_SERVICE_ROLE_KEY` deve ser uma chave administrativa secret ou service_role,
   não anon/publishable. `SUPABASE_STORAGE_BUCKET=monisystem-photos` é nome exato e
   diferencia maiúsculas/minúsculas. Bucket deve existir e continuar privado.
5. Quando autorizado pelo responsável, repetir deployment manual do commit com
   diagnóstico. Esta alteração não executa deployment. Consultar a linha
   `API_STARTUP_FAILED step=... httpStatus=...` e usar a tabela. Compartilhar somente
   etapa e status, nunca valores de ambiente.
6. Quando iniciar, o log será `API Monisystem pronta.` e `GET /healthz` responderá
   HTTP 200. Só então validar login e publicação pelo Android.

| step | Verificar/corrigir |
| --- | --- |
| API_PORT | PORT fornecida pelo Render deve ser inteiro de 1 a 65535; não sobrescrever sem necessidade |
| API_BIND | Falha ao abrir a porta; confirmar processo único e PORT |
| ENV_MODE | MONISYSTEM_ENV deve ser production |
| ENV_PROJECT | GCLOUD_PROJECT deve ser monisystem-f6d63 |
| ENV_EMULATOR | Remover variáveis de emuladores do ambiente remoto |
| ENV_MISSING | Conferir FIREBASE_SERVICE_ACCOUNT_JSON, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY e SUPABASE_STORAGE_BUCKET não vazias |
| FIREBASE_JSON | Conteúdo da variável não é JSON válido; recopiar o JSON original sem aspas externas |
| FIREBASE_FIELDS | JSON não contém campos válidos project_id, client_email e private_key; confirmar tipo de arquivo correto |
| FIREBASE_PROJECT | Conta de serviço pertence a outro projeto |
| SUPABASE_CONFIG | URL, nome de bucket ou tipo de chave rejeitado localmente; conferir passo 4 |
| SUPABASE_CONNECT | DNS, TLS, timeout ou redirect; confirmar URL e projeto Supabase ativo |
| SUPABASE_HTTP com 401/403 | Provedor recusou a chamada; conferir chave administrativa ativa e pertencente ao mesmo projeto |
| SUPABASE_HTTP com 404 | Conferir nome do bucket, URL/projeto; a resposta não permite afirmar sozinha a causa |
| SUPABASE_HTTP com outros status | Conferir disponibilidade/quota do projeto no painel; não registrar corpo da resposta |
| SUPABASE_BUCKET_RESPONSE | Resposta não é metadado JSON válido do bucket; conferir URL/projeto |
| SUPABASE_BUCKET_PRIVATE | Bucket não foi confirmado privado; manter public=false, não contornar a verificação |
| SUPABASE_BUCKET_ID | Metadados retornam nome/ID diferente do configurado |
| FIREBASE_INIT | SDK recusou inicialização/chave PEM ou projeto nativo já inicializado incompatível; recopiar JSON original da conta correta |
| STARTUP_UNKNOWN | Falha fora das etapas classificadas; informar somente código/commit para investigação |

A verificação remota de bucket executa GET autenticado em `/storage/v1/bucket/{nome}`.
A chave moderna secret usa apenas apikey; o JWT service_role legado também usa Bearer.
Nenhum bucket é criado ou tornado público. A falha mantém a API sem iniciar.

As permissões efetivas do Firestore são verificadas durante operações posteriores,
não por getFirestore() na inicialização. Falhas de categoria/região, índices e SHA
Google não explicam diretamente o catch inicial acima. A limpeza executa depois
de abrir a porta e possui mensagem separada.
