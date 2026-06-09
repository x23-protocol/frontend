const fs = require('fs');
const path = require('path');

const contracts = ['FTControllerV2', 'FTRouterV2', 'FTMarketV2'];
const srcDir = path.join(__dirname, '../../../subgraph/abis');
const outDir = __dirname;

for (const name of contracts) {
  const json = fs.readFileSync(path.join(srcDir, `${name}.json`), 'utf8').trim();
  const tsContent = `export const ${name}ABI = ${json} as const;\n`;
  fs.writeFileSync(path.join(outDir, `${name}ABI.ts`), tsContent);
  console.log(`Generated ${name}ABI.ts`);
}
