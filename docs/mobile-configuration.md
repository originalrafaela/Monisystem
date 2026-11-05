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

## Projeto real de desenvolvimento

Configuração confirmada em 2026-11-05: projeto `monisystem-f6d63`, pacote Android
`com.monisystem.app`. O Web Client ID público está no modelo `.env.example`.
O arquivo local `google-services.json` foi conferido quanto a projeto, pacote e
cliente OAuth Web, permanece ignorado pelo Git e é referenciado por
`expo.android.googleServicesFile = "./google-services.json"`.

`extra.monisystem.mode` é `firebase`, portanto não ativa demonstração. A seleção
do backend usa `EXPO_PUBLIC_FIREBASE_ENV=development`; o servidor remoto exige
`MONISYSTEM_ENV=production` para sair do modo exclusivamente emulador. Esses dois
nomes têm papéis distintos. `.env.local` contém os identificadores públicos locais
e está ignorado. Em outro checkout, copiar `.env.example` para `.env.local`.

`EXPO_PUBLIC_FIREBASE_API_URL` permanece vazio até confirmar a URL HTTPS real da
função exportada `api`. Não é a URL do Firebase Console nem o domínio Auth.
Obter a URL na função implantada no Console/Cloud Run ou na saída do deployment
autorizado; não construir uma URL presumida. Sem endpoint, o parser bloqueia
a composição: o login completo depende de `ensureSession`, que cria/recupera o
perfil pelo backend após autenticação. Nenhum endpoint ou recurso foi criado.

Google Authentication e SHA-1/SHA-256 foram informados como cadastrados pelo
responsável. Conferir se os SHAs pertencem ao certificado efetivamente usado pelo
novo development build e se a configuração OAuth permite a conta de teste. No
Console, ainda verificar/criar Firestore e Storage, implantar regras/índices e
a API com bucket real, configurar categorias/regiões e planejar limpeza de
retenção. Provisionamento, deployment e eventual faturamento exigem autorização
própria; esta preparação não os executa.

No terminal Linux, após preencher a URL confirmada em `.env.local`, selecionar
Node 22 com `nvm use`, executar `npm run check` e `npm run android`. O build requer
o arquivo Firebase local. Testar login Google, cancelamento, logout e reabertura
no dispositivo com Google Play Services. Não há comprovação de login real até
essa execução.
