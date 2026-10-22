# Security policy

## Reporting a vulnerability

Please do **not** report a security problem in a public issue, pull request or
forum post.

Report it privately through GitHub instead: open the **Security** tab of this
repository, then **Report a vulnerability**.

No such button? Private reporting is not enabled yet: open an issue that only
asks the maintainers for a private contact, without any detail of the problem,
and send the report there.

Include, when you can:

- the version of the integration and of Gladys;
- what an attacker can do, and the steps to reproduce it;
- the log lines that help (remove tokens, passwords and addresses first).

The fix ships as a new version of the integration, and the advisory is
published once users can update.

## Supported versions

Only the latest release receives security fixes: update the integration from
Gladys before reporting a problem.

## Scope

In scope: the code of this repository and the Docker image it publishes.

What the integration handles:

- **Secrets**: the Komga API key (or, for servers older than 1.12, the
  password of the account) is a `secret` field of the Gladys configuration.
  The integration reads it from Gladys at startup, keeps it in memory, and
  sends it only to the configured server, in the `X-API-Key` header (or the
  `Authorization` header, HTTP Basic). It is never written to `/data` or to
  the logs, and never part of a URL nor of an error message.
- **Stored in `/data`**: `komga-state.json`, the server address, the id of
  the Komga account, the newest series, book and reading times seen with the
  ids of that second, and the book count of the series already read to the
  end, so a restart announces nothing twice. Nothing else.
- **Privacy**: the titles and the e-mail of the account only appear in the
  device parameters and, for the titles, in the logs at the debug level
  (`LOG_LEVEL=debug`).
- **Network**: requests go only to the Komga address typed in the
  configuration, in HTTP or HTTPS (certificates verified), including its event
  stream (`/sse/v1/events`). The covers shown by the widgets are read from this
  server, never from elsewhere. The integration opens no port and calls no
  other service. It only reads, and asks Komga to scan its libraries: it never
  deletes nor changes anything.

Out of scope: Gladys Assistant itself (see its
[security policy](https://github.com/GladysAssistant/Gladys/security/policy)),
Komga itself, and the other devices and services of your network.
