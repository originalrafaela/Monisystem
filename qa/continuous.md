# Validação contínua — 2026-11-05

**MVP não liberado.** Há evidência de funcionamento local do backend e dos handlers das telas. Ainda faltam instalação/abertura Android, OAuth Google real, permissões reais, captura e publicação pelo dispositivo, persistência após reiniciar e revisão da próxima entrega preparada para publicação.

Os resultados deste documento substituem o estado inicial de `README.md` e `matrix.md`. A árvore recebeu correções durante a auditoria; os logs preservam a execução inicial e os retestes. Testes sobre a configuração de emuladores não aprovam configuração remota.

## Executado

| Verificação | Status | Evidência / limite |
|---|---|---|
| TypeScript e ESLint globais após correções | PASSOU | `evidence/continuous/fast-final.log`; `npm run check`, zero erros/avisos |
| Compilação e testes unitários backend | PASSOU | Mesmo log; 13 testes backend executados |
| Serviços, handlers das telas, regressões, geografia, GPS simulado | PASSOU | 27 testes QA; com os 13 backend, são 40 na rodada rápida; detalhamento em continuous-matrix.md |
| Integração Auth/Firestore/Storage/Functions | PASSOU | `evidence/continuous/backend-integration.log`; reteste final: 14 subcenários mais o teste pai (15 no contador Node), saída 0 |
| Regras Firestore/Storage complementares | PASSOU | `evidence/continuous/rules-emulators.log`; 18 operações indevidas negadas e um upload permitido; saída 0 |
| Android via ADB nesta sessão | BLOQUEADO | `evidence/continuous/adb.log`: socket Operation not permitted; KVM ausente no sandbox |
| Staging na pasta APS | BLOQUEADO | `evidence/continuous/staged-review.json`: repositório inválido |
| Nomes, padrões de segredos e correspondência dos blobs preparados | PASSOU | 76 arquivos revisados; nenhuma ocorrência dos padrões examinados; blobs alinhados e diff --check passou. Evidência: staged-comparison-final.json. Escopo limitado, sem aprovação funcional do MVP |

Nos testes de regras, a reserva inexistente produz mensagem de avaliação nula e a operação é negada, conforme esperado. Logs PERMISSION_DENIED nos testes negativos são evidência da negação. O upload de controle usa bytes sintéticos: somente a integração backend comprova decodificação de imagem real sintética. O caso EXIF da integração usa imagem gerada sem metadados e confirma ausência na saída; ainda falta foto de entrada com EXIF/GPS conhecido para provar remoção de metadados existentes.

Os testes de telas executam código TSX e seus handlers com hooks, navegação, host elements e serviços simulados em `screen-harness.cjs`. Não são um renderer React: não validam layout, dispatch de toque, agendamento React, acessibilidade nativa ou permissões Android. O teste de timeout GPS usa relógio simulado. O teste geográfico chama o predicado real do backend compilado; não prova precisão do sensor do aparelho.

## Lint: erros exatos e responsáveis

| Ocorrência | Erro exato / localização | Responsável | Reteste |
|---|---|---|---|
| Auditoria inicial | `import/no-unresolved`: firebase-admin/firestore, firebase-admin/app, firebase-admin/auth, firebase-admin/storage, firebase-functions/v2/https, geofire-common, sharp em backend/src; `@typescript-eslint/no-unused-vars`: Transaction | Backend | Resolvido: build backend e lint global passaram |
| Auditoria inicial | `no-var` e `no-undef` Buffer em backend/dist/backend/src/backend.js e index.js | Arquitetura: escopo do ESLint para artefatos gerados | Resolvido: eslint.config.js exclui **/dist/** |
| Auditoria inicial | `no-undef`: __dirname em qa/rules.test.cjs | QA | Resolvido: declaração de global no teste; lint global passou |
| Reteste intermediário atual | `react-hooks/exhaustive-deps`: cleanup de generation.current em src/app/detalhes.tsx:37, src/app/historico.tsx:44 e src/components/useIncidentFeed.ts:31 | Frontend | Eram 3 avisos que falhavam com --max-warnings=0. Corrigidos; fast-final passou |

Os erros iniciais estão em `evidence/check.log` e `evidence/check-retest.log`. Os três avisos intermediários estão em `evidence/continuous/check-after-corrections.log`. O primeiro lint desta rodada já passava (`evidence/continuous/lint.log`); os avisos apareceram quando novas telas foram incorporadas. Não atribuir aos arquivos QA uma falha global sem consultar a execução correspondente.

## Bugs e riscos

| ID | Severidade | Estado | Evidência e responsável |
|---|---|---|---|
| BUG-C01 | P1 | Corrigido; reteste PASSOU | Preferências não eram recuperadas ao reabrir. Frontend adicionou consulta e bloqueio de save se a carga falhar. Falha inicial: regressions.log; aprovação local: fast-final.log |
| BUG-C02 | P1 | Corrigido; reteste PASSOU | Após resposta perdida, mudança de conteúdo reutilizava chave com fingerprint diferente. Frontend agora preserva o envio pendente e bloqueia edição; retry confirma o mesmo payload. Falha inicial: regressions.log; aprovação local: fast-final.log |
| BLOQ-C03 | P0 para liberação | BLOQUEADO | Ciclo real Android/Google/câmera/GPS/publicação/reabertura ainda não executado. Arquitetura + Frontend + Backend: configurar development build e ambiente de teste |
| GAP-C04 | P1 | NÃO EXECUTADO | Perfil informa ausência de histórico de publicações próprias; tela atual oferece histórico regional. Frontend + Backend: entregar contrato/consulta própria e testar isolamento por usuário |
| RISCO-C05 | P1 | BLOQUEADO | Dois acontecimentos diferentes próximos, da mesma categoria e janela, podem ser agrupados: limitação explicitada em docs/backend.md. Backend + Arquitetura: definir critério de relação; teste de categorias/tempo/distância não prova distinção semântica |
| DOC-C06 | P2 | Documentação alinhada; build real pendente | docs/mobile-configuration.md foi corrigido para documentar EXPO_PUBLIC_FIREBASE_*. Arquitetura + Frontend: validar essa configuração no development build Android |
| RISCO-C07 | P1 | Pendente | Audit anterior sinalizou 22 pacotes; dependências mudaram depois. Reexecutar análise raiz/backend sobre lockfiles finais, sem audit fix --force; relatório anterior em vulnerabilities.md não certifica o estado atual |

Também continuam pendentes: alteração de perfil pelo usuário, desligar rede durante upload real, negação permanente de câmera/GPS, retorno das configurações Android, logout e reabertura com dados do usuário anterior, foto de entrada com EXIF/GPS e limpeza após crash. Não registrar esses cenários como aprovados com base nos mocks.

## Publicação e segredos

A lista preparada no clone de integração estava inicialmente vazia. Em revisão posterior, havia 76 arquivos preparados, sem nomes internos proibidos ou padrões de segredo examinados. Sete arquivos divergiam da árvore testada: backend/package-lock.json, backend/package.json, backend/src/backend.ts, qa/README.md, qa/matrix.md, qa/screen-harness.cjs e qa/screens.test.cjs. Essas divergências foram corrigidas: comparação final dos 76 blobs com APS não encontrou diferenças; git diff --cached --check passou. A rodada rápida e a integração foram repetidas após correções. Evidências: staged-comparison.json e staged-comparison-final.json. Os novos documentos continuous.md e continuous-matrix.md ainda não estavam na candidata. Somente o Arquiteto deve incorporá-los e revisar o staging resultante. Não há aprovação funcional do MVP ou aprovação genérica para qualquer push futuro.

`review-staged.cjs` lê blobs do staging, identifica nomes internos/sensíveis e padrões de segredos sem imprimir o valor encontrado. Uma busca complementar em arquivos selecionados de fonte, configuração, testes e documentação não encontrou os padrões examinados (`source-secret-review.json`); isso não comprova ausência de segredos nem revisa todo o histórico. O manifesto `source-sha256.json` ajuda a identificar o material inspecionado e não é uma assinatura de release.

O .gitignore atual cobre AGENTS.md, CLAUDE.md, GEMINI.md, .maestri/, .codex/, .cursor/, .agents/, ambientes e credenciais comuns. Não publicar prompts, conversas, registros internos ou logs brutos de ferramentas com dados sensíveis. Manter licenças, atribuições e declarações acadêmicas obrigatórias. `*.log` está ignorado; disponibilizar somente evidências técnicas revisadas de forma deliberada.

## Reprodução

Com Node no PATH e dependências instaladas:

```bash
bash qa/run-fast.sh
node qa/review-staged.cjs /caminho/do/clone-de-integracao
```

O ambiente desta rodada usou Node 26.13.0; o alvo declarado do backend é Node 22. O emulador avisou sobre essa diferença. Repetir no Node 22 antes da liberação.

No terminal Linux normal, para testes complementares de regras (projeto isolado, sem Firebase remoto):

```bash
backend/node_modules/.bin/firebase emulators:exec --config backend/firebase.json --project demo-monisystem-qa --only firestore,storage 'node qa/rules.test.cjs'
```

Para integração completa, partindo de backend:

```bash
npm run test:emulators
```

Os testes de integração limpam dados sintéticos do projeto demo-monisystem; não executá-los em paralelo com outra suíte no mesmo projeto. Usar os comandos Android de README.md no terminal normal; registrar APK, revisão dos fontes, emulador, OAuth configurado e evidências sanitizadas. Nenhuma correção de produção, commit, push ou audit fix foi feita por QA.
