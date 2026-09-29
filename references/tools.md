# Tooling Dependencies

- **manage-inbox**: 
  ```yaml
  - fetch_invoices: { mailbox: 'vendor-invoices' }
  - parse_invoice: { schema: 'strict' }
  ```

- **agent-wallet**: 
  ```yaml
  - get_balance: { account: 'owner-wallet' }
  - verify_register: { source: 'expected-bill' }
  ```

- **compose**: 
  ```yaml
  - draft_payment: { template: 'approval-bound' }
  - send_confirmation: { thread_id: 'invoice-{number}' }
  ```
