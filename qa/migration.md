# Validação da migração de infraestrutura

Arquitetura alvo: Firebase Authentication e Firestore Spark; fotografias em bucket
privado Supabase; API Node HTTP no Render Free. Nenhum deploy ou recurso remoto
é certificado por este relatório. Contratos públicos de domínio/serviços devem
permanecer compatíveis.

## Critérios de segurança

- API valida Firebase ID token antes de ler/modificar dados ou receber fotografias.
- Upload usa reserva com autor, status e expiração, limite 5 MiB e MIME permitido.
- Escrita repetida não sobrescreve bytes vinculados; falha não publica relato.
- Sharp decodifica bytes reais e remove metadados existentes, inclusive EXIF.
- Relatos são idempotentes por usuário/chave e entrada original.
- Fotos são entregues somente pela API autenticada após validar retenção.
- Chaves administrativas Firebase/Supabase existem apenas no servidor.
- Bucket público é recusado; URLs públicas/assinadas não substituem autorização.
- Exclusão física é recuperável; indisponibilidade do Storage não apaga os
  metadados necessários para repetir a limpeza.

## Limites da arquitetura gratuita

O Render Free interrompe serviços inativos e pode levar aproximadamente um minuto
para reiniciar. Testar espera limitada de prontidão e erro recuperável; não
repetir mutações automaticamente após timeout. O disco é efêmero, portanto fotos
e filas de limpeza não podem depender de arquivos locais permanentes.
[Fonte oficial](https://render.com/docs/free).

Bucket privado requer controle de acesso; credencial administrativa só é usada
pelo servidor e não vai para o aplicativo.
[Supabase Storage](https://supabase.com/docs/guides/storage/buckets/fundamentals).

A cota gratuita do Firestore não elimina necessidade de limitar leituras de
consultas geográficas. Sem faturamento, exceder cotas pode interromper operações.
[Firestore quotas](https://firebase.google.com/docs/firestore/quotas).

Limpeza periódica dentro do processo só executa enquanto o Render estiver ativo.
Sem agendamento externo autorizado, não comprova prazo máximo de exclusão física.
Expiração lógica deve negar acesso independentemente da limpeza. Android real,
Google OAuth, câmera/GPS e retomada após matar o processo exigem dispositivo.

## Resultados desta rodada

Validação final em 2026-11-06 com Node 22.23.0.

| Comando | Resultado |
| --- | --- |
| `bash qa/run-fast.sh` | PASSOU: TypeScript, ESLint e 63 cenários, sem falhas |
| `npm --prefix backend run test:render` | PASSOU: 14 subcenários; contador Node 15 incluindo pai; sem falhas/skips |
| Exportação Android em Node 22 | PASSOU: bundle com 1187 módulos; não é APK nem teste no aparelho |

A rodada rápida inclui 13 unitários backend, 27 testes QA anteriores, nove de
transporte/inicialização lenta, dez de segurança da migração e quatro de publicação.
Os testes de segurança usam imagem de entrada com EXIF/GPS conhecido e confirmam
a remoção na saída JPEG. Testam bucket público recusado, autoria/validade da
reserva, limite de bytes, ausência de sobrescrita, falhas de envio, leitura
expirada e recuperação da exclusão física após falha do provedor.

A integração executou Node HTTP real, Firebase Auth/Firestore Emulator Suite e um
servidor HTTP local que implementa o subconjunto REST privado do Supabase usado
pelo adaptador. Verificou `/healthz`, tokens ausentes/inválidos, upload e isolamento
por autor, preferência/perfil, publicação concorrente idempotente, agrupamento,
feed de 5 km, cursores, histórico, métricas e expiração. Não acessou Firebase nem
Supabase remotos. Avisos PERMISSION_DENIED dos testes negativos são esperados;
um MetadataLookupWarning ocorreu sem impedir os testes (exit 0).

Não houve deploy Render, criação de bucket ou faturamento. O arquivo `render.yaml`
é apenas configuração preparada, com `plan: free` e deployments automáticos
desligados. A inicialização real ainda depende das variáveis administrativas
no ambiente do Render. Nenhuma chave foi incluída no aplicativo ou nos modelos
de ambiente; os campos administrativos dos modelos permanecem vazios.

A publicação do código não aprova o MVP Android. Permanecem pendentes os testes
no Supabase/Render hospedados, Google OAuth real, câmera/GPS, publicação pelo
dispositivo e reabertura. A expiração lógica funciona sem limpeza física; não
há garantia de horário de remoção enquanto o Render Free estiver suspenso.
A triagem dos audits de dependências continua separada desta validação.
