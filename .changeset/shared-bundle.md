---
"trod": patch
---

The package is about 40% smaller (0.8 MB unpacked instead of 1.4 MB): the CLI (`bin/trod`) now shares the server's code (`server/trod-lib.mjs`) instead of carrying a second copy. `server/trod-server.mjs` is still the server's entry point. A vendored copy (`trod init --vendor`) gets the new file the next time you run it.
