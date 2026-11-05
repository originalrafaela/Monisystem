# Validação da etapa 0

Revisão: 2026-11-05. Esta revisão não implementou funcionalidades da etapa 1.

Durante a execução surgiram alterações externas em src/app e src/components:
telas de demonstração e navegação por abas. Esses arquivos foram preservados.
A exportação concluída não certifica o estado final dessas alterações concorrentes;
repetir o bundle após estabilizar a árvore e confirmar o escopo com o responsável.
Uma segunda execução de npm run check após detectar essas telas passou em
TypeScript e ESLint, sem erros ou avisos.

## Concluído

| Verificação nesta sessão | Resultado |
| --- | --- |
| Acesso às dependências instaladas | Confirmado por npm ls --depth=0, sem erro de dependências raiz |
| package-lock.json | Formato 3; dependências raiz consistentes com package.json |
| npm run check:structure | Passou |
| npm run check | Passou: TypeScript e ESLint, sem erros ou avisos |
| Expo install --check | Dependencies are up to date; usou mapa local e avisou sobre limitação offline |
| Expo config --type public | Leu nome, scheme, plugin Router e SDK corretamente |
| Exportação Android | Passou: 1.062 módulos, bundle Hermes e assets exportados em /tmp/monisystem-android-export |
| Revisão dos contratos | Entidades e interfaces preservadas; sem dependência de Firebase no domínio |

Comando da exportação: `CI=1 EXPO_OFFLINE=1 npx expo export --platform android
--output-dir /tmp/monisystem-android-export`. A exportação não produz APK nem
comprova execução de código nativo ou renderização da tela no dispositivo.

O terminal Linux também teve instalação de 877 pacotes, compatibilidade Expo,
TypeScript e lint confirmados pelo responsável. A instalação não foi repetida.

## Bloqueado nesta sessão restrita

| Verificação | Resultado |
| --- | --- |
| npx expo-doctor | Consulta ao registry falhou por DNS EAI_AGAIN |
| Expo Doctor 1.21.6 disponível em cache | Executado, mas abortou antes dos checks: Failed to parse JSON output from npx expo config --json --full; stdout vazio |
| Configuração JSON completa por npx | Reprodução: saída vazia; configuração pública funcionou |
| npm audit --json | Endpoint indisponível por DNS; sem relatório de advisories |
| git ls-remote do remoto oficial | Falhou por DNS; consulta web também não confirmou o estado remoto |
| git status --short | Sem repositório válido nesta sessão |
| adb devices -l | Serviço impedido por Operation not permitted ao abrir socket |
| emulator -accel-check | /dev/kvm não visível nesta sessão |
| npm start -- --offline | Tentativa limitada a 20 s encerrou por timeout após Starting project; servidor pronto não confirmado |

O host Linux tem DNS e KVM funcionais conforme verificação informada. Isso não
contradiz as limitações observadas no ambiente restrito. A comunicação do ambiente
de coordenação também continua impedida por Operation not permitted; os pacotes
Node instalados estão acessíveis independentemente dessa comunicação.

Não foi aplicado audit fix, override ou alteração de versão. Não houve init,
clone, fetch, commit, push ou configuração Firebase.

## Pendências e critério de conclusão

1. Executar Expo Doctor no terminal Linux com rede e obter todos os resultados.
2. Obter os relatórios detalhados dos dois audits e avaliar correções na linha
   SDK 55, conforme docs/security.md. As contagens informadas não identificam
   pacotes, advisories ou correções.
3. Inspecionar o remoto e confirmar seu histórico; seguir docs/version-control.md
   antes de conectar o diretório local.
4. Fazer build, instalar e abrir a tela provisória no Android. Validar ausência
   de tela vermelha, identificação Monisystem e reabertura.
5. Resolver ou documentar com evidência as pendências de dependências e toolchain.

A base está pronta para iniciar a validação final no terminal Linux. A etapa 0
não está integralmente aprovada enquanto Doctor, auditoria e execução Android
permanecerem sem conclusão. Integração Git também depende de inspeção remota.

## Preparação Android no terminal Linux

Ajustar PATH apenas na sessão, mantendo a instalação global intacta:

```bash
export ANDROID_HOME="$HOME/Android/Sdk"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$PATH"
# Selecionar JAVA_HOME para um JDK compatível; validar com java -version.
java -version
adb version
emulator -list-avds
emulator -accel-check
```

Após iniciar o AVD Medium_Phone_API_37.0 pelo Android Studio, confirmar:

```bash
adb devices -l
adb shell getprop sys.boot_completed
npx expo-doctor
npm run check
npm run android
```

O build pode gerar android/ (ignorado pelo Git) e baixar Gradle/dependências.
Não configurar OAuth, Firebase ou permissões de câmera/localização nesta validação.
Usar development build. Após a instalação, Metro pode ser iniciado com
`npx expo start --dev-client`. Registrar o resultado visual e erros de build.

## Revisão dos contratos

Os tipos cobrem os requisitos planejados, mas não são validação de entradas em
runtime. Até três prioridades é representado por tupla; unicidade será validada
pelo servidor. Foto de relato é obrigatória e foto de perfil opcional. Autoria
privada está separada do perfil público. Datas são milissegundos UTC.

Permanecem decisões para etapas futuras: limites de texto/upload/paginação,
durações por categoria, fronteiras das regiões, parâmetros de agrupamento,
seleção de notificações, retenção das métricas e acesso a dados expirados.
Não foram alterados contratos nem implementadas funcionalidades por esta revisão.
As demonstrações adicionadas externamente não constituem integração real dos serviços.

## Próximas etapas

A etapa 1 exigirá autorização própria e tratará login Google, perfil e sessão.
Testes posteriores abrangerão regras Firebase, privacidade, concorrência,
idempotência, consultas geográficas, upload, retenção e notificações.
