/**
 * tenant_context_pg_session.js
 * 
 * Helper module for managing tenant session context securely in PostgreSQL transactions.
 * Utilizes `set_config` inside transactions to prevent connection pool pollution.
 */

/**
 * Executes database operations within a scoped transaction,
 * setting PostgreSQL session variables for tenant isolation.
 *
 * @param {Object} pool - PostgreSQL connection pool.
 * @param {Object} ctx - The tenant context containing tenant_id, facility_id (optional), branch_id (optional).
 * @param {Function} handler - Async callback: (client, ctx) => Promise<any>
 * @returns {Promise<any>}
 */
async function withTenantTransaction(pool, ctx, handler) {
    if (!pool) {
        throw new Error('Database pool is required');
    }
    if (!ctx) {
        throw new Error('Tenant context is required');
    }
    if (ctx.tenant_id === undefined || ctx.tenant_id === null) {
        throw new Error('tenant_id is mandatory');
    }
    if (typeof handler !== 'function') {
        throw new Error('Handler must be a function');
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Set mandatory tenant_id (cast to string for set_config compatibility)
        await client.query("SELECT set_config('app.tenant_id', $1, true)", [ctx.tenant_id.toString()]);

        // Set optional facility_id if provided
        if (ctx.facility_id !== undefined && ctx.facility_id !== null) {
            await client.query("SELECT set_config('app.facility_id', $1, true)", [ctx.facility_id.toString()]);
        }

        // Set optional branch_id if provided
        if (ctx.branch_id !== undefined && ctx.branch_id !== null) {
            await client.query("SELECT set_config('app.branch_id', $1, true)", [ctx.branch_id.toString()]);
        }

        const result = await handler(client, ctx);

        await client.query('COMMIT');
        return result;
    } catch (error) {
        try {
            await client.query('ROLLBACK');
        } catch (rollbackErr) {
            console.error('Failed to rollback transaction:', rollbackErr.message);
        }
        throw error;
    } finally {
        client.release();
    }
}

module.exports = {
    withTenantTransaction
};
