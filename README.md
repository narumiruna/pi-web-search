# pi-web-search

Project-local pi extension that adds a `web_search` tool.

## Install / load

This repository already places the extension where pi auto-discovers project-local extensions:

```text
.pi/extensions/web-search.ts
```

From this directory, start pi normally or run `/reload` in an existing pi session.

## Tool

`web_search` searches the web and returns ranked results with titles, URLs, and snippets.

Parameters:

- `query` (string, required): search query
- `max_results` (integer, optional): number of results, 1-10, defaults to 5
- `provider` (`auto` | `brave` | `duckduckgo`, optional): defaults to `auto`
- `safe_search` (boolean, optional): defaults to `true`

## Providers

- `auto`: uses Brave Search when `BRAVE_SEARCH_API_KEY` is set; otherwise uses DuckDuckGo HTML.
- `brave`: uses the Brave Search API and requires:

  ```bash
  export BRAVE_SEARCH_API_KEY=...
  ```

- `duckduckgo`: no API key required; scrapes DuckDuckGo's HTML endpoint, so it may be less reliable than an API-backed provider.

## Example prompt

```text
Search the web for the latest pi-coding-agent extension docs and summarize the top sources.
```
