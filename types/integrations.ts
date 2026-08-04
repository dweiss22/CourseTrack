export interface MappingField { source: string; target: string; required: boolean; readOnly: boolean; transformation: string | null; }
export interface IntegrationMappingSummary {
  uploaded: {
    sourceFilename: string | null; importedAt: string | null; status: string | null;
    mappings: MappingField[]; ignoredFields: string[]; unmappedRawFields: string[];
    warnings: number; validationErrors: number; provenance: "Uploaded";
  };
  wrike: {
    mappings: MappingField[]; ignoredFields: string[]; approvedFolders: string[];
    taskCount: number; contactCount: number; folderCount: number;
    lastRunStatus: string | null; lastRunAt: string | null; currentRun: boolean;
    warnings: string[]; provenance: "Read-only Wrike GET";
  };
  lms: {
    status: "Not connected" | "Connected"; mappings: MappingField[];
    lastRetrievedAt: string | null; warnings: string[]; provenance: "Connected via LMS API" | null;
  };
}
