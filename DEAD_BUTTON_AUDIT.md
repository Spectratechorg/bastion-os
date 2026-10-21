# Button and action audit

| Page | Control | What it does |
| --- | --- | --- |
| Shell | Search / Ctrl K | Jumps to a page by name, or searches guards |
| Shell | Bell, sidebar Alerts badge | Live unacknowledged alert count, opens Alerts |
| Shell | Sign out | Ends the session |
| Overview | Refresh, site picker, Acknowledge, links | GET/PATCH `/api/operations`, `/api/patrols`, `/api/payroll` |
| Guards | Register guard | Page with photo, NIN, salary, site; POST `/api/operations`; issues NFC token |
| Guards | Edit, Reissue NFC, Suspend/Reactivate, Export | PATCH `/api/operations`, GET `/api/export` |
| Sites | Add/Edit site, use my location, Deactivate, map | POST/PATCH `/api/operations` |
| Attendance | Approve, Flag, filters, Export | PATCH `/api/operations` |
| Patrols | Date picker, Refresh, Export, Open guard app | GET `/api/patrols` |
| Incidents | Report, Details/comment, Assign, Escalate, Resolve | POST/PATCH `/api/operations` |
| Alerts | Acknowledge, filters | PATCH `/api/operations` |
| Clients | Assign client to site | PATCH `/api/operations` (site.clientName) |
| Finance | Month picker, Recalculate, Paid checkbox (moderators), Export | GET/PATCH `/api/payroll` |
| Reports | Download CSV (7 sections) | GET `/api/export` |
| Settings | Activity log | GET `/api/operations?section=activity` |
| Guard app | Scan check-in, scan checkpoint, tag-code entry, SOS | POST `/api/guard/scan` |
