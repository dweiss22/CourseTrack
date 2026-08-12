begin;

-- Enforce "at most one Wrike sync in flight" in the database rather than in
-- application code.
--
-- The repository previously selected for a running row and then inserted a new
-- one. That is a time-of-check-to-time-of-use race: two callers -- a scheduled
-- trigger and an admin clicking "Run sync now", or a duplicated scheduled
-- delivery -- can both observe no running row and both insert. The concurrent
-- runs then race while upserting and deactivating the same task rows, and the
-- loser's stale view can wrongly mark live tasks inactive.
--
-- A partial unique index makes the exclusion atomic: the second insert fails
-- with a unique violation (SQLSTATE 23505), which the repository translates
-- into the same "already running" conflict it previously raised itself.

-- Defensive: an index creation would fail if more than one run were already
-- marked running. Retire every such row but the newest before adding it. This
-- is a no-op on a healthy database.
with ranked as (
  select id, row_number() over (order by started_at desc, id desc) as position
  from public.wrike_sync_runs
  where status = 'running'
)
update public.wrike_sync_runs run
set
  status = 'failed',
  completed_at = coalesce(run.completed_at, now()),
  errors = '[{"folderId": null, "folderName": null, "error": "Superseded run retired when single-run exclusion was introduced."}]'::jsonb
from ranked
where run.id = ranked.id
  and ranked.position > 1;

create unique index if not exists wrike_sync_runs_single_active_idx
  on public.wrike_sync_runs ((status))
  where status = 'running';

commit;
