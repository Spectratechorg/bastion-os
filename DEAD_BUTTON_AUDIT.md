# Six-page interaction audit

| Page | Interactive element | Backing action |
| --- | --- | --- |
| Overview | Workspace cards | Route to the live Guards, Sites, Attendance, or Incidents page |
| Guards | Search, refresh, export | Client filtering; GET `/api/operations`; GET `/api/export?section=guards` |
| Guards | Add guard, suspend/reactivate | POST/PATCH `/api/operations` |
| Sites | Search, refresh, export | Client filtering; GET `/api/operations`; GET `/api/export?section=sites` |
| Sites | Add site | POST `/api/operations` |
| Attendance | Search, refresh, export, approve | GET/PATCH `/api/operations`; GET `/api/export?section=attendance` |
| Patrols | Search, refresh, export | GET `/api/operations`; GET `/api/export?section=patrols` |
| Incidents | Search, refresh, export, add, resolve | GET/POST/PATCH `/api/operations`; GET `/api/export?section=incidents` |

Every listed control is wired to a route or API operation. Patrol creation remains exclusively with the guard scan flow.
