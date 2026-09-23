# hack-7cf34f56-aman-ai
Hackathon team repository for Aman AI

## Design documents

- [Investigator architecture and analytical design](docs/moneygraph-investigator-design.md)
- [UI design contract: screens, components, data needs, and acceptance checks](docs/moneygraph-ui-design-contract.md)

## Frontend

Run the initial demo from the repository root:

```bash
npm --prefix apps/frontend ci
npm --prefix apps/frontend run dev -- --host 127.0.0.1
```

Open http://127.0.0.1:5173. The interface currently uses clearly labeled synthetic data; real backend integration is pending.

See [frontend setup and API adapter](apps/frontend/README.md) and [verification results](docs/frontend-qa-report.md).
