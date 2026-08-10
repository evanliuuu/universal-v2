import { WidgetNode } from "../protocol/types";
import { RenderContext, renderWidget } from "../widgets/registry";

export type WidgetDomPatch =
  | { op: "update"; id: string; props: Record<string, unknown> }
  | { op: "replace"; id: string; html: string }
  | { op: "append"; parentId: string; html: string }
  | { op: "remove"; id: string };

function nodeSignature(node: WidgetNode): string {
  return JSON.stringify({
    type: node.type,
    props: node.props,
    children: node.children ?? [],
    behavior: node.behavior,
  });
}

function renderSubtree(
  id: string,
  ctx: RenderContext,
  widgets: Record<string, WidgetNode>,
): string {
  const seen = new Set<string>();
  function renderChild(childId: string): string {
    if (seen.has(childId)) return "";
    seen.add(childId);
    const node = widgets[childId];
    if (!node) return "";
    return renderWidget(node, ctx, renderChild);
  }
  return renderChild(id);
}

function findParentId(
  childId: string,
  widgets: Record<string, WidgetNode>,
): string | undefined {
  for (const [id, node] of Object.entries(widgets)) {
    if (node.children?.includes(childId)) return id;
  }
  return undefined;
}

/** Diff widget maps into minimal DOM operations for the viewport iframe. */
export function diffWidgets(
  prev: Record<string, WidgetNode> | null,
  ctx: RenderContext,
): { fullRender: boolean; patches: WidgetDomPatch[] } {
  const next = ctx.doc.ui.widgets;
  if (!prev) return { fullRender: true, patches: [] };

  const patches: WidgetDomPatch[] = [];
  const prevIds = new Set(Object.keys(prev));
  const nextIds = new Set(Object.keys(next));

  for (const id of prevIds) {
    if (!nextIds.has(id) && id !== ctx.doc.ui.rootId) {
      patches.push({ op: "remove", id });
    }
  }

  for (const id of nextIds) {
    const nextNode = next[id];
    const prevNode = prev[id];
    if (!prevNode) {
      const parentId = findParentId(id, next);
      if (parentId) {
        patches.push({
          op: "append",
          parentId,
          html: renderSubtree(id, ctx, next),
        });
      } else {
        return { fullRender: true, patches: [] };
      }
      continue;
    }

    if (nodeSignature(prevNode) === nodeSignature(nextNode)) continue;

    const structureSame =
      prevNode.type === nextNode.type &&
      JSON.stringify(prevNode.children ?? []) ===
        JSON.stringify(nextNode.children ?? []);

    if (structureSame) {
      patches.push({ op: "update", id, props: { ...nextNode.props } });
    } else {
      patches.push({
        op: "replace",
        id,
        html: renderSubtree(id, ctx, next),
      });
    }
  }

  if (patches.length > 8) return { fullRender: true, patches: [] };
  return { fullRender: false, patches };
}
