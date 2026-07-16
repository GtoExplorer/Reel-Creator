import { NextResponse } from "next/server";
import {
  buildFlowchart,
  fetchTree,
  layoutTree,
  mergeSubtree,
  nodeDescription,
  pruneSubtree,
  type RawTreeNode,
} from "@/src/flowchart/build";
import { parseSceneFilters } from "@/src/data/filters";
import { SceneFilter } from "@/src/types";
import { fetchLoadStreet } from "@/src/data/solverApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/flowchart?loadId=&street=flop&leafs=7&properties=a,b&filters=[...]
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const loadId = Number(sp.get("loadId"));
  const direction = sp.get("direction") === "LR" ? "LR" : "TB";
  const leafs = Number(sp.get("leafs")) || 7;
  const properties = sp.get("properties") || undefined;
  const filters = parseSceneFilters(sp.get("filters"));
  if (!loadId) return NextResponse.json({ error: "loadId required" }, { status: 400 });
  try {
    const street = await fetchLoadStreet(loadId);
    if (!street) return NextResponse.json({ error: "Could not determine the street for that load." }, { status: 404 });
    const r = await buildFlowchart(loadId, street, leafs, filters, direction, properties);
    if (!r) return NextResponse.json({ error: "No flowchart for that load/filter combination." }, { status: 404 });
    return NextResponse.json({ flowchart: r.layout, nodes: r.nodes, tree: r.raw, street });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

// POST /api/flowchart — edit an existing tree without losing its expansions.
//   { op: "expand",   tree, nodeId, loadId, street, leafs, properties[], filters[], direction }
//   { op: "collapse", tree, nodeId, direction }
//   { op: "layout",   tree, direction }   (re-lay out, e.g. after a direction flip)
export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const op = body.op;
  const direction = body.direction === "LR" ? "LR" : "TB";
  const tree = Array.isArray(body.tree) ? (body.tree as RawTreeNode[]) : null;
  if (!tree || tree.length === 0) return NextResponse.json({ error: "tree required" }, { status: 400 });

  try {
    let raw = tree;
    if (op === "expand") {
      const loadId = Number(body.loadId);
      const nodeId = Number(body.nodeId);
      const street = await fetchLoadStreet(loadId);
      const leafs = Number(body.leafs) || 5;
      const properties = Array.isArray(body.properties)
        ? (body.properties as string[]).filter((p) => typeof p === "string" && p)
        : [];
      let filters: SceneFilter[] = [];
      try {
        filters = SceneFilter.array().parse(body.filters ?? []);
      } catch {
        filters = [];
      }
      if (!loadId || Number.isNaN(nodeId)) {
        return NextResponse.json({ error: "loadId and nodeId required" }, { status: 400 });
      }
      if (!street) return NextResponse.json({ error: "Could not determine the street for that load." }, { status: 404 });
      const q = nodeDescription(tree, nodeId);
      const fetched = await fetchTree(loadId, street, leafs, properties.join(",") || undefined, filters, q || undefined);
      if (!fetched) {
        return NextResponse.json(
          { error: "No subtree for that node with the current depth/properties." },
          { status: 404 }
        );
      }
      raw = mergeSubtree(tree, nodeId, fetched);
    } else if (op === "collapse") {
      const nodeId = Number(body.nodeId);
      if (Number.isNaN(nodeId)) return NextResponse.json({ error: "nodeId required" }, { status: 400 });
      raw = pruneSubtree(tree, nodeId);
    } else if (op !== "layout") {
      return NextResponse.json({ error: `Unknown op: ${String(op)}` }, { status: 400 });
    }
    const laid = await layoutTree(raw, direction);
    return NextResponse.json({ flowchart: laid.layout, nodes: laid.nodes, tree: raw });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
