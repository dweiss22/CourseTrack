# LMS connector

The LMS boundary is read-only and permits GET operations only. CourseTrack does not create, edit, publish, archive, enroll, assign, or delete LMS data.
The connector does not infer version changes; version history remains a CourseTrack app-owned ledger.

Until real endpoint, authentication, pagination, and payload contracts are configured, `/api/lms/retrieve` returns `503 lms_not_connected`. The course Refresh action remains visible and disabled with an explanatory accessible tooltip. No synthetic responses or outage simulations are used at runtime.

When configured, every response is stored as an immutable snapshot and its projected fields use provenance `lms_api`, displayed as **Connected via LMS API**. Those fields cannot be mutated through application or database workflows. A failed retrieval preserves the last successful snapshot and writes an immutable retrieval-run entry.
