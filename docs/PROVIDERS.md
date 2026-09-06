# Optional storyteller connections

Version 0.3 keeps on-device inference as the default and adds **Settings → Choose your storyteller → Connect an API or local server**. Each provider has a separate saved configuration. Enter an API key, then click **Fetch models** immediately below it. For an unauthenticated local server, leave the key blank; the endpoint alone is enough. Use **Filter models** and **Available models** to choose an ID, or type it manually. Discovery does not require a model or completed generation settings. It sends a metadata request only when clicked, with no story text. Changing credentials or endpoint clears the discovered list. A server without model discovery can still be used by entering its exact model ID. Confirm the destination and select **Use this connection**.

| Connection | Default API base URL           | Protocol                                 |
| ---------- | ------------------------------ | ---------------------------------------- |
| OpenAI     | `https://api.openai.com/v1`    | Responses                                |
| Anthropic  | `https://api.anthropic.com/v1` | Messages                                 |
| OpenRouter | `https://openrouter.ai/api/v1` | Chat Completions                         |
| Venice     | `https://api.venice.ai/api/v1` | Chat Completions                         |
| LM Studio  | `http://localhost:1234/v1`     | Chat Completions                         |
| Ollama     | `http://localhost:11434/v1`    | Chat Completions                         |
| Custom     | User supplied                  | Chat Completions, Responses, or Messages |

The API base includes the API prefix (`/v1` or `/api/v1`), not the final `/chat/completions`, `/responses`, or `/messages` path. Remote endpoints require HTTPS. Plain HTTP is allowed only for `localhost`, `127.0.0.1`, and `[::1]`. Credentials, queries, and fragments in the URL are rejected. Keys use Bearer authorization for Chat/Responses and `x-api-key` for Messages. Arbitrary custom headers, cloud embeddings, OAuth, provider tools, and streaming are outside this version's scope.

## Data and keys

The selected connection receives the context needed for the requested AI operation directly from the browser. Story generation uses the existing epistemic/temporal compiler. Acceptance of an AI passage may invoke extraction through the selected connection. Author assistance sends the selected entity's name, summary, and **author notes**, as disclosed beside its button. Manual Story mode, local search, storage, and native import/export remain local.

The provider's usage charges and data policies apply. OpenAI requests set `store: false`; this does not promise zero provider retention. Venice's additional system prompt and web features are explicitly disabled. OpenRouter model-provider fallback is disabled. There is no hidden fallback to another configured connection, and failed/ambiguous requests are never automatically replayed. Canceling a request cannot guarantee that its provider stopped processing or charging for it.

Keys are stored in the tab's `sessionStorage` by default, surviving reloads in that session. **Remember this key on this device** instead uses unencrypted `localStorage`, with an explicit warning. Configuration metadata is also in localStorage; none of this is in Project, PGlite, workflow records, source ZIPs, or `.storyworld` exports. Model/provider labels and destination origins appear in execution provenance. Entering a different base URL clears the key field. **Forget connection & key** removes the stored profile and both key-storage entries. Clearing site data also removes them.

This is a bring-your-own-key client. No maintainer API credential is distributed, no key is provisioned automatically, and Storied's Cloudflare service does not proxy requests or receive API keys. Anyone able to inspect or compromise the browser profile or application can access browser-held keys. Use limited keys on trusted devices; do not put a shared organization secret in a public bundle. A credential echoed verbatim by a misconfigured endpoint is redacted before entering project text.

## Local servers and CORS

The endpoint must permit the app origin in its CORS policy. A static website cannot override a server's CORS policy or a browser's local-network permissions. There is no public relay.

For LM Studio, enable CORS in server settings, or run `lms server start --cors`. Keep the server bound to loopback and use server authentication where appropriate. See the [official CLI documentation](https://lmstudio.ai/docs/cli/serve/server-start).

For Ollama, set `OLLAMA_ORIGINS=https://storied.alecakin.com` in the Ollama process environment and restart it. For localhost development, use the exact printed app origin instead. Keep the default loopback binding; do not broaden to all interfaces merely to connect from a browser. See [Ollama's CORS FAQ](https://docs.ollama.com/faq#how-can-i-allow-additional-web-origins-to-access-ollama) and [OpenAI compatibility](https://docs.ollama.com/api/openai-compatibility).

Chromium may request permission to access local-network devices. Some browsers or enterprise policies block HTTPS-page-to-localhost requests. Anthropic requests include the required direct-browser header; some organization policies still prohibit browser access. In these cases, configure an endpoint you operate that permits the app origin, or run Storied locally with appropriate server settings. Error messages identify the browser/API boundary rather than silently routing through another service.

## Output and verification

Version 0.3.1 adds **Output limit** with Automatic, Provider default, and Custom modes. Automatic omits token-limit parameters for OpenAI's exact `chat-latest` ID and IDs ending in `-chat-latest`, accommodating the reported incompatibility without replaying a rejected request. Other models retain the configured limit (initially 2,048). Existing v0.3 profiles gain Automatic mode on load. **Provider default — omit limit** works with Responses and Chat Completions for any compatible endpoint; neither `max_tokens` nor `max_output_tokens` is serialized. The provider then controls maximum response length and usage. **Custom token limit** explicitly sends the chosen value. Anthropic Messages requires a limit, so omission is disabled for that protocol. These controls apply to both generation and extraction.

The [official chat-latest page](https://developers.openai.com/api/docs/models/chat-latest) describes an evolving alias; its public page does not establish every parameter restriction. The omission policy above is an application compatibility choice based on the user's observed error, not a claim that all Chat Latest snapshots reject the same parameters. Actual paid-account inference has not been tested here.

The default extraction mode includes JSON instructions and then applies Storied's existing strict schema/reference validation. Optional native JSON-object/JSON-schema modes require model support; errors remain visible. Increase the output budget for reasoning models that otherwise return no text. Refusals, tool-only results, empty output, non-JSON HTTP responses, and responses larger than 2 MiB fail without committing canon. Only normal text output blocks are consumed; reasoning/tool blocks are ignored.

Protocol tests use synthetic keys and controlled responses and do not spend provider credits. They verify request formats, endpoint restrictions, explicit opt-in, context exclusion, key storage/export separation, and human canon review. They do **not** establish live paid-account compatibility, inference quality, billing, or CORS policy for every provider/account. The separate existing hardware test exercises real WebLLM/MiniLM offline inference.

Primary protocol references consulted on 2026-09-05: [OpenAI text generation](https://developers.openai.com/api/docs/guides/text), [Anthropic Messages](https://platform.claude.com/docs/en/api/messages/create), [OpenRouter](https://openrouter.ai/docs/quickstart), [Venice](https://docs.venice.ai/api-reference/endpoint/chat/completions), and the local-server references above.
