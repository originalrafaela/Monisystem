# Validação do backend — 2026-11-05

A implementação passou nos testes locais abaixo. O MVP Android real ainda não
está homologado: Google OAuth, configurações Firebase remotas e execução das telas
com o development build permanecem pendentes. Não houve deploy, commit ou push.

## Execuções finais

| Comando | Resultado |
| --- | --- |
| npm run check (raiz) | exit 0: TypeScript e ESLint sem erros/avisos |
| npm test --prefix backend | exit 0: 13 testes unitários, sem falhas ou skips |
| npm run test:emulators (em backend) | exit 0: 14 cenários integrados; runner conta 15 incluindo o teste pai; sem falhas/skips |
| npm audit --json (em backend, online) | exit 1: 18 alertas, 13 moderados e 5 altos; nenhum crítico |

Emuladores: Auth 9099, Firestore 8080, Storage 9199, Functions 5001, todos em
127.0.0.1, projeto demo-monisystem. Portas e downloads precisaram de execução
local fora do sandbox. Não foi usado projeto Firebase real nos testes.
Firestore Emulator 1.22.0 e Storage Rules Runtime 1.1.3. Node 26.13.0 e Java do
Android Studio; o deploy declara nodejs22. Repetir em Node 22/24 no CI, pois uma
dependência da CLI declara suporte até 24. Surgiram avisos Java sobre Unsafe e
um MetadataLookupWarning da biblioteca Google; os testes concluíram com exit 0.

Versões backend finais relevantes: firebase-admin 14.5.0, firebase-functions
7.4.0, Firebase CLI 15.35.0, Firebase JS 13.2.0, rules-unit-testing 6.0.0,
sharp 0.35.5 e zod 4.6.7. Consultar lockfile para todas as transitivas.

## Cobertura demonstrada

Unitários: entradas de relatos/coordenadas, limite/unicidade de prioridades,
distância geodésica e antimeridiano, polígonos com buracos, troca/cancelamento de
token Google nos ports do adaptador, sessão/logout com resposta atrasada,
compensação de falha de envio/finalização, bloqueio de URI externa/travessia,
HTTPS e ausência de sessão, erros sem detalhes internos, configuração de ambientes.
Os ports de Auth são simulados somente nos testes unitários; eles não validam
OAuth real, armazenamento nativo da sessão ou comportamento do Google Play Services.

Integração: persistência de perfil privado/público, preferências e catálogo,
upload permitido com autoria/reserva; recusa de outro autor, MIME incorreto,
tamanho excessivo, sobrescrita, leitura de staging e escrita em processed;
negação de leitura/escrita Firestore direta; processamento JPEG sem EXIF;
recusa de bytes inválidos; posse da foto; publicação idempotente concorrente e
rejeição de chave reutilizada com entrada diferente; agrupamento por categoria,
distância/tempo e publicação concorrente de relatos distintos; raio geográfico
real de 5 km, filtros, ordem temporal e cursor vinculado ao proprietário/filtros;
agregação de métricas; dispositivos privados com limite de dez e planejamento
deduplicado; expiração de alerta, histórico de 14 dias, negação de foto após
retenção e exclusão física recuperável; API HTTP recusando tokens ausentes e
inválidos e aceitando identidade do Auth Emulator.

Os logs PERMISSION_DENIED dos testes negativos são esperados. O teste que
verifica escrita válida no Storage é o controle positivo das regras.
Emulador Firestore não certifica a implantação dos índices em produção;
`firestore.indexes.json` precisa ser implantado e as consultas verificadas no
ambiente autorizado. Não há teste real de revogação OAuth/conta em Android.

## Segurança das dependências

Audit inicial backend: 33 alertas (20 moderados, 12 altos, 1 crítico).
Atualizações corrigiram alertas de sharp e zod e a cadeia crítica de tar da CLI;
Firebase Admin e Functions também foram atualizados e retestados.

Audit final: 18 alertas, sem críticos. Os cinco altos pertencem à cadeia de
**desenvolvimento/teste**: firebase, @firebase/firestore,
@firebase/firestore-compat, @firebase/rules-unit-testing e @grpc/grpc-js.
A causa é o pin transitivo ~1.9.0 do grpc-js no Firebase JS, mesmo na versão
13.2.0 disponível no registry consultado. O Admin usa outra versão, corrigida.
O audit sugere downgrades de major do Firebase/rules-unit-testing; eles não foram
aplicados, nem foram forçados overrides sem validação específica.

Os moderados também precisam de triagem: glob, google-gax, minimatch e rimraf
aparecem na árvore de runtime; os demais estão na árvore de desenvolvimento.
A presença na árvore não demonstra exploração. O relatório integral foi mantido
somente como artefato temporário local, sem adicionar logs ao código-fonte.
Este resultado não equivale a aprovação de segurança para exposição pública.
A auditoria raiz do Expo tem avaliação própria; esta entrega não a certifica.

## Configuração e bloqueios

Ações detalhadas: [backend.md](backend.md), seção Google/Firebase Android.
Faltam confirmação do pacote Android, projetos por ambiente, provedor Google,
OAuth Web Client ID, SHA-1/SHA-256 do certificado real, google-services.json local,
endpoint HTTPS implantado e políticas reais de categorias/regiões. Para uso de
Storage/Functions remoto, obter autorização de faturamento antes de criar recursos.

Frontend precisa ligar os contratos na composição e utilizar a leitura protegida
de fotos; a fábrica expõe resolvePhoto(path) em data URI em memória e readPhoto(path)
em bytes/Result. Não foi alterado frontend por esta implementação. O consumo
real e a proteção visual das rotas dependem de validação no aparelho.

Login Google Android, persistência após matar/reabrir, sessão revogada, captura e
GPS reais, publicação pelo aparelho e renderização final do feed **não foram
validados**. O Auth Emulator usa identidades sintéticas apenas para teste da API.
Notificações têm registro e planejamento; envio FCM, worker e credenciais seguem
pendentes. Limpeza automática remota não foi provisionada: sem executor autorizado,
os dados são ocultados pela expiração, mas podem continuar fisicamente armazenados.

Buscas HarpiSense/Harpi no Drive não retornaram arquivos; não houve acesso a
código-fonte reutilizável nem cópia de credenciais/serviços externos.

Inventário dos arquivos entregues: [backend.md](backend.md), seção Arquivos.
Os contratos foram preservados. Arquivos internos de agentes, ambientes reais,
credenciais e logs de emuladores não fazem parte do entregável. A verificação dos
arquivos efetivamente preparados para publicação exige revisão QA do índice Git;
o backend não executou operações de integração ou publicação.
