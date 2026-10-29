# Partner Finder

Paste a startup's URL, get a ranked list of real partner companies, each with a reason and an outreach draft.

1. **Profile**: fetches the site and has Claude write a structured profile (product, customers, value prop, gaps). Editable.
2. **Categories**: Claude proposes 4–6 partner categories ("who already has these customers?"), each with a contact role and two search queries. Editable.
3. **Partners**: runs every query through a search API, dedupes the results, and has Claude pick and score 15–30 companies **only from those results**. The server then drops any pick whose name doesn't appear in the search result it cites, so a partner can't be invented.
4. **Email**: drafted on demand when you open a row.
5. **Find more**: searches deeper in the filtered category (or all of them), skipping every company already listed or marked not a fit.
6. **Not a fit**: hides a partner, leaves it out of the export, and keeps it out of later searches. Undo from the toast or the list under the table.
7. **Export CSV**: includes a LinkedIn people search for each contact role, and any emails drafted so far.

No database. State lives in the browser (localStorage).

## Run it

```bash
cp .env.example .env.local   # add ANTHROPIC_API_KEY and one search key
npm install
npm run dev
```

Search provider: set one of `EXA_API_KEY` (best: it can restrict results to company homepages), `TAVILY_API_KEY` or `SERPER_API_KEY`. If several are set, Exa wins, then Tavily.

## Sharing a deployed link

Set `APP_PASSWORD` and the browser asks for it before showing anything (any username works). API calls are also rate limited per IP (20 partner searches and 120 other calls per 10 minutes), so a leaked link can't run up your Claude and Exa bills. Both live in `proxy.ts`.

## Keyboard

Press `⌘K` (or `?`) in the app for the full list.

| Keys | Action |
| --- | --- |
| `⌘↵` | Run the next step (analyze, suggest categories, find partners) |
| `/` | Focus the URL box |
| `J` `K` / `↓` `↑` | Move through partners |
| `↵` or `O` | Open or close the selected partner's email |
| `E` / `R` / `C` | Draft / regenerate / copy the email |
| `X` | Not a fit |
| `L` / `W` | Open LinkedIn search / website |
| `1`–`9`, `0` | Filter to a category, show all |
| `F` | Find more |
| `⇧E` | Export CSV |
| `Esc` | Leave a field, close the email, clear the filter, clear the selection |

## Files

- `app/page.tsx`: the whole UI, built on shadcn/ui (`components/ui/`)
- `app/api/{profile,categories,partners,email}/route.ts`: one route per step, prompts inline
- `lib/llm.ts`: Claude structured-output call (`claude-opus-5-5`)
- `lib/search.ts`: Exa / Tavily / Serper adapters
- `lib/site.ts`: homepage fetch and text extraction, with search snippets as a fallback for JS-heavy sites
