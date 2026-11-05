# Dependências e segurança

## Evidências disponíveis

O audit executado no terminal Linux foi informado com 22 alertas totais e 15 com
`--omit=dev` (5 altos, 9 moderados, 1 baixo). Esses números não representam
necessariamente 22 falhas distintas: dependências afetadas podem propagar alertas
para seus consumidores.

A tentativa de `npm audit --json` nesta sessão falhou por DNS (EAI_AGAIN).
Ainda não estão disponíveis os pacotes afetados, URLs dos advisories, intervalos
vulneráveis, cadeias de dependência e versões corrigidas. Assim, não há fundamento
para selecionar versões ou declarar vulnerabilidades resolvidas.

O lockfile está presente (formato 3), com dependências raiz consistentes com
package.json. A instalação observada contém Expo 55.0.32, Router 55.0.18 e
React Native 0.83.10. Não foram alterados package.json, lockfile ou dependências
durante esta revisão.

## Plano de correção compatível com SDK 55

1. Obter `npm audit --json` e `npm audit --omit=dev --json` no terminal com rede.
   Guardar os relatórios temporários fora do repositório.
2. Para cada advisory, registrar pacote, versão instalada, cadeia (npm explain),
   versão corrigida, pré-condições e exposição real.
3. Separar código embarcado no aplicativo de ferramentas de build/CLI: estar em
   dependencies ou aparecer com --omit=dev não demonstra exploração no Android.
   Ferramentas de build também precisam de correção quando expostas.
4. Preferir patches das dependências responsáveis dentro da linha Expo SDK 55 e
   das faixas de compatibilidade recomendadas. Avaliar o plano com
   `npm audit fix --dry-run --json`; não aplicar automaticamente sua sugestão.
5. Se a correção transitiva não for resolvida pelas faixas existentes, verificar
   suporte upstream antes de propor override. Não impor major transitiva sem
   comprovação de compatibilidade.
6. Rever o diff de package.json/lockfile e executar npm ls, expo install --check,
   expo-doctor, npm run check, bundle e teste Android.
7. Repetir os dois audits e registrar o que foi resolvido e o que permanece.
   Se não houver patch compatível, documentar a exposição e mitigação específica,
   sem declarar o aplicativo liberado para produção.

Não usar npm audit fix --force, não reduzir a versão Expo e não trocar de SDK
como efeito colateral de uma correção. A revisão atual propõe o procedimento;
a seleção de versões depende dos relatórios detalhados.

## Referências

- https://docs.npmjs.com/cli/v11/commands/npm-audit/
- https://docs.npmjs.com/auditing-package-dependencies-for-security-vulnerabilities/
- https://docs.expo.dev/develop/tools/
