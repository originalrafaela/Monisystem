# Auditoria QA — 2026-11-05

**Estado mais recente:** [validação contínua](continuous.md) e [matriz atualizada](continuous-matrix.md). O restante deste arquivo preserva a auditoria inicial; vários bloqueios de compilação e regras foram resolvidos posteriormente.

**Liberação bloqueada.** Não foi comprovado o ciclo Android → Google → foto real → publicação → persistência → feed geográfico. A árvore está sendo alterada por outros responsáveis durante a inspeção; resultados valem para o instante registrado, sem revisão Git identificável (diretório sem repositório válido).

## Execução e defeitos

| ID | Severidade | Resultado e evidência | Responsável / ação |
|---|---|---|---|
| BUG-01 | P0 | Composição inicialmente demonstrativa; integração nativa, sessão e persistência reais não comprovadas | Aplicativo/backend: integrar e demonstrar ciclo completo no Android |
| BUG-02 | P1 | `npm run check` falhou em ocorrencias, preferencias e MobileProvider durante alterações concorrentes: [log](evidence/check.log) | Aplicativo: corrigir tipos e repetir check após estabilização |
| BUG-03 | P1 | Backend não compila: módulos ausentes, Transaction não utilizado, casts UserPreferences, demais erros possivelmente em cascata: [log](evidence/backend-test.log) | Backend: instalar dependências isoladas e corrigir erros restantes |
| BUG-04 | P1 | Scripts de testes backend referenciam tests/unit.test e integration.test; diretório tests ausente no momento da inspeção | Backend: entregar suítes executáveis |
| RISCO-01 | P1 | 22 pacotes sinalizados no audit, 5 altos, 16 moderados, 1 baixo; sem exploração demonstrada | Ver análise individual em vulnerabilities.md |
| BLOQ-01 | P1 | ADB não abre socket: Operation not permitted; /dev/kvm ausente | Executar procedimento abaixo no Linux normal |
| BLOQ-02 | P1 | Doctor aborta antes dos checks ao interpretar config JSON vazio: [log](evidence/expo-doctor.log) | Repetir com Node 22 e rede no host |

Estrutura passou (`npm run check:structure`); verificação Expo offline informou dependências atualizadas, mas avisou sobre confiabilidade offline ([log](evidence/expo-deps.log)). Exportação Android passou ([log](evidence/android-export.log)); bundle Hermes não é APK, instalação nem validação visual. Node disponível: 26.13.0; alvo declarado: 22. Primeira execução de TypeScript passou, primeira execução de lint falhou com dependências backend ausentes; execução posterior falhou já no TypeScript, preservada no log.

Reteste após alterações externas: TypeScript raiz e compilação backend passaram. O teste backend ainda falhou por ausência de `dist/backend/tests/unit.test.js` (evidence/backend-retest.log). O lint raiz falhou em artefatos compilados de backend/dist e inicialmente nos globais do novo teste QA; o problema do teste QA foi corrigido e `eslint qa --max-warnings=0` passou (evidence/qa-lint.log). Responsável deve excluir os artefatos gerados da análise e repetir lint global. BUG-02/03 têm correções parciais; BUG-04 permanece aberto.

## Segurança

Firestore nega acesso direto a todas as coleções. Storage permite criação em staging somente com usuário proprietário, reserva válida, MIME permitido e tamanho até 5 MiB; leitura e sobrescrita negadas. Isso é inspeção estática, não certificação das regras. O backend usa Admin SDK, que exige validar autorização em cada operação da API; regras não protegem contra erros nesse código.

O processamento usa sharp para decodificar e recodificar fotos com limite de pixels. MIME declarado sozinho não comprova imagem válida. Confirmar remoção de EXIF e GPS com arquivo real. Ausência de padrões `console.`, `private_key`, `AIza` e cabeçalho de chave privada em src/backend/src nesta busca não prova ausência de segredos no histórico; histórico Git indisponível. Não foram encontrados arquivos .env na busca até profundidade 2. Revisar configuração final e manifesto gerado antes de liberar permissões Android e dados de localização.

## Automação

`services.test.cjs` usa node:test e o TypeScript já instalado para transpilar o adaptador real; testa HTTP inseguro, ausência de sessão sem request, rede indisponível e corrida de sessão/logout. Não substitui typecheck. Executar `node qa/services.test.cjs`; resultado em evidence/services-test.log.

`rules.test.cjs` contém testes negativos reais de Firestore e Storage e upload permitido de controle. **NÃO EXECUTADO**: dependências backend/emuladores indisponíveis. Os bytes sintéticos só validam regras de upload, não decodificação de imagem. Cobertura adicional pendente: expiração da reserva, status consumido, categoria, raio, paginação, idempotência e limpeza em integração.

No terminal Linux normal, com Node 22 e JDK compatível selecionados na sessão:

```bash
cd '/home/original0x100/Área de trabalho/APS'
nvm use
export ANDROID_HOME="$HOME/Android/Sdk"
export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$PATH"
java -version
emulator -list-avds
emulator -accel-check
# Iniciar um AVD listado pelo Android Studio.
adb devices -l
adb shell getprop sys.boot_completed
npx expo-doctor
npm run check
npm run android
adb shell am start -n com.monisystem.app/.MainActivity
adb emu geo fix -46.6333 -23.5505
adb shell am force-stop com.monisystem.app
adb shell am start -n com.monisystem.app/.MainActivity
adb logcat -d -s AndroidRuntime > /tmp/monisystem-android-runtime.log
```

Registrar instalação, abertura, navegação, câmera, permissões negadas, GPS simulado, login/cancelamento, publicação real e reabertura. Guardar evidências sem tokens, e-mails ou coordenadas pessoais. Não executar prebuild/build aqui sem toolchain validado; não modificar sandbox ou permissões do host.

Regras locais, após o backend estabilizar e dependências serem instaladas pelo responsável:

```bash
cd backend
npx firebase emulators:exec --project demo-monisystem --only firestore,storage 'node ../qa/rules.test.cjs'
```

Nenhum código de produção, versão de dependência, commit ou push foi alterado por QA. Não foi executado audit fix. Prioridade: fechar BUG-02/03/04, integrar serviços nativos, executar regras e ciclo Android, então repetir os checks na mesma revisão e reavaliar liberação.

## Verificação obrigatória antes da publicação

Somente o Arquiteto executa integração, commit e push. QA deve inspecionar a lista e o conteúdo preparados para cada publicação; configuração de ignore sozinha não comprova conformidade. Bloquear arquivos AGENTS.md, CLAUDE.md, GEMINI.md, diretórios .maestri/, .codex/, .cursor/, prompts, conversas e registros de orquestração, além de credenciais, tokens, chaves privadas e ambientes sensíveis. Preservar licenças, atribuições e declarações acadêmicas obrigatórias. Publicar apenas fonte, configuração necessária, testes e documentação técnica legítima. Neste ambiente sem repositório Git válido, revisão do staging e histórico permanece BLOQUEADA; não há aprovação de publicação.

Achado de configuração P1: o .gitignore inspecionado não contém exclusões explícitas para CLAUDE.md, GEMINI.md e .cursor/. Solicitar inclusão ao Arquiteto e conferir também arquivos já rastreados. `*.log` está ignorado; evidências de QA devem ser revisadas e disponibilizadas de forma deliberada, sem forçar inclusão indiscriminada de logs. A revisão não substitui inspeção dos arquivos preparados para commit.
