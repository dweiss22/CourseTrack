import { LoaderCircle } from "lucide-react";

export default function CourseLibraryLoading() {
  return (
    <div className="page-stack">
      <section className="page-heading">
        <div>
          <span className="eyebrow">Primary workspace</span>
          <h1>Course Library</h1>
          <p>
            Search, filter, and review the full course portfolio with clear data
            provenance.
          </p>
        </div>
      </section>

      <section className="panel library-panel" aria-busy="true" aria-live="polite">
        <div className="result-summary">
          <span className="loading-summary">
            <LoaderCircle size={16} className="spin" aria-hidden="true" />
            Loading course library…
          </span>
        </div>
        <div className="table-scroll">
          <table className="data-table course-table">
            <tbody>
              {Array.from({ length: 10 }).map((_, index) => (
                <tr key={index} className="skeleton-row">
                  <td colSpan={8}>
                    <div className="skeleton-bar" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
