# Composição Firebase Android

`native.ts` implementa Google Sign In + Firebase Auth nativo, persistência de sessão
pelo SDK Android. Fotografias passam pela API Node autenticada, que usa bucket
privado Supabase; o aplicativo não importa Firebase Storage nem recebe chaves
Supabase. `index.ts` preserva os contratos existentes e `http.ts` transporta
`Result<T>` pela API. Domínio e telas não importam SDKs.

Após configurar o development build, a composição cria uma única instância:

```ts
import { readFirebaseClientConfiguration } from './config';
import { createAndroidFirebaseServices } from './native';

const services = createAndroidFirebaseServices(readFirebaseClientConfiguration({
  EXPO_PUBLIC_FIREBASE_ENV: process.env.EXPO_PUBLIC_FIREBASE_ENV,
  EXPO_PUBLIC_FIREBASE_PROJECT_ID: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  EXPO_PUBLIC_FIREBASE_API_URL: process.env.EXPO_PUBLIC_FIREBASE_API_URL,
  EXPO_PUBLIC_FIREBASE_EMULATOR_HOST: process.env.EXPO_PUBLIC_FIREBASE_EMULATOR_HOST,
}));
```

Acesso ao `process.env.EXPO_PUBLIC_...` deve ser literal na composição Expo para
substituição no bundle. Não há credenciais fictícias ou fallback de login.
`EXPO_PUBLIC_*` contém identificadores públicos, nunca chaves administrativas.
Configuração incompleta falha antes de conectar. Quando projectId for informado, o projeto do google-services.json
compilado deve coincidir com o ambiente; mudar ambiente exige novo build nativo.

Frontend: manter um estado inicial de recuperação e assinar
`services.auth.observeSession`. Liberar rotas privadas apenas após sessão válida;
remover dados sensíveis do estado ao receber null. O servidor verifica token em
todas as operações. O contrato atual não distingue erro de restauração de logout;
a interface deve permitir tentar novamente quando a rede voltar.

Publicação: obter permissão e foto da câmera no cache privado, obter coordenadas
com permissão de localização, `photos.upload({localUri,purpose:'report'})`,
`reports.create({idempotencyKey,photoUploadId:uploadId,categoryId,description,location})`.
Preservar idempotencyKey e entrada em tentativas após timeout; não gerar uma nova
chave até saber o resultado. Se desistir antes de publicar, chamar photos.discard.
Uma foto vinculada não pode ser descartada. Fotos de galeria/content:// precisam
ser copiadas para o cache privado pela camada de captura, dentro do escopo da UI.

Feed: center obrigatório, radiusMeters 5000, limit até 50, cursor opaco; sem
permissão, pedir localização/região escolhida explicitamente, sem usar (0,0) como
fallback. A captura de foto e a permissão de localização pertencem ao Frontend.
Não foram alteradas telas nem instalada integração visual nesta entrega.

Fotos não têm URL pública. A API POST readPhoto recebe `{storagePath}` e devolve
JPEG binário apenas com Authorization Bearer e após checar retenção. Usar
`readProtectedPhoto` para carregar os bytes em memória; não persistir tokens ou
URLs em logs. Cancelar/descartar imagens da sessão no logout. A fábrica também expõe
resolvePhoto(storagePath), que devolve data URI em memória para um componente Image;
nenhum token ou URL pública é incluído nessa URI.

Apenas os testes usam identidades sintéticas e emuladores. Login Google no Android,
recuperação após matar o aplicativo e proteção visual de rotas exigem teste no
development build com a configuração manual descrita em docs/backend.md.

## Transporte Render e fotografias privadas

A URL pública confirmada da API vai em `EXPO_PUBLIC_FIREBASE_API_URL`, incluindo
o caminho `/api`; nenhuma URL de deployment foi presumida. O endpoint remoto
exige HTTPS sem credenciais, query ou fragmento. Desenvolvimento local aceita
`http://127.0.0.1:PORT/api` ou `http://10.0.2.2:PORT/api`, com Auth Emulator
configurado separadamente. A rota antiga Functions local continua reconhecida
para testes históricos; o fluxo migrado usa Node `/api`.

Antes da primeira requisição, o transporte consulta `GET /healthz` da mesma
origem. Compartilha a espera entre chamadas concorrentes e guarda prontidão por
45 segundos. Somente essa consulta GET é repetida: orçamento de 105 segundos,
até 15 segundos por consulta e intervalos de até dois segundos. Depois, cada
POST tem limite de 55 segundos e nunca é repetido automaticamente. Se a
inicialização falhar, retorna mensagem recuperável pedindo aguardar e tentar
novamente. Após a espera, recupera novamente o token Firebase: logout durante
o despertar impede o envio autenticado posterior. O aplicativo não mantém
pings para impedir a suspensão do plano gratuito.

O upload segue `reservePhoto` → `POST /api/upload?path=<stagingPath>` →
`completePhoto`. O POST envia Bearer Firebase, MIME da imagem e bytes brutos
extraídos de `File.bytes()` no cache privado Expo (máximo 5 MiB). O caminho é
reserva gerada pelo servidor; o backend verifica autoria e estado antes de
escrever no bucket privado. Não há escrita direta no Supabase, URL pública
ou retry automático de upload. Erros estruturados de autoria são preservados.

Leitura mantém `POST /api` com operação `readPhoto` e devolve JPEG binário
autenticado. `resolvePhoto` converte os bytes somente em memória. O contrato
de `PhotoReference`, publicação, paginação e preferências não muda.

Validação do transporte: `node qa/mobile-transport.test.cjs` (prontidão lenta,
orçamento limitado, ausência de retry de mutações, logout durante espera, upload
privado/autorização/tamanho e foto indisponível). Esses testes simulam rede, não
comprovam execução Android nem conectividade real a Render/Supabase.
