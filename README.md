# Monisystem

Aplicativo acadêmico para compartilhamento de informações ambientais urbanas:
trânsito, acidentes, alagamentos, inundações, quedas de árvores e infraestrutura.

## Estado atual

Implementação Expo SDK 55/React Native/TypeScript com fluxos nativos de login
Google, câmera, GPS, publicação, feed de 5 km, perfil e preferências. Backend
Firebase validado localmente com Auth, Firestore, Storage e Functions em emuladores.
Configuração ausente bloqueia o fluxo real; demonstração exige seleção explícita.

TypeScript, ESLint e 40 testes rápidos passaram. A integração passou em 14
subcenários, e regras complementares verificaram 18 negações e um controle permitido.
Esses resultados não homologam o Android real: faltam configuração Firebase/OAuth,
development build, dispositivo e teste completo incluindo reabertura. Reteste em
Node 22 e triagem dos audits também permanecem pendentes.

Consulte [validação QA](qa/continuous.md), [backend](docs/backend-validation.md)
e [configuração Android](docs/mobile-configuration.md).

Repositório oficial: https://github.com/originalrafaela/Monisystem

## Instalação

Requisitos: Node.js 22 LTS via NVM, npm, Git e, para build Android, Android SDK e
JDK compatível com o Gradle gerado pelo Expo. O arquivo `.nvmrc` seleciona Node 22.

```bash
nvm install
nvm use
npm install
npm run check:structure
npm run check
npx expo install --check
```

O `package-lock.json` já foi gerado pela instalação e está consistente com as
dependências raiz. Use `npm ci` para instalações reproduzíveis; revise e versione
o lockfile junto com futuras alterações de dependências.

## Execução

```bash
npm start
```

Para compilar e instalar o development build em um emulador iniciado:

```bash
npm run android
```

Após instalado, o desenvolvimento pode usar `npx expo start --dev-client`.
O projeto usa Expo Router com entrada `expo-router/entry` e rotas em `src/app`.
O identificador Android provisório é `com.monisystem.app`; confirme sua titularidade
antes de registrar OAuth/Firebase ou distribuir o aplicativo.

### Ambiente Linux da preparação

Para selecionar as instalações existentes somente na sessão atual:

```bash
export NVM_DIR="$HOME/.nvm"
. "$NVM_DIR/nvm.sh"
nvm use
export ANDROID_HOME="$HOME/Android/Sdk"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$PATH"
```

Somente Node 26.13.0 foi localizado nesta sessão. Instalar Node 22 via NVM depende
de rede; não houve alteração global. Há JBR/Java 25 em
`/opt/android-studio/jbr`, mas o build ainda precisa validar a compatibilidade.
Recomenda-se disponibilizar JDK 17 para o toolchain Android do SDK 55, selecionado
por `JAVA_HOME` na sessão; não substituir o Java global.

## Arquitetura

- `src/app`: rotas e telas dos fluxos mobile.
- `src/components`: componentes reutilizáveis.
- `src/domain`: entidades independentes de Firebase.
- `src/types`: paginação e resultado de serviços.
- `src/services`: interfaces e adaptadores Firebase/Google nativos.
- `src/config`: políticas compartilhadas.
- `scripts`: verificações locais sem dependências externas.
- `docs`: arquitetura, dados, validação e decisões técnicas.

Detalhes em [arquitetura](docs/architecture.md), [modelo de dados](docs/data-model.md)
e [decisão inicial](docs/adr/0001-application-foundation.md).

## Firebase e segurança

Análise de dependências e plano de correção em [segurança](docs/security.md).

SDKs Firebase/Google e backend estão implementados. Nenhum projeto remoto foi
provisionado nem Functions implantadas por esta entrega. Configuração OAuth,
catálogos e infraestrutura reais continuam pendentes. Os fluxos usam os contratos
de `src/services/contracts.ts`; notificações push e limpeza remota automática
ainda não foram configuradas.

Não versionar segredos, arquivos de contas de serviço, tokens, configurações locais,
caches ou artefatos internos de ferramentas. O `.gitignore` contém as exclusões.
Variáveis `EXPO_PUBLIC_*` são incorporadas ao aplicativo e não podem conter segredos.
A ausência de segredos deve ser revisada também nos arquivos preparados para commit.

## Versionamento

O histórico remoto foi inspecionado e preservado em clone separado. A integração
usa seleção explícita de arquivos, revisão do staging e verificação de padrões
sensíveis antes de commit e push. Arquivos internos, ambientes e credenciais ficam
fora do versionamento. A publicação dos fontes não representa aprovação funcional
do MVP Android.

Eventual declaração acadêmica de uso de IA deve seguir o regulamento da instituição.
