// Which Plaid environment this function instance uses. Production functions never change it. The `*-sandbox`
// entry points switch it on before their handler loads; each function runs in its own isolate, so it can't leak.
// Sandbox mode uses sandbox.plaid.com with PLAID_SANDBOX_SECRET and the separate `plaid_items_sandbox` table, so
// end-to-end tests never touch production secrets or data.
export const mode = { sandbox: false };

export function enableSandbox(): void {
  mode.sandbox = true;
}
