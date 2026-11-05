# Backend Firebase do Monisystem

Serviços implementados para execução local e preparação de deployment autorizado.
A validação local não comprova login Google em Android ou integração das telas.
Nenhum projeto, bucket, faturamento, serviço pago ou agendamento foi criado.

## Arquivos e composição

- `src/services/firebase/index.ts`: contratos de serviços, transporte HTTP com Bearer,
  observação de sessão com controle de respostas atrasadas e leitura binária de fotos.
- `src/services/firebase/native-driver.ts`: troca de token, logout e validação de URI.
- `src/services/firebase/native.ts`: bindings reais de Google Sign In, Firebase Auth e
  Storage; leitura de arquivos Expo no cache privado; composição para o Frontend.
- `src/services/firebase/config.ts`: configuração explícita por ambiente, sem fallback.
- `src/services/firebase/README.md`: instruções de consumo e proteção visual de rotas.
- `backend/src/core.ts`: esquemas, erros, geografia, limites e isolamento de emuladores.
- `backend/src/backend.ts`: perfil, preferências, publicação, upload, feed, histórico,
  agrupamento, métricas, dispositivos e limpeza recuperável.
- `backend/src/persistence.ts`: conversão de Timestamp e DTOs sem dados privados.
- `backend/src/index.ts`: API HTTP autenticada, verificação de token/revogação,
  seleção explícita de ambiente e despacho fechado de operações.
- `backend/src/cleanup.ts`: executor de limpeza somente local.
- `backend/tests/`: testes unitários e integração com Emulator Suite.
- `backend/firestore.rules`, `storage.rules`, `firestore.indexes.json`, `firebase.json`,
  `package.json`, `package-lock.json`, `tsconfig.json`, `.env.example`: infraestrutura
  declarativa local, dependências fixadas por lockfile e exemplo sem credenciais.
- `package.json`, `package-lock.json`: SDKs nativos e expo-file-system; react-dom fixado
  em 19.2.0 para acompanhar React, resolvendo conflito de peer dependency na instalação.
- `.gitignore`: exclusão de arquivos de configuração interna e segredos.

Os contratos em `src/domain`, `src/services/contracts.ts` e `src/types` foram
preservados. Nenhum arquivo de tela/componente foi modificado nesta implementação.
O arquivo `src/services/firebase/README.md` contém o exemplo de composição.

## Ações manuais para Google/Firebase Android

1. Escolher projetos Firebase separados para desenvolvimento e produção, sem
   ativar faturamento ou criar infraestrutura paga sem autorização. Obter os
   identificadores reais pelo console; não usar os valores do projeto de emulador.
2. Confirmar com a arquitetura o applicationId. O app.json atual declara
   `com.monisystem.app`; tratá-lo como provisório até confirmação do produto.
   Registrar um app Android no projeto com exatamente esse identificador.
3. No Firebase Authentication habilitar o provedor Google e configurar email de
   suporte. Configurar a tela de consentimento OAuth e usuários de teste quando
   o app estiver em modo de teste no Google Cloud.
4. Obter SHA-1 e SHA-256 do certificado usado no development build e cadastrá-los
   no app Android do Firebase. Usar `./gradlew signingReport` no projeto Android
   gerado ou `keytool -list -v -keystore <caminho real>` com entrada interativa da
   senha. Cadastrar também certificados de release/Play App Signing quando usados;
   o certificado de debug não valida um binário assinado por outro certificado.
5. Baixar o google-services.json atualizado do app correto. Guardá-lo fora do Git
   e apontar `expo.android.googleServicesFile` para seu caminho local na configuração
   do build. Nunca colocar chave de conta de serviço no aplicativo.
6. Adicionar à lista de plugins Expo `@react-native-firebase/app`,
   `@react-native-firebase/auth`, `@react-native-google-signin/google-signin`,
   preservando expo-router e outros plugins existentes. Validar compatibilidade da
   versão instalada com Expo SDK 55. O app.json foi preservado porque o arquivo
   Firebase real não está disponível. Auth e Storage usam o app nativo padrão.
7. Identificar o OAuth client do tipo **Web application** pertencente ao mesmo
   projeto (normalmente criado pelo Firebase) e usar seu Client ID em webClientId.
   Não usar o Android client ID nesse campo; nenhum client secret vai para o app.
8. Na composição Expo definir explicitamente EXPO_PUBLIC_FIREBASE_ENV
   (`development` ou `production`), EXPO_PUBLIC_FIREBASE_PROJECT_ID,
   EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID e EXPO_PUBLIC_FIREBASE_API_URL.
   Deixar EXPO_PUBLIC_FIREBASE_EMULATOR_HOST ausente para ambientes remotos.
   São identificadores públicos, não segredos. Manter arquivos .env reais ignorados.
   A composição atual do Frontend também aceita extra.monisystem com mode firebase,
   webClientId e endpoint; usar uma fonte de configuração consistente no build.
9. Após autorização de infraestrutura: configurar Firestore, Storage, regras e
   índices; configurar a função `api` com MONISYSTEM_ENV=production e
   MONISYSTEM_STORAGE_BUCKET igual ao bucket real. GCLOUD_PROJECT é fornecido
   pelo runtime. Usa identidade do runtime/ADC no servidor, nunca chave no cliente.
   A identidade deve ter somente os acessos necessários a Firestore, Storage e
   verificação de usuários Auth. Restringir acesso IAM de deploy/console aos responsáveis.
10. O endpoint HTTPS real retornado pelo deployment vai em FIREBASE_API_URL.
    Não há URL de produção inventada, deploy automático ou comando de deploy nesta entrega.
11. Cadastrar categorias e regiões pelo servidor/console administrativo. Cada
    categoria exige duração de alerta, distância e janela de agrupamento. Regiões
    exigem polígonos fechados sem sobreposição ambígua. A publicação falha de forma
    explícita se a ocorrência estiver fora da cobertura ou se faltar política.
    As regiões e parâmetros dos testes são sintéticos e nunca são seed de produção.
12. Gerar novo development build, instalar e testar login, cancelamento, logout,
    reabertura, sessão revogada e indisponibilidade. Expo Go não contém estes módulos.
    Configurar câmera/localização e ligar a proteção de rotas na frente de interface.

Referências de configuração: [Expo/Firebase](https://docs.expo.dev/guides/using-firebase/),
[Google Sign In/Expo](https://react-native-google-signin.github.io/docs/setting-up/expo),
[Firebase Auth nativo](https://rnfirebase.io/auth/social-auth).

Cloud Storage exige projeto no plano Blaze conforme a política vigente; Cloud
Functions e agendamento também podem exigir faturamento. A execução local evita
provisionamento. Consultar a [política oficial de Storage](https://firebase.google.com/docs/storage/faqs-storage-changes-announced-sept-2024)
antes de autorizar recursos. O backend remoto depende dessa decisão.

## Modelo persistido

| Coleção | Conteúdo e acesso |
| --- | --- |
| accounts/{uid} | UID apenas no caminho privado, publicProfileId e createdAt |
| accounts/{uid}/preferences/main | regiões, categorias, até três prioridades únicas e opt-in |
| accounts/{uid}/devices/{id} | tokens privados, plataforma, updatedAt controlado pelo servidor |
| publicProfiles/{id aleatório} | nickname e foto processada opcional, sem UID/email |
| reports/{id} | DTO Report mais ownerUid/uploadId privados e deletionState |
| incidents/{id} | categoria, centro, geohash, região, contagem e datas; estado derivado da expiração |
| categories/{id} | políticas administrativas de alertas e agrupamento |
| regions/{id} | nome e boundary como mapas {points}, evitando arrays aninhados do Firestore |
| uploads/{id} | reserva privada, autoria, paths gerados, propósito, estado e expiração |
| operations/{hash} | idempotência por UID/chave, fingerprint e referência ao relato |
| groupingGates/{categoryId} | serialização de seleção de agrupamentos concorrentes |
| querySessions/{id} | IDs ordenados e fingerprint de filtros, proprietário e TTL lógico de 10 min |
| regionalMetrics/{hash} | contagens diárias por região/categoria, relatos e incidentes separados |
| notificationJobs/{hash} | preparação opcional deduplicada, sem envio implementado |
| cleanupJobs, uploadQuotas | recuperação de limpeza e limite de reservas |

Datas no banco são Timestamp; DTOs usam milissegundos UTC. Preferências ficam
aninhadas na conta sem coleção duplicada. Coleções incidentGroups/users do enunciado
correspondem a incidents e accounts/publicProfiles nos contratos existentes.
Nenhuma DTO de feed/perfil expõe UID, email, dispositivos ou preferências.

## Publicação, falhas e limites

API autentica cada chamada verificando ID token e revogação. Cliente não escolhe
paths Storage; servidor reserva staging/{uid}/{uploadId}/original. Upload é create
único, autor autenticado, reserva vigente, tipo jpeg/png/webp e 0 < bytes <= 5 MiB.
O backend decodifica bytes reais com limite de 24 megapixels, recusa animação,
normaliza para JPEG até 2048x2048 e remove metadados EXIF. Processed é privado.

CreateReport valida texto entre 1 e 2000 caracteres, categoria, coordenadas finitas,
região e posse/propósito/estado/validade da foto. Uma transação cria relato, atualiza
agrupamento, consome foto e registra idempotência e métricas. Falha de transação
não cria relato parcial. Repetição com a mesma chave e entrada devolve o mesmo
relato; outra entrada com a mesma chave falha. Upload abandonado é rastreado e
eliminado por cleanup; a API discard marca para limpeza, sem apagar foto vinculada.
Processamento ativo não pode ser descartado; limpeza respeita lease de 2 minutos.

Cliente só aceita file:// no cache privado do app, sem caminhos relativos ou
travessia. Servidor nunca recebe caminhos locais. Não existe edição ou exclusão
de relatos pelo cliente nesta versão; ambos são negados pelas regras. Perfil só
pode ser alterado pelo serviço usando a conta da sessão; fotografia deve pertencer
à mesma conta e ter propósito profile. A rotina administrativa de retenção apaga
relatos após a janela. Políticas de exclusão voluntária/conta exigem incremento
próprio, sem abrir escrita direta no banco.

## Feed, agrupamento e histórico

O feed aceita raio até 5000m; o aplicativo deve enviar 5000m. Utiliza intervalos
geohash, deduplicação, distância geodésica em metros (distanceBetween retorna km),
filtros por categoria/região e ordenação updatedAt decrescente, ID como desempate.
Página até 50 itens. Um snapshot de IDs mantém paginação consistente entre
intervalos e impede reutilizar cursor de outra conta/filtro. Novos relatos entram
na atualização do feed. Itens expirados são reavaliados em cada página.

Cada intervalo lê até 2001 candidatos e o conjunto único é limitado a 2000; se
excedido, retorna unavailable, sem apresentar silenciosamente um feed incompleto.
O limite por intervalo pode custar até aproximadamente nove vezes esse número
por primeira consulta, mais leituras de páginas e sessão. Filtros são finais;
não reduzem necessariamente as leituras geográficas. O MVP precisa de análise de
custo/índices para áreas densas. Catálogo até 100 regiões; preferências até 50
regiões; reserva de upload até 10/minuto/conta. API autenticada não substitui
proteção contra abuso por usuários válidos; App Check/rate limiting global e
limites comerciais devem ser definidos antes de exposição pública ampla.

Agrupamento exige mesma categoria e região, distância configurada da referência,
janela contada da criação do grupo e alerta ativo. Seleciona o mais próximo com
ID como desempate. Distância medida da âncora evita encadeamento de ocorrências
progressivamente distantes. Gate por categoria impede grupos duplicados em
transações concorrentes; prioriza consistência ao custo de throughput no MVP.
Não existe classificação semântica: dois eventos próximos da mesma categoria
na janela podem ainda ser agrupados; parâmetros conservadores são essenciais.

alertExpiresAt encerra o alerta; o histórico continua até deleteAfter = createdAt
+ 14 dias. Leitura de foto de relato exige deleteAfter vigente. Incidente acumula
a maior data de seus relatos. Limpeza física não é requisito para negar leitura.
Cleanup marca deletando, apaga foto e depois remove documentos/reconta grupo;
reexecução recupera falhas. Não configurar TTL de reports/uploads antes de
coordenar exclusão das fotos: deletar somente o documento poderia deixar órfãos.
Sem scheduler autorizado, executar a rotina local em emuladores. Uma rotina
administrativa equivalente no ambiente real exige provisionamento/autorização;
sem ela, dados ficam invisíveis mas podem permanecer fisicamente armazenados.

## Métricas e push

Cada publicação atualiza contagem diária por categoria e região na mesma
transação, incluindo contagem separada de grupos novos. API retorna no máximo
200 agregados por região, ordenados por período, filtrando retenção. Totais,
distribuição por categoria/região/dia derivam dessas linhas. Retenção de agregados
na composição da API é 14 dias após o final do dia UTC; não é histórico ilimitado.

Dispositivos são registrados na conta autenticada com timestamp do servidor e
limite transacional de dez por conta.
Planejamento opcional intersection seleciona região E categoria seguidas,
identifica prioridades e deduplica por incidente/conta/dispositivo, limitado a
100 contas e 10 dispositivos lidos por conta. Não é disparado pela API e não há
worker, envio FCM, retries ou credenciais de push configurados. Notificações
reais permanecem **pendentes**, inclusive aprovação da seleção e frequência.

## HarpiSense

Buscas no Google Drive conectado por HarpiSense e Harpi não retornaram arquivos.
Não foi possível inspecionar código-fonte; nenhum reaproveitamento é alegado.
Validação de runtime, erros estruturados, separação domínio/adaptador e testes
foram implementados diretamente para estes contratos. Nenhum serviço MQTT,
PostgreSQL, credencial ou dado de outro projeto foi copiado.

## Verificação e pendências

Executar com Node 22 ou 24 e JDK 21+; esta sessão utiliza Node 26.13 e o JBR do
Android Studio. Firebase CLI 15.35 inclui dependência que declara suporte até Node
24; manter CI em versão suportada. npm ci deve respeitar os lockfiles.

```bash
npm ci
npm run check
cd backend
npm ci
npm test
npm run test:emulators
```

Testes de integração recusam hosts externos e projeto real, usam dados sintéticos
e limpam somente demo-monisystem. Não executar junto de outro teste que compartilhe
esse projeto. O JDK deve estar no PATH. Para Android Emulator, host dos serviços é
10.0.2.2; em testes Node o host é 127.0.0.1. Emulator Suite escuta somente loopback.
Google OAuth real não é reproduzido pelo emulador; tokens de teste não constituem
validação do login Google no aparelho.

O relatório dos testes efetivamente executados e os bloqueios da entrega ficam
em docs/backend-validation.md. Revisão QA e integração/publicação pertencem ao
Arquiteto. A entrega não inclui arquivos internos de agentes ou segredos.
