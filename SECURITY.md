# Security policy

## Project status

UTSAV AI is a local-first hackathon prototype. It has no hosted production service, account system, or server-side planning database. The Node server is an optional stateless API proxy and static file server. Do not assume that a deployment, TLS configuration, or platform hardening described in the documentation has occurred.

## Supported versions

| Version | Supported |
| --- | --- |
| `main` branch | Yes — fixes are made on `main` |
| Older commits, forks, and modified copies | No |

There are no tagged releases or long-term support branches. Package version `0.1.0` identifies the current source snapshot, not a supported distribution.

## Reporting a vulnerability

Please **do not open a public issue** for a suspected vulnerability.

1. Use GitHub's private vulnerability reporting from the repository's **Security** tab: [Report a vulnerability](https://github.com/siddhant19saraf-spec/utsav-ai/security/advisories/new).
2. If private reporting is unavailable, open a minimal public issue that contains **no vulnerability details, secrets, or personal data**, and ask for a private channel.

Include:

- the affected area and, if known, the commit;
- reproduction steps using synthetic or bundled sample data;
- the observed impact and any preconditions;
- a safe proof of concept or log excerpt, with credentials and personal data removed;
- a suggested fix, if you have one.

**Never include** real API keys, `.env` contents, access tokens, guest names, guest notes, dietary or accessibility details, exported workspace files, or other private planning data in a report, issue, screenshot, or pull request. Rotate any credential that may have been exposed.

## What to expect

This is a single-maintainer prototype without a bug bounty program or a guaranteed response time. Reports are reviewed on a best-effort basis. Valid issues are fixed on `main`; a public disclosure should be coordinated after a fix or mitigation is available. No confidentiality or payment terms are implied beyond GitHub's private advisory workflow.

## In scope

- the React application and browser storage boundary;
- deterministic budget, rescue, risk, timeline, task, guest, and catering logic;
- the Node HTTP server, provider proxy, static serving, rate limiting, and request handling;
- shared validation contracts between browser and server;
- CI configuration and repository automation;
- documentation that could cause a user to expose credentials or private data.

## Out of scope

- vulnerabilities in a third-party AI provider, hosting platform, browser, or dependency that are not caused by this repository's integration code — report those upstream;
- denial-of-service, spam, or resource-exhaustion testing against systems you do not own;
- social engineering, physical access, or attacks requiring control of the user's machine or browser profile;
- access to `localStorage` by someone who already controls the same browser profile; the app does not encrypt local storage or provide authentication;
- missing features that are documented as out of scope, such as accounts, cloud sync, multi-user isolation, payments, or vendor integrations.

Tests and reports must use synthetic data and must not make paid provider calls, send real guest information, or attempt to disrupt a service. Act in good faith and avoid privacy violations, data destruction, or service interruption.

## Security-relevant design notes

The repository documents its trust boundaries and known limitations in the [README](README.md) and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Notably:

- provider credentials are read only from server environment variables;
- browser code calls only relative `/api` endpoints, never a provider directly;
- AI context excludes guest records and other events;
- approvals revalidate and persist before in-memory state changes;
- no Content-Security-Policy, application authentication, or encrypted local storage is implemented;
- the prepared deployment would rely on the hosting platform for HTTPS, and that deployment has not occurred.
