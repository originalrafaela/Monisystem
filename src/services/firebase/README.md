# Composição Firebase Android

`native.ts` implementa Google Sign In + Firebase Auth nativo, persistência de sessão
pelo SDK Android e upload Storage. `index.ts` implementa os contratos existentes e
transporta `Result<T>` pela API autenticada. Domínio e telas não importam SDKs.

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
