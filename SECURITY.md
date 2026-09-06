# Security policy

The current MVP development branch is the supported version. Security fixes may require updating the static application; export projects before updating between incompatible major versions.

Use the repository’s **Security → Advisories → Report a vulnerability** flow when available. Otherwise request a private maintainer contact without posting exploit details or real project content in a public issue. Please include the affected version, browser/OS, a minimal disposable reproduction, impact, and any proposed fix. Never attach a private storyworld merely to demonstrate a bug.

Particularly relevant reports include content leaving the device, execution through project/Markdown/image imports, context leaks from private author data into a viewpoint, unsafe model asset selection, persistence loss, and cross-project/branch disclosure.

The local-first design does not encrypt the browser profile or protect against a compromised device, extension, or modified app distribution. Optional provider keys are browser-held credentials; persistent storage is unencrypted and opt-in. Explicitly chosen inference connections send context to their endpoints. Unexpected transmission, credential leakage, silent fallback, and imported endpoint activation are relevant security reports. Context exclusion does not guarantee that a language model cannot guess a fictional fact independently. See [privacy architecture](docs/PRIVACY.md).

Do not test against other people’s projects. Prefer the original demo world and synthetic markers. Maintainers will acknowledge reports as availability permits; no guaranteed response-time SLA is offered for this volunteer project.
