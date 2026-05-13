import { Background, Controls, MiniMap, ReactFlow, type Edge, type Node } from "@xyflow/react";
import { useMemo } from "react";
import type { BoardAnalysis, BoardNode } from "../types";

type Props = {
  analysis: BoardAnalysis;
};

export function VisionBoard({ analysis }: Props) {
  const { nodes, edges } = useMemo(() => toFlowGraph(analysis), [analysis]);

  return (
    <section className="board-section">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Vision board</p>
          <h2>Big rocks, small rocks, and outliers</h2>
        </div>
      </div>
      <div className="flow-wrap">
        <ReactFlow nodes={nodes} edges={edges} fitView minZoom={0.35} maxZoom={1.4} nodesDraggable={false} nodesConnectable={false}>
          <Background gap={18} size={1} color="#ccd4dc" />
          <Controls showInteractive={false} />
          <MiniMap pannable zoomable nodeStrokeWidth={3} />
        </ReactFlow>
      </div>
    </section>
  );
}

function toFlowGraph(analysis: BoardAnalysis): { nodes: Node[]; edges: Edge[] } {
  const sourceNodes = analysis.board.nodes.length > 0 ? analysis.board.nodes : deriveBoardNodes(analysis);
  const sourceEdges = analysis.board.edges.length > 0 ? analysis.board.edges : deriveBoardEdges(analysis);
  const grouped = groupByKind(sourceNodes);
  const nodes = sourceNodes.map((node) => ({
    id: node.id,
    type: "default",
    data: {
      label: <NodeLabel node={node} />
    },
    position: positionNode(node, grouped),
    className: `flow-node ${node.kind}`
  }));
  const edges = sourceEdges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    label: edge.label,
    animated: edge.label === "risk",
    className: edge.label === "risk" ? "risk-edge" : undefined
  }));
  return { nodes, edges };
}

function NodeLabel({ node }: { node: BoardNode }) {
  return (
    <div className="node-label">
      <span>{node.kind}</span>
      <strong>{node.label}</strong>
      {node.issueKeys?.length ? <em>{node.issueKeys.slice(0, 4).join(", ")}</em> : null}
    </div>
  );
}

function groupByKind(nodes: BoardNode[]) {
  const groups = new Map<string, BoardNode[]>();
  nodes.forEach((node) => {
    const current = groups.get(node.kind) ?? [];
    current.push(node);
    groups.set(node.kind, current);
  });
  return groups;
}

function positionNode(node: BoardNode, groups: Map<string, BoardNode[]>): { x: number; y: number } {
  const rocks = groups.get("big-rock") ?? groups.get("bigRock") ?? [];
  const small = groups.get("small-rock") ?? groups.get("smallRock") ?? [];
  const outliers = groups.get("outlier") ?? [];

  if (rocks.includes(node)) {
    const index = rocks.indexOf(node);
    return { x: 80, y: 80 + index * 170 };
  }
  if (small.includes(node)) {
    const index = small.indexOf(node);
    return { x: 440 + (index % 2) * 280, y: 40 + Math.floor(index / 2) * 140 };
  }
  if (outliers.includes(node)) {
    const index = outliers.indexOf(node);
    return { x: 1040, y: 90 + index * 150 };
  }
  const flatIndex = Array.from(groups.values()).flat().indexOf(node);
  return { x: 120 + (flatIndex % 4) * 260, y: 120 + Math.floor(flatIndex / 4) * 150 };
}

function deriveBoardNodes(analysis: BoardAnalysis): BoardNode[] {
  const nodes: BoardNode[] = [];
  analysis.bigRocks.forEach((rock) => {
    nodes.push({ id: rock.id, label: rock.title, kind: "big-rock", status: rock.status, issueKeys: rock.issueKeys, score: rock.confidence });
    rock.smallRocks.forEach((small) => {
      nodes.push({ id: small.id, label: small.title, kind: "small-rock", status: small.status, issueKeys: small.issueKeys, score: small.confidence });
    });
  });
  analysis.outliers.forEach((outlier) => {
    nodes.push({ id: outlier.issueKey, label: outlier.title, kind: "outlier", issueKeys: [outlier.issueKey], score: outlier.confidence });
  });
  return nodes;
}

function deriveBoardEdges(analysis: BoardAnalysis) {
  return analysis.bigRocks.flatMap((rock) =>
    rock.smallRocks.map((small) => ({
      id: `${rock.id}-${small.id}`,
      source: rock.id,
      target: small.id,
      label: "contains"
    }))
  );
}

