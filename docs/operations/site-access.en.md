# Demo entry and restricted access operations

[日本語](site-access.md)

`http://localhost:<port>/` offers municipality and university demos, linking to `lg.localhost` and `univ.localhost` on the same port. Existing registered production hosts and fallback behavior for preview or unknown hosts remain unchanged. General subpages on localhost return to the entry page. Existing admin URLs and authentication remain in place.

## Settings and browsing

In Maintenance, save the independent Restricted access section below the existing maintenance form. The environment (Development / Preview / Production) follows the existing Host-based environment resolver and cannot be selected in the payload.

- Shared, municipality and university scopes are independent. Shared restriction protects the entry. Either shared or sector restriction protects that sector; a public sector setting does not override shared restriction.
- An enabled shared code works for both sectors. An enabled sector code works only for that sector. During shared restriction, the entry also accepts an enabled sector code, without granting access to the other sector.
- Codes contain 8–64 ASCII letters or digits and are case-sensitive. Initial activation requires a code. Leave it blank to keep an existing code. Plaintext cannot be retrieved.
- Sessions default to one day (24 hours) from authentication. Any positive integer day count representable as a timestamp is accepted. Browser storage limits may require earlier re-entry.
- Entry and each sector require their own initial code entry. Cookies are host-only; there is no cross-host single sign-on.
- Every settings save advances the scope's revision and invalidates sessions issued for that scope, including visibility, duration and code changes. Other scopes remain valid.
- VIEW grants reading; UPDATE grants changes. Shared scope requires access to both sectors. Conflicts preserve input: review it before reloading.

Existing maintenance applies after access verification. A valid code cannot bypass maintenance. The neutral entry does not inherit municipal maintenance.

## Intake and access boundaries

Restricted external intake returns 503 `SITE_RESTRICTED` before storage, enqueueing or provider calls, regardless of API keys or browsing cookies. Admin operations with existing authentication and permissions remain available. Intake resumes when restrictions are lifted; webhook retries or recovery and cancellation of previously accepted operations are not guaranteed.

| Route | Classification and scope |
| --- | --- |
| `/admin`, `/admin/**`, `/api/admin/**` | Existing admin authentication and permissions |
| `/api/auth/**`, `/api/account/change-password`, `/api/password-reset-requests`, legacy login redirects | Admin authentication flow |
| `/access`, `POST /api/site-access/verify` | Access bootstrap with Origin, input and attempt checks |
| `/api/public/v1/**` | Municipal external reservation API |
| `/api/disaster-radio-subscriptions`, `/api/municipal-notification-registrations` | Municipal external registrations |
| `/api/zaad/municipal/**`, `/api/internal/zaad/municipal/**` | Municipal webhooks and processing intake |
| `/api/zaad/provider-events`, `/api/university-notification-registrations` | University external intake |
| GET/HEAD `/api/municipal-notification-options`, `/api/university-notification-options` | Sector-specific browsing helpers, protected even with another Host |
| GET `/api/public/consultation-availability` | Browsing helper for the Host's sector |
| `/api/docs-md/**`, pages, RSC, documents, sitemap | Browsing protection; no generic extension bypass |
| Other APIs and webhooks | Unknown-scope intake: 503 while any scope is restricted |
| `/_next/static/**`, development HMR, theme-init, explicit favicons, robots, health | Narrow infrastructure allowlist; optimizer exemption covers allowed favicons only |

Unauthenticated HTML navigation redirects to access verification with 307; RSC, POST and documents return 401. Restricted responses use private/no-store or equivalent no-store and retain noindex. Missing/invalid settings or database read failures return 503. Attempts share a database counter, limited to 10 per 15-minute window. Only Vercel's verified forwarding header is trusted in Vercel; elsewhere a shared bucket is used instead of arbitrary forwarding headers.

## Database, releases and recovery

Migration `20260912090000_add_site_access_control` seeds all three scopes in all three environments as public, one day, revision 1. It leaves maintenance rows unchanged and adds `site_access_settings`, `site_access_sessions`, `site_access_attempts` and `site_access_audits`. Codes use salted scrypt. Only SHA-256 digests of random 256-bit session tokens are stored. Audits contain scope, environment, revision, actor and time. Authentication removes at most 100 expired sessions and attempts each.

Apply the additive migration through the normal approved release process before exposing the new application. Use a read/write database endpoint. This change itself does not execute Production migrations or deployments. Existing deployment smoke that requires public HTML 200 does not accept restricted 307/401 responses; establish the intended public settings and expected responses before release validation.

Lift restrictions through the admin settings. Restore the database before retrying after a database outage. Before rollback, make all scopes public or block external access separately, since the old application has no access gate. Preserve the additional tables rather than dropping them immediately. Downloaded content and static JavaScript cannot be treated as confidential storage.
