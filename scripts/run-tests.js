// Roda a suíte de integração e grava os resultados em results/.
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const outDir = path.join(root, 'results');
fs.mkdirSync(outDir, { recursive: true });

const jsonFile = path.join(outDir, 'resultados.json');
const run = spawnSync(
  'npx',
  [
    'jest',
    '--json',
    `--outputFile=${jsonFile}`,
    '--coverage',
    '--coverageReporters=json-summary',
    '--coverageReporters=text',
    `--coverageDirectory=${path.join(root, 'coverage')}`,
  ],
  { cwd: root, encoding: 'utf8', env: { ...process.env, NODE_NO_WARNINGS: '1' } }
);
fs.writeFileSync(path.join(outDir, 'execucao-final.txt'), `${run.stderr}\n${run.stdout}`);

const report = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));
const coverage = JSON.parse(fs.readFileSync(path.join(root, 'coverage', 'coverage-summary.json'), 'utf8'));

// Remove caminhos absolutos da máquina local do JSON publicado.
for (const suite of report.testResults) suite.name = path.relative(root, suite.name);
report.coverageMap = undefined;
fs.writeFileSync(jsonFile, JSON.stringify(report, null, 2));

const icon = (status) => (status === 'passed' ? '✅' : status === 'failed' ? '❌' : '⏭️');
const lines = [
  '# Resultados da execução',
  '',
  `- **Data:** ${new Date(report.startTime).toISOString()}`,
  `- **Node:** ${process.version}`,
  `- **Suítes:** ${report.numPassedTestSuites}/${report.numTotalTestSuites} aprovadas`,
  `- **Testes:** ${report.numPassedTests}/${report.numTotalTests} aprovados, ${report.numFailedTests} falharam`,
  '',
];

for (const suite of report.testResults) {
  const ms = suite.endTime - suite.startTime;
  lines.push(`## \`${suite.name}\` (${ms} ms)`, '', '| | Caso de teste | Tempo |', '|---|---|---|');
  for (const t of suite.assertionResults) {
    lines.push(`| ${icon(t.status)} | ${t.ancestorTitles.slice(1).concat(t.title).join(' › ')} | ${t.duration ?? 0} ms |`);
  }
  lines.push('');
}

lines.push('## Cobertura de código (src/)', '', '| Arquivo | Linhas | Branches | Funções |', '|---|---|---|---|');
for (const [file, c] of Object.entries(coverage)) {
  const name = file === 'total' ? '**Total**' : `\`${path.relative(root, file)}\``;
  lines.push(`| ${name} | ${c.lines.pct}% | ${c.branches.pct}% | ${c.functions.pct}% |`);
}
lines.push('');

fs.writeFileSync(path.join(outDir, 'RESULTADOS.md'), lines.join('\n'));
console.log(`${report.numPassedTests}/${report.numTotalTests} testes aprovados. Relatório em results/RESULTADOS.md`);
process.exit(run.status);
