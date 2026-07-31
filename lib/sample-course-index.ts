import courseIndexJson from "@/lib/generated/mock-course-index.json";

export type SampleCourseIndexEntry = {
  id: string;
  title: string;
  courseCode: string;
  primaryVertical: string;
};

export const sampleCourseIndex = courseIndexJson as SampleCourseIndexEntry[];
export const sampleCourseCount = sampleCourseIndex.length;
