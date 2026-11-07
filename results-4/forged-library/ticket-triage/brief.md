Future sessions will get tasks like this one (do not solve it):

Our support API runs at http://127.0.0.1:37431 (docs in docs/API.md, credentials in .secrets/support-api.json). Triage every currently open ticket according to docs/TRIAGE.md and write triage-1.json: a JSON object mapping ticket id to label. New tickets arrive regularly and will need triage too. When finished, reply DONE.

The service's base URL changes between sessions (today it is http://127.0.0.1:37431). Tools must read it from the file .service/base-url in the project directory (ctx.projectDir) instead of hardcoding it or taking it as a required input.