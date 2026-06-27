const fs = require('fs');
const path = require('path');
const { getDb } = require('./database.js');

const db = getDb();
let inserted = 0;

try {
    const jsonPath = 'e:\\\\NamaMedical\\\\pharmacy_global_products_p1_to_200.json';
    const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

    console.log(`Loaded ${data.length} items from JSON. Commencing bulk insert...`);

    const stmtMed = db.prepare('INSERT INTO medications (name, active_ingredient, stock_quantity, price) VALUES (?, ?, ?, ?)');
    const stmtCat = db.prepare('INSERT INTO pharmacy_drug_catalog (drug_name, active_ingredient, category, selling_price, cost_price, stock_qty) VALUES (?, ?, ?, ?, ?, ?)');

    const checkMed = db.prepare('SELECT id FROM medications WHERE name = ?');
    const checkCat = db.prepare('SELECT id FROM pharmacy_drug_catalog WHERE drug_name = ?');

    db.transaction(() => {
        for (const item of data) {
            const name = item.name.trim();
            const price = parseFloat(item.price_sar) || 0;
            if (!name || price <= 0) continue;

            const cost = parseFloat((price * 0.7).toFixed(2));
            const stock = Math.floor(Math.random() * 80) + 20;
            const category = "عام";
            const active = "غير محدد";

            try {
                if (!checkMed.get(name)) {
                    stmtMed.run(name, active, stock, price);
                }

                if (!checkCat.get(name)) {
                    stmtCat.run(name, active, category, price, cost, stock);
                    inserted++;
                }
            } catch (err) {
                // Ignore unique constraint errors if any
            }
        }
    })();

    console.log(`Successfully imported ${inserted} unique Nahdi products into the database.`);

} catch (error) {
    console.error("Failed to import JSON data:", error);
}
