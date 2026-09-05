"use client";

import { Check, CircleCheck, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DashboardWidget } from "@/features/dashboard/components/dashboard-widget";
import {
  completeTaskAction,
  createTaskAction,
  deleteTaskAction,
} from "@/features/dashboard/actions";
import type { PracticeTask } from "@/features/dashboard/contracts";

export function TasksPanel({ tasks }: { tasks: PracticeTask[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);

  function run(action: () => Promise<{ error?: string }>, onSuccess?: () => void) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.error) {
        setError(result.error);
        return;
      }
      onSuccess?.();
      router.refresh();
    });
  }

  return (
    <DashboardWidget
      id="tasks-heading"
      title="Minhas Tarefas"
      tone="tasks"
      icon={<CircleCheck />}
    >
      <form
        className="flex flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          run(() => createTaskAction({ title }), () => setTitle(""));
        }}
      >
        <div className="flex gap-2">
          <Input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Nova tarefa"
            aria-label="Título da nova tarefa"
            maxLength={200}
            className="h-9"
          />
          <Button type="submit" size="sm" isLoading={isPending} disabled={!title.trim()}>
            Adicionar
          </Button>
        </div>
      </form>

      {error ? (
        <p role="alert" className="text-sm text-failed">
          {error}
        </p>
      ) : null}

      {tasks.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma tarefa pendente para hoje.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {tasks.map((task) => (
            <li key={task.id} className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium text-foreground">{task.title}</span>
              <div className="flex shrink-0 items-center">
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label={`Concluir ${task.title}`}
                  isLoading={isPending}
                  onClick={() => run(() => completeTaskAction(task.id))}
                >
                  <Check className="size-4" aria-hidden />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label={`Remover ${task.title}`}
                  isLoading={isPending}
                  onClick={() => run(() => deleteTaskAction(task.id))}
                >
                  <Trash2 className="size-4" aria-hidden />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </DashboardWidget>
  );
}
