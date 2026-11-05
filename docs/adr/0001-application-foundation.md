# ADR 0001: Base Expo e contratos independentes de infraestrutura

Data: 2026-11-05

Estado: aceito para a etapa 0; execução ainda pendente de validação.

## Contexto

O Monisystem precisa de um cliente Android acadêmico com login Google,
colaboração geográfica, fotografias e proteção dos dados pessoais.
A etapa inicial não permite credenciais reais, serviços pagos ou publicação remota.

## Decisão

Usar Expo SDK 55, React Native 0.83 e React 19.2 com TypeScript estrito e Expo Router.
O SDK foi escolhido como base explícita de compatibilidade, sem assumir a versão
mais recente. Versões declaradas seguem o template oficial da linha SDK 55.
Preparar development build por expo-dev-client para a futura integração Google.
Usar Node 22 LTS como referência de desenvolvimento e instalação reproduzível
com package-lock após o primeiro acesso bem-sucedido ao registry.

Separar entidades, contratos e adaptadores. Não instalar Firebase antes de definir
sua integração. Não incluir mock de autenticação que aparente um login funcional.
A tela provisória é apenas um ponto de verificação de execução.

## Consequências

Firebase e recursos nativos serão integrados incrementalmente. Tipos não substituem
validação no servidor. Compatibilidade das dependências e build precisam passar por
`expo install --check`, TypeScript, ESLint e Android antes de considerar a base validada.

## Referências

- https://github.com/expo/expo/blob/sdk-55/templates/expo-template-default/package.json
- https://github.com/expo/expo/blob/sdk-55/packages/expo/bundledNativeModules.json
- https://docs.expo.dev/router/installation/
- https://docs.expo.dev/guides/google-authentication/
- https://firebase.google.com/docs/firestore/solutions/geoqueries
- https://firebase.google.com/docs/firestore/ttl
