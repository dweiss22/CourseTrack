begin;

update public.verticals
set slug = 'p1a', name = 'Police1 Academy', sort_order = 1
where slug = 'law-enforcement';

update public.verticals
set slug = 'fr1a', name = 'FireRescue1 Academy', sort_order = 2
where slug = 'fire-and-rescue';

update public.verticals
set slug = 'c1a', name = 'Corrections1 Academy', sort_order = 3
where slug = 'corrections';

update public.verticals
set slug = 'ems1', name = 'EMS1 Academy', sort_order = 4
where slug = 'emergency-medical-services';

update public.verticals
set slug = 'd1a', name = 'Dispatch1 Academy', sort_order = 5
where slug = 'dispatch-and-telecommunications';

update public.verticals
set slug = 'lgu', name = 'Local Government University', sort_order = 6
where slug = 'local-government';

update public.verticals
set slug = 'lexipol', name = 'Internal employee LMS', sort_order = 7
where slug = 'cross-vertical';

update public.verticals
set name = 'Course content for the Wellness app', sort_order = 8
where slug = 'wellness';

commit;
