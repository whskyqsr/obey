import type { ReactNode } from "react";
import { DndContext, KeyboardSensor, PointerSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Icon, cx } from "./ui";

/**
 * A vertical list whose items can be dragged by their handle into a new order (mouse, touch or keyboard).
 * [onReorder] gets the full list in its new order.
 */
export function SortableList<T extends { id: string }>({
  items,
  enabled,
  onReorder,
  children,
}: {
  items: T[];
  enabled: boolean;
  onReorder(next: T[]): void;
  children(item: T, index: number, handle: ReactNode): ReactNode;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const from = items.findIndex((i) => i.id === active.id);
    const to = items.findIndex((i) => i.id === over.id);
    if (from >= 0 && to >= 0) onReorder(arrayMove(items, from, to));
  }
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
        {items.map((item, index) => (
          <Row key={item.id} id={item.id} enabled={enabled}>
            {(handle) => children(item, index, handle)}
          </Row>
        ))}
      </SortableContext>
    </DndContext>
  );
}

function Row({ id, enabled, children }: { id: string; enabled: boolean; children(handle: ReactNode): ReactNode }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id, disabled: !enabled });
  const handle = enabled ? (
    <button
      type="button"
      ref={setActivatorNodeRef}
      {...attributes}
      {...listeners}
      aria-label="Drag to reorder"
      className="flex size-10 shrink-0 cursor-grab touch-none items-center justify-center rounded-full text-on-surface-variant hover:bg-on-surface/8 active:cursor-grabbing"
    >
      <Icon name="drag_indicator" />
    </button>
  ) : null;
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cx("relative list-none", isDragging && "z-10 opacity-90 shadow-lg")}
    >
      {children(handle)}
    </li>
  );
}
