# Arquitetura

## Limites

O aplicativo Expo usa TypeScript estrito e Expo Router. As rotas coordenam a
interface; domínio não importa React Native nem Firebase. Adaptadores futuros
implementam os contratos de serviço, convertendo datas e erros na fronteira.
O shell inicial apenas verifica a composição das rotas e não acessa serviços.

## Fluxo planejado

Authentication fornecerá a identidade da sessão. Firestore armazenará perfis,
preferências, relatos e agrupamentos. Storage guardará fotografias com acesso
controlado. Publicação, autoria, localização regional, expiração e agrupamento
serão validados pelo servidor. Expo Location e Camera serão adicionados na etapa
funcional correspondente; nenhuma permissão é solicitada na tela provisória.

O feed começa em 5.000 metros. Consultas por geohash precisam combinar intervalos,
remover duplicatas e filtrar pela distância real. Cursores devem representar o
conjunto da consulta, incluindo filtros, e não apenas um único intervalo geohash.
O conjunto de regiões e suas fronteiras ainda precisa ser definido.

## Privacidade e consistência

Perfis públicos usam identificador diferente do UID privado. O feed não contém
UID, email, preferências ou tokens. A posição consultada pelo usuário não gera
histórico de deslocamento. A coordenada publicada identifica o incidente.
Fotos precisam ser reprocessadas para remover metadados e ter tamanho e formato
validados. Referências Storage não devem se tornar URLs públicas permanentes.

Chaves de idempotência evitam relatos repetidos por reenvio. Agrupamento deve
considerar categoria, distância e tempo sem apagar publicações. Transações e
processamento idempotente precisam suportar concorrência e reentrega de eventos.
Métricas distinguem quantidade de relatos e quantidade de ocorrências.

## Dependências futuras

Firebase Authentication/Firestore/Storage e login Google nativo serão integrados
após configurar um projeto de desenvolvimento, OAuth, certificados Android e regras.
Cloud Functions, agendamentos e uso do Storage podem exigir faturamento conforme
as condições vigentes. A configuração e qualquer ativação paga dependem de etapa
posterior e autorização. Nenhum acesso Firebase existe nesta base.

Expo Notifications/FCM exigirão credenciais específicas e development build.
Notificações combinarão preferências de região/categoria com até três prioridades;
a regra exata de seleção e frequência deverá ser confirmada antes da implementação.
O servidor deverá validar limites e unicidade, independentemente dos tipos do cliente.

## Integração

Configurações raiz e contratos compartilhados são centralizados na arquitetura.
A frente de interface atua em rotas/componentes; a de Firebase em adaptadores,
regras e processamento; a de validação em testes e cenários de segurança.
Cada arquivo tem um único responsável por incremento. Alterações de contrato são
revisadas primeiro; implementações consumidoras só começam após essa revisão.
A documentação registra decisões do software, sem históricos de coordenação.
