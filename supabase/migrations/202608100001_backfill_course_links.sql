begin;

-- The original metadata import predates the dedicated projection columns.
-- Fill only missing Uploaded values. Never replace a populated value or a
-- field that a CourseTrack user has explicitly overridden.
with current_metadata as (
  select distinct on (record.course_id)
    record.course_id,
    nullif(btrim(record.normalized_payload->>'backendLink'), '') as backend_link,
    nullif(btrim(record.normalized_payload->>'frontendLink'), '') as frontend_link
  from public.content_metadata_records record
  where record.course_id is not null
    and record.is_current
    and record.is_importable
  order by record.course_id, record.created_at desc, record.id desc
)
update public.courses course
set
  backend_link = case
    when nullif(btrim(course.backend_link), '') is null
      and lower(coalesce(course.field_provenance->>'backendLink', '')) <> 'coursetrack'
      then metadata.backend_link
    else course.backend_link
  end,
  frontend_link = case
    when nullif(btrim(course.frontend_link), '') is null
      and lower(coalesce(course.field_provenance->>'frontendLink', '')) <> 'coursetrack'
      then metadata.frontend_link
    else course.frontend_link
  end
from current_metadata metadata
where metadata.course_id = course.id
  and (
    (
      metadata.backend_link is not null
      and nullif(btrim(course.backend_link), '') is null
      and lower(coalesce(course.field_provenance->>'backendLink', '')) <> 'coursetrack'
    )
    or (
      metadata.frontend_link is not null
      and nullif(btrim(course.frontend_link), '') is null
      and lower(coalesce(course.field_provenance->>'frontendLink', '')) <> 'coursetrack'
    )
  );

-- Reconcile metadata-only comparison rows with the newly populated projection.
select public.refresh_all_course_comparisons();

-- Fail the migration if any eligible source link was not projected.
do $$
begin
  if exists (
    select 1
    from public.content_metadata_records metadata
    join public.courses course on course.id = metadata.course_id
    where metadata.is_current
      and metadata.is_importable
      and (
        (
          nullif(btrim(metadata.normalized_payload->>'backendLink'), '') is not null
          and nullif(btrim(course.backend_link), '') is null
          and lower(coalesce(course.field_provenance->>'backendLink', '')) <> 'coursetrack'
        )
        or (
          nullif(btrim(metadata.normalized_payload->>'frontendLink'), '') is not null
          and nullif(btrim(course.frontend_link), '') is null
          and lower(coalesce(course.field_provenance->>'frontendLink', '')) <> 'coursetrack'
        )
      )
  ) then
    raise exception 'Eligible course link backfill rows remain missing.';
  end if;
end $$;

commit;
