export type HealthResponse = {
  status: string;
  jiraConfigured: boolean;
  defaultProject: string;
  codexConfigured: boolean;
  codexBin: string;
  port: number;
};

export type AppConfig = {
  jiraBaseUrl: string;
  jiraProject: string;
  jiraTokenSaved: boolean;
  codexBin: string;
  codexModel: string;
  port: number;
  cacheDir: string;
  configPath: string;
};

export type UpdateAppConfig = {
  jiraBaseUrl: string;
  jiraProject: string;
  jiraToken?: string;
  codexBin: string;
  codexModel: string;
  port: number;
  cacheDir: string;
};

export type ProjectSearchRequest = {
  query: string;
  jiraBaseUrl?: string;
  jiraToken?: string;
};

export type ProjectSearchResult = {
  id?: string;
  key: string;
  name: string;
  projectTypeKey?: string;
  leadName?: string;
  avatarUrl?: string;
};

export type ProjectSearchResponse = {
  projects: ProjectSearchResult[];
};

export type SyncJobLog = {
  time: string;
  stage: string;
  message: string;
  percent: number;
};

export type SyncJob = {
  id: string;
  project: string;
  state: "queued" | "running" | "succeeded" | "failed";
  stage: string;
  message: string;
  percent: number;
  pulled: number;
  total: number;
  issueCount: number;
  startedAt: string;
  updatedAt: string;
  finishedAt?: string;
  error?: string;
  logs: SyncJobLog[];
};

export type Issue = {
  id: string;
  key: string;
  url: string;
  summary: string;
  description?: string;
  issueType: string;
  status: string;
  priority?: string;
  assignee?: string;
  reporter?: string;
  parentKey?: string;
  epicKey?: string;
  epicName?: string;
  storyPoints?: number;
  labels?: string[];
  components?: string[];
  fixVersions?: string[];
  sprints?: string[];
  created?: string;
  updated?: string;
};

export type Snapshot = {
  project: string;
  baseUrl: string;
  pulledAt: string;
  issueCount: number;
  issues: Issue[];
};

export type BoardAnalysis = {
  project: string;
  generatedAt: string;
  visionSummary: string;
  health: {
    score: number;
    alignment: string;
    risks: string[];
    nextMoves: string[];
    confidence: number;
  };
  bigRocks: BigRock[];
  outliers: Outlier[];
  metrics: {
    totalIssues: number;
    analyzedIssues: number;
    bigRockCount: number;
    smallRockCount: number;
    outlierCount: number;
    statusCounts: CountBucket[];
    issueTypeCounts: CountBucket[];
    unassignedCount: number;
    withoutEpicCount: number;
    lastJiraPullIso8601: string;
  };
  signals: Signal[];
  board: {
    nodes: BoardNode[];
    edges: BoardEdge[];
  };
  model: {
    provider: string;
    model?: string;
  };
};

export type CountBucket = {
  name: string;
  value: number;
};

export type BigRock = {
  id: string;
  title: string;
  rationale: string;
  status: string;
  owner?: string;
  themes: string[];
  issueKeys: string[];
  smallRocks: SmallRock[];
  confidence: number;
  alignment: string;
  recommended?: string;
};

export type SmallRock = {
  id: string;
  title: string;
  issueKeys: string[];
  status: string;
  owner?: string;
  whyItFits: string;
  confidence: number;
};

export type Outlier = {
  issueKey: string;
  title: string;
  reason: string;
  recommendedFit?: string;
  severity: "low" | "medium" | "high";
  confidence: number;
};

export type Signal = {
  kind: string;
  title: string;
  detail: string;
  evidence: string[];
};

export type BoardNode = {
  id: string;
  label: string;
  kind: string;
  status?: string;
  issueKeys?: string[];
  score?: number;
};

export type BoardEdge = {
  id: string;
  source: string;
  target: string;
  label?: string;
};
