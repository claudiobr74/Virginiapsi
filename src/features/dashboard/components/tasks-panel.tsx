"use client";

import { Check, ListTodo, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { SectionHeader } from "@/components/ui/section-header";
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
    <section aria-labelledby="tasks-heading" className="flex flex-col gap-3">
      <SectionHeader
        id="tasks-heading"
        title="Tarefas"
        description="Checklist operacional do consultório — não é conteúdo clínico"
      />

      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(event) => {
          event.preventDefault();
          run(() => createTaskAction({ title }), () => setTitle(""));
        }}
      >
        <Input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Nova tarefa"
          aria-label="Título da nova tarefa"
          maxLength={200}
        />
        <Button type="submit" size="sm" isLoading={isPending} disabled={!title.trim()}>
          Adicionar
        </Button>
      </form>

      {error ? (
        <p role="alert" className="text-sm text-failed">
          {error}
        </p>
      ) : null}

      {tasks.length === 0 ? (
        <EmptyState
          icon={ListTodo}
          title="Nenhuma tarefa pendente"
          description="O dia está em ordem. Adicione um lembrete operacional quando precisar."
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {tasks.map((task) => (
            <li
              key={task.id}
              className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-3"
            >
              <span className="text-sm font-medium text-foreground">{task.title}</span>
              <div className="flex shrink-0 items-center gap-1">
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
    </section>
  );
}
