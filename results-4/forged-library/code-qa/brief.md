Future sessions will get tasks like this one (do not solve it):

Answer these questions about the JavaScript code in src/ (call graph of exported functions; ignore calls that appear only in comments or strings, and ignore non-exported helpers). A function id is "<path relative to src/>:<function name>", e.g. "billing/core.js:validate"; for a default export use its declared function name.

- q1: Which functions call `auth/core8.js:apply` directly or transitively? Answer with a sorted array of ids.
- q2: What is a shortest call chain from `storage/model.js:format` to `billing/view.js:parse`? Answer with the array of ids from the first to the last function, inclusive.
- q3: How many distinct functions does `reports/worker76.js:check` call directly or transitively? Answer with a number.
- q4: Which functions call `mail/helpers.js:checkNow` directly or transitively? Answer with a sorted array of ids.

Write answers-1.json: a JSON object {"q1": …, "q2": …, …}. There will be more questions about this code base in the future. When finished, reply DONE.