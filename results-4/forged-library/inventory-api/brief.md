The inventory service runs at http://127.0.0.1:43355 (docs: docs/inventory-api.md, which are incomplete; token in .secrets/inventory.token). "Active" items are those whose status is not archived. Money values are euros.

Future sessions will each answer one question about this inventory data, for example stock value per warehouse, items below their reorder point, net stock movements over a period, or recent price changes.

The service's base URL changes between sessions (today it is http://127.0.0.1:43355). Tools must read it from the file .service/base-url in the project directory (ctx.projectDir) instead of hardcoding it or taking it as a required input.