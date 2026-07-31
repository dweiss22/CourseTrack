"use client";

import {
  AlertTriangle,
  Check,
  FileSpreadsheet,
  ListChecks,
  Network,
  ShieldCheck,
} from "lucide-react";
import { useState } from "react";
import { sampleImportPreviews } from "@/lib/sample-data";
import { StatusBadge } from "../status-badge";

type ImportSource = "Content Metadata" | "Topics" | "Monitoring list";

function PreviewMetric({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: number | string;
  tone?: "neutral" | "success" | "warning" | "danger" | "info";
}) {
  return (
    <div className={`preview-metric preview-${tone}`}>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

export function ImportPreview() {
  const [source, setSource] = useState<ImportSource>("Content Metadata");
  const [reviewed, setReviewed] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const content = sampleImportPreviews.contentMetadata;
  const topics = sampleImportPreviews.topics;
  const monitoring = sampleImportPreviews.monitoring;

  const changeSource = (nextSource: ImportSource) => {
    setSource(nextSource);
    setReviewed(false);
    setConfirmed(false);
  };

  return (
    <div className="import-preview-workspace">
      <div className="panel-heading">
        <div>
          <h2>Import preview</h2>
          <p>Validate source files before any confirmed import changes CourseTrack.</p>
        </div>
        <StatusBadge tone="sample">Deterministic fixture</StatusBadge>
      </div>

      <div className="import-source-tabs" role="tablist" aria-label="Import source previews">
        {(["Content Metadata", "Topics", "Monitoring list"] as const).map((item) => (
          <button
            key={item}
            role="tab"
            aria-selected={source === item}
            className={source === item ? "active" : ""}
            onClick={() => changeSource(item)}
          >
            {item === "Content Metadata" ? <FileSpreadsheet size={16} /> : item === "Topics" ? <Network size={16} /> : <ListChecks size={16} />}
            {item}
          </button>
        ))}
      </div>

      {source === "Content Metadata" && (
        <>
          <div className="import-contract-banner">
            <FileSpreadsheet size={20} />
            <span>
              <strong>Course Metadata.xlsx contract</strong>
              17 recognized columns · Course ID matching only · configurable aliases retained
            </span>
          </div>
          <div className="preview-metric-grid">
            <PreviewMetric label="Matched LMS courses" value={content.matchedLmsCourses} tone="success" />
            <PreviewMetric label="Metadata-only records" value={content.contentMetadataOnlyRecords} tone="warning" />
            <PreviewMetric label="LMS courses missing metadata" value={content.lmsCoursesMissingMetadata} tone="warning" />
            <PreviewMetric label="Duplicate Course IDs" value={content.duplicateCourseIds} tone="danger" />
            <PreviewMetric label="Missing Course IDs" value={content.missingCourseIds} tone="danger" />
            <PreviewMetric label="Invalid verticals" value={content.invalidVerticals} tone="danger" />
            <PreviewMetric label="Invalid URLs" value={content.invalidUrls} tone="danger" />
            <PreviewMetric label="Missing relationship targets" value={content.missingRelationshipTargets} tone="warning" />
            <PreviewMetric label="Circular relationships" value={content.circularRelationships} tone="danger" />
            <PreviewMetric label="Overlapping-field conflicts" value={content.overlappingFieldConflicts} tone="warning" />
            <PreviewMetric label="Fields added" value={content.fieldsWouldBeAdded} tone="info" />
            <PreviewMetric label="Fields unchanged" value={content.fieldsUnchanged} />
            <PreviewMetric label="Rows blocked" value={content.rowsBlocked} tone="danger" />
          </div>
        </>
      )}

      {source === "Topics" && (
        <>
          <div className="import-contract-banner">
            <Network size={20} />
            <span>
              <strong>Topics.xlsx wide assignment matrix</strong>
              99 real topic columns · whitespace normalized · many-to-many assignments preserved
            </span>
          </div>
          <div className="preview-metric-grid">
            <PreviewMetric label="Topics" value={topics.topicCount} tone="info" />
            <PreviewMetric label="Assignments" value={topics.assignmentCount.toLocaleString()} tone="success" />
            <PreviewMetric label="Unique Course IDs" value={topics.uniqueCourseIdCount.toLocaleString()} />
            <PreviewMetric label="Duplicate assignments" value={topics.duplicateAssignments} tone="warning" />
            <PreviewMetric label="Unknown Course IDs" value={topics.unknownCourseIds} tone="danger" />
            <PreviewMetric label="Empty topics" value={topics.emptyTopics} tone="warning" />
            <PreviewMetric label="Topic labels normalized" value={topics.normalizedTopicNames} tone="info" />
          </div>
        </>
      )}

      {source === "Monitoring list" && (
        <>
          <div className="import-contract-banner">
            <ListChecks size={20} />
            <span>
              <strong>{monitoring.fixtureLabel}</strong>
              No production columns are assumed; administrators map supplied columns during preview.
            </span>
          </div>
          <div className="preview-metric-grid">
            <PreviewMetric label="Fixture rows" value={monitoring.rows} />
            <PreviewMetric label="Monitoring enabled" value={monitoring.enabled} tone="success" />
            <PreviewMetric label="Excluded" value={monitoring.excluded} tone="neutral" />
          </div>
        </>
      )}

      <div className="readonly-callout">
        <ShieldCheck size={18} />
        <span>
          <strong>Preview first, confirm second</strong>
          Duplicate identifiers, missing identifiers, and blocked rows are never imported automatically. LMS snapshots remain read-only.
        </span>
      </div>

      {confirmed ? (
        <div className="inline-alert alert-success">
          <Check size={17} />
          <span>
            <strong>Sample preview confirmed</strong>
            The confirmation workflow completed without modifying the example workbooks or a live database.
          </span>
        </div>
      ) : (
        <div className="preview-confirmation-row">
          <label>
            <input
              type="checkbox"
              checked={reviewed}
              onChange={(event) => setReviewed(event.target.checked)}
            />
            I reviewed the validation errors and source changes in this preview.
          </label>
          <button
            className="button button-primary"
            disabled={!reviewed}
            onClick={() => setConfirmed(true)}
          >
            <Check size={16} /> Confirm sample preview
          </button>
        </div>
      )}

      <div className="preview-blocked-note">
        <AlertTriangle size={15} />
        Live import execution remains disabled until a real file is selected, its preview passes validation, and an authorized user confirms it.
      </div>
    </div>
  );
}
