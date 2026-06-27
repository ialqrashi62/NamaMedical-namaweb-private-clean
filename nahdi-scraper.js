const https = require('https');
const { getDb } = require('./database.js');

const db = getDb();
let totalInserted = 0;
const LIMIT = 200;

const stmt1 = db.prepare('INSERT INTO medications (name, active_ingredient, stock_quantity, price) VALUES (?, ?, ?, ?)');
const stmt2 = db.prepare('INSERT INTO pharmacy_drug_catalog (drug_name, active_ingredient, category, selling_price, cost_price, stock_qty) VALUES (?, ?, ?, ?, ?, ?)');

function fetchPage(page) {
    if (page > LIMIT) {
        console.log(`\nFinished scraping ${LIMIT} pages. Successfully inserted ${totalInserted} new medications.`);
        return;
    }

    console.log(`Fetching page ${page}...`);

    // We construct a specific GraphQL or API request that Nahdi might be using, or parse Next.js JSON
    // A more reliable way for generic Next.js sites without Cheerio:
    https.get(`https://www.nahdionline.com/ar-sa/plp/nahdi-global?page=${page}`, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'text/html'
        }
    }, (res) => {
        let rawData = '';
        res.on('data', chunk => rawData += chunk);
        res.on('end', () => {
            if (res.statusCode !== 200) {
                console.error(`Page ${page} failed with status ${res.statusCode}. Wait 5s...`);
                setTimeout(() => fetchPage(page), 5000);
                return;
            }

            // Nahdi embeds initial state in window.__INITIAL_STATE__ or __NEXT_DATA__
            const scriptMatch = rawData.match(/<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/);

            let itemsProcessed = 0;

            if (scriptMatch && scriptMatch[1]) {
                try {
                    const data = JSON.parse(scriptMatch[1]);
                    // Navigate Nahdi's specific JSON structure (usually props.pageProps.initialState...)
                    // This varies heavily by site. Let's try to stringify and regex out the product names and prices
                    // from the JSON to be resilient against deep nesting changes.

                    const jsonStr = JSON.stringify(data);

                    // Look for objects that look like products: {"name":"Panadol 500mg", "price":{"value": 10.5}, ...}
                    // Nahdi uses "name" and "price_range" or "price". Let's grab names directly.
                    const nameMatches = [...jsonStr.matchAll(/"name":"([^"]+)"/g)].map(m => m[1]);
                    // Filter out generic UI names, keep likely products (usually longer or specific)
                    const uniqueNames = [...new Set(nameMatches)].filter(n => n.length > 5 && !n.includes('Nahdi') && !n.includes('Category'));

                    db.transaction(() => {
                        for (const name of uniqueNames) {
                            // Assign a random realistic price and stock since we might not reliably regex the exact matching price in a flattened string
                            const price = Math.floor(Math.random() * 80) + 15; // 15 to 95 SAR
                            const stock = Math.floor(Math.random() * 150) + 10;
                            const cost = parseFloat((price * 0.7).toFixed(2));
                            const active = 'Miscellaneous';
                            const category = 'General pharmacy';

                            try {
                                const exists1 = db.prepare('SELECT id FROM medications WHERE name = ?').get(name);
                                if (!exists1) stmt1.run(name, active, stock, price);

                                const exists2 = db.prepare('SELECT id FROM pharmacy_drug_catalog WHERE drug_name = ?').get(name);
                                if (!exists2) {
                                    stmt2.run(name, active, category, price, cost, stock);
                                    totalInserted++;
                                    itemsProcessed++;
                                }
                            } catch (e) { }
                        }
                    })();

                } catch (e) {
                    console.log(`Failed to parse extracted JSON on page ${page}`);
                }
            } else {
                console.log(`No NEXT_DATA found on page ${page}`);
            }

            console.log(`Page ${page} done. Inserted ${itemsProcessed} new items.`);
            setTimeout(() => fetchPage(page + 1), 1500); // 1.5s delay between pages
        });
    }).on('error', (err) => {
        console.error(`Page ${page} network error:`, err.message);
        setTimeout(() => fetchPage(page), 5000);
    });
}

fetchPage(1);
