import 'dotenv/config';
import { createApp } from './app.js';
import { initDb } from './db/init.js';

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;

async function main() {
  await initDb();
  const app = createApp();
  app.listen(PORT, () => {
    console.log(`Cement ERP server listening on port ${PORT}`);
  });
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
