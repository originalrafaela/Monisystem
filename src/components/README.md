# Interface mobile

As rotas existentes em `src/app` usam os contratos de `src/services/contracts.ts`.
A composição de interface fica em `MobileProvider.tsx` e
`mobile-composition.ts`, sem consultas diretas ao Firestore.

## Execução real

`mobile-composition.ts` lê as variáveis públicas documentadas em
`src/services/firebase/README.md` usando o parser do Backend. Cria uma instância
nativa compartilhada de Google/Firebase, Camera e Location. Configuração ausente
exibe erro e mantém as rotas privadas bloqueadas. Não há fallback automático para
mocks. Demonstração exige `extra.monisystem.mode = "demo"` explicitamente no build.

A sessão é recuperada por `observeSession`. Rotas privadas usam `Tabs.Protected`;
logout remove o estado da conta, desmonta essas telas e encerra captura pendente.
A entrada também permite tentar login novamente após falha de restauração/rede.

`NativeCamera.tsx` solicita somente câmera, mostra captura real e retorna URI do
cache privado. Monta a câmera somente durante o modal e trata cancelamento,
permissão negada, bloqueio permanente e câmera indisponível. O formulário exibe
prévia e permite refazer a foto. `device-location.ts` solicita uma leitura GPS em
primeiro plano, verifica serviço habilitado e limita a espera a 20 segundos.
Não monitora deslocamento. A coordenada do relato sempre exige confirmação
separada; também pode ser informada manualmente, com validação decimal e limites.

A publicação usa `photos.upload` e `reports.create`, com `photoUploadId` e chave
de idempotência. Após resultado incerto, preserva a entrada original e bloqueia
edições até confirmar o mesmo envio. Toques simultâneos compartilham a tentativa.
Erros definitivos liberam a correção e solicitam descarte da reserva. O estado de
tentativas vive na sessão da tela, não sobrevive ao encerramento do processo.
Uploads abandonados dependem também da rotina de retenção do servidor.

O feed real usa raio de 5000 metros, filtros do catálogo e cursores opacos;
atualização invalida páginas antigas. Exibe distância aproximada e relatos
agrupados. Detalhes consultam relatos mesmo quando abertos diretamente por ID.
Fotos são lidas pela API autenticada e convertidas em imagem somente na memória;
não há URL pública nem persistência de tokens. Cada cartão consulta os relatos
para obter sua descrição/foto, pois o contrato do feed retorna apenas Incident.

Preferências são recuperadas antes de permitir salvar, usam regiões/categorias
reais e limitam prioridades a três. Histórico regional e indicadores usam seus
serviços existentes, com erros independentes. Relatos e ocorrências têm contagens
distintas. O perfil usa o serviço de perfil e a leitura protegida de fotografia.

## Validação

- `npm run check`: TypeScript e ESLint globais.
- `node src/components/__tests__/publication.test.cjs`: quatro cenários de
  idempotência após timeout, concorrência, correção após erro definitivo e
  coordenadas inválidas.
- Exportação Android verifica resolução do bundle, sem comprovar execução nativa.

A verificação Android completa exige development build com google-services.json
local, OAuth Web Client ID, certificados SHA cadastrados, provedor Google ativo,
API Firebase acessível, catálogo/regiões configurados e dispositivo conectado.
Não usar Expo Go para validar Google/Firebase nativo. Seguir docs/backend.md.

Histórico próprio ainda não tem contrato de serviço. Notificações reais exigem
registro de dispositivo e transporte push. A demonstração, a exportação do bundle
e os testes de lógica não comprovam login/câmera/GPS/publicação no aparelho.
