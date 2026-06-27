/**
 * cross_tenant_catalog_override_test.js
 * ====================================================
 * Automated tests for CATALOG_OVERRIDE_IMPLEMENTATION_CONTROLLED_STAGING.
 * Asserts:
 *  1. Smoke tests for reading catalogs.
 *  2. Tenant price override resolution (LEFT JOIN logic).
 *  3. Cross-tenant isolation (Tenant A cannot see/modify Tenant B's overrides).
 *  4. Global catalogs remain untouched.
 *  5. RLS regression on the 14 previously RLS-enabled tables.
 *
 * Run: node cross_tenant_catalog_override_test.js
 */

const { pool } = require('./db_postgres');

const RED   = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const BLUE  = '\x1b[34m';
const RESET = '\x1b[0m';
const BOLD  = '\x1b[1m';

let passed = 0;
let failed = 0;
const failureLog = [];

function assert(condition, testName, details = '') {
    if (condition) {
        console.log(`  ${GREEN}✅ PASS${RESET} — ${testName}`);
        passed++;
    } else {
        console.log(`  ${RED}❌ FAIL${RESET} — ${testName}${details ? ' | ' + details : ''}`);
        failed++;
        failureLog.push({ testName, details });
    }
}

async function runTests() {
    console.log(`\n${BOLD}${BLUE}============================================================${RESET}`);
    console.log(`${BOLD}${BLUE}  Catalog Override & Tenant Isolation Integration Tests${RESET}`);
    console.log(`${BOLD}${BLUE}============================================================${RESET}\n`);

    const client = await pool.connect();

    try {
        // --- PREPARATION (Run as superuser) ---
        // Create mock tenants if they do not exist
        await client.query("INSERT INTO tenants (id, name, subdomain, status) VALUES (1, 'Tenant A', 'tenant-a', 'active') ON CONFLICT (id) DO NOTHING");
        await client.query("INSERT INTO tenants (id, name, subdomain, status) VALUES (2, 'Tenant B', 'tenant-b', 'active') ON CONFLICT (id) DO NOTHING");

        // Clean up overrides for a clean test run under FORCE RLS
        await client.query("SET app.tenant_id = '1'");
        await client.query("DELETE FROM tenant_lab_test_overrides WHERE tenant_id = 1");
        await client.query("DELETE FROM tenant_radiology_overrides WHERE tenant_id = 1");
        await client.query("DELETE FROM tenant_service_overrides WHERE tenant_id = 1");

        await client.query("SET app.tenant_id = '2'");
        await client.query("DELETE FROM tenant_lab_test_overrides WHERE tenant_id = 2");
        await client.query("DELETE FROM tenant_radiology_overrides WHERE tenant_id = 2");
        await client.query("DELETE FROM tenant_service_overrides WHERE tenant_id = 2");

        await client.query("RESET app.tenant_id");

        // Retrieve a sample test, radiology exam, and medical service to use in tests
        const labItem = (await client.query("SELECT id, price, test_name FROM lab_tests_catalog ORDER BY id LIMIT 1")).rows[0];
        const radItem = (await client.query("SELECT id, price, exact_name FROM radiology_catalog ORDER BY id LIMIT 1")).rows[0];
        const svcItem = (await client.query("SELECT id, price, name_en FROM medical_services ORDER BY id LIMIT 1")).rows[0];

        if (!labItem || !radItem || !svcItem) {
            throw new Error("Missing initial seed data in global catalogs!");
        }

        console.log(`Using Lab Item ID: ${labItem.id} (Price: ${labItem.price})`);
        console.log(`Using Rad Item ID: ${radItem.id} (Price: ${radItem.price})`);
        console.log(`Using Svc Item ID: ${svcItem.id} (Price: ${svcItem.price})`);

        // Setup the test_rls_user role
        await client.query(`
            DO $$ 
            BEGIN
                IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'test_rls_user') THEN
                    CREATE ROLE test_rls_user WITH LOGIN;
                END IF;
            END $$;
        `);
        await client.query("GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO test_rls_user");
        await client.query("GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO test_rls_user");

        // ==========================================
        // 1. SMOKE TESTS (Run as test_rls_user)
        // ==========================================
        console.log(`\n${BOLD}[ 1 ] Smoke Tests for Global Catalogs${RESET}`);
        await client.query("SET ROLE test_rls_user");
        
        const labCatalog = await client.query("SELECT * FROM lab_tests_catalog LIMIT 5");
        assert(labCatalog.rows.length > 0, "Smoke check: Read lab_tests_catalog");

        const radCatalog = await client.query("SELECT * FROM radiology_catalog LIMIT 5");
        assert(radCatalog.rows.length > 0, "Smoke check: Read radiology_catalog");

        const svcCatalog = await client.query("SELECT * FROM medical_services LIMIT 5");
        assert(svcCatalog.rows.length > 0, "Smoke check: Read medical_services");

        await client.query("RESET ROLE");

        // ==========================================
        // 2. TENANT WITHOUT OVERRIDES (DEFAULT PRICE)
        // ==========================================
        console.log(`\n${BOLD}[ 2 ] Tenant Without Overrides (Resolved Price equals Global Price)${RESET}`);
        {
            // Switch to test role & set tenant
            await client.query("SET ROLE test_rls_user");
            await client.query("SET app.tenant_id = '1'");
            
            const resolvedLab = (await client.query(`
                SELECT COALESCE(o.custom_price, lt.price) AS price
                FROM lab_tests_catalog lt
                LEFT JOIN tenant_lab_test_overrides o ON lt.id = o.test_id
                WHERE lt.id = $1
            `, [labItem.id])).rows[0];
            
            assert(resolvedLab.price === labItem.price, "Tenant A gets global price for lab test when no override exists");

            const resolvedRad = (await client.query(`
                SELECT COALESCE(o.custom_price, rc.price) AS price
                FROM radiology_catalog rc
                LEFT JOIN tenant_radiology_overrides o ON rc.id = o.radiology_id
                WHERE rc.id = $1
            `, [radItem.id])).rows[0];
            
            assert(resolvedRad.price === radItem.price, "Tenant A gets global price for radiology when no override exists");
            
            await client.query("RESET app.tenant_id");
            await client.query("RESET ROLE");
        }

        // ==========================================
        // 3. TENANT WITH OVERRIDES (CUSTOM PRICE)
        // ==========================================
        console.log(`\n${BOLD}[ 3 ] Tenant With Custom Price Overrides${RESET}`);
        {
            const customLabPrice = labItem.price + 50.0;
            const customRadPrice = radItem.price + 75.0;

            // Insert override as test_rls_user in Tenant 1 context
            await client.query("SET ROLE test_rls_user");
            await client.query("SET app.tenant_id = '1'");
            
            await client.query(`
                INSERT INTO tenant_lab_test_overrides (tenant_id, test_id, custom_price)
                VALUES (1, $1, $2)
            `, [labItem.id, customLabPrice]);
            
            await client.query(`
                INSERT INTO tenant_radiology_overrides (tenant_id, radiology_id, custom_price, custom_template)
                VALUES (1, $1, $2, 'Custom Template A')
            `, [radItem.id, customRadPrice]);

            // Query resolved price inside Tenant A context
            const resolvedLab = (await client.query(`
                SELECT COALESCE(o.custom_price, lt.price) AS price
                FROM lab_tests_catalog lt
                LEFT JOIN tenant_lab_test_overrides o ON lt.id = o.test_id
                WHERE lt.id = $1
            `, [labItem.id])).rows[0];
            
            assert(resolvedLab.price === customLabPrice, "Tenant A gets the custom overridden price for lab test");

            const resolvedRad = (await client.query(`
                SELECT COALESCE(o.custom_price, rc.price) AS price, COALESCE(o.custom_template, rc.default_template) AS template
                FROM radiology_catalog rc
                LEFT JOIN tenant_radiology_overrides o ON rc.id = o.radiology_id
                WHERE rc.id = $1
            `, [radItem.id])).rows[0];
            
            assert(resolvedRad.price === customRadPrice, "Tenant A gets the custom overridden price for radiology");
            assert(resolvedRad.template === 'Custom Template A', "Tenant A gets the custom overridden template for radiology");

            await client.query("RESET app.tenant_id");
            await client.query("RESET ROLE");
        }

        // ==========================================
        // 4. CROSS-TENANT ISOLATION (RLS CHECK)
        // ==========================================
        console.log(`\n${BOLD}[ 4 ] Cross-Tenant Isolation Validation (RLS on Overrides)${RESET}`);
        {
            // Switch context to Tenant B (tenant_id = 2) under test role
            await client.query("SET ROLE test_rls_user");
            await client.query("SET app.tenant_id = '2'");

            // Query resolved price for Tenant B - should NOT see Tenant A's override, should resolve to global price
            const resolvedLabB = (await client.query(`
                SELECT COALESCE(o.custom_price, lt.price) AS price
                FROM lab_tests_catalog lt
                LEFT JOIN tenant_lab_test_overrides o ON lt.id = o.test_id
                WHERE lt.id = $1
            `, [labItem.id])).rows[0];
            
            assert(resolvedLabB.price === labItem.price, "Tenant B resolves to global default price because Tenant A's override is isolated by RLS");

            // Verify Tenant B sees 0 override rows
            const directOverrideCount = (await client.query("SELECT COUNT(*) AS cnt FROM tenant_lab_test_overrides")).rows[0].cnt;
            assert(parseInt(directOverrideCount) === 0, "Tenant B sees 0 override rows because Tenant A's rows are hidden by RLS");

            // Verify Tenant B cannot update Tenant A's override row
            let updateErrorOccurred = false;
            try {
                // If RLS works, Tenant B has no view of tenant_id 1 rows, so this UPDATE will update 0 rows
                const updateRes = await client.query(`
                    UPDATE tenant_lab_test_overrides SET custom_price = 999.0 WHERE test_id = $1
                `, [labItem.id]);
                assert(updateRes.rowCount === 0, "Tenant B update matches 0 rows due to RLS filter");
            } catch (e) {
                updateErrorOccurred = true;
            }

            // Query as superuser to verify Tenant A's override was NOT modified
            await client.query("SET app.tenant_id = '1'");
            await client.query("RESET ROLE");
            const verifyPrice = (await client.query("SELECT custom_price FROM tenant_lab_test_overrides WHERE test_id = $1 AND tenant_id = 1", [labItem.id])).rows[0].custom_price;
            assert(verifyPrice !== 999.0, "Tenant B cannot modify Tenant A's override price");
            await client.query("RESET app.tenant_id");
        }

        // ==========================================
        // 5. GLOBAL CATALOGS INTEGRITY
        // ==========================================
        console.log(`\n${BOLD}[ 5 ] Global Catalogs Integrity Check${RESET}`);
        {
            // Check that the global catalog prices are unmodified
            const freshLabItem = (await client.query("SELECT price FROM lab_tests_catalog WHERE id = $1", [labItem.id])).rows[0];
            assert(freshLabItem.price === labItem.price, "Global price in lab_tests_catalog remains unchanged");

            const freshRadItem = (await client.query("SELECT price FROM radiology_catalog WHERE id = $1", [radItem.id])).rows[0];
            assert(freshRadItem.price === radItem.price, "Global price in radiology_catalog remains unchanged");

            const freshSvcItem = (await client.query("SELECT price FROM medical_services WHERE id = $1", [svcItem.id])).rows[0];
            assert(freshSvcItem.price === svcItem.price, "Global price in medical_services remains unchanged");
        }

        // ==========================================
        // 6. RLS REGRESSION FOR THE 14 PREVIOUS TABLES
        // ==========================================
        console.log(`\n${BOLD}[ 6 ] RLS Regression Tests on Existing 14 Tables${RESET}`);
        {
            const tablesToCheck = [
                'patients', 'appointments', 'invoices', 'prescriptions', 
                'lab_radiology_orders', 'emergency_visits', 'nursing_vitals', 
                'lab_results', 'insurance_claims', 'pharmacy_prescriptions_queue', 
                'emergency_beds', 'pharmacy_sales', 'pharmacy_sale_items', 'lab_samples'
            ];

            // Verify they have RLS enabled
            for (const table of tablesToCheck) {
                const rlsInfo = (await client.query(`
                    SELECT rowsecurity FROM pg_tables WHERE tablename = $1
                `, [table])).rows[0];
                assert(rlsInfo && rlsInfo.rowsecurity === true, `Table '${table}' RLS remains active`);
            }
        }

        // Clean up tests data as superuser
        await client.query("RESET app.tenant_id");
        await client.query("RESET ROLE");
        await client.query("DELETE FROM tenant_lab_test_overrides WHERE tenant_id IN (1, 2)");
        await client.query("DELETE FROM tenant_radiology_overrides WHERE tenant_id IN (1, 2)");
        await client.query("DELETE FROM tenant_service_overrides WHERE tenant_id IN (1, 2)");

    } catch (e) {
        console.error("Test error:", e.message);
        failed++;
    } finally {
        await client.query("RESET app.tenant_id").catch(() => {});
        await client.query("RESET ROLE").catch(() => {});
        client.release();
    }

    console.log(`\n${BOLD}${BLUE}============================================================${RESET}`);
    console.log(`${BOLD}${BLUE}  Test Execution Summary${RESET}`);
    console.log(`${BOLD}${BLUE}============================================================${RESET}`);
    console.log(`  ${GREEN}Passed${RESET}: ${passed}`);
    console.log(`  ${RED}Failed${RESET}: ${failed}`);

    if (failed === 0) {
        console.log(`\n${BOLD}${GREEN}🎉 ALL TESTS PASSED SUCCESSFULLY!${RESET}\n`);
        process.exit(0);
    } else {
        console.log(`\n${BOLD}${RED}⛔ SOME TESTS FAILED. CHECK LOGS ABOVE.${RESET}\n`);
        process.exit(1);
    }
}

runTests();
