# Stock: buy when the price is below a limit

- Buy is `button#buy`. The price is `span#stock-price` in the listing and on screen. They can differ slightly (017: listing $53.70, screen $52.10; both under the $58.40 limit).
- Passes (016, 017, 018): read the price, and if it is below the limit, `click <buy>` at once. 2-3 calls each.
- Fail (013): the price started at $53.80 against a $51.20 limit. The session then ran `sleep 20` and `sleep 15`, read "$undefined0", and stopped without buying. The shell blocked a chained `sleep 60`.
- If the price is above the limit, re-read it repeatedly with `mw observe` or a screenshot, without long sleeps, and buy the moment it is below. Compare numbers exactly against the task's limit.
