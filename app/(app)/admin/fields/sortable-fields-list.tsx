"use client";

import { useState, useTransition } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";

import { reorderFields } from "@/app/actions/custom-fields";
import { FieldRow } from "./field-row";
import type { FieldFormData } from "./new-field-dialog";

interface SortableFieldsListProps {
  initialFields: FieldFormData[];
}

export function SortableFieldsList({ initialFields }: SortableFieldsListProps) {
  const [fields, setFields] = useState(initialFields);
  const [announcement, setAnnouncement] = useState("");
  const [, startTransition] = useTransition();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = fields.findIndex((f) => f.id === active.id);
    const newIndex = fields.findIndex((f) => f.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const nextFields = arrayMove(fields, oldIndex, newIndex);
    const previousFields = fields;
    const moved = nextFields[newIndex];

    setFields(nextFields);
    setAnnouncement(
      `Moved ${moved?.name ?? "field"} to position ${newIndex + 1} of ${nextFields.length}.`,
    );

    startTransition(async () => {
      try {
        await reorderFields(nextFields.map((f) => f.id));
      } catch {
        setFields(previousFields);
        setAnnouncement("Could not save new order. Please try again.");
      }
    });
  };

  return (
    <>
      <div className="sr-only" role="status" aria-live="polite">
        {announcement}
      </div>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={fields.map((f) => f.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-2">
            {fields.map((field) => (
              <SortableFieldItem key={field.id} field={field} />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </>
  );
}

function SortableFieldItem({ field }: { field: FieldFormData }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: field.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="flex items-stretch gap-2">
      <button
        type="button"
        className="flex cursor-grab items-center rounded-md px-1 text-muted-foreground hover:bg-muted active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={`Reorder ${field.name}`}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" aria-hidden="true" />
      </button>
      <div className="flex-1">
        <FieldRow field={field} />
      </div>
    </div>
  );
}
