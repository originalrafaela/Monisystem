// Read-only staging review. Prints paths and finding categories, never matched secrets.
const { spawnSync } = require('node:child_process');
const repository = process.argv[2] || '.';
function git(args) { return spawnSync('git', ['-C', repository, ...args], { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 }); }
const valid = git(['rev-parse', '--show-toplevel']);
if (valid.status !== 0) {
  console.log(JSON.stringify({ status: 'BLOQUEADO', reason: 'Repositório Git indisponível; staging e histórico não foram revisados.' }, null, 2));
  process.exitCode = 2;
} else {
  const list = git(['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z']);
  if (list.status !== 0) throw Error('Não foi possível listar staging.');
  const findings = [];
  const names = list.stdout.split('\0').filter(Boolean);
  for (const filename of names) {
    if (/(^|\/)(?:AGENTS|CLAUDE|GEMINI)\.md$|(^|\/)(?:\.maestri|\.codex|\.cursor|\.agents)(\/|$)/i.test(filename)) findings.push({ file: filename, reason: 'Arquivo interno proibido' });
    if (/(^|\/)(?:prompts?|conversations?|conversas?|orchestration)(\/|\.|$)/i.test(filename)) findings.push({ file: filename, reason: 'Revisar conteúdo interno/orquestração' });
    if (/(^|\/)\.env(?:\.|$)/.test(filename) && !filename.endsWith('.env.example') || /(?:service[-_]?account.*\.json|google-services\.json|GoogleService-Info\.plist|\.(?:pem|key|p12|jks|keystore))$/i.test(filename)) findings.push({ file: filename, reason: 'Arquivo potencialmente sensível' });
    const staged = git(['show', ':' + filename]);
    if (staged.status !== 0) { findings.push({ file: filename, reason: 'Conteúdo preparado não pôde ser lido' }); continue; }
    for (const [reason, pattern] of [
      ['Chave privada', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
      ['Conta administrativa', /"type"\s*:\s*"service_account"/],
      ['Token GitHub', /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})\b/],
      ['Chave AWS', /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
      ['Token JWT literal', /\beyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\b/],
    ]) if (pattern.test(staged.stdout)) findings.push({ file: filename, reason });
  }
  const result = { status: findings.length ? 'FALHOU' : 'NÃO EXECUTADO', scope: 'Somente arquivos preparados; exige revisão humana de conteúdo e histórico', files: names, findings };
  // No PASSOU: heuristic absence of findings never certifies absence of secrets.
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = findings.length ? 1 : 0;
}
