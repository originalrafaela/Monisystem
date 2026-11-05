# Configuração Android

O aplicativo usa development build com Firebase e Google Sign In nativos; Expo Go não fornece esses módulos.

A composição `src/components/mobile-composition.ts` lê as variáveis públicas abaixo por acessos literais `process.env.EXPO_PUBLIC_*`, usando `readFirebaseClientConfiguration`. Configure-as no ambiente do Metro/build; arquivos `.env` permanecem fora do Git. São identificadores públicos incorporados ao aplicativo, nunca segredos.

| Variável | Valor esperado |
| --- | --- |
| `EXPO_PUBLIC_FIREBASE_ENV` | `emulator`, `development` ou `production` |
| `EXPO_PUBLIC_FIREBASE_PROJECT_ID` | ID do projeto nativo Firebase; em emuladores, `demo-monisystem` |
| `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` | Client ID OAuth do tipo Web terminado em `.apps.googleusercontent.com` |
| `EXPO_PUBLIC_FIREBASE_API_URL` | Endpoint HTTPS da API autenticada; emulador permite HTTP local |
| `EXPO_PUBLIC_FIREBASE_EMULATOR_HOST` | Somente em `emulator`: `10.0.2.2` no AVD ou `127.0.0.1` com encaminhamento de portas |

Em emuladores, o endpoint deve começar com `http://HOST:5001/demo-monisystem/`; conferir região e nome da função em `backend/firebase.json` e `backend/src/index.ts`. Ambientes remotos recusam projetos `demo-*` e host de emulador. Google Sign In continua dependendo de OAuth válido.

`extra.monisystem.mode = "demo"` habilita demonstração explicitamente. Os campos `webClientId`, `endpoint` e `emulatorHost` em `extra` não configuram a composição real. A ausência das variáveis públicas válidas mantém o fluxo real bloqueado.

`app.json` declara plugins de câmera, localização, Firebase e Google Sign In. A câmera não solicita áudio; o GPS é usado em primeiro plano. Para build real, disponibilizar `google-services.json` local e configurar `android.googleServicesFile` para seu caminho. Registrar o pacote `com.monisystem.app` e certificados SHA no Firebase/OAuth e ativar o provedor Google. O projeto nativo deve coincidir com `EXPO_PUBLIC_FIREBASE_PROJECT_ID`. Não versionar o arquivo nativo nem chaves de conta de serviço.

Executar `npm run check`, `npx expo config --type public` e `npm run android` com SDK/JDK validados. Testar permissões aceitas/negadas, login/cancelamento, sessão, publicação, foto privada e feed real. Bundle exportado não comprova execução no Android. Configuração da API e catálogo em `docs/backend.md`.
