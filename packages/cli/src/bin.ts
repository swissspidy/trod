import { main } from './cli.ts';

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (err: Error) => {
    console.error(`trod: ${err.message}`);
    process.exit(1);
  },
);
