import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
import db from '../config/sqlite.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const csvPath = path.join(__dirname, 'data/clean_people.csv');

// Strip a UTF-8 BOM if present (Excel exports often add one — without
// stripping it, the first row's "id" header would read as "\uFEFFid"
// and silently fail to match anything).
const raw = fs.readFileSync(csvPath, 'utf8').replace(/^\uFEFF/, '');

const lines = raw.split(/\r?\n/).filter((line) => line.trim().length > 0);
const dataLines = lines.slice(1); // drop the "id,name" header row

const insert = db.prepare(`
  INSERT INTO members (id, name, gender, phone_number, id_card_number, synced_at)
  VALUES (?, ?, ?, ?, ?, NULL)
`);

const clearExisting = db.prepare('DELETE FROM members');

let phoneCounter = 1;

const seed = db.transaction((rows) => {
  clearExisting.run(); // safe to re-run: wipes old seed data first, avoids UNIQUE errors on re-seed

  let inserted = 0;
  let skipped = 0;

  for (const line of rows) {
    // Split on the FIRST comma only — the id is always numeric,
    // everything after the first comma is the name.
    const match = line.match(/^(\d+),(.+)$/);
    if (!match) {
      console.warn(`Skipping malformed line: "${line}"`);
      skipped++;
      continue;
    }

    const [, idCardNumber, name] = match;

    // PLACEHOLDER DATA — not real. Real gender/phone were not in the
    // source file. These need to be corrected in the app once known,
    // not treated as accurate.
    const gender = Math.random() < 0.5 ? 'male' : 'female';
    const phoneNumber = `09${String(phoneCounter++).padStart(8, '0')}`;

    insert.run(randomUUID(), name.trim(), gender, phoneNumber, idCardNumber.trim());
    inserted++;
  }

  return { inserted, skipped };
});

const { inserted, skipped } = seed(dataLines);

console.log(`Seeded ${inserted} member(s).${skipped > 0 ? ` Skipped ${skipped} malformed row(s).` : ''}`);
console.log('NOTE: gender and phone_number were NOT in the source data — placeholder values were generated and must be corrected once real values are known.');
