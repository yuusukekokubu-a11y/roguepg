// 企画書（design/企画書.xlsx）からゲームデータを取り出して JSON に書き出すスクリプト。
// 使い方: npm run import-data
// Excel を直したらこれを実行すると src/data/generated/*.json が更新される。
import ExcelJS from 'exceljs';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'design', '企画書.xlsx');
const outDir = join(root, 'src', 'data', 'generated');

// シート名 → [出力ファイル名, 見出し行, 列名の英語キー]
const SHEETS = {
  職業: ['jobs', 4, ['lineage', 'name', 'role', 'hp', 'mp', 'atk', 'def', 'mag', 'spr', 'spd', 'total', 'comment']],
  方向性: ['archetypes', 4, ['lineage', 'job', 'name', 'description']],
  スキルブック: ['books', 4, ['lineage', 'job', 'archetype', 'name', 'rarity', 'target', 'cost', 'effect']],
  アクセサリー: ['accessories', 4, ['category', 'name', 'rarity', 'effect', 'drawback', 'synergy']],
  アイテム: ['items', 4, ['category', 'name', 'rarity', 'target', 'effect', 'price']],
  敵: ['enemies', 4, ['floor', 'kind', 'name', 'feature', 'actions', 'resist', 'counter']],
  層: ['floors', 4, ['floor', 'place', 'feature', 'role', 'builds', 'boss']],
  状態異常: ['statuses', 4, ['name', 'effect']],
};

function cellText(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object' && 'richText' in v) return v.richText.map((r) => r.text).join('');
  if (typeof v === 'object' && 'result' in v) return String(v.result);
  return String(v).trim();
}

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(src);
mkdirSync(outDir, { recursive: true });

for (const [sheetName, [file, headerRow, keys]] of Object.entries(SHEETS)) {
  const ws = wb.getWorksheet(sheetName);
  if (!ws) throw new Error(`シート「${sheetName}」が見つかりません`);
  const rows = [];
  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const values = keys.map((_, i) => cellText(row.getCell(i + 1).value));
    if (values.every((v) => v === '')) continue;
    // 「冊数合計」「うちレア」などの集計行は除外（2列目以降がほぼ空）
    if (values.slice(2).every((v) => v === '') && keys.length > 3) continue;
    rows.push(Object.fromEntries(keys.map((k, i) => [k, values[i]])));
  }
  writeFileSync(join(outDir, `${file}.json`), JSON.stringify(rows, null, 2) + '\n');
  console.log(`${sheetName} → ${file}.json (${rows.length}行)`);
}
