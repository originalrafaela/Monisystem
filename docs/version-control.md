# Integração segura com o repositório oficial

Remoto oficial: https://github.com/originalrafaela/Monisystem

## Estado confirmado

Nenhum repositório local válido foi reconhecido nesta sessão. O terminal Linux
foi informado como sem .git na raiz; o ambiente restrito expõe uma entrada .git
somente para leitura. A consulta por git ls-remote falhou por DNS. Também não foi
possível confirmar o conteúdo remoto pela consulta web. Não é possível inferir
que o repositório esteja vazio, público ou inexistente.

Nenhum init, clone, fetch, commit ou push foi executado nesta revisão.

## Procedimento proposto, ainda não executado

1. No terminal com acesso, consultar:
   ```bash
   git ls-remote --symref https://github.com/originalrafaela/Monisystem.git HEAD
   git ls-remote https://github.com/originalrafaela/Monisystem.git
   ```
   Falha de autenticação/rede não equivale a remoto vazio.
2. Clonar para um diretório novo e vazio, separado de APS. Não executar clone
   por cima dos arquivos atuais e não mover/remover o diretório original.
3. No clone, inspecionar git remote -v, git branch -a, git log --all
   --oneline --decorate -20, git ls-tree -r HEAD (caso exista HEAD) e
   git status --short. Verificar a branch padrão real, sem presumir main.
4. Se houver histórico, criar uma branch de trabalho baseada nele, sem
   reset, rebase ou force push. Comparar os arquivos com a base local antes
   de copiar uma lista explícita de fontes, configurações e documentação.
   Arquivos de mesmo nome exigem integração revisada; preservar os demais.
5. Se o remoto estiver comprovadamente vazio, o clone vazio pode receber os
   arquivos revisados. Não recriar ou alterar históricos existentes.
6. Incluir o lockfile; não copiar node_modules, .expo, .idea, .maestri, .codex,
   .agents, AGENTS.md, credenciais, logs ou configurações privadas.
7. Antes de preparar qualquer commit, executar as verificações técnicas.
   Na revisão de publicação, examinar git status, arquivos adicionados,
   git diff --cached --stat, git diff --cached e git diff --cached --check,
   além de padrões de segredos e regras de exclusão.
8. Apresentar branch, histórico preservado, arquivos finais e verificações.
   Aguardar autorização específica para commit e publicação.

O clone separado é a proposta mais conservadora para preservar o estado atual.
A decisão de tornar esse clone o diretório principal, ou de conectar APS
diretamente após a inspeção, será apresentada antes de alterar a organização local.
