# pi-web-search

A shareable [pi](https://github.com/badlogic/pi-mono) package that adds a `web_search` tool.

The tool searches the web and returns ranked results with titles, URLs, and snippets. It can use Brave Search when an API key is available, or DuckDuckGo HTML without an API key.

## Install

Install directly from git:

```bash
pi install git:github.com/narumiruna/pi-web-search
```

Or install from a local checkout:

```bash
pi install /absolute/path/to/pi-web-search
# or, for this project only:
pi install -l ./pi-web-search
```

If published to npm, install with:

```bash
pi install npm:@narumitw/pi-web-search
```

To try it for one run without adding it to settings:

```bash
pi -e git:github.com/narumiruna/pi-web-search
# or
pi -e /absolute/path/to/pi-web-search
```

> Security note: pi packages can execute code with your user permissions. Review packages before installing them.

## Tool

`web_search` searches the web and returns source URLs with snippets.

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

## Package layout

This repository is a pi package. `package.json` declares:

```json
{
  "keywords": ["pi-package"],
  "pi": {
    "extensions": ["./extensions"]
  }
}
```

The extension entrypoint is:

```text
extensions/web-search.ts
```

Pi loads TypeScript extensions directly, so there is no build step.

## Publishing to npm

1. Update `package.json` metadata (`name`, `version`, repository fields if needed).
2. Preview the npm tarball:

   ```bash
   npm pack --dry-run
   ```

3. Publish:

   ```bash
   npm publish
   ```

After publishing, users can run:

```bash
pi install npm:@narumitw/pi-web-search
```
