import Link from "next/link";
import { SearchX } from "lucide-react";

export default function NotFound() {
  return (
    <div className="empty-state not-found-state">
      <SearchX size={32} />
      <h1>Record not found</h1>
      <p>The requested CourseTrack record may have moved or is not available.</p>
      <Link href="/courses" className="button button-primary">
        Return to Course Library
      </Link>
    </div>
  );
}
