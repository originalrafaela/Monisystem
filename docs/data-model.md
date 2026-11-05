# Modelo de dados e contratos

Os contratos estão em `src/domain/entities.ts` e `src/services/contracts.ts`.
São propostas de fronteira, ainda sem persistência. IDs são strings opacas e datas
são números em milissegundos UTC. Adaptadores converterão Firebase Timestamp.
Coordenadas devem ser validadas em latitude [-90, 90] e longitude [-180, 180].

| Entidade | Responsabilidade |
| --- | --- |
| PublicProfile | Apelido, fotografia opcional e identificador público |
| PrivateAccount | Associação privada entre UID e perfil |
| UserPreferences | Acompanhamentos, até três prioridades e consentimento de notificações |
| Category | Duração de alertas e limites de agrupamento configurados no servidor |
| Region | Identificador, nome e anéis de delimitação |
| Report | Publicação individual, foto obrigatória, ponto do incidente e expiração |
| Incident | Agrupamento com localização de referência e contagem de relatos |
| RegionalMetric | Contagens por região, categoria e intervalo |
| NotificationDevice | Token privado do dispositivo |

## Serviços

AuthService controla entrada, saída e observação da sessão. ProfileService trata
perfil próprio e preferências. PhotoService recebe arquivo local, prepara upload
associado ao usuário e permite descarte. ReportService publica por chave de
idempotência, consulta feed e histórico e lista relatos individuais de um grupo.
CatalogService fornece categorias e regiões. MetricsService fornece agregados.
NotificationService registra e remove dispositivos do usuário autenticado.

Resultados são discriminados por `ok`; erros têm código estável. Páginas possuem
cursor opaco ou `null`. Consulta paginada não deve aceitar cursor de filtros
incompatíveis. O servidor imporá limites de página e validações de entrada.

## Agrupamento e retenção

O servidor define datas, região, geohash e incidentId. O cliente não escolhe autoria,
contagem de agrupamentos ou expiração. Relatos permanecem independentes; não são
armazenados como um array ilimitado no documento de ocorrência.

A duração do alerta depende da categoria. Valores concretos ainda não foram
aprovados; não são inventados no cliente. `deleteAfter` do relato representa
`createdAt + 14 dias`, independentemente de novos relatos no mesmo agrupamento.
O histórico não renova a retenção de publicações antigas.

Uma limpeza programada deve remover relatos e fotografias vencidos, uploads
abandonados e agrupamentos sem conteúdo. O prazo de retenção de métricas também
precisa ser formalizado; proposta inicial: agregados diários disponíveis por 14 dias.

TTL do Firestore é assíncrono e não exclui automaticamente imagens no Storage.
Validação de acesso e consulta deve ocultar conteúdo vencido mesmo antes da limpeza.
Expiração e regras de acesso precisam ser testadas com paginação e índices antes
de escolher acesso direto do cliente ou um endpoint de leitura no servidor.
