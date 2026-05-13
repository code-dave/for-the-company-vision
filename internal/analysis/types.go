package analysis

import "time"

type BoardAnalysis struct {
	Project       string      `json:"project"`
	GeneratedAt   time.Time   `json:"generatedAt"`
	VisionSummary string      `json:"visionSummary"`
	Health        Health      `json:"health"`
	BigRocks      []BigRock   `json:"bigRocks"`
	Outliers      []Outlier   `json:"outliers"`
	Metrics       Metrics     `json:"metrics"`
	Signals       []Signal    `json:"signals"`
	Board         BoardGraph  `json:"board"`
	Model         ModelSource `json:"model"`
}

type Health struct {
	Score      int      `json:"score"`
	Alignment  string   `json:"alignment"`
	Risks      []string `json:"risks"`
	NextMoves  []string `json:"nextMoves"`
	Confidence float64  `json:"confidence"`
}

type BigRock struct {
	ID          string      `json:"id"`
	Title       string      `json:"title"`
	Rationale   string      `json:"rationale"`
	Status      string      `json:"status"`
	Owner       string      `json:"owner,omitempty"`
	Themes      []string    `json:"themes"`
	IssueKeys   []string    `json:"issueKeys"`
	SmallRocks  []SmallRock `json:"smallRocks"`
	Confidence  float64     `json:"confidence"`
	Alignment   string      `json:"alignment"`
	Recommended string      `json:"recommended,omitempty"`
}

type SmallRock struct {
	ID         string   `json:"id"`
	Title      string   `json:"title"`
	IssueKeys  []string `json:"issueKeys"`
	Status     string   `json:"status"`
	Owner      string   `json:"owner,omitempty"`
	WhyItFits  string   `json:"whyItFits"`
	Confidence float64  `json:"confidence"`
}

type Outlier struct {
	IssueKey       string  `json:"issueKey"`
	Title          string  `json:"title"`
	Reason         string  `json:"reason"`
	RecommendedFit string  `json:"recommendedFit,omitempty"`
	Severity       string  `json:"severity"`
	Confidence     float64 `json:"confidence"`
}

type Metrics struct {
	TotalIssues         int           `json:"totalIssues"`
	AnalyzedIssues      int           `json:"analyzedIssues"`
	BigRockCount        int           `json:"bigRockCount"`
	SmallRockCount      int           `json:"smallRockCount"`
	OutlierCount        int           `json:"outlierCount"`
	StatusCounts        []CountBucket `json:"statusCounts"`
	IssueTypeCounts     []CountBucket `json:"issueTypeCounts"`
	UnassignedCount     int           `json:"unassignedCount"`
	WithoutEpicCount    int           `json:"withoutEpicCount"`
	LastJiraPullISO8601 string        `json:"lastJiraPullIso8601"`
}

type CountBucket struct {
	Name  string `json:"name"`
	Value int    `json:"value"`
}

type Signal struct {
	Kind     string   `json:"kind"`
	Title    string   `json:"title"`
	Detail   string   `json:"detail"`
	Evidence []string `json:"evidence"`
}

type BoardGraph struct {
	Nodes []BoardNode `json:"nodes"`
	Edges []BoardEdge `json:"edges"`
}

type BoardNode struct {
	ID        string   `json:"id"`
	Label     string   `json:"label"`
	Kind      string   `json:"kind"`
	Status    string   `json:"status,omitempty"`
	IssueKeys []string `json:"issueKeys,omitempty"`
	Score     float64  `json:"score,omitempty"`
}

type BoardEdge struct {
	ID     string `json:"id"`
	Source string `json:"source"`
	Target string `json:"target"`
	Label  string `json:"label,omitempty"`
}

type ModelSource struct {
	Provider string `json:"provider"`
	Model    string `json:"model,omitempty"`
}
