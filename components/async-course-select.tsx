"use client";

import { Search } from "lucide-react";
import { useEffect, useId, useState } from "react";
import type { CourseIndexEntry } from "@/db";

export function AsyncCourseSelect({ name = "courseId", label = "Course", defaultCourse, disabled = false }: { name?: string; label?: string; defaultCourse?: CourseIndexEntry | null; disabled?: boolean }) {
  const listId = useId();
  const [query, setQuery] = useState(defaultCourse ? `${defaultCourse.courseCode} — ${defaultCourse.title}` : "");
  const [selected, setSelected] = useState<CourseIndexEntry | null>(defaultCourse ?? null);
  const [items, setItems] = useState<CourseIndexEntry[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const search = query.trim();
    if (disabled || selected || search.length < 2) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/courses/search?q=${encodeURIComponent(search)}`, { signal: controller.signal });
        const result = await response.json() as { items?: CourseIndexEntry[] };
        setItems(response.ok ? result.items ?? [] : []);
      } catch (error) { if ((error as { name?: string }).name !== "AbortError") setItems([]); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }, 200);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [disabled, query, selected]);

  return <label className="async-course-select">{label}<span><Search size={15} /><input value={query} disabled={disabled} required onChange={(event) => { setQuery(event.target.value); setSelected(null); if (event.target.value.trim().length < 2) setItems([]); }} role="combobox" aria-autocomplete="list" aria-expanded={items.length > 0} aria-controls={listId} placeholder="Search by course name, code, or LMS ID" />{loading && <small>Searching…</small>}</span><input type="hidden" name={name} value={selected?.id ?? ""} />{items.length > 0 && <ul id={listId} role="listbox">{items.map((course) => <li key={course.id}><button type="button" onClick={() => { setSelected(course); setQuery(`${course.courseCode} — ${course.title}`); setItems([]); }}><strong>{course.title}</strong><small>{course.courseCode} · {course.verticals.join(", ") || "No vertical"}</small></button></li>)}</ul>}</label>;
}
