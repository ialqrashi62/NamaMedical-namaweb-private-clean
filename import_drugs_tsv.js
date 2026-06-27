const fs = require('fs');
const { getDb } = require('./database.js');

try {
    const db = getDb();

    // Read file, prioritizing UTF-16LE as it's a common output from SQL Server Management Studio exports
    const rawData = fs.readFileSync('e:\\\\NamaMedical\\\\drugs_export.txt', 'utf16le');
    let lines = rawData.split(/\r?\n/);

    // If it wasn't utf16le, it will look like garbage and have very few lines due to missing \n
    if (lines.length < 100) {
        lines = fs.readFileSync('e:\\\\NamaMedical\\\\drugs_export.txt', 'utf8').split(/\r?\n/);
    }

    console.log(`Parsed ${lines.length} lines from drugs_export.txt`);

    const stmtMed = db.prepare('INSERT INTO medications (name, active_ingredient, stock_quantity, price) VALUES (?, ?, ?, ?)');
    const stmtCat = db.prepare('INSERT INTO pharmacy_drug_catalog (drug_name, active_ingredient, category, selling_price, cost_price, stock_qty) VALUES (?, ?, ?, ?, ?, ?)');
    const checkCat = db.prepare('SELECT id FROM pharmacy_drug_catalog WHERE drug_name = ?');

    let inserted = 0;

    db.transaction(() => {
        for (const line of lines) {
            const parts = line.split('\t');
            if (parts.length < 4) continue;

            const fullName = parts[1].trim();
            if (!fullName || !isNaN(fullName)) continue; // Skip headers or garbage lines

            let name = fullName;
            let active = 'Various';

            if (fullName.includes('(')) {
                let chunks = fullName.split('(');
                name = chunks[0].trim();
                active = chunks[chunks.length - 1].replace(')', '').trim();
            }
            if (name.length < 3) continue;

            const cat = parts[3] ? parts[3].replace(/\x00/g, '').trim() : 'General Medication';

            // Handle prices that might be in different columns
            const p1 = parseFloat(parts[parts.length - 1]);
            const p2 = parseFloat(parts[parts.length - 2]);
            const price = (!isNaN(p1) ? p1 : (!isNaN(p2) ? p2 : 15.0));

            const cost = parseFloat((price * 0.7).toFixed(2));
            const stock = Math.floor(Math.random() * 50) + 10;

            try {
                if (!checkCat.get(name)) {
                    stmtMed.run(name, active, stock, price);
                    stmtCat.run(name, active, cat, price, cost, stock);
                    inserted++;
                }
            } catch (e) {
                // Ignore unique constraint errors
            }
        }
    })();

    console.log(`Successfully inserted ${inserted} additional global drugs from TSV export.`);

} catch (error) {
    console.error("Fatal error:", error);
}
