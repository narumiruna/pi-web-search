import { StringEnum } from "@mariozechner/pi-ai";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type, type Static } from "typebox";

const WEB_SEARCH_PARAMS = Type.Object({
	query: Type.String({ description: "Search query." }),
	max_results: Type.Optional(
		Type.Integer({
			description: "Maximum number of results to return (1-10). Defaults to 5.",
			minimum: 1,
			maximum: 10,
		}),
	),
	provider: Type.Optional(
		StringEnum(["auto", "brave", "duckduckgo"], {
			description:
				"Search backend. 'auto' uses Brave when BRAVE_SEARCH_API_KEY is set, otherwise DuckDuckGo HTML. Defaults to auto.",
		}),
	),
	safe_search: Type.Optional(
		Type.Boolean({ description: "Enable safe search when the provider supports it. Defaults to true." }),
	),
});

type WebSearchParams = Static<typeof WEB_SEARCH_PARAMS>;

type SearchProvider = "brave" | "duckduckgo";

type SearchResult = {
	title: string;
	url: string;
	snippet?: string;
};

type SearchResponse = {
	provider: SearchProvider;
	results: SearchResult[];
	warnings?: string[];
};

const DEFAULT_MAX_RESULTS = 5;
const USER_AGENT = "Mozilla/5.0 (compatible; pi-web-search/0.1)";

export default function webSearchExtension(pi: ExtensionAPI) {
	pi.registerTool({
		name: "web_search",
		label: "Web Search",
		description: "Search the web and return titles, URLs, and snippets for relevant results.",
		promptSnippet: "Search the web for current information and return source URLs with snippets",
		promptGuidelines: [
			"Use web_search when the user asks for current information, recent events, external facts not available in the repository, or sources from the public web.",
			"When using web_search, cite returned URLs in the final answer and say when the search results are inconclusive.",
		],
		parameters: WEB_SEARCH_PARAMS,
		async execute(_toolCallId, params: WebSearchParams, signal, onUpdate) {
			const query = params.query.trim();
			if (!query) {
				throw new Error("Search query must not be empty.");
			}

			const maxResults = clampInteger(params.max_results ?? DEFAULT_MAX_RESULTS, 1, 10);
			const requestedProvider = params.provider ?? "auto";
			const safeSearch = params.safe_search ?? true;

			try {
				const provider = selectProvider(requestedProvider);

				onUpdate?.({
					content: [{ type: "text" as const, text: `Searching ${provider} for: ${query}` }],
					details: { query, provider },
				});

				const response =
					provider === "brave"
						? await searchBrave(query, maxResults, safeSearch, signal)
						: await searchDuckDuckGo(query, maxResults, safeSearch, signal);

				const text = formatSearchResponse(query, response);
				return {
					content: [{ type: "text" as const, text }],
					details: { query, ...response },
				};
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				throw new Error(`Web search failed using ${requestedProvider}: ${message}`);
			}
		},
	});
}

function selectProvider(provider: WebSearchParams["provider"]): SearchProvider {
	if (provider === "brave") {
		if (!process.env.BRAVE_SEARCH_API_KEY) {
			throw new Error("BRAVE_SEARCH_API_KEY is required when provider is 'brave'.");
		}
		return "brave";
	}
	if (provider === "duckduckgo") return "duckduckgo";
	return process.env.BRAVE_SEARCH_API_KEY ? "brave" : "duckduckgo";
}

async function searchBrave(
	query: string,
	maxResults: number,
	safeSearch: boolean,
	signal?: AbortSignal,
): Promise<SearchResponse> {
	const apiKey = process.env.BRAVE_SEARCH_API_KEY;
	if (!apiKey) throw new Error("BRAVE_SEARCH_API_KEY is not set.");

	const url = new URL("https://api.search.brave.com/res/v1/web/search");
	url.searchParams.set("q", query);
	url.searchParams.set("count", String(maxResults));
	url.searchParams.set("safesearch", safeSearch ? "strict" : "off");

	const res = await fetch(url, {
		signal,
		headers: {
			Accept: "application/json",
			"Accept-Encoding": "gzip",
			"X-Subscription-Token": apiKey,
		},
	});

	if (!res.ok) {
		throw new Error(`Brave Search API returned HTTP ${res.status}: ${await safeReadText(res)}`);
	}

	const data = (await res.json()) as {
		web?: { results?: Array<{ title?: string; url?: string; description?: string }> };
	};

	const results = (data.web?.results ?? [])
		.filter((item) => item.title && item.url)
		.slice(0, maxResults)
		.map((item) => ({
			title: cleanText(item.title ?? ""),
			url: item.url ?? "",
			snippet: item.description ? cleanText(item.description) : undefined,
		}));

	return { provider: "brave", results };
}

async function searchDuckDuckGo(
	query: string,
	maxResults: number,
	safeSearch: boolean,
	signal?: AbortSignal,
): Promise<SearchResponse> {
	const url = new URL("https://html.duckduckgo.com/html/");
	url.searchParams.set("q", query);
	if (!safeSearch) url.searchParams.set("kp", "-2");

	const res = await fetch(url, {
		signal,
		headers: {
			"User-Agent": USER_AGENT,
			Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
			"Accept-Language": "en-US,en;q=0.9",
		},
	});

	if (!res.ok) {
		throw new Error(`DuckDuckGo returned HTTP ${res.status}: ${await safeReadText(res)}`);
	}

	const html = await res.text();
	const results = parseDuckDuckGoHtml(html, maxResults);
	const warnings = results.length === 0 ? ["No results parsed from DuckDuckGo HTML response."] : undefined;
	return { provider: "duckduckgo", results, warnings };
}

function parseDuckDuckGoHtml(html: string, maxResults: number): SearchResult[] {
	const anchors = [...html.matchAll(/<a[^>]+class=["'][^"']*result__a[^"']*["'][^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)];
	const results: SearchResult[] = [];
	const seen = new Set<string>();

	for (let i = 0; i < anchors.length && results.length < maxResults; i++) {
		const match = anchors[i];
		const nextMatch = anchors[i + 1];
		const block = html.slice(match.index ?? 0, nextMatch?.index ?? html.length);
		const url = normalizeDuckDuckGoUrl(decodeHtml(match[1] ?? ""));
		const title = cleanText(match[2] ?? "");
		if (!title || !url || seen.has(url)) continue;

		const snippetMatch = block.match(/<(?:a|div)[^>]+class=["'][^"']*result__snippet[^"']*["'][^>]*>([\s\S]*?)<\/(?:a|div)>/i);
		const snippet = snippetMatch ? cleanText(snippetMatch[1] ?? "") : undefined;

		seen.add(url);
		results.push({ title, url, snippet });
	}

	return results;
}

function normalizeDuckDuckGoUrl(rawUrl: string): string {
	try {
		const url = rawUrl.startsWith("//") ? new URL(`https:${rawUrl}`) : new URL(rawUrl, "https://duckduckgo.com");
		const uddg = url.searchParams.get("uddg");
		return uddg ? decodeURIComponent(uddg) : url.toString();
	} catch {
		return rawUrl;
	}
}

function formatSearchResponse(query: string, response: SearchResponse): string {
	const lines = [`Search results for "${query}" (${response.provider}):`];

	if (response.warnings?.length) {
		for (const warning of response.warnings) lines.push(`Warning: ${warning}`);
	}

	if (response.results.length === 0) {
		lines.push("No results found.");
		return lines.join("\n");
	}

	response.results.forEach((result, index) => {
		lines.push("", `${index + 1}. ${result.title}`, `   URL: ${result.url}`);
		if (result.snippet) lines.push(`   Snippet: ${result.snippet}`);
	});

	return lines.join("\n");
}

function cleanText(value: string): string {
	return decodeHtml(stripTags(value)).replace(/\s+/g, " ").trim();
}

function stripTags(value: string): string {
	return value
		.replace(/<script\b[\s\S]*?<\/script>/gi, " ")
		.replace(/<style\b[\s\S]*?<\/style>/gi, " ")
		.replace(/<[^>]+>/g, " ");
}

function decodeHtml(value: string): string {
	const named: Record<string, string> = {
		amp: "&",
		lt: "<",
		gt: ">",
		quot: '"',
		apos: "'",
		"#39": "'",
		nbsp: " ",
	};

	return value.replace(/&(#x?[0-9a-f]+|[a-z][a-z0-9]+);/gi, (_entity, code: string) => {
		const lower = code.toLowerCase();
		if (lower.startsWith("#x")) return String.fromCodePoint(Number.parseInt(lower.slice(2), 16));
		if (lower.startsWith("#")) return String.fromCodePoint(Number.parseInt(lower.slice(1), 10));
		return named[lower] ?? `&${code};`;
	});
}

function clampInteger(value: number, min: number, max: number): number {
	if (!Number.isFinite(value)) return DEFAULT_MAX_RESULTS;
	return Math.min(max, Math.max(min, Math.trunc(value)));
}

async function safeReadText(response: Response): Promise<string> {
	try {
		return (await response.text()).slice(0, 500);
	} catch {
		return "<unable to read response body>";
	}
}
